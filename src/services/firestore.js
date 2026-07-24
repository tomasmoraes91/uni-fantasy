import {
  collection, doc, getDoc as _rawGetDoc, getDocs as _rawGetDocs, setDoc, addDoc,
  deleteDoc, updateDoc, query, where, arrayUnion, arrayRemove, deleteField,
} from 'firebase/firestore';
import { db } from './firebase';

/* ── DEV: contador de leituras por coleção (PERSISTENTE) ──────────────
   Wrappers que contam getDoc/getDocs sem alterar as chamadas. Acumula em
   localStorage → SOBREVIVE a F5/fechar a aba, somando ao longo do tempo.
   Console:  window.__fsReads()  (mostra _sinceHours = horas desde o reset)
             window.__fsReadsReset()  (zera e reinicia a contagem)
   Conta só ESTE navegador/usuário; total do projeto = Firebase Console.
   (Não cobre scoring.js/badgeEngine.js, que são lotes do admin.) */
const _RS_KEY = 'fsreads';
const _readStats = (() => {
  try { const raw = localStorage.getItem(_RS_KEY); if (raw) return JSON.parse(raw); } catch { /* ignore */ }
  return { _startedAt: Date.now() };
})();
function _persistReads() { try { localStorage.setItem(_RS_KEY, JSON.stringify(_readStats)); } catch { /* ignore */ } }
function _trackRead(target, n) {
  if (!n) return;
  let coll = 'unknown';
  try {
    if (target?.path) coll = target.path.split('/')[0];
    else if (target?._query?.path?.segments?.length) coll = target._query.path.segments[0];
  } catch { /* ignore */ }
  _readStats[coll] = (_readStats[coll] || 0) + n;
  _readStats._total = (_readStats._total || 0) + n;
}
async function getDocs(q) { const s = await _rawGetDocs(q); _trackRead(q, s.size || 0); return s; }
async function getDoc(ref) { const s = await _rawGetDoc(ref); _trackRead(ref, 1); return s; }
if (typeof window !== 'undefined') {
  window.__fsReads = () => ({
    ..._readStats,
    _sinceHours: +(((Date.now() - (_readStats._startedAt || Date.now())) / 3600000).toFixed(2)),
  });
  window.__fsReadsReset = () => {
    for (const k in _readStats) delete _readStats[k];
    _readStats._startedAt = Date.now();
    _persistReads();
  };
  window.addEventListener('beforeunload', _persistReads);
  setInterval(_persistReads, 15000); // salva periodicamente (resiste a crash)
}

export const DEFAULT_EVENT_ID = 'default';

/* ── CACHE EM MEMÓRIA (dados estáticos: events, teams, players) ───────
   Essas coleções só mudam por ação do admin. Em vez de relê-las a cada
   navegação, guardamos a Promise da leitura por sessão. É invalidado
   automaticamente nas escritas do admin (create/update/delete) e expira
   por TTL como rede de segurança para edições feitas em outro cliente.
   ─────────────────────────────────────────────────────────────────── */
const CACHE_TTL_MS = 5 * 60 * 1000;
// TTL longo para dados de REFERÊNCIA (events/teams/players): só mudam por ação
// do admin (que invalida). localStorage sobrevive entre sessões/abas, então o
// usuário não relê a coleção inteira a cada acesso.
const STATIC_TTL_MS = 60 * 60 * 1000; // 1h
// TTL curto para dados "vivos" (matches/scores/user_teams): resultados são
// lançados manualmente pelo admin, cujas escritas invalidam na hora. O TTL é
// só uma rede de segurança para propagar a outros clientes.
const LIVE_TTL_MS = 60 * 1000;
const _cache = new Map(); // key → { promise, expires }
const SS_PREFIX = 'fscache:'; // persistência (localStorage — sobrevive a sessões)

function ssGet(key) {
  try {
    const raw = localStorage.getItem(SS_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (entry.expires > Date.now()) return entry;
    localStorage.removeItem(SS_PREFIX + key);
  } catch { /* indisponível/corrompido */ }
  return null;
}
function ssSet(key, value, expires) {
  try { localStorage.setItem(SS_PREFIX + key, JSON.stringify({ value, expires })); }
  catch { /* cota excedida ou valor não-serializável: ignora */ }
}

function cachedRead(key, loader, ttl = CACHE_TTL_MS) {
  const now = Date.now();
  const hit = _cache.get(key);
  if (hit && hit.expires > now) return hit.promise;

  // Hidrata da sessionStorage (sobrevive a recarregar a página)
  const persisted = ssGet(key);
  if (persisted) {
    const p = Promise.resolve(persisted.value);
    _cache.set(key, { promise: p, expires: persisted.expires });
    return p;
  }

  const expires = now + ttl;
  const promise = loader()
    .then((value) => { ssSet(key, value, expires); return value; })
    .catch((err) => {
      // Não memoiza falhas: remove para permitir nova tentativa
      if (_cache.get(key)?.promise === promise) _cache.delete(key);
      throw err;
    });
  _cache.set(key, { promise, expires });
  return promise;
}

// Invalida entradas cujo prefixo casa (ex.: 'players', 'teams', 'events'),
// tanto em memória quanto na sessionStorage.
export function invalidateCache(...prefixes) {
  for (const key of _cache.keys()) {
    if (prefixes.some((p) => key.startsWith(p))) _cache.delete(key);
  }
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const full = localStorage.key(i);
      if (full?.startsWith(SS_PREFIX)
          && prefixes.some((p) => full.slice(SS_PREFIX.length).startsWith(p))) {
        localStorage.removeItem(full);
      }
    }
  } catch { /* localStorage indisponível */ }
}

/* ── PACOTES (bundles) ───────────────────────────────────────────────
   Agrega uma coleção num único doc `aggregates/{name}` = { items: {id:data} }
   para LER 1 doc em vez de N. Mantido incrementalmente nas escritas (admin)
   e reconstruível via rebuildReferenceBundles(). Doc < 1MB (Copa: ~1248
   jogadores ≈ 300KB; se um dia passar disso, shardar por evento). ──── */
async function bundleUpsert(name, id, data) {
  try {
    await setDoc(doc(db, 'aggregates', name),
      { items: { [id]: data }, updatedAt: Date.now() }, { merge: true });
  } catch { /* best-effort: o pacote é reconstruível */ }
}
async function bundleRemove(name, id) {
  try {
    await setDoc(doc(db, 'aggregates', name),
      { items: { [id]: deleteField() } }, { merge: true });
  } catch { /* best-effort */ }
}
// Lê o pacote (1 leitura); cai na coleção inteira se ainda não foi gerado.
// Só considera o pacote VÁLIDO quando tem `count` (setado pelo rebuild) — assim
// um pacote parcial criado por um upsert antes do rebuild é ignorado (não some
// jogador da lista).
async function readBundleOrCollection(name, collName, ttl) {
  return cachedRead(name, async () => {
    const snap = await getDoc(doc(db, 'aggregates', name));
    const data = snap.exists() ? snap.data() : null;
    if (data && data.count != null) return Object.values(data.items || {});
    const all = await getDocs(collection(db, collName));
    return all.docs.map((d) => ({ id: d.id, ...d.data() }));
  }, ttl);
}

// (Re)gera os pacotes players/teams a partir das coleções. Admin, 1×
// (e após qualquer edição em massa). Lê as coleções uma vez; depois os
// usuários leem 1 doc cada.
export async function rebuildReferenceBundles() {
  const [pSnap, tSnap, mSnap] = await Promise.all([
    getDocs(collection(db, 'players')),
    getDocs(collection(db, 'teams')),
    getDocs(collection(db, 'matches')),
  ]);
  const pItems = {}; pSnap.docs.forEach((d) => { pItems[d.id] = { id: d.id, ...d.data() }; });
  const tItems = {}; tSnap.docs.forEach((d) => { tItems[d.id] = { id: d.id, ...d.data() }; });
  // matches agrupados por evento → um pacote por evento
  const mByEvent = {};
  mSnap.docs.forEach((d) => {
    const data = d.data();
    const eid  = data.eventId || DEFAULT_EVENT_ID;
    (mByEvent[eid] = mByEvent[eid] || {})[d.id] = { id: d.id, ...data };
  });
  const now = Date.now();
  await Promise.all([
    setDoc(doc(db, 'aggregates', 'players'), { items: pItems, updatedAt: now, count: pSnap.size }),
    setDoc(doc(db, 'aggregates', 'teams'),   { items: tItems, updatedAt: now, count: tSnap.size }),
    ...Object.entries(mByEvent).map(async ([eid, items]) => {
      try {
        await setDoc(doc(db, 'aggregates', `matches_${eid}`), { items, updatedAt: now, count: Object.keys(items).length });
      } catch {
        // Pacote > 1MB (evento com muitas partidas + playerStats): apaga para os
        // leitores usarem a query por evento (correto, um pouco mais caro).
        try { await deleteDoc(doc(db, 'aggregates', `matches_${eid}`)); } catch { /* ignore */ }
      }
    }),
  ]);
  invalidateCache('players', 'teams', 'matches');
  return { players: pSnap.size, teams: tSnap.size, matches: mSnap.size };
}

/**
 * Importa em massa o elenco de um evento país/gênero (OLIMFEF): cria os times-país
 * que faltam e os jogadores (com gênero, sem modalidade/posição). Idempotente:
 * pula jogadores já existentes (mesmo nome no mesmo time). Faz UMA reconstrução
 * de bundle no fim (em vez de 1 escrita por jogador no agregado).
 */
export async function importCountryRoster(eventId, roster) {
  const eid = eventId || DEFAULT_EVENT_ID;
  const [existingTeams, allPlayers] = await Promise.all([getTeamsByEvent(eid), getPlayers()]);
  let teamsCreated = 0, playersCreated = 0, skipped = 0;

  for (const grp of roster) {
    let team = existingTeams.find((t) => t.name === grp.team);
    if (!team) {
      const ref = await addDoc(collection(db, 'teams'), { name: grp.team, country: true, eventId: eid, createdAt: Date.now() });
      team = { id: ref.id, name: grp.team };
      existingTeams.push(team);
      teamsCreated++;
    }
    const have = new Set(allPlayers.filter((p) => p.teamId === team.id).map((p) => p.name));
    for (const pl of grp.players) {
      if (have.has(pl.name)) { skipped++; continue; }
      await addDoc(collection(db, 'players'), {
        name: pl.name, gender: pl.gender, teamId: team.id, eventId: eid, createdAt: Date.now(),
      });
      have.add(pl.name);
      playersCreated++;
    }
  }

  // Reconstrói os pacotes (players/teams) 1× → leitura otimizada
  await rebuildReferenceBundles();
  invalidateCache('players', 'teams');
  return { teamsCreated, playersCreated, skipped };
}

/**
 * Importa em massa partidas de um evento país/gênero (casa país pelo nome do
 * time). Idempotente: pula partida igual (sport+gender+times+data). Rebuild 1×.
 */
export async function importCountryMatches(eventId, matchList) {
  const eid = eventId || DEFAULT_EVENT_ID;
  const [teams, existing] = await Promise.all([getTeamsByEvent(eid), getMatchesByEvent(eid)]);
  const byName = {};
  teams.forEach((t) => { byName[t.name.trim().toLowerCase()] = t; });
  let created = 0, skipped = 0;
  const missing = new Set();

  for (const m of matchList) {
    const home = byName[m.home.trim().toLowerCase()];
    const away = byName[m.away.trim().toLowerCase()];
    if (!home || !away) { if (!home) missing.add(m.home); if (!away) missing.add(m.away); skipped++; continue; }
    const dup = existing.some((e) => e.sport === m.sport && (e.gender || '') === (m.gender || '')
      && e.homeTeamId === home.id && e.awayTeamId === away.id && e.date === m.date);
    if (dup) { skipped++; continue; }
    await addDoc(collection(db, 'matches'), {
      eventId: eid, sport: m.sport, gender: m.gender,
      homeTeamId: home.id, awayTeamId: away.id,
      homeTeamName: home.name, awayTeamName: away.name,
      homeShieldEmoji: home.shieldEmoji || '', awayShieldEmoji: away.shieldEmoji || '',
      date: m.date, status: 'scheduled', eventType: 'amador', createdAt: Date.now(),
    });
    created++;
  }

  await rebuildReferenceBundles();
  invalidateCache('matches');
  return { created, skipped, missing: [...missing] };
}

/**
 * Importa resultados de partidas (súmulas) de um evento país/gênero: casa a
 * partida por (sport, gender, home, away) e o jogador pelo NOME do elenco;
 * grava placar + playerStats via updateMatchResult. Retorna pendências (issues)
 * para revisar. NÃO pontua — depois rode "Pontuar novos resultados"/Recalcular.
 */
export async function importCountryResults(eventId, results) {
  const eid = eventId || DEFAULT_EVENT_ID;
  const [teams, allPlayers, matches] = await Promise.all([
    getTeamsByEvent(eid), getPlayers(), getMatchesByEvent(eid),
  ]);
  const teamByName = {};
  teams.forEach((t) => { teamByName[t.name.trim().toLowerCase()] = t; });
  const playersByTeam = {};
  allPlayers.filter((p) => (p.eventId || DEFAULT_EVENT_ID) === eid).forEach((p) => {
    (playersByTeam[p.teamId] = playersByTeam[p.teamId] || []).push(p);
  });
  const findPlayer = (teamId, name) => {
    const target = name.trim().toLowerCase();
    return (playersByTeam[teamId] || []).find((p) => p.name.trim().toLowerCase() === target);
  };

  let applied = 0;
  const issues = [];
  for (const r of results) {
    const home = teamByName[r.home.trim().toLowerCase()];
    const away = teamByName[r.away.trim().toLowerCase()];
    if (!home || !away) { issues.push(`Times não encontrados: ${r.home} / ${r.away}`); continue; }
    const match = matches.find((m) => m.sport === r.sport && (m.gender || '') === (r.gender || '')
      && m.homeTeamId === home.id && m.awayTeamId === away.id);
    if (!match) { issues.push(`Partida não encontrada: ${r.sport} ${r.gender} ${r.home}×${r.away}`); continue; }

    const stats = [];
    const addStats = (list, team) => {
      (list || []).forEach((s) => {
        const pl = findPlayer(team.id, s.name);
        if (!pl) { issues.push(`Jogador não encontrado: ${s.name} (${team.name})`); return; }
        const e = { playerId: pl.id, teamId: team.id };
        if (s.goals != null)      e.goals = s.goals;
        if (s.exclusions != null) e.exclusions = s.exclusions;
        if (s.points != null)     e.points = s.points;
        stats.push(e);
      });
    };
    addStats(r.homeStats, home);
    addStats(r.awayStats, away);

    await updateMatchResult(match.id, r.homeScore, r.awayScore, stats);
    applied++;
  }
  invalidateCache('matches');
  return { applied, issues };
}

/* ── EVENTS ─────────────────────────────────────────────────────────── */
export async function getEvents() {
  return cachedRead('events', async () => {
    const snap = await getDocs(collection(db, 'events'));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }, STATIC_TTL_MS);
}
export async function getEventById(eventId) {
  const snap = await getDoc(doc(db, 'events', eventId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
export async function getActiveEvents() {
  const all = await getEvents();
  // Retrocompat: status v3 ('ativo') ou active===true (v2) — ambos contam
  return all.filter((e) => {
    if (e.status) return e.status !== 'finalizado';
    return e.active !== false;
  });
}
export async function createEvent(data) {
  const ref = await addDoc(collection(db, 'events'), { ...data, createdAt: Date.now() });
  invalidateCache('events');
  return ref.id;
}
export async function updateEvent(id, data) {
  await updateDoc(doc(db, 'events', id), data);
  invalidateCache('events');
}
// Marca um evento como principal (home do app) e desmarca os demais.
export async function setFeaturedEvent(eventId) {
  const snap = await getDocs(collection(db, 'events'));
  await Promise.all(snap.docs.map((d) => updateDoc(d.ref, { featured: d.id === eventId })));
  invalidateCache('events');
}

/* ── TEAMS ──────────────────────────────────────────────────────────── */
// Bandeira padrão por país (OLIMFEF) quando o time não tem emoji definido.
const COUNTRY_FLAGS = { brasil: '🇧🇷', franca: '🇫🇷', holanda: '🇳🇱', portugal: '🇵🇹' };
export function countryFlag(name) {
  if (!name) return '';
  const k = name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  return COUNTRY_FLAGS[k] || '';
}
export async function getTeams() {
  // 1 leitura do pacote `aggregates/teams` (fallback: coleção inteira).
  const teams = await readBundleOrCollection('teams', 'teams', STATIC_TTL_MS);
  // Preenche a bandeira do país quando o emoji não foi definido manualmente.
  return teams.map((t) => t.shieldEmoji ? t : { ...t, shieldEmoji: countryFlag(t.name) });
}
// Derivam do cache de getTeams() — mesma saída de antes, sem nova leitura.
export async function getTeamsBySport(sport) {
  const all = await getTeams();
  return all.filter((t) => t.sport === sport);
}
export async function getTeamsByEvent(eventId) {
  const all = await getTeams();
  return all.filter((t) => (t.eventId || DEFAULT_EVENT_ID) === eventId);
}
export async function createTeam(data) {
  const payload = { ...data, eventId: data.eventId || DEFAULT_EVENT_ID, createdAt: Date.now() };
  const ref = await addDoc(collection(db, 'teams'), payload);
  await bundleUpsert('teams', ref.id, { id: ref.id, ...payload });
  invalidateCache('teams');
  return ref.id;
}
// Após editar, lê o doc completo p/ manter o pacote consistente (admin, raro).
async function _syncTeamBundle(id) {
  try { const s = await getDoc(doc(db, 'teams', id)); if (s.exists()) await bundleUpsert('teams', id, { id, ...s.data() }); }
  catch { /* best-effort */ }
}
export async function updateTeam(id, data) { await updateDoc(doc(db, 'teams', id), data); await _syncTeamBundle(id); invalidateCache('teams'); }
export async function deleteTeam(id)       { await deleteDoc(doc(db, 'teams', id)); await bundleRemove('teams', id); invalidateCache('teams'); }

/* ── PLAYERS ─────────────────────────────────────────────────────────── */
export async function getPlayers() {
  // 1 leitura do pacote `aggregates/players` (fallback: coleção inteira).
  return readBundleOrCollection('players', 'players', STATIC_TTL_MS);
}
// Derivam do cache de getPlayers() — mesma saída de antes, sem nova leitura.
export async function getPlayersBySport(sport, eventId = null) {
  const all = (await getPlayers()).filter((p) => p.sport === sport);
  if (!eventId || eventId === DEFAULT_EVENT_ID) return all;
  // Inclui jogadores do evento específico E do pool padrão (sem eventId)
  return all.filter((p) => {
    const pid = p.eventId || DEFAULT_EVENT_ID;
    return pid === eventId || pid === DEFAULT_EVENT_ID;
  });
}
// OLIMFEF (país/gênero): jogadores são do evento e filtrados por gênero. 'misto'
// inclui os dois. Deriva do cache de getPlayers() — sem nova leitura.
export async function getPlayersByGender(eventId, gender) {
  const all = (await getPlayers()).filter((p) => (p.eventId || DEFAULT_EVENT_ID) === eventId);
  if (!gender || gender === 'misto') return all;
  return all.filter((p) => p.gender === gender);
}
export async function getPlayerById(id) {
  const snap = await getDoc(doc(db, 'players', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
export async function createPlayer(data) {
  const payload = { ...data, eventId: data.eventId || DEFAULT_EVENT_ID, createdAt: Date.now() };
  const ref = await addDoc(collection(db, 'players'), payload);
  await bundleUpsert('players', ref.id, { id: ref.id, ...payload });
  invalidateCache('players');
  return ref.id;
}
// Após editar, lê o doc completo p/ manter o pacote consistente (admin, raro).
async function _syncPlayerBundle(id) {
  try { const s = await getDoc(doc(db, 'players', id)); if (s.exists()) await bundleUpsert('players', id, { id, ...s.data() }); }
  catch { /* best-effort */ }
}
export async function updatePlayer(id, data) { await updateDoc(doc(db, 'players', id), data); await _syncPlayerBundle(id); invalidateCache('players'); }
export async function deletePlayer(id)       { await deleteDoc(doc(db, 'players', id)); await bundleRemove('players', id); invalidateCache('players'); }

/* Conta em quantos times escalados e escalações por rodada o jogador aparece
   (titular — array playerIds). Usado para avisar antes de excluir. */
export async function getPlayerUsage(playerId) {
  const [teamsSnap, lineupsSnap] = await Promise.all([
    getDocs(query(collection(db, 'user_teams'),    where('playerIds', 'array-contains', playerId))),
    getDocs(query(collection(db, 'round_lineups'), where('playerIds', 'array-contains', playerId))),
  ]);
  return { teams: teamsSnap.size, lineups: lineupsSnap.size };
}

/* ── USER FANTASY TEAM ───────────────────────────────────────────────
   BUG FIX v3: ID sempre inclui eventId para que trocar de evento
   NÃO apague o time — cada evento tem seu próprio doc.
   Formato: `{uid}__{eventId}__{sport}`  (duplo underscore para evitar colisão)
   Docs antigos com formato `{uid}_{sport}` continuam sendo lidos via fallback.
   ───────────────────────────────────────────────────────────────────── */
function teamDocId(uid, sport, eventId) {
  const eid = eventId || DEFAULT_EVENT_ID;
  return `${uid}__${eid}__${sport}`;
}

export async function getUserTeam(uid, sport, eventId) {
  const eid = eventId || DEFAULT_EVENT_ID;

  // 1) Tenta novo formato
  const newSnap = await getDoc(doc(db, 'user_teams', teamDocId(uid, sport, eid)));
  if (newSnap.exists()) return { id: newSnap.id, ...newSnap.data() };

  // 2) Fallback: formato antigo `{uid}_{sport}` — migra automaticamente
  const oldSnap = await getDoc(doc(db, 'user_teams', `${uid}_${sport}`));
  if (oldSnap.exists()) {
    const data = oldSnap.data();
    // Salva no novo formato sem apagar o antigo (não-destrutivo).
    // Best-effort: a trava de mercado pode negar a escrita (mercado fechado);
    // nesse caso só retorna os dados antigos — a migração ocorre quando reabrir.
    try {
      await setDoc(doc(db, 'user_teams', teamDocId(uid, sport, eid)), {
        ...data, eventId: eid, migratedAt: Date.now(),
      });
    } catch { /* migração adiada — não quebra a leitura do time */ }
    return { id: teamDocId(uid, sport, eid), ...data, eventId: eid };
  }

  return null;
}

export async function saveUserTeam(uid, sport, playerIds, captainId, eventId, playerPositions = [], bench = {}, formation = null) {
  const eid = eventId || DEFAULT_EVENT_ID;
  await setDoc(doc(db, 'user_teams', teamDocId(uid, sport, eid)), {
    uid, sport, eventId: eid, playerIds, playerPositions, captainId, bench, formation, updatedAt: Date.now(),
  });
  invalidateCache('userteams', `usereventids:${uid}`);
}

/* ── MATCHES ─────────────────────────────────────────────────────────── */
export async function getMatchesByEvent(eventId) {
  const eid = eventId || DEFAULT_EVENT_ID;
  return cachedRead(`matches:${eid}`, async () => {
    // 1 leitura do pacote `aggregates/matches_${eid}` (fallback: query por evento).
    const bSnap = await getDoc(doc(db, 'aggregates', `matches_${eid}`));
    const bData = bSnap.exists() ? bSnap.data() : null;
    let list;
    if (bData && bData.count != null) {
      list = Object.values(bData.items || {});
    } else {
      const q = query(collection(db, 'matches'), where('eventId', '==', eid));
      const snap = await getDocs(q);
      list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    return list.sort((a, b) => (a.date ?? 0) - (b.date ?? 0));
  }, LIVE_TTL_MS);
}
// Mantém `event.predictionDeadline` = data da 1ª partida (min). A trava
// server-side dos palpites de campeonato lê esse campo (rules não fazem query).
// Escrito só por escrita de partida (admin), portanto confiável. Best-effort.
async function syncEventPredictionDeadline(eventId) {
  const eid = eventId || DEFAULT_EVENT_ID;
  if (eid === DEFAULT_EVENT_ID) return; // evento 'default' não tem doc próprio
  try {
    const matches  = await getMatchesByEvent(eid);
    const dates    = matches.map((m) => m.date).filter((d) => typeof d === 'number');
    const deadline = dates.length ? Math.min(...dates) : null;
    await updateDoc(doc(db, 'events', eid), { predictionDeadline: deadline });
    invalidateCache('events');
  } catch { /* best-effort: não bloqueia a operação da partida */ }
}

// Sincroniza uma partida no pacote `matches_${eid}` lendo o doc completo.
async function _syncMatchBundle(matchId) {
  try {
    const s = await getDoc(doc(db, 'matches', matchId));
    if (!s.exists()) return null;
    const m = { id: matchId, ...s.data() };
    const name = `matches_${m.eventId || DEFAULT_EVENT_ID}`;
    try {
      await setDoc(doc(db, 'aggregates', name),
        { items: { [matchId]: m }, updatedAt: Date.now() }, { merge: true });
    } catch {
      // Pacote provavelmente estourou o limite de 1MB (Copa com playerStats de
      // muitas partidas): APAGA o pacote para os leitores caírem na query por
      // evento — senão a tela fica presa num pacote velho e o resultado salvo
      // "não aparece". Dados sempre corretos; leitura um pouco mais cara.
      try { await deleteDoc(doc(db, 'aggregates', name)); } catch { /* ignore */ }
    }
    return m;
  } catch { return null; }
}

export async function createMatch(data) {
  const payload = { ...data, eventId: data.eventId || DEFAULT_EVENT_ID, status: data.status || 'scheduled', createdAt: Date.now() };
  const ref = await addDoc(collection(db, 'matches'), payload);
  await bundleUpsert(`matches_${payload.eventId}`, ref.id, { id: ref.id, ...payload });
  invalidateCache('matches');
  await syncEventPredictionDeadline(payload.eventId);
  return ref.id;
}
export async function updateMatch(id, data) {
  await updateDoc(doc(db, 'matches', id), data);
  invalidateCache('matches');
  const m = await _syncMatchBundle(id); // lê o doc 1× (serve p/ pacote e prazo)
  if ('date' in data) await syncEventPredictionDeadline(m?.eventId ?? data.eventId);
}
export async function deleteMatch(id) {
  let eid;
  try { eid = (await getDoc(doc(db, 'matches', id))).data()?.eventId; } catch { /* ignora */ }
  await deleteDoc(doc(db, 'matches', id));
  await bundleRemove(`matches_${eid || DEFAULT_EVENT_ID}`, id);
  invalidateCache('matches');
  await syncEventPredictionDeadline(eid);
}
export async function updateMatchResult(matchId, homeScore, awayScore, playerStats = [], extra = {}) {
  await updateDoc(doc(db, 'matches', matchId), {
    homeScore, awayScore, status: 'finished',
    playerStats, finishedAt: Date.now(),
    ...extra,
  });
  await _syncMatchBundle(matchId); // mantém o pacote da partida atualizado
  invalidateCache('matches');
}

/* ── PLAYERS (extra query) ──────────────────────────────────────────── */
export async function getPlayersByTeam(teamId) {
  return (await getPlayers()).filter((p) => p.teamId === teamId);
}

/* ── PREDICTIONS ─────────────────────────────────────────────────────── */
export async function getUserPredictions(uid) {
  // Só muda quando o próprio usuário salva um palpite (que invalida a entrada).
  return cachedRead(`preds:${uid}`, async () => {
    const q    = query(collection(db, 'predictions'), where('uid', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  });
}
export async function getPredictionsByUids(uids) {
  if (!uids.length) return [];
  const BATCH = 30;
  const results = [];
  for (let i = 0; i < uids.length; i += BATCH) {
    const q = query(collection(db, 'predictions'), where('uid', 'in', uids.slice(i, i + BATCH)));
    const snap = await getDocs(q);
    snap.docs.forEach((d) => results.push({ id: d.id, ...d.data() }));
  }
  return results;
}
export async function savePrediction(uid, matchId, homeScore, awayScore) {
  await setDoc(doc(db, 'predictions', `${uid}_${matchId}`), {
    uid, matchId,
    homeScore: Number(homeScore), awayScore: Number(awayScore),
    submittedAt: Date.now(),
  });
  invalidateCache(`preds:${uid}`);
}

/* ── SCORES ──────────────────────────────────────────────────────────── */
export async function getAllScores() {
  return cachedRead('scores:all', async () => {
    const snap = await getDocs(collection(db, 'scores'));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }, LIVE_TTL_MS);
}
// Score doc agora keyed por uid_eventId — um doc por (usuário × evento)
export async function getUserScore(uid, eventId) {
  if (!eventId || eventId === DEFAULT_EVENT_ID) {
    // fallback legado: tenta doc pelo uid
    const snap = await getDoc(doc(db, 'scores', uid));
    if (snap.exists()) return snap.data();
    return null;
  }
  const snap = await getDoc(doc(db, 'scores', `${uid}_${eventId}`));
  return snap.exists() ? snap.data() : null;
}
export async function getScoresByEvent(eventId) {
  if (!eventId || eventId === DEFAULT_EVENT_ID) return getAllScores();
  return cachedRead(`scores:${eventId}`, async () => {
    // Denormalizado: 1 leitura do agregado. Fallback p/ a coleção se o resumo
    // ainda não existir (ex.: antes do 1º recompute após o deploy).
    const sumSnap = await getDoc(doc(db, 'scores_summary', eventId));
    if (sumSnap.exists()) return sumSnap.data().entries || [];
    const q    = query(collection(db, 'scores'), where('eventId', '==', eventId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }, LIVE_TTL_MS);
}
// Scores de um único usuário em todos os eventos (perfil de usuário)
export async function getScoresByUid(uid) {
  return cachedRead(`scores:uid:${uid}`, async () => {
    const q    = query(collection(db, 'scores'), where('uid', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }, LIVE_TTL_MS);
}
export async function updateTeamEmoji(teamId, emoji) {
  await updateDoc(doc(db, 'teams', teamId), { shieldEmoji: emoji });
  await bundleUpsert('teams', teamId, { shieldEmoji: emoji });
  invalidateCache('teams');
}

/* ── LIMPEZA DE TIME INVÁLIDO ─────────────────────────────────────────
   Recebe playerIds salvos + players reais disponíveis.
   Retorna { cleaned: boolean, validIds: string[], removedCount: number }
   ─────────────────────────────────────────────────────────────────── */
export function filterValidPlayerIds(savedIds, availablePlayers) {
  const availableSet = new Set(availablePlayers.map((p) => p.id));
  const validIds     = savedIds.filter((id) => availableSet.has(id));
  return {
    cleaned:      validIds.length !== savedIds.length,
    validIds,
    removedCount: savedIds.length - validIds.length,
  };
}

/* ── EVENTOS DO USUÁRIO ───────────────────────────────────────────────
   Retorna os eventIds distintos em que o usuário tem time salvo.
   ─────────────────────────────────────────────────────────────────── */
export async function getUserEventIds(uid) {
  // Cacheado por uid: muda só ao escalar time / entrar / sair de evento.
  return cachedRead(`usereventids:${uid}`, async () => {
    const [teamsSnap, partSnap, prefsSnap] = await Promise.all([
      getDocs(query(collection(db, 'user_teams'), where('uid', '==', uid))),
      getDocs(query(collection(db, 'event_participants'), where('uid', '==', uid))),
      getDocs(query(collection(db, 'user_event_prefs'), where('uid', '==', uid))),
    ]);
    // Eventos marcados como "saiu" pelo usuário
    const hiddenIds = new Set(
      prefsSnap.docs.filter((d) => d.data().hidden).map((d) => d.data().eventId)
    );
    const ids = new Set();
    teamsSnap.docs.forEach((d) => {
      const eid = d.data().eventId;
      if (eid && eid !== DEFAULT_EVENT_ID && !hiddenIds.has(eid)) ids.add(eid);
    });
    partSnap.docs.forEach((d) => {
      const eid = d.data().eventId;
      if (eid && !hiddenIds.has(eid)) ids.add(eid);
    });
    return [...ids];
  });
}
export async function joinEvent(uid, eventId) {
  await Promise.all([
    setDoc(doc(db, 'event_participants', `${uid}_${eventId}`), { uid, eventId, joinedAt: Date.now() }),
    deleteDoc(doc(db, 'user_event_prefs', `${uid}_${eventId}`)).catch(() => {}),
  ]);
  invalidateCache(`usereventids:${uid}`);
}
export async function leaveEvent(uid, eventId) {
  await Promise.all([
    setDoc(doc(db, 'user_event_prefs', `${uid}_${eventId}`), { uid, eventId, hidden: true }),
    deleteDoc(doc(db, 'event_participants', `${uid}_${eventId}`)).catch(() => {}),
  ]);
  invalidateCache(`usereventids:${uid}`);
}

/* ── EVENTO POR CÓDIGO PRIVADO ────────────────────────────────────────
   Eventos podem ter campo `privateCode` para acesso restrito.
   ─────────────────────────────────────────────────────────────────── */
export async function getEventByPrivateCode(code) {
  const q    = query(collection(db, 'events'), where('privateCode', '==', code.trim().toUpperCase()));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

/* ── MERCADO ──────────────────────────────────────────────────────────
   Formato atual: { isOpen: bool, openedAt: ms, closeAt: ms|null }
   closeAt = 1h antes do 1º jogo da próxima rodada (calculado ao abrir)
   Retrocompat: lê também formatos antigos (windows[], openAt/closeAt)
   ─────────────────────────────────────────────────────────────────── */
export async function getMarketConfig(eventId) {
  // Deriva do cache de getEvents() — sem getDoc separado. A trava de mercado
  // é imposta no servidor (rule lê o evento fresh), então cache aqui é seguro.
  const ev = (await getEvents()).find((e) => e.id === eventId);
  return ev?.market || null;
}
export async function setMarketConfig(eventId, marketData) {
  await updateDoc(doc(db, 'events', eventId), { market: marketData });
  invalidateCache('events');
}
export async function setEventCurrentPhase(eventId, phase) {
  await updateDoc(doc(db, 'events', eventId), { currentPhase: phase || null });
  invalidateCache('events');
}
/**
 * Finaliza um fechamento AUTOMÁTICO (por horário) pendente, igualando-o ao
 * fechamento manual: captura o snapshot da rodada e marca isOpen:false.
 * Seguro rodar a qualquer momento enquanto o mercado segue fechado: a regra do
 * servidor bloqueia user_teams desde closeAt, então a escalação capturada é a
 * do instante do fechamento. Retorna { round } se finalizou, null se não havia
 * nada a fazer. Chamar só em contexto de admin (escreve round_lineups/events).
 */
export async function finalizeExpiredMarket(eventId) {
  const mkt = await getMarketConfig(eventId);
  if (!mkt || !('isOpen' in mkt) || !mkt.isOpen || !mkt.closeAt) return null;
  if (Date.now() < mkt.closeAt) return null;
  // Rodada que motivou o fechamento = a do primeiro jogo a partir do closeAt
  // (closeAt é 1h antes dele) — mesma convenção de rodada do scoring.
  const matches = await getMatchesByEvent(eventId);
  const target = matches
    .filter((m) => m.date && m.date >= mkt.closeAt)
    .sort((a, b) => a.date - b.date)[0];
  const round = target
    ? (target.rodada != null && target.rodada !== '' ? String(target.rodada) : (target.phase || ''))
    : null;
  if (round) {
    try { await captureRoundLineups(eventId, round); } catch { /* não bloqueia a finalização */ }
  }
  await setMarketConfig(eventId, { isOpen: false, closeAt: null });
  return { round: round || null };
}

export function isMarketOpen(market) {
  if (!market) return true;
  const now = Date.now();
  // Formato atual: { isOpen, closeAt }
  if ('isOpen' in market) {
    if (!market.isOpen) return false;
    if (market.closeAt && now >= market.closeAt) return false;
    return true;
  }
  // Legado: windows[]
  if (market.windows?.length) {
    return market.windows.some((w) => w.openAt && w.closeAt && now >= w.openAt && now <= w.closeAt);
  }
  // Legado: { openAt, closeAt }
  if (market.openAt && market.closeAt) return now >= market.openAt && now <= market.closeAt;
  return true;
}

export async function getUserTeamsByEvent(eventId) {
  if (!eventId) return [];
  return cachedRead(`userteams:event:${eventId}`, async () => {
    const q = query(collection(db, 'user_teams'), where('eventId', '==', eventId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }, LIVE_TTL_MS);
}

// Times de um usuário específico (para ver escalação de adversário)
export async function getUserTeamsByUid(uid, eventId) {
  if (!uid || !eventId) return [];
  return cachedRead(`userteams:uid:${uid}:${eventId}`, async () => {
    const q = query(
      collection(db, 'user_teams'),
      where('uid',     '==', uid),
      where('eventId', '==', eventId),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }, LIVE_TTL_MS);
}

/* ── ESCALAÇÕES POR RODADA ──────────────────────────────────────────
   Salva snapshot da escalação de todos os usuários no início de cada rodada.
   Permite ver o time passado no perfil do adversário e gerar estatísticas.
   ─────────────────────────────────────────────────────────────────── */
export async function captureRoundLineups(eventId, rodada) {
  const teams = await getUserTeamsByEvent(eventId);
  if (!teams.length) return 0;
  const rodadaSafe = rodada.replace(/[^a-zA-Z0-9]/g, '_');
  const now = Date.now();
  // Snapshots restaurados à mão (de backup) são BLINDADOS: nunca os sobrescreve,
  // independentemente da ordem em que o mercado é reaberto/fechado.
  const existing = await getDocs(query(collection(db, 'round_lineups'),
    where('eventId', '==', eventId), where('rodada', '==', String(rodada))));
  const protectedIds = new Set(existing.docs.filter((d) => d.data().restoredFromBackup).map((d) => d.id));
  // Salva em paralelo, lotes de 20
  const BATCH = 20;
  for (let i = 0; i < teams.length; i += BATCH) {
    await Promise.all(
      teams.slice(i, i + BATCH).map((team) => {
        const docId = `${team.uid}__${eventId}__${rodadaSafe}__${team.sport}`;
        if (protectedIds.has(docId)) return Promise.resolve(); // pula restaurados
        return setDoc(doc(db, 'round_lineups', docId), {
          uid:             team.uid,
          eventId,
          rodada,
          sport:           team.sport,
          capturedAt:      now,
          playerIds:       team.playerIds       || [],
          playerPositions: team.playerPositions || [],
          captainId:       team.captainId       || null,
          bench:           team.bench           || {},
          formation:       team.formation       || null,
        });
      })
    );
  }

  // Agregado "mais escalados" (denormalização): conta titulares em TODAS as
  // rodadas já capturadas, para o Dashboard ler 1 doc em vez de todos os
  // round_lineups. Recalcula do zero (idempotente em recapturas da mesma rodada).
  const lineupsSnap = await getDocs(query(collection(db, 'round_lineups'), where('eventId', '==', eventId)));
  const counts = {};
  const snapSet = new Set(); // `${sport}::${rodada}` — quais rodadas têm snapshot (p/ o perfil)
  lineupsSnap.docs.forEach((d) => {
    const dd = d.data();
    (dd.playerIds || []).forEach((pid) => { counts[pid] = (counts[pid] || 0) + 1; });
    if (dd.sport != null && dd.rodada != null) snapSet.add(`${dd.sport}::${dd.rodada}`);
  });
  await setDoc(doc(db, 'lineup_stats', eventId), { eventId, updatedAt: now, counts, snapRounds: [...snapSet] });

  invalidateCache('roundlineups', 'lineupstats');
  return teams.length;
}

// Backups de scores (scores_backup) ordenados do mais novo p/ o mais antigo.
// Usado para recuperar pontuação perdida (cada item tem total + bySport).
export async function getScoreBackups() {
  const snap = await getDocs(collection(db, 'scores_backup'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

// Restaura TODAS as pontuações a partir de um scores_backup (o recompute salva
// um antes de escrever). Reescreve scores/{id} e reconstrói scores_summary.
export async function restoreScoresFromBackup(backupId) {
  const snap = await getDoc(doc(db, 'scores_backup', String(backupId)));
  if (!snap.exists()) throw new Error('Backup não encontrado.');
  const scores = snap.data().scores || [];
  if (!scores.length) throw new Error('Backup vazio.');
  const byEid = {};
  for (const s of scores) {
    const { id, ...data } = s;
    const docId = id || `${s.uid}_${s.eventId || 'default'}`;
    await setDoc(doc(db, 'scores', docId), data);
    const eid = data.eventId || 'default';
    (byEid[eid] = byEid[eid] || []).push({ id: docId, ...data });
  }
  await Promise.all(Object.entries(byEid).map(([eid, entries]) =>
    setDoc(doc(db, 'scores_summary', eid), { eventId: eid, updatedAt: Date.now(), count: entries.length, entries })));
  invalidateCache('scores');
  return scores.length;
}

// Ajuste manual durável de pontos por (usuário × evento). O recompute soma
// `fantasy` em bySport[sport]. fantasy=0 zera o ajuste.
export async function setScoreAdjustment(uid, eventId, { sport, fantasy, note }) {
  await setDoc(doc(db, 'score_adjustments', `${uid}_${eventId}`), {
    uid, eventId, sport, fantasy: Number(fantasy) || 0, note: note || '', updatedAt: Date.now(),
  });
}

// Restaura a escalação de uma rodada (snapshot round_lineups) a partir de um
// time (ex.: vindo de um backup JSON). Grava no MESMO doc-id que captureRoundLineups,
// então sobrescreve um snapshot vazio. `rodada` deve casar com roundKeyOf do scoring.
export async function restoreRoundLineup(uid, eventId, rodada, team) {
  const rodadaSafe = String(rodada).replace(/[^a-zA-Z0-9]/g, '_');
  const sport = team.sport;
  await setDoc(doc(db, 'round_lineups', `${uid}__${eventId}__${rodadaSafe}__${sport}`), {
    uid, eventId, rodada: String(rodada), sport,
    capturedAt:      Date.now(),
    playerIds:       team.playerIds       || [],
    playerPositions: team.playerPositions || [],
    captainId:       team.captainId       || null,
    bench:           team.bench           || {},
    formation:       team.formation       || null,
    restoredFromBackup: true,
  });
  // Registra a rodada como "tem snapshot" (p/ o perfil casar com o score).
  await setDoc(doc(db, 'lineup_stats', eventId), { snapRounds: arrayUnion(`${sport}::${String(rodada)}`) }, { merge: true });
  invalidateCache('roundlineups', 'lineupstats');
}

// Agregado de "mais escalados" (1 doc por evento). null se ainda não gerado.
export async function getLineupStats(eventId) {
  if (!eventId) return null;
  return cachedRead(`lineupstats:${eventId}`, async () => {
    const snap = await getDoc(doc(db, 'lineup_stats', eventId));
    return snap.exists() ? snap.data() : null;
  }, LIVE_TTL_MS);
}

export async function getRoundLineupsByUser(uid, eventId) {
  return cachedRead(`roundlineups:uid:${uid}:${eventId}`, async () => {
    const q = query(
      collection(db, 'round_lineups'),
      where('uid',     '==', uid),
      where('eventId', '==', eventId),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }, LIVE_TTL_MS);
}

export async function getRoundLineupsByEvent(eventId, rodada) {
  const q = query(
    collection(db, 'round_lineups'),
    where('eventId', '==', eventId),
    where('rodada',  '==', rodada),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getAllRoundLineupsByEvent(eventId) {
  if (!eventId) return [];
  return cachedRead(`roundlineups:event:${eventId}`, async () => {
    const q = query(collection(db, 'round_lineups'), where('eventId', '==', eventId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }, LIVE_TTL_MS);
}

export async function getPlayersByEvent(eventId) {
  if (!eventId) return [];
  // Mesma semântica do where('eventId','==',eventId): igualdade estrita.
  return (await getPlayers()).filter((p) => p.eventId === eventId);
}

// Perfis de outros usuários (nome/foto para ranking/ligas). Cacheado por uid —
// mudam raramente; invalidado em updateDisplayName. Dedupa leituras entre
// navegações e entre ligas que compartilham membros.
export async function getUserProfilesByUids(uids) {
  if (!uids.length) return {};
  const result = {};
  await Promise.all([...new Set(uids)].map(async (uid) => {
    const data = await cachedRead(`profile:${uid}`, async () => {
      const snap = await getDoc(doc(db, 'users', uid));
      return snap.exists() ? snap.data() : null;
    });
    if (data) result[uid] = data;
  }));
  return result;
}

/* ── BUSCA DE USUÁRIOS ────────────────────────────────────────────── */
export async function searchUsers(query) {
  if (!query?.trim()) return [];
  // Lista cacheada por 60s: evita reler a coleção 'users' inteira a cada busca.
  const users = await cachedRead('users:all', async () => {
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
  }, 60 * 1000);
  const q = query.toLowerCase();
  // Busca só por nome — o e-mail não é mais público.
  return users
    .filter((u) => (u.displayName || '').toLowerCase().includes(q))
    .slice(0, 20);
}

/* Migração one-shot (admin): move o campo `email` de TODOS os docs públicos
   `users` para a subcoleção privada `users/{uid}/private/profile` e o remove do
   público. Cobre usuários inativos que ainda não migraram no login. */
export async function migrateAllEmailsToPrivate() {
  const snap = await getDocs(collection(db, 'users'));
  let migrated = 0;
  for (const d of snap.docs) {
    if (d.data().email === undefined) continue;
    await setDoc(doc(db, 'users', d.id, 'private', 'profile'),
      { email: d.data().email || '' }, { merge: true });
    await updateDoc(d.ref, { email: deleteField() });
    migrated++;
  }
  invalidateCache('users');
  return migrated;
}

/* ── INSÍGNIAS ────────────────────────────────────────────────────── */
export async function awardBadge(uid, badgeId) {
  const ref  = doc(db, 'user_badges', uid);
  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : {};
  const prev = data[badgeId] || { count: 0 };
  const prevNew = Array.isArray(data._new) ? data._new : [];
  // Adiciona à lista de novas apenas se não estiver já lá
  const newList = prevNew.includes(badgeId) ? prevNew : [...prevNew, badgeId];
  await setDoc(ref, {
    ...data,
    [badgeId]: { count: prev.count + 1, lastEarned: Date.now() },
    _new: newList,
  }, { merge: true });
  invalidateCache(`badges:${uid}`);
}

// Cacheado por uid: badges só mudam por concessão/revogação (admin/motor),
// que invalidam a entrada. Corta o leque de leituras no Dashboard/ranking.
export async function getUserBadges(uid) {
  return cachedRead(`badges:${uid}`, async () => {
    const snap = await getDoc(doc(db, 'user_badges', uid));
    return snap.exists() ? snap.data() : {};
  });
}

// Badges que só podem ser concedidos ao fim do evento
const EVENT_ONLY_BADGE_IDS = [
  'champion', 'podium', 'leader', 'onisciente', 'first_steps', 'mestre',
  'compromissado_escalacao', 'magnetico', 'termometro', 'veterano',
  'loyal_fan', 'symbiosis', 'eternal_partner',
  'friends_1', 'friends_5', 'friends_10',
  'league_champion',
];

export async function revokeEventOnlyBadges(uid) {
  const ref  = doc(db, 'user_badges', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  const toRemove = EVENT_ONLY_BADGE_IDS.filter((id) => data[id] !== undefined);
  const cleanNew  = (data._new || []).filter((id) => !EVENT_ONLY_BADGE_IDS.includes(id));
  if (toRemove.length === 0 && cleanNew.length === (data._new || []).length) return;
  const updates = { _new: cleanNew };
  toRemove.forEach((id) => { updates[id] = deleteField(); });
  await updateDoc(ref, updates);
  invalidateCache(`badges:${uid}`);
}

export async function clearNewBadge(uid, badgeId) {
  const ref  = doc(db, 'user_badges', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data    = snap.data();
  const newList = (data._new || []).filter((id) => id !== badgeId);
  await updateDoc(ref, { _new: newList });
  invalidateCache(`badges:${uid}`);
}

export async function getBadgeProcessedRounds(eventId) {
  const snap = await getDoc(doc(db, 'badge_rounds', eventId));
  return snap.exists() ? (snap.data().processed || []) : [];
}

export async function markBadgeRoundsProcessed(eventId, rounds) {
  const ref  = doc(db, 'badge_rounds', eventId);
  const snap = await getDoc(ref);
  const prev = snap.exists() ? (snap.data().processed || []) : [];
  const merged = [...new Set([...prev, ...rounds])];
  await setDoc(ref, { processed: merged }, { merge: true });
}

/* ── AMIGOS ───────────────────────────────────────────────────────── */
export async function getFriends(uid) {
  const snap = await getDocs(collection(db, 'users', uid, 'friends'));
  return snap.docs.map((d) => d.data());
}

export async function getFriendRequests(uid) {
  const snap = await getDocs(collection(db, 'users', uid, 'friendRequests'));
  return snap.docs.map((d) => d.data());
}

/* ── LIGAS PERSONALIZADAS ─────────────────────────────────────────── */
export async function createLeague(uid, eventId, name, isPublic = false, leagueMode = 'ambas', emoji = '') {
  const code = Math.random().toString(36).slice(2, 10).toUpperCase();
  const ref = await addDoc(collection(db, 'leagues'), {
    name, eventId, createdBy: uid,
    inviteCode: code, members: [uid],
    isPublic,
    leagueMode,   // 'fantasy' | 'palpites' | 'ambas'
    emoji,        // emoticon escolhido pelo criador (decoração)
    createdAt: Date.now(),
  });
  return { id: ref.id, inviteCode: code };
}

export async function getLeagueByCode(code) {
  const q    = query(collection(db, 'leagues'), where('inviteCode', '==', code.toUpperCase()));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export async function getLeagueById(leagueId) {
  const snap = await getDoc(doc(db, 'leagues', leagueId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function joinLeague(leagueId, uid) {
  await updateDoc(doc(db, 'leagues', leagueId), { members: arrayUnion(uid) });
}

export async function leaveLeague(leagueId, uid) {
  const snap = await getDoc(doc(db, 'leagues', leagueId));
  if (!snap.exists()) return;
  const members = (snap.data().members || []).filter((m) => m !== uid);
  await updateDoc(doc(db, 'leagues', leagueId), { members });
}

/* ── Solicitação / aprovação de entrada ──────────────────────────────
   Entrar numa liga exige pedido; o dono aceita ou recusa. */
export async function requestJoinLeague(leagueId, uid) {
  await updateDoc(doc(db, 'leagues', leagueId), { pendingMembers: arrayUnion(uid) });
}
export async function cancelJoinRequest(leagueId, uid) {
  await updateDoc(doc(db, 'leagues', leagueId), { pendingMembers: arrayRemove(uid) });
}
export async function approveLeagueMember(leagueId, uid) {
  await updateDoc(doc(db, 'leagues', leagueId), {
    pendingMembers: arrayRemove(uid),
    members: arrayUnion(uid),
  });
}
export async function rejectLeagueMember(leagueId, uid) {
  await updateDoc(doc(db, 'leagues', leagueId), { pendingMembers: arrayRemove(uid) });
}

export async function getUserLeagues(uid, eventId) {
  const q    = query(collection(db, 'leagues'), where('members', 'array-contains', uid));
  const snap = await getDocs(q);
  const all  = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (!eventId) return all;
  return all.filter((l) => !l.eventId || l.eventId === eventId);
}

// Ligas em que o usuário tem solicitação pendente
export async function getPendingRequestLeagues(uid) {
  const q    = query(collection(db, 'leagues'), where('pendingMembers', 'array-contains', uid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Ligas criadas pelo usuário que têm solicitações pendentes
export async function getOwnedLeaguesWithRequests(uid) {
  const q    = query(collection(db, 'leagues'), where('createdBy', '==', uid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((l) => (l.pendingMembers || []).length > 0);
}

// Todas as ligas de um evento (para descoberta e gestão)
export async function getLeaguesByEvent(eventId) {
  const q    = query(collection(db, 'leagues'), where('eventId', '==', eventId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function updateLeague(leagueId, data) {
  await updateDoc(doc(db, 'leagues', leagueId), data);
}
export async function deleteLeague(leagueId) {
  await deleteDoc(doc(db, 'leagues', leagueId));
}
// Remove um membro da liga (usado pelo dono/admin)
export async function removeLeagueMember(leagueId, uid) {
  await updateDoc(doc(db, 'leagues', leagueId), { members: arrayRemove(uid) });
}

export async function getPublicLeagues(eventId) {
  const q    = query(collection(db, 'leagues'), where('isPublic', '==', true));
  const snap = await getDocs(q);
  const all  = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (!eventId) return all;
  return all.filter((l) => !l.eventId || l.eventId === eventId);
}

/* ── PALPITES DE CAMPEONATO (antecipados) ─────────────────────────────
   Um doc por (uid × eventId): contém campeão, vice, 3º, 4º, artilheiro.
   Bloqueado 1 hora antes do início do evento (startDate).
   ─────────────────────────────────────────────────────────────────── */
export async function getEventPrediction(uid, eventId) {
  const snap = await getDoc(doc(db, 'event_predictions', `${uid}_${eventId}`));
  return snap.exists() ? snap.data() : null;
}

export async function saveEventPrediction(uid, eventId, data) {
  await setDoc(doc(db, 'event_predictions', `${uid}_${eventId}`), {
    uid, eventId, ...data, updatedAt: Date.now(),
  });
}

/* ── FOTO DE JOGADOR / ESCUDO DO TIME (salva URL no Firestore) ─────── */
export async function updatePlayerPhoto(playerId, photoUrl) {
  await updateDoc(doc(db, 'players', playerId), { photoUrl });
  await bundleUpsert('players', playerId, { photoUrl });
  invalidateCache('players');
}
export async function updateTeamShield(teamId, shieldUrl) {
  await updateDoc(doc(db, 'teams', teamId), { shieldUrl });
  await bundleUpsert('teams', teamId, { shieldUrl });
  invalidateCache('teams');
}
export async function updateEventLogo(eventId, logoUrl) {
  await updateDoc(doc(db, 'events', eventId), { logoUrl });
  invalidateCache('events');
}

/* ── EXPORTAÇÃO COMPLETA (backup JSON — admin) ───────────────────────
   Lê todas as coleções relevantes e devolve um objeto serializável.
   Não inclui subcoleções de amigos. Uso manual (botão no Admin).
   ─────────────────────────────────────────────────────────────────── */
export async function exportAllData() {
  const COLLECTIONS = [
    'events', 'teams', 'players', 'matches', 'scores',
    'user_teams', 'predictions', 'event_predictions', 'event_participants',
    'round_lineups', 'user_badges', 'leagues', 'users',
  ];
  const data = {};
  await Promise.all(COLLECTIONS.map(async (name) => {
    const snap = await getDocs(collection(db, name));
    data[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }));
  return {
    exportedAt: new Date().toISOString(),
    collections: data,
  };
}
