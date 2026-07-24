/**
 * scoring.js — Motor de pontuação centralizado.
 * A lógica por modalidade vive em sportRules.js.
 * Este arquivo cuida apenas do recompute global do Firestore.
 */
import { collection, getDocs, getDoc, doc, setDoc, deleteDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../services/firebase';
import { invalidateCache, DEFAULT_EVENT_ID } from '../services/firestore';
import { calcFantasyPoints, calcTeamBonus } from './sportRules';
import { fmtPts } from './labels';

const SCORE_BACKUPS_TO_KEEP = 8;

/**
 * Salva um snapshot dos scores atuais em `scores_backup/{timestamp}` antes de
 * recalcular — rede de segurança caso o recompute introduza um erro.
 * Mantém apenas os últimos SCORE_BACKUPS_TO_KEEP backups.
 */
async function backupScores() {
  const snap = await getDocs(collection(db, 'scores'));
  if (snap.empty) return; // nada a preservar (primeiro cálculo)
  const scores = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const ts = Date.now();
  await setDoc(doc(db, 'scores_backup', String(ts)), {
    createdAt: ts,
    count: scores.length,
    scores,
  });
  // Poda: remove backups além dos mais recentes
  try {
    const all = await getDocs(query(collection(db, 'scores_backup'), orderBy('createdAt', 'desc')));
    await Promise.all(all.docs.slice(SCORE_BACKUPS_TO_KEEP).map((d) => deleteDoc(d.ref)));
  } catch { /* poda é best-effort */ }
}

export { calcFantasyPoints };   // reexporta para quem importava fantasyPointsForPlayer

/* Pontuação de palpites POR FASE. Categorias (mutuamente exclusivas):
   - exact:           acertou os dois placares
   - partialWinner:   acertou o placar de UM time + o vencedor/empate
   - partialNoWinner: acertou o placar de UM time, mas errou o vencedor
   - winner:          acertou só o vencedor/empate (nenhum placar exato)
   1ª fase = group (também usada para rodadas normais sem fase definida). */
export const PREDICTION_POINTS_BY_PHASE = {
  group: { exact: 9,   winner: 4,  partialWinner: 5,   partialNoWinner: 1  },
  r32:   { exact: 27,  winner: 12, partialWinner: 15,  partialNoWinner: 3  },
  r16:   { exact: 36,  winner: 16, partialWinner: 20,  partialNoWinner: 4  },
  qf:    { exact: 45,  winner: 20, partialWinner: 25,  partialNoWinner: 5  },
  sf:    { exact: 90,  winner: 40, partialWinner: 50,  partialNoWinner: 10 },
  third: { exact: 18,  winner: 8,  partialWinner: 10,  partialNoWinner: 2  },
  final: { exact: 180, winner: 80, partialWinner: 100, partialNoWinner: 20 },
};

// Resolve a tabela de pontos da partida pela fase (fallback: 1ª fase)
function predictionTableFor(match) {
  return PREDICTION_POINTS_BY_PHASE[match?.phase] || PREDICTION_POINTS_BY_PHASE.group;
}

// Pontos para palpites antecipados de campeonato
export const EVENT_PREDICTION_POINTS = {
  champion:   50,
  runnerUp:   30,
  thirdPlace: 15,
  fourthPlace:10,
  topScorer:  20,
};

/**
 * Palpites antecipados de campeonato — schema FLAT (Copa padrão, sem genderMode).
 * userPred: { champion, runnerUp, thirdPlace, fourthPlace, topScorer } (ids do palpite).
 * real:     mesma forma, com o resultado VERDADEIRO (event.champResult).
 */
export function eventPredictionPoints(userPred, real) {
  if (!userPred || !real) return 0;
  let pts = 0;
  if (userPred.champion    && userPred.champion    === real.champion)    pts += EVENT_PREDICTION_POINTS.champion;
  if (userPred.runnerUp    && userPred.runnerUp    === real.runnerUp)    pts += EVENT_PREDICTION_POINTS.runnerUp;
  if (userPred.thirdPlace  && userPred.thirdPlace  === real.thirdPlace)  pts += EVENT_PREDICTION_POINTS.thirdPlace;
  if (userPred.fourthPlace && userPred.fourthPlace === real.fourthPlace) pts += EVENT_PREDICTION_POINTS.fourthPlace;
  if (userPred.topScorer   && userPred.topScorer   === real.topScorer)   pts += EVENT_PREDICTION_POINTS.topScorer;
  return pts;
}

// OLIMFEF: palpite de campeonato POR MODALIDADE (campeão/3º/4º) + GERAL (dobrado).
export const CHAMP_POINTS = { champion: 50, second: 30, third: 15, fourth: 10 };
/**
 * userChamp / results: { [modalidade|'overall']: { champion, second, third, fourth } } (ids de país).
 * O bloco 'overall' (campeão geral do OLIMFEF) vale o DOBRO.
 */
export function championshipPoints(userChamp, results) {
  if (!userChamp || !results) return 0;
  let pts = 0;
  for (const key of Object.keys(results)) {
    const r = results[key]; const u = userChamp[key];
    if (!r || !u) continue;
    const mult = key === 'overall' ? 2 : 1;
    if (u.champion && u.champion === r.champion) pts += CHAMP_POINTS.champion * mult;
    if (u.second   && u.second   === r.second)   pts += CHAMP_POINTS.second   * mult;
    if (u.third    && u.third    === r.third)    pts += CHAMP_POINTS.third    * mult;
    if (u.fourth   && u.fourth   === r.fourth)   pts += CHAMP_POINTS.fourth   * mult;
  }
  return pts;
}

export function predictionPoints(prediction, match) {
  if (!prediction || match.status !== 'finished') return 0;
  const ph = Number(prediction.homeScore);
  const pa = Number(prediction.awayScore);
  const mh = Number(match.homeScore);
  const ma = Number(match.awayScore);
  if ([ph, pa, mh, ma].some((n) => Number.isNaN(n))) return 0;

  const P = predictionTableFor(match);

  // Placar exato
  if (ph === mh && pa === ma) return P.exact;

  const oneRight    = (ph === mh) !== (pa === ma); // exatamente um placar correto
  const predOut     = ph > pa ? 1 : ph < pa ? -1 : 0;
  const realOut     = mh > ma ? 1 : mh < ma ? -1 : 0;
  const winnerRight = predOut === realOut;

  if (oneRight && winnerRight)  return P.partialWinner;
  if (oneRight && !winnerRight) return P.partialNoWinner;
  if (winnerRight)              return P.winner;
  return 0;
}

// True se o palpite acertou o placar exato (para marcadores na UI)
export function isExactPrediction(prediction, match) {
  if (!prediction) return false;
  return Number(prediction.homeScore) === Number(match.homeScore)
      && Number(prediction.awayScore) === Number(match.awayScore);
}

// Retorna true se os palpites da partida já estão bloqueados (< 1h para começar)
export function isPredictionLocked(match) {
  if (!match.date) return false;
  return Date.now() >= match.date - 60 * 60 * 1000;
}

const SPORTS = ['futebol', 'futsal', 'basketball', 'volleyball', 'handball', 'beachvolley'];

function emptyBySport() {
  const o = {};
  SPORTS.forEach((s) => { o[s] = { fantasy: 0, prediction: 0, total: 0 }; });
  return o;
}

// Rótulo de rodada (MESMA convenção do Admin/captura e do perfil).
const roundKeyOf = (m) => (m.rodada != null && m.rodada !== '' ? String(m.rodada) : (m.phase || ''));

/**
 * Pontos FANTASY de uma escalação numa RODADA completa (todas as partidas da
 * rodada já finalizadas). Regra do reserva: o titular conta sempre, EXCETO
 * quando fez exatamente 0 na rodada (não jogou/nada) — aí o reserva da MESMA
 * posição entra no lugar (pontos do reserva). 1 reserva por posição. Pontos
 * negativos do titular (ex.: cartão) PERMANECEM (não acionam reserva). Capitão
 * dobra (×2). Bônus de time: 1× por (time, partida) dos que contaram.
 * Fonte ÚNICA usada pelo recompute completo E pelo incremental.
 */
export function roundFantasyDetail(roundMatches, lineup, sport) {
  // Pontos de um jogador na rodada (soma sobre as partidas da rodada)
  const ptsOf = (pid) => {
    let p = 0;
    for (const m of roundMatches) {
      for (const st of (m.playerStats || [])) {
        if (st.playerId === pid) p += calcFantasyPoints(st, m, false);
      }
    }
    return p;
  };

  // entries na ORDEM de avaliação: cada reserva que entra vem logo após o
  // titular que saiu. role: 'starter' | 'starter-out' | 'reserve-in'.
  const entries   = [];
  const active    = new Set(); // jogadores que efetivamente contaram (p/ bônus de time)
  const usedBench = new Set(); // chaves de reserva já usadas (cada reserva 1×)
  const starters  = lineup.playerIds || [];
  const positions = lineup.playerPositions || [];
  const benchKeys = Object.keys(lineup.bench || {});
  // Posição/gênero "base" de uma chave (reserva OLIMFEF pode ser `genero#1`)
  const baseOf = (k) => (typeof k === 'string' && k.includes('#') ? k.split('#')[0] : k);

  starters.forEach((pid, idx) => {
    const sPts = ptsOf(pid);
    if (sPts !== 0) {
      // Pontuou (positivo) ou foi penalizado (negativo) → titular conta
      const isCap = lineup.captainId === pid;
      entries.push({ playerId: pid, pts: isCap ? sPts * 2 : sPts, role: 'starter', captain: isCap });
      active.add(pid);
    } else {
      // Titular fez exatamente 0 → entra um reserva COMPATÍVEL (mesma posição/gênero), 1×
      const pos = positions[idx];
      const k = benchKeys.find((bk) => !usedBench.has(bk) && lineup.bench[bk]
        && (bk === pos || baseOf(bk) === pos));
      const benchPid = k ? lineup.bench[k] : null;
      if (benchPid && !active.has(benchPid)) {
        usedBench.add(k);
        entries.push({ playerId: pid, pts: 0, role: 'starter-out', replacedBy: benchPid });
        entries.push({ playerId: benchPid, pts: ptsOf(benchPid), role: 'reserve-in', replaces: pid });
        active.add(benchPid);
      } else {
        // sem reserva → titular fica (0 pts)
        entries.push({ playerId: pid, pts: 0, role: 'starter', captain: lineup.captainId === pid });
        active.add(pid);
      }
    }
  });

  // Bônus de time: 1× por (time, partida) dos jogadores que contaram. Usa a
  // modalidade REAL (m.sport) — `sport` pode ser composto (modalidade__genero).
  let bonus = 0;
  for (const m of roundMatches) {
    const teams = new Set(
      (m.playerStats || []).filter((s) => active.has(s.playerId)).map((s) => s.teamId)
    );
    for (const tid of teams) bonus += calcTeamBonus(tid, m, m.sport);
  }

  const total = entries.reduce((s, e) => s + e.pts, 0) + bonus;
  return { entries, bonus, total, active };
}

// Total da rodada (motor de pontuação). Mesmo resultado de antes — agora apenas
// um wrapper fino sobre o detalhamento, p/ uma fonte única da regra do reserva.
function roundFantasyForLineup(roundMatches, lineup, sport) {
  return roundFantasyDetail(roundMatches, lineup, sport).total;
}

export async function recomputeAllScores() {
  // Backup de segurança antes de sobrescrever os scores
  await backupScores();

  const [usersSnap, matchesSnap, userTeamsSnap, predictionsSnap, lineupsSnap, eventsSnap, evPredSnap, adjSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'matches')),
    getDocs(collection(db, 'user_teams')),
    getDocs(collection(db, 'predictions')),
    getDocs(collection(db, 'round_lineups')),
    getDocs(collection(db, 'events')),
    getDocs(collection(db, 'event_predictions')),
    getDocs(collection(db, 'score_adjustments')),
  ]);

  // Ajustes manuais duráveis por (uid,evento) — ex.: pontos de uma escalação
  // perdida. Doc id `${uid}_${eid}` → { sport, fantasy }. Somados no bySport.
  const adjByKey = {};
  adjSnap.docs.forEach((d) => { adjByKey[d.id] = d.data(); });

  // Palpite de campeonato: resultado real por evento + palpite por (uid,evento)
  const champResultsByEvent = {};
  eventsSnap.docs.forEach((d) => { if (d.data().champResults) champResultsByEvent[d.id] = d.data().champResults; });
  const champByUserEvent = {}; // doc id `${uid}_${eid}` → champ palpitado
  evPredSnap.docs.forEach((d) => { const x = d.data(); if (x.champ) champByUserEvent[d.id] = x.champ; });

  // Palpite antecipado FLAT (Copa padrão): resultado real por evento + palpite
  // por (uid,evento). Schema distinto do OLIMFEF acima (champion/runnerUp/... soltos).
  const evPredResultsByEvent = {};
  eventsSnap.docs.forEach((d) => { if (d.data().champResult) evPredResultsByEvent[d.id] = d.data().champResult; });
  const evPredByUserEvent = {}; // doc id `${uid}_${eid}` → { champion, runnerUp, thirdPlace, fourthPlace, topScorer }
  evPredSnap.docs.forEach((d) => {
    const x = d.data();
    if (x.champion || x.runnerUp || x.thirdPlace || x.fourthPlace || x.topScorer) evPredByUserEvent[d.id] = x;
  });

  const allMatches     = matchesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const allUserTeams   = userTeamsSnap.docs.map((d) => d.data());
  const allPredictions = predictionsSnap.docs.map((d) => d.data());
  const allRoundLineups= lineupsSnap.docs.map((d) => d.data());
  const finished       = allMatches.filter((m) => m.status === 'finished');

  // Eventos país/gênero (OLIMFEF): a escalação é por modalidade × gênero, então
  // a CHAVE de esporte da escalação embute o gênero (modalidade__genero).
  const genderModeEvents = new Set(eventsSnap.docs.filter((d) => d.data().genderMode).map((d) => d.id));
  const sportKeyOf = (m) => genderModeEvents.has(m.eventId || 'default')
    ? `${m.sport}__${m.gender || ''}` : m.sport;
  // Vôlei de Praia: pontos por jogador lançados pelo admin (sem partidas)
  const beachStatsByEvent = {};
  eventsSnap.docs.forEach((d) => { if (d.data().beachStats) beachStatsByEvent[d.id] = d.data().beachStats; });

  // Pontuação é por RODADA completa (a regra do reserva precisa do resultado de
  // TODAS as partidas da rodada). Uma rodada (eid::sportKey::rk) só pontua quando
  // todas as suas partidas estão finalizadas.
  const roundKey = (m) => `${m.eventId || 'default'}::${sportKeyOf(m)}::${roundKeyOf(m)}`;
  const roundComplete = {};
  const grp = {};
  allMatches.forEach((m) => { (grp[roundKey(m)] = grp[roundKey(m)] || []).push(m); });
  Object.entries(grp).forEach(([k, ms]) => { roundComplete[k] = ms.every((m) => m.status === 'finished'); });
  const scorable = finished.filter((m) => roundComplete[roundKey(m)]);

  // Fallback p/ o time ATUAL só vale na ÚLTIMA rodada (snapshot ainda não
  // capturado) OU em rodadas legadas SEM nenhum snapshot. Numa rodada PASSADA que
  // já tem snapshots, quem não tem snapshot NÃO pontua (não escalou aquela rodada).
  const latestRkByKey = {}; // `${eid}::${sportKey}` → { rk, d } (jogo de maior data)
  allMatches.forEach((m) => {
    const k = `${m.eventId || 'default'}::${sportKeyOf(m)}`;
    const d = m.date || 0;
    if (!latestRkByKey[k] || d > latestRkByKey[k].d) latestRkByKey[k] = { rk: roundKeyOf(m), d };
  });
  const roundHasSnap = new Set(
    allRoundLineups.map((s) => `${s.eventId || 'default'}::${s.sport}::${s.rodada}`)
  );

  // Agregado por evento (denormalização): junta todos os scores num único doc
  // para o ranking ser lido em 1 leitura (em vez de O(usuários)).
  const summaries = {}; // eid → entries[]

  for (const userDoc of usersSnap.docs) {
    const uid         = userDoc.id;
    const displayName = userDoc.data().displayName || 'Jogador';
    const myTeams     = allUserTeams.filter((t) => t.uid === uid);

    // Determina todos os eventos em que este usuário participou
    const eventIds = [...new Set(myTeams.map((t) => t.eventId || 'default'))];
    // Inclui eventos de palpites (partidas finalizadas)
    allPredictions
      .filter((p) => p.uid === uid)
      .forEach((p) => {
        const m = finished.find((x) => x.id === p.matchId);
        if (m) eventIds.push(m.eventId || 'default');
      });
    // Inclui eventos onde só fez palpite de campeonato (sem time/predição)
    Object.keys(champByUserEvent).forEach((k) => {
      if (k.startsWith(`${uid}_`)) eventIds.push(k.slice(uid.length + 1));
    });
    Object.keys(evPredByUserEvent).forEach((k) => {
      if (k.startsWith(`${uid}_`)) eventIds.push(k.slice(uid.length + 1));
    });
    const uniqueEventIds = [...new Set(eventIds)];

    for (const eid of uniqueEventIds) {
      const bySport = emptyBySport();

      // Pontos fantasy por evento — usa a escalação DAQUELA rodada (snapshot
      // round_lineups); cai no time atual em rodadas sem snapshot (legado).
      const myEventTeams = myTeams.filter((t) => (t.eventId || 'default') === eid);
      const mySnaps      = allRoundLineups.filter((s) => s.uid === uid && (s.eventId || 'default') === eid);
      const sports       = [...new Set([...myEventTeams.map((t) => t.sport), ...mySnaps.map((s) => s.sport)])];

      for (const sport of sports) {
        // `sport` pode ser composto (modalidade__genero) no genderMode; os pontos
        // agregam na modalidade base do bySport.
        const baseSport = sport.includes('__') ? sport.split('__')[0] : sport;
        if (!bySport[baseSport]) continue;
        const currentTeam = myEventTeams.find((t) => t.sport === sport) || null;

        // Vôlei de Praia: sem partidas — pontua pelos pontos por jogador (event.beachStats)
        if (baseSport === 'beachvolley') {
          const bs = beachStatsByEvent[eid];
          const lineup = mySnaps.find((s) => s.sport === sport) || currentTeam;
          if (bs && lineup) {
            const beachMatch = {
              sport: 'beachvolley',
              playerStats: Object.entries(bs).map(([playerId, points]) => ({ playerId, points: Number(points) || 0 })),
            };
            const fpts = roundFantasyForLineup([beachMatch], lineup, 'beachvolley');
            bySport.beachvolley.fantasy += fpts;
            bySport.beachvolley.total   += fpts;
          }
          continue;
        }

        // Agrupa as partidas PONTUÁVEIS (rodadas completas) por rodada (chave composta)
        const byRound = {};
        scorable
          .filter((m) => sportKeyOf(m) === sport && (m.eventId || 'default') === eid)
          .forEach((m) => { (byRound[roundKeyOf(m)] = byRound[roundKeyOf(m)] || []).push(m); });

        for (const [rk, roundMatches] of Object.entries(byRound)) {
          const snap     = mySnaps.find((s) => s.sport === sport && s.rodada === rk);
          const isLatest = latestRkByKey[`${eid}::${sport}`]?.rk === rk;
          const hasSnap  = roundHasSnap.has(`${eid}::${sport}::${rk}`);
          // snapshot do usuário; senão time atual SÓ na última rodada ou em rodada
          // legada sem snapshots. Rodada passada já snapshotada sem o dele → 0.
          const lineup = snap || ((isLatest || !hasSnap) ? currentTeam : null);
          if (!lineup) continue;
          const fpts = roundFantasyForLineup(roundMatches, lineup, baseSport);
          bySport[baseSport].fantasy += fpts;
          bySport[baseSport].total   += fpts;
        }
      }

      // Pontos de palpites por evento (por PARTIDA finalizada — não espera a rodada)
      for (const pred of allPredictions.filter((p) => p.uid === uid)) {
        const match = finished.find((m) => m.id === pred.matchId && (m.eventId || 'default') === eid);
        if (!match) continue;
        const sport = match.sport;
        if (!bySport[sport]) continue;
        const pts = predictionPoints(pred, match);
        bySport[sport].prediction += pts;
        bySport[sport].total      += pts;
      }

      // Ajuste manual durável (escalação perdida etc.): soma no bySport para o
      // valor sobreviver a recálculos E a pontuações incrementais (que recomputam
      // o total a partir do bySport).
      const adj = adjByKey[`${uid}_${eid}`];
      if (adj && adj.fantasy && bySport[adj.sport]) {
        bySport[adj.sport].fantasy += Number(adj.fantasy) || 0;
        bySport[adj.sport].total   += Number(adj.fantasy) || 0;
      }

      let fantasyTotal = 0, predictionTotal = 0, total = 0;
      SPORTS.forEach((s) => {
        // Arredonda cada bucket (evita ruído de ponto flutuante acumulado)
        bySport[s].fantasy    = fmtPts(bySport[s].fantasy);
        bySport[s].prediction = fmtPts(bySport[s].prediction);
        bySport[s].total      = fmtPts(bySport[s].total);
        fantasyTotal    += bySport[s].fantasy;
        predictionTotal += bySport[s].prediction;
        total           += bySport[s].total;
      });

      // Palpite de campeonato (por modalidade + geral dobrado) — pontuado no completo
      const champTotal  = championshipPoints(champByUserEvent[`${uid}_${eid}`], champResultsByEvent[eid]);
      // Palpite antecipado FLAT (Copa padrão: campeão/vice/3º/4º/artilheiro)
      const evPredTotal = eventPredictionPoints(evPredByUserEvent[`${uid}_${eid}`], evPredResultsByEvent[eid]);
      total           = fmtPts(total + champTotal + evPredTotal);
      fantasyTotal    = fmtPts(fantasyTotal);
      predictionTotal = fmtPts(predictionTotal + champTotal + evPredTotal);

      // Doc keyed por uid_eventId — um score por (usuário × evento)
      const scoreData = {
        uid,
        eventId: eid,
        displayName,
        total,
        fantasyTotal,
        predictionTotal,
        champTotal,
        bySport,
        updatedAt: Date.now(),
      };
      await setDoc(doc(db, 'scores', `${uid}_${eid}`), scoreData);
      (summaries[eid] = summaries[eid] || []).push({ id: `${uid}_${eid}`, ...scoreData });
    }
  }

  // Grava o agregado por evento (1 doc com todos os scores).
  await Promise.all(Object.entries(summaries).map(([eid, entries]) =>
    setDoc(doc(db, 'scores_summary', eid), {
      eventId: eid,
      updatedAt: Date.now(),
      count: entries.length,
      entries,
    })
  ));

  // snapRounds por evento → o perfil sabe quais rodadas têm snapshot (mesmo sinal
  // global que o score usa), para mostrar/ocultar rodada igual à pontuação.
  const snapByEid = {};
  allRoundLineups.forEach((s) => {
    if (s.sport == null || s.rodada == null) return;
    const e = s.eventId || 'default';
    (snapByEid[e] = snapByEid[e] || new Set()).add(`${s.sport}::${s.rodada}`);
  });
  await Promise.all(Object.entries(snapByEid).map(([e, set]) =>
    setDoc(doc(db, 'lineup_stats', e), { snapRounds: [...set] }, { merge: true }).catch(() => {})));

  // Marcadores para o incremental não recontar:
  //  · predScoredAt: palpites já pontuados (toda partida finalizada)
  //  · fantScoredAt: fantasy da rodada já pontuado (só rodadas completas)
  const stampedAt = Date.now();
  await Promise.all([
    ...finished.map((m) =>
      setDoc(doc(db, 'matches', m.id), { predScoredAt: stampedAt }, { merge: true }).catch(() => {})),
    ...scorable.map((m) =>
      setDoc(doc(db, 'matches', m.id), { fantScoredAt: stampedAt }, { merge: true }).catch(() => {})),
  ]);

  // Scores mudaram: limpa o cache para clientes relerem os novos totais.
  invalidateCache('scores');
}

/**
 * INCREMENTAL: soma aos scores sem reler/recontar tudo. Duas granularidades:
 *  · PALPITES: por PARTIDA finalizada (marcador `predScoredAt`) — não espera a rodada.
 *  · FANTASY: por RODADA completa (marcador `fantScoredAt`) — a regra do reserva
 *    precisa de todas as partidas da rodada finalizadas.
 * Lê só: partidas do evento + palpites das novas + escalações das rodadas prontas.
 * Para CORRIGIR um resultado já pontuado, use recomputeAllScores() (completo).
 */
export async function scoreNewResults(eventId) {
  const eid = eventId || DEFAULT_EVENT_ID;

  const mSnap = await getDocs(query(collection(db, 'matches'), where('eventId', '==', eid)));
  const all = mSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Evento país/gênero (OLIMFEF): a escalação é por modalidade × gênero
  const evSnap = await getDoc(doc(db, 'events', eid));
  const genderMode = evSnap.exists() && !!evSnap.data().genderMode;
  const sportKey = (m) => genderMode ? `${m.sport}__${m.gender || ''}` : m.sport;

  const deltas = {}; // uid → bySport
  const ensure = (uid) => (deltas[uid] = deltas[uid] || emptyBySport());
  const predMatchesToMark = []; // partidas cujos palpites pontuamos agora
  const fantMatchesToMark = []; // partidas de rodadas cujo fantasy pontuamos agora
  let currentTeams = null;      // fallback (lido 1× se faltar snapshot)

  // ── A) PALPITES: cada partida finalizada ainda sem predScoredAt.
  //    `scoredAt` (marcador ANTIGO) também conta como já pontuada — evita
  //    recontar partidas pontuadas antes da troca de marcadores (dobrava).
  for (const match of all.filter((m) => m.status === 'finished' && !m.predScoredAt && !m.scoredAt)) {
    predMatchesToMark.push(match);
    const sport = match.sport;
    if (!emptyBySport()[sport]) continue;
    const pSnap = await getDocs(query(collection(db, 'predictions'), where('matchId', '==', match.id)));
    pSnap.docs.forEach((pd) => {
      const pred = pd.data();
      const pts = predictionPoints(pred, match);
      if (pts) { const x = ensure(pred.uid); x[sport].prediction += pts; x[sport].total += pts; }
    });
  }

  // ── B) FANTASY: rodadas 100% finalizadas e ainda sem fantScoredAt ──
  // `sport` aqui é a CHAVE da escalação (composta no genderMode: modalidade__genero).
  const rounds = {}; // `${sportKey}::${rk}` → { sport, rk, matches[] }
  all.forEach((m) => {
    const sk = sportKey(m);
    const key = `${sk}::${roundKeyOf(m)}`;
    (rounds[key] = rounds[key] || { sport: sk, rk: roundKeyOf(m), matches: [] }).matches.push(m);
  });
  const readyRounds = Object.values(rounds).filter((r) =>
    r.matches.every((m) => m.status === 'finished')
    && r.matches.some((m) => !m.fantScoredAt && !m.scoredAt) // ignora rodadas já pontuadas (marcador antigo)
  );
  // Última rodada por sportKey (jogo de maior data) — onde o time atual ainda vale
  // como escalação. Rodada passada já snapshotada sem o time do usuário → não pontua.
  const latestRkInc = {};
  all.forEach((m) => {
    const k = sportKey(m); const d = m.date || 0;
    if (!latestRkInc[k] || d > latestRkInc[k].d) latestRkInc[k] = { rk: roundKeyOf(m), d };
  });

  for (const r of readyRounds) {
    const { sport, rk, matches: roundMatches } = r;
    roundMatches.forEach((m) => fantMatchesToMark.push(m));
    const baseSport = sport.includes('__') ? sport.split('__')[0] : sport;
    if (!emptyBySport()[baseSport]) continue;

    // Escalações da rodada POR USUÁRIO: snapshot dele (se houver), senão o time
    // atual dele. (Antes era global — se ALGUÉM tinha snapshot, quem não tinha
    // ficava de fora da soma. Agora bate com o recompute.)
    const lSnap = await getDocs(query(collection(db, 'round_lineups'),
      where('eventId', '==', eid), where('rodada', '==', rk)));
    const snapByUid = {};
    lSnap.docs.map((d) => d.data()).filter((s) => s.sport === sport)
      .forEach((s) => { snapByUid[s.uid] = s; });
    if (!currentTeams) {
      const tSnap = await getDocs(query(collection(db, 'user_teams'), where('eventId', '==', eid)));
      currentTeams = tSnap.docs.map((d) => d.data());
    }
    const currentForSport = {};
    currentTeams.filter((t) => t.sport === sport).forEach((t) => { currentForSport[t.uid] = t; });
    // Time atual só vale na última rodada ou em rodada legada sem snapshots.
    const hasSnap     = Object.keys(snapByUid).length > 0;
    const isLatest    = latestRkInc[sport]?.rk === rk;
    const allowCurrent = isLatest || !hasSnap;
    const luids = new Set(Object.keys(snapByUid));
    if (allowCurrent) Object.keys(currentForSport).forEach((u) => luids.add(u));
    for (const luid of luids) {
      const lineup = snapByUid[luid] || (allowCurrent ? currentForSport[luid] : null);
      if (!lineup) continue;
      const fpts = roundFantasyForLineup(roundMatches, lineup, baseSport);
      if (fpts) { const x = ensure(luid); x[baseSport].fantasy += fpts; x[baseSport].total += fpts; }
    }
  }

  if (!predMatchesToMark.length && !fantMatchesToMark.length) return { rounds: 0, predGames: 0, users: 0 };

  const uids = Object.keys(deltas);

  // 3) Aplica os deltas sobre o agregado (1 leitura) + docs por usuário
  const sumRef  = doc(db, 'scores_summary', eid);
  const sumSnap = await getDoc(sumRef);
  if (!sumSnap.exists()) {
    // Sem agregado ainda: o incremental não tem base. Cai no completo.
    return recomputeAllScores().then(() => ({ rounds: readyRounds.length, predGames: predMatchesToMark.length, users: uids.length, fellBack: true }));
  }
  const entries = sumSnap.data().entries || [];
  const byUid = Object.fromEntries(entries.map((e) => [e.uid, e]));

  // Nomes p/ usuários que ainda não estavam no agregado
  const writes = [];
  for (const uid of uids) {
    const d = deltas[uid];
    let entry = byUid[uid];
    if (!entry) {
      let displayName = 'Jogador';
      try { const us = await getDoc(doc(db, 'users', uid)); if (us.exists()) displayName = us.data().displayName || displayName; } catch { /* ignore */ }
      entry = { id: `${uid}_${eid}`, uid, eventId: eid, displayName, total: 0, fantasyTotal: 0, predictionTotal: 0, bySport: emptyBySport() };
      byUid[uid] = entry;
      entries.push(entry);
    }
    // Soma os deltas no entry
    if (!entry.bySport) entry.bySport = emptyBySport();
    SPORTS.forEach((s) => {
      if (!entry.bySport[s]) entry.bySport[s] = { fantasy: 0, prediction: 0, total: 0 };
      entry.bySport[s].fantasy    = fmtPts(entry.bySport[s].fantasy    + d[s].fantasy);
      entry.bySport[s].prediction = fmtPts(entry.bySport[s].prediction + d[s].prediction);
      entry.bySport[s].total      = fmtPts(entry.bySport[s].total      + d[s].total);
    });
    entry.fantasyTotal    = fmtPts(SPORTS.reduce((a, s) => a + entry.bySport[s].fantasy, 0));
    entry.predictionTotal = fmtPts(SPORTS.reduce((a, s) => a + entry.bySport[s].prediction, 0));
    entry.total           = fmtPts(SPORTS.reduce((a, s) => a + entry.bySport[s].total, 0));
    entry.updatedAt = Date.now();
    // Mantém o doc por usuário em sincronia (UserProfile lê por uid)
    const { id, ...scoreData } = entry;
    writes.push(setDoc(doc(db, 'scores', `${uid}_${eid}`), scoreData, { merge: true }));
  }

  // Grava o agregado atualizado
  writes.push(setDoc(sumRef, { eventId: eid, updatedAt: Date.now(), count: entries.length, entries }));
  // Marcadores: predScoredAt nas partidas com palpites pontuados; fantScoredAt
  // nas partidas de rodadas cujo fantasy foi pontuado.
  const stampedAt = Date.now();
  predMatchesToMark.forEach((m) => writes.push(setDoc(doc(db, 'matches', m.id), { predScoredAt: stampedAt }, { merge: true })));
  fantMatchesToMark.forEach((m) => writes.push(setDoc(doc(db, 'matches', m.id), { fantScoredAt: stampedAt }, { merge: true })));
  await Promise.all(writes);

  invalidateCache('scores');
  return { rounds: readyRounds.length, predGames: predMatchesToMark.length, users: uids.length };
}
