import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getEvents, createEvent, updateEvent,
  getTeamsByEvent, createTeam, updateTeam, deleteTeam,
  getPlayers, createPlayer, updatePlayer, deletePlayer, getPlayerUsage,
  getMatchesByEvent, createMatch, updateMatch, deleteMatch, updateMatchResult,
  exportAllData, setFeaturedEvent, rebuildReferenceBundles,
  getLeaguesByEvent, updateLeague, deleteLeague, removeLeagueMember,
  approveLeagueMember, rejectLeagueMember, getUserProfilesByUids,
} from '../services/firestore';
import { recomputeAllScores, scoreNewResults } from '../utils/scoring';
import { checkAndAwardBadges } from '../utils/badgeEngine';
import { T, SPORT_LABELS, POSITION_LABELS } from '../utils/labels';
import { resolveEventStatus, EVENT_STATUS_LABELS } from '../utils/eventStatus';
import { STAT_FIELDS, STAT_FIELDS_PRO, SQUAD_CONFIG, PHASE_LABELS, isPredictionOnly } from '../utils/sportRules';
import { setMarketConfig, updateTeamEmoji, setEventCurrentPhase, isMarketOpen, captureRoundLineups, finalizeExpiredMarket, importCountryMatches, importCountryResults, getScoresByEvent, restoreRoundLineup, saveUserTeam, getPlayersBySport, getUserTeamsByUid, getAllRoundLineupsByEvent, getRoundLineupsByEvent, getScoreBackups, restoreScoresFromBackup } from '../services/firestore';
import { OLIMFEF_MATCHES } from '../utils/olimfefMatches';
import { OLIMFEF_RESULTS } from '../utils/olimfefResults';
import EmojiPicker from '../components/EmojiPicker';
import ShieldEmoji from '../components/ShieldEmoji';

const ALL_SPORTS = [
  { key:'futebol',    label:'⚽ Futebol de Campo' },
  { key:'futsal',     label:'⚽ Futsal' },
  { key:'basketball', label:'🏀 Basquete' },
  { key:'volleyball', label:'🏐 Vôlei' },
  { key:'handball',   label:'🤾 Handebol' },
  { key:'beachvolley',label:'🏖️ Vôlei de Praia (só campeonato)' },
];
// Formações de futebol (slots) — espelha FORMATIONS_FUTEBOL do FantasyTeam.
const FUT_FORMATIONS = {
  '4-3-3': ['GK','LAT','ZAG','ZAG','LAT','MCM','MCM','MCM','ATA','ATA','ATA'],
  '4-4-2': ['GK','LAT','ZAG','ZAG','LAT','MCM','MCM','MCM','MCM','ATA','ATA'],
  '4-5-1': ['GK','LAT','ZAG','ZAG','LAT','MCM','MCM','MCM','MCM','MCM','ATA'],
  '3-5-2': ['GK','ZAG','ZAG','ZAG','MCM','MCM','MCM','MCM','MCM','ATA','ATA'],
  '3-4-3': ['GK','ZAG','ZAG','ZAG','MCM','MCM','MCM','MCM','ATA','ATA','ATA'],
  '5-3-2': ['GK','LAT','ZAG','ZAG','ZAG','LAT','MCM','MCM','MCM','ATA','ATA'],
};
// Compatibilidade slot→posição do jogador (subset de POSITION_COMPAT do FantasyTeam).
const FUT_POS_COMPAT = { GK:['GK'], ZAG:['ZAG'], LAT:['LAT'], MCM:['MCM','VOL','MEI'], ATA:['ATA'] };
const futCompat = (slot) => FUT_POS_COMPAT[slot] || [slot];
const POSITIONS_BY_SPORT = {
  futebol:    ['GK','ZAG','LAT','MCM','ATA'],
  futsal:     ['GK','FIX','ALA','PIV'],
  basketball: ['PG','SG','SF'],
  volleyball: ['SET','OPP','OH1','OH2','MB1','MB2'],
  handball:   ['GK','LD','LC','LP','LE','LL','PIV'],
};
const GENDER_OPTS = [
  { value: '',         label: '— Não especificado' },
  { value: 'masculino', label: '♂ Masculino' },
  { value: 'feminino',  label: '♀ Feminino' },
  { value: 'misto',     label: '⚡ Misto' },
];

const STATUS_OPTS = [
  { value:'ativo',      label:'🟢 Ativo' },
  { value:'futuro',     label:'🟡 Em breve' },
  { value:'finalizado', label:'⚪ Encerrado' },
];

function Msg({ msg }) {
  if (!msg?.text) return null;
  return <div className={msg.type} style={{ marginBottom:'0.75rem' }}>{msg.text}</div>;
}

/* ── ROOT ─────────────────────────────────────────────────────── */
export default function Admin() {
  const { profile, isAdmin } = useAuth();
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [events, setEvents]               = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  useEffect(() => {
    (async () => {
      setLoadingEvents(true);
      setEvents(await getEvents());
      setLoadingEvents(false);
    })();
  }, []);

  const reloadEvents = async () => {
    const evs = await getEvents();
    setEvents(evs);
    // Sincroniza o evento selecionado com os dados frescos do Firestore
    if (selectedEvent) {
      const fresh = evs.find((e) => e.id === selectedEvent.id);
      if (fresh) setSelectedEvent(fresh);
    }
  };

  if (profile && !isAdmin) {
    return (
      <>
        <h1>{T.admin.title}</h1>
        <div className="card"><p className="muted">{T.admin.notAdmin}</p></div>
      </>
    );
  }

  return (
    <>
      <h1>{T.admin.title}</h1>
      <p className="page-subtitle">{T.admin.subtitle}</p>

      {!selectedEvent ? (
        <EventPicker
          events={events}
          loading={loadingEvents}
          onSelect={setSelectedEvent}
          onReload={reloadEvents}
        />
      ) : (
        <EventManager
          event={selectedEvent}
          onBack={() => setSelectedEvent(null)}
          onEventUpdated={reloadEvents}
        />
      )}
    </>
  );
}

/* ── NÍVEL 1: seleção de evento ───────────────────────────────── */
function EventPicker({ events, loading, onSelect, onReload }) {
  const [creating, setCreating] = useState(false);
  const [form, setForm]         = useState({ name:'', description:'', status:'ativo', type:'amador', privateCode:'', modalidades:['futsal'] });
  const [msg, setMsg]           = useState(null);
  const [exporting, setExporting] = useState(false);
  const [bundling, setBundling] = useState(false);

  const handleRebuildBundles = async () => {
    setBundling(true);
    setMsg(null);
    try {
      const r = await rebuildReferenceBundles();
      setMsg({ type: 'success', text: `📦 Pacotes gerados: ${r.players} jogadores, ${r.teams} times, ${r.matches} partidas. Leitura por usuário caiu para 1 doc cada.` });
    } catch (err) {
      setMsg({ type: 'error', text: 'Erro ao gerar pacotes: ' + err.message });
    } finally {
      setBundling(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setMsg(null);
    try {
      const data = await exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      a.href = url;
      a.download = `capitola-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMsg({ type: 'success', text: 'Backup baixado com sucesso.' });
    } catch (err) {
      setMsg({ type: 'error', text: 'Erro ao gerar o backup: ' + err.message });
    } finally {
      setExporting(false);
    }
  };

  const toggleSport = (key) => {
    const next = form.modalidades.includes(key)
      ? form.modalidades.filter((s) => s !== key)
      : [...form.modalidades, key];
    setForm({ ...form, modalidades: next });
  };

  const save = async () => {
    if (!form.name.trim()) { setMsg({ type:'error', text:'Informe o nome do evento.' }); return; }
    if (!form.modalidades.length) { setMsg({ type:'error', text:'Selecione ao menos uma modalidade.' }); return; }
    try {
      const payload = { ...form };
      if (payload.type !== 'privado') delete payload.privateCode;
      else if (!payload.privateCode.trim()) payload.privateCode = Math.random().toString(36).slice(2,8).toUpperCase();
      await createEvent(payload);
      setCreating(false);
      setForm({ name:'', description:'', status:'ativo', type:'amador', privateCode:'', modalidades:['futsal'] });
      setMsg(null);
      await onReload();
    } catch (err) { setMsg({ type:'error', text: err.message }); }
  };

  if (loading) return <p className="muted">{T.common.loading}</p>;

  return (
    <>
      <div className="flex-between mb-2">
        <h2 style={{ margin:0 }}>Selecione um evento</h2>
        <div style={{ display:'flex', gap:'0.5rem' }}>
          <button className="btn-secondary" onClick={handleExport} disabled={exporting}
            title="Baixar backup de todos os dados (JSON)">
            {exporting ? '⏳ Gerando…' : '📥 Backup (JSON)'}
          </button>
          <button className="btn-secondary" onClick={handleRebuildBundles} disabled={bundling}
            title="Rode após cadastrar um evento/partidas novos — empacota tudo para a leitura cair a 1 doc por usuário">
            {bundling ? '⏳ Gerando…' : '📦 Otimizar leituras'}
          </button>
          <button onClick={() => { setCreating(true); setMsg(null); }}>+ Novo evento</button>
        </div>
      </div>
      <Msg msg={msg} />

      {creating && (
        <div className="card mb-2 admin-form-card">
          <h3>Novo evento</h3>
          <div className="form-group">
            <label>Nome</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Jogos Universitários 2025" />
          </div>
          <div className="form-group">
            <label>Descrição (opcional)</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Tipo</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="amador">⚽ Amador</option>
              <option value="profissional">🏆 Profissional</option>
              <option value="privado">🔒 Privado (acesso por código)</option>
            </select>
          </div>
          {form.type === 'privado' && (
            <div className="form-group">
              <label>Código de acesso <span className="muted" style={{ fontSize:'0.78rem' }}>(deixe em branco para gerar automaticamente)</span></label>
              <input
                value={form.privateCode}
                onChange={(e) => setForm({ ...form, privateCode: e.target.value.toUpperCase() })}
                placeholder="Ex: UNIV25"
                style={{ textTransform:'uppercase' }}
              />
            </div>
          )}
          <div className="form-group">
            <label>Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Modalidades</label>
            <div className="sport-checkboxes">
              {ALL_SPORTS.map((s) => (
                <label key={s.key} className="sport-checkbox-label">
                  <input type="checkbox" checked={form.modalidades.includes(s.key)}
                    onChange={() => toggleSport(s.key)} style={{ width:'auto' }} />
                  {s.label}
                </label>
              ))}
            </div>
          </div>
          <div className="flex mt-2">
            <button onClick={save}>Criar evento</button>
            <button className="btn-secondary" onClick={() => { setCreating(false); setMsg(null); }}>
              {T.common.cancel}
            </button>
          </div>
        </div>
      )}

      {events.length === 0 && !creating ? (
        <div className="card"><p className="muted">Nenhum evento criado. Clique em "+ Novo evento" para começar.</p></div>
      ) : (
        <div className="admin-event-list">
          {events.map((ev) => {
            const status = resolveEventStatus(ev);
            return (
              <div key={ev.id} className="admin-event-row">
                <div className="admin-event-row-info" onClick={() => onSelect(ev)} style={{ flex:1, cursor:'pointer' }}>
                  <span className="admin-event-row-name">{ev.name}</span>
                  <span className="admin-event-row-meta">
                    {EVENT_STATUS_LABELS[status]}
                    {ev.modalidades?.length ? ' · ' + ev.modalidades.map((s) => SPORT_LABELS[s] || s).join(', ') : ''}
                  </span>
                </div>
                <div className="flex" style={{ gap:'0.5rem', alignItems:'center' }}>
                  <span className="admin-event-row-cta" onClick={() => onSelect(ev)}>Gerenciar →</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ── NÍVEL 2: gerência do evento ──────────────────────────────── */
const EVENT_TABS = [
  { key:'teams',    label:'🏅 Times' },
  { key:'players',  label:'👤 Jogadores' },
  { key:'matches',  label:'📅 Partidas' },
  { key:'results',  label:'⚽ Resultados' },
  { key:'leagues',  label:'🏆 Ligas' },
  { key:'settings', label:'⚙️ Config' },
];

function EventManager({ event, onBack, onEventUpdated }) {
  const [tab, setTab] = useState('teams');
  return (
    <>
      <div className="admin-event-header">
        <button className="btn-secondary admin-back-btn" onClick={onBack}>← Eventos</button>
        <div className="admin-event-header-info">
          <span className="admin-event-header-name">{event.name}</span>
          <span className="admin-event-header-status">{EVENT_STATUS_LABELS[resolveEventStatus(event)]}</span>
        </div>
      </div>
      <div className="tabs mb-2">
        {EVENT_TABS.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'teams'    && <TeamsSection    event={event} />}
      {tab === 'players'  && <PlayersSection  event={event} />}
      {tab === 'matches'  && <MatchesSection  event={event} />}
      {tab === 'results'  && <ResultsSection  event={event} />}
      {tab === 'leagues'  && <LeaguesSection  event={event} />}
      {tab === 'settings' && <SettingsSection event={event} onUpdated={onEventUpdated} />}
    </>
  );
}

/* ── TIMES ────────────────────────────────────────────────────── */
function TeamsSection({ event }) {
  const genderMode = !!event.genderMode; // OLIMFEF: times são países (sem modalidade/gênero)
  const [teams, setTeams]     = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm]       = useState({ name:'', sport: event.modalidades?.[0] || 'futsal' });
  const [msg, setMsg]         = useState(null);
  const availableSports       = event.modalidades || ['futsal'];

  const load = async () => setTeams(await getTeamsByEvent(event.id));
  useEffect(() => { load(); }, [event.id]);

  const openNew  = () => { setEditing('new'); setForm(genderMode ? { name:'', country:true } : { name:'', sport: availableSports[0] }); setMsg(null); };
  const openEdit = (t) => { setEditing(t.id); setForm(genderMode ? { name:t.name, country:true } : { name:t.name, sport:t.sport }); setMsg(null); };

  const save = async () => {
    if (!form.name.trim()) { setMsg({ type:'error', text:'Informe o nome do time.' }); return; }
    try {
      if (editing === 'new') {
        await createTeam({ ...form, eventId: event.id });
        setMsg({ type:'success', text: T.admin.teamCreated });
      } else {
        await updateTeam(editing, form);
        // Sincroniza nome do time nas partidas do evento
        const matches = await getMatchesByEvent(event.id);
        await Promise.all(
          matches
            .filter((m) => m.homeTeamId === editing || m.awayTeamId === editing)
            .map((m) => {
              const patch = {};
              if (m.homeTeamId === editing) patch.homeTeamName = form.name;
              if (m.awayTeamId === editing) patch.awayTeamName = form.name;
              return updateMatch(m.id, patch);
            })
        );
        setMsg({ type:'success', text: T.admin.teamUpdated });
      }
      setEditing(null); load();
    } catch (err) { setMsg({ type:'error', text: err.message }); }
  };

  const remove = async (id) => {
    if (!window.confirm(T.admin.confirmDeleteTeam)) return;
    await deleteTeam(id); load();
    setMsg({ type:'success', text: T.admin.teamDeleted });
  };

  // Bloqueia/libera o time no MERCADO de escalação (fantasy). Bloqueado = some do
  // mercado e sai dos times salvos (eliminado, ou jogando agora). Não afeta palpites.
  const toggleBlock = async (t) => {
    try {
      await updateTeam(t.id, { noLineup: !t.noLineup });
      load();
      setMsg({ type:'success', text: t.noLineup ? `✅ ${t.name} liberado para escalação.` : `🚫 ${t.name} bloqueado para escalação.` });
    } catch (err) { setMsg({ type:'error', text: err.message }); }
  };

  // Em massa: bloqueia todos os times SEM jogo futuro (não-finalizado) = eliminados.
  const blockEliminated = async () => {
    try {
      const matches = await getMatchesByEvent(event.id);
      const inPlay = new Set();
      matches.filter((m) => m.status !== 'finished').forEach((m) => {
        if (m.homeTeamId) inPlay.add(m.homeTeamId);
        if (m.awayTeamId) inPlay.add(m.awayTeamId);
      });
      const toBlock = teams.filter((t) => !t.noLineup && !inPlay.has(t.id));
      if (!toBlock.length) { setMsg({ type:'error', text:'Nenhum time sem jogo futuro para bloquear.' }); return; }
      if (!window.confirm(`Bloquear escalação de ${toBlock.length} time(s) SEM jogo futuro (eliminados)?\n\n${toBlock.map((t) => t.name).join(', ')}`)) return;
      await Promise.all(toBlock.map((t) => updateTeam(t.id, { noLineup: true })));
      load();
      setMsg({ type:'success', text:`🚫 ${toBlock.length} time(s) bloqueado(s) (sem jogo futuro).` });
    } catch (err) { setMsg({ type:'error', text: err.message }); }
  };

  const teamsBySport = useMemo(() => {
    const g = {};
    availableSports.forEach((s) => { g[s] = []; });
    teams.forEach((t) => {
      if (g[t.sport]) g[t.sport].push(t);
    });
    Object.values(g).forEach((arr) => arr.sort((a, b) => a.name.localeCompare(b.name)));
    return g;
  }, [teams, availableSports]);

  return (
    <>
      <div className="flex-between mb-2">
        <h2 style={{ margin:0 }}>{T.admin.sectionTeams}</h2>
        <div className="flex" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
          {!genderMode && <button className="btn-secondary" onClick={blockEliminated} title="Bloqueia escalação dos times sem jogo futuro (eliminados)">🚫 Bloquear eliminados</button>}
          <button onClick={openNew}>{T.admin.newTeam}</button>
        </div>
      </div>
      <Msg msg={msg} />
      {editing === 'new' && (
        <div className="card mb-2 admin-form-card">
          <h3>{T.admin.newTeam}</h3>
          <div className="form-group"><label>{genderMode ? 'País' : T.admin.teamName}</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          {!genderMode && (<>
            <div className="form-group"><label>{T.admin.selectSport}</label>
              <select value={form.sport} onChange={(e) => setForm({ ...form, sport: e.target.value })}>
                {availableSports.map((s) => <option key={s} value={s}>{SPORT_LABELS[s] || s}</option>)}
              </select></div>
            <div className="form-group"><label>Gênero</label>
              <select value={form.gender || ''} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                {GENDER_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select></div>
          </>)}
          <div className="flex mt-2">
            <button onClick={save}>{T.common.save}</button>
            <button className="btn-secondary" onClick={() => setEditing(null)}>{T.common.cancel}</button>
          </div>
        </div>
      )}
      {teams.length === 0 ? (
        <div className="card"><p className="muted">Nenhum time. Clique em "Novo time" para adicionar.</p></div>
      ) : (
        (genderMode
          ? [{ key:'all', label:null, list:[...teams].sort((a,b)=>a.name.localeCompare(b.name)) }]
          : availableSports.map((sport) => ({ key:sport, label:SPORT_LABELS[sport]||sport, list:teamsBySport[sport]||[] }))
        ).map((grp) => {
          if (!grp.list.length) return null;
          return (
            <div key={grp.key} className="mb-2">
              {grp.label && <h3 className="admin-sport-header">{grp.label}</h3>}
              {grp.list.map((t) => (
                editing === t.id ? (
                  <div key={t.id} className="card mb-2 admin-form-card" style={{ borderColor: 'var(--primary)' }}>
                    <h3 style={{ fontSize:'0.9rem', marginBottom:'0.5rem', color:'var(--primary)' }}>Editando: {form.name}</h3>
                    <div className="form-group"><label>{genderMode ? 'País' : T.admin.teamName}</label>
                      <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                    {!genderMode && (<>
                      <div className="form-group"><label>{T.admin.selectSport}</label>
                        <select value={form.sport} onChange={(e) => setForm({ ...form, sport: e.target.value })}>
                          {availableSports.map((s) => <option key={s} value={s}>{SPORT_LABELS[s] || s}</option>)}
                        </select></div>
                      <div className="form-group"><label>Gênero</label>
                        <select value={form.gender || ''} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                          {GENDER_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select></div>
                    </>)}
                    <div className="flex mt-2">
                      <button onClick={save}>{T.common.save}</button>
                      <button className="btn-secondary" onClick={() => setEditing(null)}>{T.common.cancel}</button>
                    </div>
                  </div>
                ) : (
                  <div key={t.id} className="player-card" style={t.noLineup ? { opacity: 0.6 } : undefined}>
                    <EmojiPicker
                      value={t.shieldEmoji || ''}
                      size={40}
                      label="escudo/bandeira"
                      onChange={async (emoji) => {
                        await updateTeamEmoji(t.id, emoji);
                        load();
                      }}
                    />
                    <div className="player-info">
                      <span className="player-name">{t.name}{t.noLineup && ' 🚫'}</span>
                      {t.gender && <span className="player-meta">{t.gender === 'masculino' ? '♂ Masculino' : '♀ Feminino'}</span>}
                      {t.noLineup && <span className="player-meta" style={{ color:'#f59e0b' }}>fora da escalação</span>}
                    </div>
                    <div className="flex">
                      <button className="btn-secondary" onClick={() => toggleBlock(t)} title="Some/volta no mercado de escalação (fantasy). Não afeta palpites.">
                        {t.noLineup ? '✅ Liberar' : '🚫 Bloquear'}
                      </button>
                      <button className="btn-secondary" onClick={() => openEdit(t)}>{T.common.edit}</button>
                      <button className="btn-danger"    onClick={() => remove(t.id)}>{T.common.delete}</button>
                    </div>
                  </div>
                )
              ))}
            </div>
          );
        })
      )}
    </>
  );
}

/* ── JOGADORES ────────────────────────────────────────────────── */
function PlayersSection({ event }) {
  const genderMode = !!event.genderMode; // OLIMFEF: jogador tem gênero, sem modalidade/posição
  const [teams, setTeams]         = useState([]);
  const [players, setPlayers]     = useState([]);
  const [editing, setEditing]     = useState(null);
  const [form, setForm]           = useState({ name:'', teamId:'', sport:'futsal', position:'GK' });
  const [msg, setMsg]             = useState(null);
  const [expandedTeam, setExpandedTeam] = useState(null);

  const load = async () => {
    const [t, p] = await Promise.all([getTeamsByEvent(event.id), getPlayers()]);
    setTeams(t);
    const teamIds = new Set(t.map((x) => x.id));
    setPlayers(p.filter((pl) => teamIds.has(pl.teamId)));
  };
  useEffect(() => { load(); }, [event.id]);

  const teamMap = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams]);
  const playersByTeam = useMemo(() => {
    const g = {};
    teams.forEach((t) => { g[t.id] = []; });
    players.forEach((p) => { if (g[p.teamId]) g[p.teamId].push(p); });
    // Ordenar por posição (ordem do SQUAD_CONFIG) e depois alfabeticamente
    teams.forEach((t) => {
      const positions = [...new Set(SQUAD_CONFIG[t.sport]?.positions || [])];
      const posOrder  = Object.fromEntries(positions.map((pos, i) => [pos, i]));
      g[t.id].sort((a, b) => {
        const ao = posOrder[a.position] ?? 99;
        const bo = posOrder[b.position] ?? 99;
        return ao !== bo ? ao - bo : a.name.localeCompare(b.name);
      });
    });
    return g;
  }, [players, teams]);

  const openNew = (teamId) => {
    const team = teamMap[teamId];
    const sport = team?.sport || 'futsal';
    setEditing('new');
    setForm(genderMode
      ? { name:'', teamId, gender:'' }
      : { name:'', teamId, sport, position: POSITIONS_BY_SPORT[sport]?.[0] || 'GK' });
    setExpandedTeam(teamId);
    setMsg(null);
  };
  const openEdit = (p) => {
    setEditing(p.id);
    setExpandedTeam(p.teamId);
    setForm(genderMode
      ? { name:p.name, teamId:p.teamId, gender:p.gender || '' }
      : { name:p.name, teamId:p.teamId, sport:p.sport, position:p.position||'GK' });
    setMsg(null);
  };

  const save = async () => {
    if (!form.name.trim()) { setMsg({ type:'error', text:'Nome obrigatório.' }); return; }
    if (genderMode && !form.gender) { setMsg({ type:'error', text:'Selecione o gênero.' }); return; }
    try {
      const trimmed = { ...form, name: form.name.trim() };
      if (editing === 'new') { await createPlayer({ ...trimmed, eventId: event.id }); setMsg({ type:'success', text: T.admin.playerCreated }); }
      else                   { await updatePlayer(editing, trimmed); setMsg({ type:'success', text: T.admin.playerUpdated }); }
      setEditing(null); load();
    } catch (err) { setMsg({ type:'error', text: err.message }); }
  };

  const remove = async (p) => {
    let usage = { teams: 0, lineups: 0 };
    try { usage = await getPlayerUsage(p.id); } catch { /* segue sem contagem */ }

    if (usage.teams > 0 || usage.lineups > 0) {
      const ok = window.confirm(
        `⚠️ "${p.name}" está vinculado a dados existentes:\n\n` +
        `• ${usage.teams} time(s) escalado(s) por usuários\n` +
        `• ${usage.lineups} escalação(ões) de rodada\n\n` +
        'Excluir o jogador deixa essas referências órfãs e afeta a pontuação. ' +
        'Esta ação é irreversível.\n\nExcluir mesmo assim?'
      );
      if (!ok) return;
    } else {
      if (!window.confirm(T.admin.confirmDeletePlayer)) return;
    }
    await deletePlayer(p.id); load();
    setMsg({ type:'success', text: T.admin.playerDeleted });
  };

  if (teams.length === 0 && !genderMode) {
    return <div className="card"><p className="muted">Crie times primeiro na aba "Times".</p></div>;
  }

  return (
    <>
      <div className="flex-between mb-2">
        <h2 style={{ margin:0 }}>{T.admin.sectionPlayers}</h2>
      </div>
      <Msg msg={msg} />
      {[...teams].sort((a, b) => a.name.localeCompare(b.name)).map((team) => {
        const list   = playersByTeam[team.id] || [];
        const isOpen = expandedTeam === team.id || list.length === 0;

        const inlineForm = (
          <div className="card mb-2 admin-form-card" style={{ margin: '0.4rem 0', borderColor: 'var(--primary)' }}>
            <h3 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--primary)' }}>
              {editing === 'new' ? T.admin.newPlayer : `Editar: ${form.name}`}
            </h3>
            <div className="form-group"><label>{T.admin.playerName}</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></div>
            {genderMode ? (
              <div className="form-group"><label>Gênero</label>
                <select value={form.gender || ''} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                  <option value="">— selecionar —</option>
                  <option value="masculino">♂ Masculino</option>
                  <option value="feminino">♀ Feminino</option>
                </select></div>
            ) : (
              <div className="form-group"><label>{T.admin.position}</label>
                <select value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })}>
                  {(POSITIONS_BY_SPORT[form.sport] || ['GK']).map((pos) => (
                    <option key={pos} value={pos}>{POSITION_LABELS[pos] || pos}</option>
                  ))}
                </select></div>
            )}
            <div className="flex mt-2">
              <button onClick={save}>{T.common.save}</button>
              <button className="btn-secondary" onClick={() => setEditing(null)}>{T.common.cancel}</button>
            </div>
          </div>
        );

        return (
          <div key={team.id} className="admin-team-accordion">
            <div className="admin-team-accordion-header"
              onClick={() => setExpandedTeam(isOpen && list.length > 0 ? null : team.id)}>
              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                <ShieldEmoji emoji={team.shieldEmoji} size="1.5rem" />
                <div>
                  <strong>{team.name}</strong>
                  <span className="muted" style={{ fontSize:'0.8rem', marginLeft:8 }}>
                    {genderMode ? '🌍 País' : SPORT_LABELS[team.sport]} · {list.length} jogador{list.length !== 1 ? 'es' : ''}
                  </span>
                </div>
              </div>
              <div className="flex" style={{ gap:8 }}>
                <button className="btn-secondary" style={{ fontSize:'0.82rem', padding:'0.25rem 0.6rem' }}
                  onClick={(e) => { e.stopPropagation(); openNew(team.id); }}>
                  + Jogador
                </button>
                <span>{isOpen ? '▲' : '▼'}</span>
              </div>
            </div>
            {isOpen && (
              <div className="admin-team-accordion-body">
                {editing === 'new' && expandedTeam === team.id && inlineForm}
                {list.length === 0 && editing !== 'new' ? (
                  <p className="muted" style={{ fontSize:'0.85rem', padding:'0.5rem 0' }}>Clique em "+ Jogador" para adicionar.</p>
                ) : list.map((p) => (
                  editing === p.id ? inlineForm :
                  <div key={p.id} className="player-card" style={{ margin:'0.3rem 0' }}>
                    <div className="player-info" style={{ flexDirection:'row', alignItems:'center', gap:'0.5rem' }}>
                      <ShieldEmoji emoji={team.shieldEmoji} size="1.2rem" />
                      <div style={{ display:'flex', flexDirection:'column', gap:'0.15rem' }}>
                        <span className="player-name">{p.name}</span>
                        <span className="player-meta">
                          {genderMode
                            ? (p.gender === 'masculino' ? '♂ Masculino' : p.gender === 'feminino' ? '♀ Feminino' : '—')
                            : (POSITION_LABELS[p.position] || p.position)} · {team.name}
                        </span>
                      </div>
                    </div>
                    <div className="flex">
                      <button className="btn-secondary" onClick={() => openEdit(p)}>{T.common.edit}</button>
                      <button className="btn-danger"    onClick={() => remove(p)}>{T.common.delete}</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/* ── PARTIDAS ─────────────────────────────────────────────────── */
function MatchesSection({ event }) {
  const genderMode = !!event.genderMode; // OLIMFEF: times são países (sem modalidade); gênero vem do form
  const [matches, setMatches] = useState([]);
  const [teams, setTeams]     = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm]       = useState({ homeTeamId:'', awayTeamId:'', sport:'futsal', date:'', location:'', rodada:'', phase:'', gender:'' });
  const [msg, setMsg]         = useState(null);
  // Modalidades só-campeonato (ex.: Vôlei de Praia) não têm partidas
  const availableSports       = (event.modalidades || ['futsal']).filter((s) => !isPredictionOnly(s));

  const load = async () => {
    const [m, t] = await Promise.all([getMatchesByEvent(event.id), getTeamsByEvent(event.id)]);
    setMatches(m); setTeams(t);
  };
  useEffect(() => { load(); }, [event.id]);

  const teamMap      = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams]);
  // No genderMode os times são países (sem modalidade) → lista todos; senão filtra por modalidade.
  const teamsBySport = (sport) => (genderMode ? [...teams] : teams.filter((t) => t.sport === sport))
    .sort((a, b) => a.name.localeCompare(b.name));

  const openNew = () => {
    const sp = availableSports[0];
    setEditing('new');
    setForm({ homeTeamId:'', awayTeamId:'', sport: sp, date:'', location:'', rodada:'', phase:'', gender:'' });
    setMsg(null);
  };

  // A chave de rodada do scoring é `rodada ?? phase` — mata-mata com o campo
  // Rodada preenchido COLIDE com as rodadas da fase de grupos (pontuação mistura
  // as fases e snapshots caem na chave errada). Limpa a Rodada dos jogos com fase
  // de mata-mata para a chave virar a própria fase (r32/r16/qf/...).
  const fixKnockoutRounds = async () => {
    const bad = matches.filter((m) => m.phase && m.phase !== 'group' && m.rodada != null);
    if (!bad.length) { setMsg({ type:'success', text:'Nenhum jogo de mata-mata com campo Rodada preenchido. Tudo certo.' }); return; }
    const label = (m) => `${m.homeTeamName || '?'} x ${m.awayTeamName || '?'} (${PHASE_LABELS[m.phase] || m.phase}, rodada ${m.rodada})`;
    if (!window.confirm(`Limpar o campo Rodada de ${bad.length} jogo(s) de mata-mata? A rodada deles passa a ser a FASE (r32/r16/qf).\n\n${bad.slice(0, 12).map(label).join('\n')}${bad.length > 12 ? `\n… e mais ${bad.length - 12}` : ''}\n\nDepois: restaure os snapshots das fases e rode "🔄 Recalcular tudo".`)) return;
    try {
      for (const m of bad) await updateMatch(m.id, { rodada: null });
      await load();
      setMsg({ type:'success', text:`🧹 ${bad.length} jogo(s) corrigido(s) — rodada = fase. Agora restaure os snapshots (Config → backup JSON) e rode "🔄 Recalcular tudo".` });
    } catch (err) { setMsg({ type:'error', text: err.message }); }
  };
  const openEdit = (m) => {
    setEditing(m.id);
    setForm({
      homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, sport: m.sport,
      date: m.date ? new Date(m.date).toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0,16).replace(' ','T') : '',
      location: m.location || '',
      rodada: m.rodada ?? '',
      phase: m.phase || '',
      gender: m.gender || '',
    });
    setMsg(null);
  };

  const save = async () => {
    if (!form.homeTeamId || !form.awayTeamId) { setMsg({ type:'error', text:'Selecione os dois times.' }); return; }
    if (form.homeTeamId === form.awayTeamId)   { setMsg({ type:'error', text:'Times precisam ser diferentes.' }); return; }
    if (genderMode && !form.gender) { setMsg({ type:'error', text:'Selecione o gênero da partida.' }); return; }
    const home = teamMap[form.homeTeamId];
    const away = teamMap[form.awayTeamId];
    const gender = form.gender || home?.gender || away?.gender || '';
    const payload = {
      ...form, eventId: event.id,
      eventType: event.type || 'amador',
      homeTeamName:   home?.name       || '',
      awayTeamName:   away?.name       || '',
      homeShieldUrl:  home?.shieldUrl  || '',
      awayShieldUrl:  away?.shieldUrl  || '',
      homeShieldEmoji: home?.shieldEmoji || '',
      awayShieldEmoji: away?.shieldEmoji || '',
      gender,
      date: form.date ? new Date(form.date + ':00-03:00').getTime() : null,
    };
    try {
      if (editing === 'new') { await createMatch(payload); setMsg({ type:'success', text:'Partida criada!' }); }
      else                   { await updateMatch(editing, payload); setMsg({ type:'success', text:'Partida atualizada!' }); }
      setEditing(null); load();
    } catch (err) { setMsg({ type:'error', text: err.message }); }
  };

  const remove = async (m) => {
    const isFinished = m.status === 'finished';
    const label = `${m.homeTeamName || '?'} x ${m.awayTeamName || '?'}`;
    if (isFinished) {
      const ok1 = window.confirm(
        `⚠️ Esta partida (${label}) JÁ TEM RESULTADO lançado.\n\n` +
        'Excluí-la vai apagar o placar e as estatísticas, e a pontuação dos ' +
        'usuários muda no próximo recálculo. Esta ação é irreversível.\n\nContinuar?'
      );
      if (!ok1) return;
      const ok2 = window.confirm('Tem certeza que deseja excluir uma partida finalizada?');
      if (!ok2) return;
    } else {
      if (!window.confirm(`Excluir a partida ${label}?`)) return;
    }
    await deleteMatch(m.id); load();
    setMsg({ type:'success', text:'Partida excluída.' });
  };

  const matchesBySport = useMemo(() => {
    const g = {};
    availableSports.forEach((s) => { g[s] = []; });
    matches.forEach((m) => { if (g[m.sport]) g[m.sport].push(m); });
    return g;
  }, [matches, availableSports]);

  // OLIMFEF: importa a agenda fixa de partidas (idempotente)
  const [importingMatches, setImportingMatches] = useState(false);
  const importMatches = async () => {
    if (!window.confirm(`Importar a agenda OLIMFEF (${OLIMFEF_MATCHES.length} partidas)?\n\nPartidas iguais são puladas.`)) return;
    setImportingMatches(true);
    try {
      const r = await importCountryMatches(event.id, OLIMFEF_MATCHES);
      const miss = r.missing?.length ? ` · ⚠️ país(es) não encontrado(s): ${r.missing.join(', ')}` : '';
      setMsg({ type: r.missing?.length ? 'error' : 'success', text: `📥 ${r.created} criada(s), ${r.skipped} puladas${miss}.` });
      load();
    } catch (err) { setMsg({ type:'error', text:'Erro ao importar: ' + err.message }); }
    finally { setImportingMatches(false); }
  };

  return (
    <>
      <div className="flex-between mb-2">
        <h2 style={{ margin:0 }}>Partidas</h2>
        <div className="flex" style={{ gap:'0.5rem' }}>
          {genderMode && (
            <button className="btn-secondary" onClick={importMatches} disabled={importingMatches} style={{ fontSize:'0.85rem' }}>
              {importingMatches ? '⏳ Importando…' : '📥 Importar agenda OLIMFEF'}
            </button>
          )}
          <button className="btn-secondary" onClick={fixKnockoutRounds}
            title="Limpa o campo Rodada dos jogos de mata-mata (a rodada deles vira a fase: r32/r16/qf)">
            🧹 Corrigir rodada do mata-mata
          </button>
          <button onClick={openNew}>+ Nova partida</button>
        </div>
      </div>
      <Msg msg={msg} />
      {/* Formulário de nova partida — só aparece no topo para criação */}
      {editing === 'new' && (
        <div className="card mb-2 admin-form-card">
          <h3>Nova partida</h3>
          <div className="form-group"><label>Modalidade</label>
            <select value={form.sport} onChange={(e) => setForm({ ...form, sport: e.target.value, homeTeamId:'', awayTeamId:'' })}>
              {availableSports.map((s) => <option key={s} value={s}>{SPORT_LABELS[s] || s}</option>)}
            </select></div>
          <div className="admin-match-teams">
            <div className="form-group" style={{ flex:1 }}><label>Casa</label>
              <select value={form.homeTeamId} onChange={(e) => setForm({ ...form, homeTeamId: e.target.value })}>
                <option value="">Selecione</option>
                {teamsBySport(form.sport).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select></div>
            <div className="admin-match-vs">VS</div>
            <div className="form-group" style={{ flex:1 }}><label>Visitante</label>
              <select value={form.awayTeamId} onChange={(e) => setForm({ ...form, awayTeamId: e.target.value })}>
                <option value="">Selecione</option>
                {teamsBySport(form.sport).filter((t) => t.id !== form.homeTeamId)
                  .map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select></div>
          </div>
          <div className="admin-match-meta">
            <div className="form-group" style={{ flex:1 }}><label>Data e hora</label>
              <input type="datetime-local" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div className="form-group" style={{ flex:'0 0 90px' }}><label>Rodada</label>
              <input type="number" min="1" placeholder="1" value={form.rodada}
                onChange={(e) => setForm({ ...form, rodada: e.target.value === '' ? '' : Number(e.target.value) })} /></div>
            <div className="form-group" style={{ flex:'0 0 160px' }}><label>Fase</label>
              <select value={form.phase} onChange={(e) => setForm({ ...form, phase: e.target.value })}>
                <option value="">— Rodada normal</option>
                {Object.entries(PHASE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
            <div className="form-group" style={{ flex:'0 0 140px' }}><label>Gênero</label>
              <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                <option value="">— Não especificado</option>
                <option value="masculino">♂ Masculino</option>
                <option value="feminino">♀ Feminino</option>
                <option value="misto">⚡ Misto</option>
              </select></div>
            <div className="form-group" style={{ flex:1 }}><label>Local (opcional)</label>
              <input value={form.location} placeholder="Ex: Ginásio Central"
                onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
          </div>
          <div className="flex mt-2">
            <button onClick={save}>{T.common.save}</button>
            <button className="btn-secondary" onClick={() => setEditing(null)}>{T.common.cancel}</button>
          </div>
        </div>
      )}
      {matches.length === 0 ? (
        <div className="card"><p className="muted">Nenhuma partida neste evento.</p></div>
      ) : (
        availableSports.map((sport) => {
          const list = matchesBySport[sport] || [];
          if (!list.length) return null;
          return (
            <div key={sport} className="mb-2">
              <h3 className="admin-sport-header">{SPORT_LABELS[sport] || sport}</h3>
              {list.map((m) => (
                editing === m.id ? (
                  /* Editor inline — aparece no lugar da partida */
                  <div key={m.id} className="card mb-2 admin-form-card" style={{ borderColor: 'var(--primary)' }}>
                    <h3 style={{ fontSize:'0.9rem', marginBottom:'0.5rem', color:'var(--primary)' }}>
                      Editando: {m.homeTeamName} × {m.awayTeamName}
                    </h3>
                    <div className="form-group"><label>Modalidade</label>
                      <select value={form.sport} onChange={(e) => setForm({ ...form, sport: e.target.value, homeTeamId:'', awayTeamId:'' })}>
                        {availableSports.map((s) => <option key={s} value={s}>{SPORT_LABELS[s] || s}</option>)}
                      </select></div>
                    <div className="admin-match-teams">
                      <div className="form-group" style={{ flex:1 }}><label>Casa</label>
                        <select value={form.homeTeamId} onChange={(e) => setForm({ ...form, homeTeamId: e.target.value })}>
                          <option value="">Selecione</option>
                          {teamsBySport(form.sport).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select></div>
                      <div className="admin-match-vs">VS</div>
                      <div className="form-group" style={{ flex:1 }}><label>Visitante</label>
                        <select value={form.awayTeamId} onChange={(e) => setForm({ ...form, awayTeamId: e.target.value })}>
                          <option value="">Selecione</option>
                          {teamsBySport(form.sport).filter((t) => t.id !== form.homeTeamId)
                            .map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select></div>
                    </div>
                    <div className="admin-match-meta">
                      <div className="form-group" style={{ flex:1 }}><label>Data e hora</label>
                        <input type="datetime-local" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
                      <div className="form-group" style={{ flex:'0 0 90px' }}><label>Rodada</label>
                        <input type="number" min="1" placeholder="1" value={form.rodada}
                          onChange={(e) => setForm({ ...form, rodada: e.target.value === '' ? '' : Number(e.target.value) })} /></div>
                      <div className="form-group" style={{ flex:'0 0 160px' }}><label>Fase</label>
                        <select value={form.phase} onChange={(e) => setForm({ ...form, phase: e.target.value })}>
                          <option value="">— Rodada normal</option>
                          {Object.entries(PHASE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select></div>
                      <div className="form-group" style={{ flex:'0 0 140px' }}><label>Gênero</label>
                        <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                          <option value="">— Não especificado</option>
                          <option value="masculino">♂ Masculino</option>
                          <option value="feminino">♀ Feminino</option>
                          <option value="misto">⚡ Misto</option>
                        </select></div>
                      <div className="form-group" style={{ flex:1 }}><label>Local (opcional)</label>
                        <input value={form.location} placeholder="Ex: Ginásio Central"
                          onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
                    </div>
                    <div className="flex mt-2">
                      <button onClick={save}>{T.common.save}</button>
                      <button className="btn-secondary" onClick={() => setEditing(null)}>{T.common.cancel}</button>
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="match-card">
                    <div className="match-meta">
                      <span>
                        {m.phase ? PHASE_LABELS[m.phase] : m.rodada ? `R${m.rodada}` : ''}
                        {(m.phase || m.rodada) ? ' · ' : ''}
                        {m.date ? new Date(m.date).toLocaleString('pt-BR', { timeZone:'America/Sao_Paulo', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : 'Data a definir'}
                      </span>
                      <span className={`match-status ${m.status || 'scheduled'}`}>{m.status === 'finished' ? 'Finalizada' : 'Agendada'}</span>
                    </div>
                    <div className="match-row">
                      <div className="match-team home">
                        <ShieldEmoji emoji={m.homeShieldEmoji} size="1.1em" style={{ marginRight:'0.3rem' }} />
                        {m.homeTeamName}
                      </div>
                      {m.status === 'finished' ? <div className="score-final">{m.homeScore} : {m.awayScore}</div> : <div className="match-vs">x</div>}
                      <div className="match-team">
                        <ShieldEmoji emoji={m.awayShieldEmoji} size="1.1em" style={{ marginRight:'0.3rem' }} />
                        {m.awayTeamName}
                      </div>
                    </div>
                    {m.location && <div className="match-location">📍 {m.location}</div>}
                    <div className="prediction-row">
                      <button className="btn-secondary" onClick={() => openEdit(m)}>{T.common.edit}</button>
                      <button className="btn-danger"    onClick={() => remove(m)}>{T.common.delete}</button>
                    </div>
                  </div>
                )
              ))}
            </div>
          );
        })
      )}
    </>
  );
}

/* ── RESULTADOS ───────────────────────────────────────────────── */
function ResultsSection({ event }) {
  const [matches, setMatches] = useState([]);
  const [players, setPlayers] = useState([]);
  const [teams,   setTeams]   = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm]       = useState({ sport:'', homeScore:0, awayScore:0, homePoints:'', awayPoints:'', stats:[] });
  const [msg, setMsg]         = useState(null);
  const [busy, setBusy]       = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [statFilter, setStatFilter] = useState({ teamId:'all', position:'all', sort:'alpha' });
  const [expandedPlayers, setExpandedPlayers] = useState(new Set()); // IDs dos jogadores com stats visíveis
  const togglePlayer = (id) => setExpandedPlayers((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const expandAll    = () => setExpandedPlayers(new Set(filteredMatchPlayers.map((p) => p.id)));
  const collapseAll  = () => setExpandedPlayers(new Set());
  const [roundFilter, setRoundFilter] = useState('all');
  const autoSelectedRef = useRef(false);

  const load = async () => {
    const [m, t, p] = await Promise.all([getMatchesByEvent(event.id), getTeamsByEvent(event.id), getPlayers()]);
    const teamIds = new Set(t.map((x) => x.id));
    setMatches(m);
    setTeams(t);
    setPlayers(p.filter((pl) => teamIds.has(pl.teamId)));
    if (!autoSelectedRef.current) {
      autoSelectedRef.current = true;
      const firstPendingKey = m.filter((x) => x.status !== 'finished').map((x) => x.phase || x.rodada).find(Boolean);
      if (firstPendingKey) setRoundFilter(String(firstPendingKey));
    }
  };
  useEffect(() => {
    autoSelectedRef.current = false;
    setRoundFilter('all');
    load();
  }, [event.id]);

  const startEdit = (m) => {
    setEditing(m.id);
    setForm({ sport:m.sport, homeScore:m.homeScore??0, awayScore:m.awayScore??0,
      homePoints:m.homePoints??'', awayPoints:m.awayPoints??'', stats:m.playerStats||[] });
    setExpandedPlayers(new Set());
    setMsg(null);
  };

  const matchPlayers = useMemo(() => {
    if (!editing) return [];
    const m = matches.find((x) => x.id === editing);
    if (!m) return [];
    return players.filter((p) => p.teamId === m.homeTeamId || p.teamId === m.awayTeamId);
  }, [editing, matches, players]);

  const POS_ORDER = ['GK','LAT','ZAG','MCM','ATA','FIX','ALA','PIV','PG','SG','SF','SET','OPP','OH1','OH2','MB1','MB2'];

  const filteredMatchPlayers = useMemo(() => {
    let pls = matchPlayers;
    if (statFilter.teamId !== 'all')
      pls = pls.filter((p) => p.teamId === statFilter.teamId);
    if (statFilter.position !== 'all')
      pls = pls.filter((p) => p.position === statFilter.position);
    pls = [...pls].sort((a, b) => {
      if (statFilter.sort === 'position')
        return (POS_ORDER.indexOf(a.position) - POS_ORDER.indexOf(b.position)) || a.name.localeCompare(b.name, 'pt');
      if (statFilter.sort === 'team')
        return (a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0) || a.name.localeCompare(b.name, 'pt');
      return a.name.localeCompare(b.name, 'pt'); // alpha
    });
    return pls;
  }, [matchPlayers, statFilter]);

  const getStatFields = (sport) =>
    event.type === 'profissional' && sport === 'futebol'
      ? STAT_FIELDS_PRO.futebol
      : (STAT_FIELDS[sport] || []);

  const updateStat = (playerId, teamId, field, val) => {
    const existing = form.stats.find((s) => s.playerId === playerId);
    const blank = { playerId, teamId };
    getStatFields(form.sport).forEach(({ field:f }) => { blank[f] = 0; });
    const stats = existing
      ? form.stats.map((s) => s.playerId === playerId ? { ...s, [field]: Number(val)||0 } : s)
      : [...form.stats, { ...blank, [field]: Number(val)||0 }];
    setForm({ ...form, stats });
  };

  const statValue = (pid, f) => form.stats.find((s) => s.playerId === pid)?.[f] ?? 0;

  const submit = async () => {
    setBusy(true);
    try {
      const extra = form.sport === 'volleyball'
        ? { homePoints: Number(form.homePoints)||0, awayPoints: Number(form.awayPoints)||0 }
        : {};
      await updateMatchResult(editing, Number(form.homeScore), Number(form.awayScore), form.stats, extra);
      await load();
      setEditing(null);
      setMsg({ type:'success', text: 'Resultado salvo. Clique em "➕ Pontuar novos resultados" ao terminar de lançar os jogos.' });
    } catch (err) { setMsg({ type:'error', text: err.message }); }
    finally { setBusy(false); }
  };

  // Incremental: pontua só os jogos NOVOS e soma (barato). Para o dia a dia.
  const [scoringNew, setScoringNew] = useState(false);
  const scoreNew = async () => {
    setScoringNew(true);
    setMsg(null);
    try {
      // Garante que um fechamento automático pendente vire snapshot ANTES de
      // pontuar (senão a rodada pontuaria sem o snapshot congelado).
      try { await finalizeExpiredMarket(event.id); } catch { /* segue */ }
      const r = await scoreNewResults(event.id);
      const parts = [];
      if (r.predGames) parts.push(`palpites de ${r.predGames} jogo(s)`);
      if (r.rounds)    parts.push(`fantasy de ${r.rounds} rodada(s) completa(s)`);
      setMsg({ type:'success', text: parts.length
        ? `➕ Pontuado: ${parts.join(' + ')}.`
        : 'Nada novo para pontuar (sem jogos finalizados novos nem rodadas completas).' });
    } catch (err) { setMsg({ type:'error', text: 'Erro ao pontuar: ' + err.message }); }
    finally { setScoringNew(false); }
  };

  // OLIMFEF: importa os resultados das súmulas (placar + stats) de uma vez.
  const [importingRes, setImportingRes] = useState(false);
  const importResults = async () => {
    if (!window.confirm(`Importar ${OLIMFEF_RESULTS.length} resultados de súmulas (placar + estatísticas)?\n\nDepois rode "🔄 Recalcular tudo" para pontuar.`)) return;
    setImportingRes(true);
    setMsg(null);
    try {
      const r = await importCountryResults(event.id, OLIMFEF_RESULTS);
      const head = `📥 ${r.applied} resultado(s) aplicado(s).`;
      setMsg({ type: r.issues.length ? 'error' : 'success',
        text: r.issues.length ? `${head}\n⚠️ Pendências:\n- ${r.issues.join('\n- ')}` : head });
    } catch (err) { setMsg({ type:'error', text: 'Erro ao importar: ' + err.message }); }
    finally { setImportingRes(false); }
  };

  // Completo: zera e recalcula tudo. Caro — use só para CORRIGIR resultados já
  // lançados, ou se algo ficar inconsistente. Não rode "pra atualizar o ranking".
  const recompute = async () => {
    setRecomputing(true);
    setMsg(null);
    try {
      try { await finalizeExpiredMarket(event.id); } catch { /* segue */ }
      await recomputeAllScores();
      setMsg({ type:'success', text: '✅ Tudo recalculado.' });
    } catch (err) { setMsg({ type:'error', text: 'Erro ao recalcular: ' + err.message }); }
    finally { setRecomputing(false); }
  };

  // Conquistas em botão separado — também lê coleções inteiras. Rode com menos
  // frequência (ex.: fim de rodada/evento), para não dobrar o custo do recompute.
  const [badging, setBadging] = useState(false);
  const updateBadges = async () => {
    setBadging(true);
    setMsg(null);
    try {
      await checkAndAwardBadges(event.id);
      setMsg({ type:'success', text: '🏅 Conquistas atualizadas.' });
    } catch (err) { setMsg({ type:'error', text: 'Erro ao atualizar conquistas: ' + err.message }); }
    finally { setBadging(false); }
  };

  const rodadas = useMemo(() => {
    const seen = new Set();
    const list = [];
    matches.forEach((m) => {
      const key = m.phase || m.rodada;
      if (key && !seen.has(key)) { seen.add(key); list.push(key); }
    });
    return list;
  }, [matches]);

  const filterByRound = (arr) =>
    roundFilter === 'all' ? arr : arr.filter((m) => (m.phase || m.rodada) === roundFilter);

  const pending  = filterByRound(matches.filter((m) => m.status !== 'finished'));
  const finished = filterByRound(matches.filter((m) => m.status === 'finished'));

  const renderCard = (m) => {
    const isEditing = editing === m.id;
    return (
      <div key={m.id} className="match-card">
        <div className="match-meta">
          <span>
            {SPORT_LABELS[m.sport] || m.sport}
            {m.gender === 'masculino' ? ' ♂' : m.gender === 'feminino' ? ' ♀' : ''}
          </span>
          <span className={`match-status ${m.status||'scheduled'}`}>{m.status === 'finished' ? 'Finalizada' : 'Agendada'}</span>
        </div>
        <div className="match-row">
          <div className="match-team home">
            {m.homeShieldUrl && <img src={m.homeShieldUrl} alt="" className="match-shield" />}
            {m.homeTeamName}
          </div>
          {m.status === 'finished' && !isEditing ? <div className="score-final">{m.homeScore} : {m.awayScore}</div> : <div className="match-vs">x</div>}
          <div className="match-team">
            {m.awayTeamName}
            {m.awayShieldUrl && <img src={m.awayShieldUrl} alt="" className="match-shield" />}
          </div>
        </div>
        {isEditing ? (
          <div style={{ marginTop:'0.8rem' }}>
            <div className="flex mb-1" style={{ alignItems:'center', gap:8 }}>
              <label style={{ minWidth:90, fontSize:'0.85rem' }}>Placar:</label>
              <input type="number" min="0" style={{ width:56 }} value={form.homeScore} onChange={(e) => setForm({ ...form, homeScore: e.target.value })} />
              <span>:</span>
              <input type="number" min="0" style={{ width:56 }} value={form.awayScore} onChange={(e) => setForm({ ...form, awayScore: e.target.value })} />
            </div>
            {form.sport === 'volleyball' && (
              <div className="flex mb-1" style={{ gap:8, alignItems:'center' }}>
                <label style={{ minWidth:120, fontSize:'0.85rem', color:'var(--muted)' }}>Pontos totais:</label>
                <input type="number" min="0" placeholder="Casa" style={{ width:60 }} value={form.homePoints} onChange={(e) => setForm({ ...form, homePoints: e.target.value })} />
                <span>:</span>
                <input type="number" min="0" placeholder="Fora" style={{ width:60 }} value={form.awayPoints} onChange={(e) => setForm({ ...form, awayPoints: e.target.value })} />
              </div>
            )}
            <h4 style={{ margin:'0.8rem 0 0.4rem', fontSize:'0.9rem' }}>Estatísticas</h4>
            {matchPlayers.length === 0 && <p className="muted" style={{ fontSize:'0.85rem' }}>Sem jogadores cadastrados nesses times.</p>}
            {matchPlayers.length > 0 && (() => {
              const homeTeam = teams.find((t) => t.id === m.homeTeamId);
              const awayTeam = teams.find((t) => t.id === m.awayTeamId);
              const positions = [...new Set(matchPlayers.map((p) => p.position).filter(Boolean))]
                .sort((a, b) => POS_ORDER.indexOf(a) - POS_ORDER.indexOf(b));
              return (
                <div style={{ marginBottom:'0.6rem', display:'flex', flexDirection:'column', gap:'0.4rem' }}>
                  {/* Filtro: seleção */}
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'0.3rem', alignItems:'center' }}>
                    <span className="muted" style={{ fontSize:'0.72rem', minWidth:56 }}>Seleção:</span>
                    {[{ id:'all', label:'Todos', emoji:null }, { id:homeTeam?.id, label:homeTeam?.name, emoji:homeTeam?.shieldEmoji }, { id:awayTeam?.id, label:awayTeam?.name, emoji:awayTeam?.shieldEmoji }]
                      .filter((x) => x.id).map((x) => (
                        <button key={x.id} type="button"
                          style={{ fontSize:'0.72rem', padding:'0.18rem 0.5rem', display:'flex', alignItems:'center', gap:'0.25rem',
                            background: statFilter.teamId === x.id ? 'var(--primary)' : 'var(--surface-2)',
                            color: statFilter.teamId === x.id ? '#000' : 'var(--text)',
                            border:`1px solid ${statFilter.teamId === x.id ? 'var(--primary)' : 'var(--border)'}`,
                            borderRadius:20, cursor:'pointer' }}
                          onClick={() => setStatFilter((f) => ({ ...f, teamId: x.id }))}>
                          {x.emoji && <ShieldEmoji emoji={x.emoji} size="0.9em" />}{x.label}
                        </button>
                    ))}
                  </div>
                  {/* Filtro: posição */}
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'0.3rem', alignItems:'center' }}>
                    <span className="muted" style={{ fontSize:'0.72rem', minWidth:56 }}>Posição:</span>
                    {['all', ...positions].map((pos) => (
                      <button key={pos} type="button"
                        style={{ fontSize:'0.72rem', padding:'0.18rem 0.5rem',
                          background: statFilter.position === pos ? 'var(--primary)' : 'var(--surface-2)',
                          color: statFilter.position === pos ? '#000' : 'var(--text)',
                          border:`1px solid ${statFilter.position === pos ? 'var(--primary)' : 'var(--border)'}`,
                          borderRadius:20, cursor:'pointer' }}
                        onClick={() => setStatFilter((f) => ({ ...f, position: pos }))}>
                        {pos === 'all' ? 'Todas' : (POSITION_LABELS[pos] || pos)}
                      </button>
                    ))}
                  </div>
                  {/* Ordenação */}
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'0.3rem', alignItems:'center' }}>
                    <span className="muted" style={{ fontSize:'0.72rem', minWidth:56 }}>Ordenar:</span>
                    {[{ k:'alpha', lbl:'A–Z' }, { k:'position', lbl:'Posição' }, { k:'team', lbl:'Seleção' }].map(({ k, lbl }) => (
                      <button key={k} type="button"
                        style={{ fontSize:'0.72rem', padding:'0.18rem 0.5rem',
                          background: statFilter.sort === k ? 'var(--accent)' : 'var(--surface-2)',
                          color: statFilter.sort === k ? '#000' : 'var(--text)',
                          border:`1px solid ${statFilter.sort === k ? 'var(--accent)' : 'var(--border)'}`,
                          borderRadius:20, cursor:'pointer' }}
                        onClick={() => setStatFilter((f) => ({ ...f, sort: k }))}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <p className="muted" style={{ fontSize:'0.72rem', margin:0 }}>
                      {filteredMatchPlayers.length} de {matchPlayers.length} jogador(es)
                    </p>
                    <div style={{ display:'flex', gap:'0.3rem' }}>
                      <button type="button" onClick={expandAll}
                        style={{ fontSize:'0.68rem', padding:'0.15rem 0.45rem', borderRadius:99, cursor:'pointer',
                          background:'var(--surface-2)', border:'1px solid var(--border)', color:'var(--text)' }}>
                        Expandir todos
                      </button>
                      <button type="button" onClick={collapseAll}
                        style={{ fontSize:'0.68rem', padding:'0.15rem 0.45rem', borderRadius:99, cursor:'pointer',
                          background:'var(--surface-2)', border:'1px solid var(--border)', color:'var(--text)' }}>
                        Recolher todos
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
            {filteredMatchPlayers.map((p) => {
              const isExpanded = expandedPlayers.has(p.id);
              const team       = teams.find((t) => t.id === p.teamId);
              const hasValues  = getStatFields(m.sport).some((f) => statValue(p.id, f.field) > 0);
              return (
                <div key={p.id} className="player-card" style={{ flexDirection:'column', gap:'0.25rem', padding:'0.45rem 0.65rem' }}>
                  {/* Linha colapsada: nome + indicador de stats + botão */}
                  <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', cursor:'pointer' }}
                       onClick={() => togglePlayer(p.id)}>
                    {team?.shieldEmoji && <ShieldEmoji emoji={team.shieldEmoji} size="1rem" />}
                    <span className="player-name" style={{ flex:1 }}>{p.name}</span>
                    <span className="player-meta" style={{ fontSize:'0.7rem' }}>{POSITION_LABELS[p.position] || p.position}</span>
                    {hasValues && !isExpanded && (
                      <span style={{ fontSize:'0.68rem', color:'var(--primary)', fontWeight:700 }}>✓</span>
                    )}
                    <span style={{ fontSize:'0.7rem', color:'var(--muted)', userSelect:'none' }}>
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>
                  {/* Campos de stats — só visíveis quando expandido */}
                  {isExpanded && (
                    <div className="flex" style={{ flexWrap:'wrap', gap:8, paddingTop:'0.4rem', borderTop:'1px solid var(--border)' }}>
                      {getStatFields(m.sport).map(({ field:f, label:lbl }) => (
                        <label key={f} style={{ display:'flex', flexDirection:'column', alignItems:'center', fontSize:'0.75rem', gap:2 }}>
                          <span>{lbl}</span>
                          <input type="number" min="0" style={{ width:52 }} value={statValue(p.id, f)}
                            onChange={(e) => updateStat(p.id, p.teamId, f, e.target.value)} />
                        </label>
                      ))}
                      {getStatFields(m.sport).length === 0 && (
                        <span className="muted" style={{ fontSize:'0.8rem' }}>Pontuação por resultado de sets</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="flex mt-2">
              <button onClick={submit} disabled={busy}>{busy ? T.common.loading : '💾 Salvar resultado'}</button>
              <button className="btn-secondary" onClick={() => setEditing(null)}>{T.common.cancel}</button>
            </div>
          </div>
        ) : (
          <div className="prediction-row">
            {m.status === 'finished'
              ? <button className="btn-secondary" onClick={() => startEdit(m)} style={{ marginLeft:'auto' }}>{T.admin.editResult}</button>
              : <button onClick={() => startEdit(m)} style={{ marginLeft:'auto' }}>{T.admin.enterResult}</button>
            }
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <Msg msg={msg} />
      {matches.length > 0 && (
        <div className="card" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'0.6rem', flexWrap:'wrap', padding:'0.7rem 0.9rem', marginBottom:'1rem' }}>
          <span className="muted" style={{ fontSize:'0.8rem' }}>
            <strong>➕ Pontuar novos resultados</strong> (barato): palpites pontuam por <strong>jogo</strong>;
            o fantasy só quando a <strong>rodada inteira</strong> fecha (regra do reserva). Pode clicar a cada
            tanda de jogos. Use <strong>🔄 Recalcular tudo</strong> só para corrigir resultado já lançado.
          </span>
          <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap' }}>
            <button onClick={scoreNew} disabled={scoringNew || recomputing || badging} style={{ whiteSpace:'nowrap' }}>
              {scoringNew ? '⏳ Pontuando…' : '➕ Pontuar novos resultados'}
            </button>
            <button className="btn-secondary" onClick={recompute} disabled={scoringNew || recomputing || badging} style={{ whiteSpace:'nowrap' }}>
              {recomputing ? '⏳ Recalculando…' : '🔄 Recalcular tudo'}
            </button>
            <button className="btn-secondary" onClick={updateBadges} disabled={scoringNew || recomputing || badging} style={{ whiteSpace:'nowrap' }}>
              {badging ? '⏳ Atualizando…' : '🏅 Atualizar conquistas'}
            </button>
            {event.genderMode && (
              <button className="btn-secondary" onClick={importResults} disabled={importingRes || scoringNew || recomputing} style={{ whiteSpace:'nowrap' }}>
                {importingRes ? '⏳ Importando…' : '📥 Importar resultados (súmulas)'}
              </button>
            )}
          </div>
        </div>
      )}
      {matches.length === 0 && (
        <div className="card"><p className="muted">Cadastre partidas na aba "Partidas" antes de lançar resultados.</p></div>
      )}
      {rodadas.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:'0.3rem', marginBottom:'1rem', alignItems:'center' }}>
          <span className="muted" style={{ fontSize:'0.78rem', marginRight:'0.2rem' }}>Rodada:</span>
          {['all', ...rodadas].map((r) => (
            <button
              key={r} type="button"
              style={{
                fontSize:'0.78rem', padding:'0.25rem 0.65rem', borderRadius:20, cursor:'pointer',
                background: roundFilter === r ? 'var(--primary)' : 'var(--surface-2)',
                color:      roundFilter === r ? '#000' : 'var(--text)',
                border:    `1px solid ${roundFilter === r ? 'var(--primary)' : 'var(--border)'}`,
                fontWeight: roundFilter === r ? 700 : 400,
              }}
              onClick={() => { setRoundFilter(r); setEditing(null); }}
            >
              {r === 'all' ? 'Todas' : (PHASE_LABELS[r] || r)}
            </button>
          ))}
        </div>
      )}
      {pending.length > 0 && (
        <>
          <h3 className="admin-sport-header">Aguardando resultado</h3>
          {pending.map(renderCard)}
        </>
      )}
      {finished.length > 0 && (
        <>
          <h3 className="admin-sport-header mt-2">Resultados lançados</h3>
          {finished.map(renderCard)}
        </>
      )}
      {rodadas.length > 0 && roundFilter !== 'all' && pending.length === 0 && finished.length === 0 && (
        <div className="card"><p className="muted">Nenhuma partida encontrada para "{roundFilter}".</p></div>
      )}
    </>
  );
}

/* ── GESTÃO DE LIGAS (admin) ──────────────────────────────────── */
function LeaguesSection({ event }) {
  const [leagues, setLeagues]   = useState([]);
  const [profiles, setProfiles] = useState({});
  const [loading, setLoading]   = useState(true);
  const [msg, setMsg]           = useState(null);
  const [editing, setEditing]   = useState(null); // leagueId em edição
  const [editForm, setEditForm] = useState({ name: '', leagueMode: 'ambas', emoji: '' });

  const load = async () => {
    setLoading(true);
    const ls = await getLeaguesByEvent(event.id);
    setLeagues(ls);
    const uids = [...new Set(ls.flatMap((l) => [...(l.members || []), ...(l.pendingMembers || [])]))];
    if (uids.length) setProfiles(await getUserProfilesByUids(uids));
    setLoading(false);
  };
  useEffect(() => { load(); }, [event.id]);

  const nameOf = (uid) => profiles[uid]?.displayName || uid.slice(0, 8) + '…';

  const startEdit = (l) => { setEditing(l.id); setEditForm({ name: l.name, leagueMode: l.leagueMode || 'ambas', emoji: l.emoji || '' }); };
  const saveEdit = async (l) => {
    try {
      await updateLeague(l.id, { name: editForm.name.trim() || l.name, leagueMode: editForm.leagueMode, emoji: editForm.emoji });
      setMsg({ type: 'success', text: 'Liga atualizada.' });
      setEditing(null); await load();
    } catch (err) { setMsg({ type: 'error', text: 'Erro: ' + err.message }); }
  };
  const remove = async (l) => {
    if (!window.confirm(`Excluir a liga "${l.name}"? Esta ação não pode ser desfeita.`)) return;
    try { await deleteLeague(l.id); setMsg({ type: 'success', text: 'Liga excluída.' }); await load(); }
    catch (err) { setMsg({ type: 'error', text: 'Erro: ' + err.message }); }
  };
  const kick = async (l, uid) => {
    if (!window.confirm(`Remover ${nameOf(uid)} da liga "${l.name}"?`)) return;
    try { await removeLeagueMember(l.id, uid); await load(); }
    catch { setMsg({ type: 'error', text: 'Erro ao remover membro.' }); }
  };
  const approve = async (l, uid) => { try { await approveLeagueMember(l.id, uid); await load(); } catch { setMsg({ type:'error', text:'Erro ao aprovar.' }); } };
  const reject  = async (l, uid) => { try { await rejectLeagueMember(l.id, uid);  await load(); } catch { setMsg({ type:'error', text:'Erro ao recusar.' }); } };

  if (loading) return <p className="muted">Carregando ligas…</p>;

  return (
    <>
      <h2 style={{ marginBottom: '0.5rem' }}>🏆 Ligas do evento</h2>
      <Msg msg={msg} />
      {leagues.length === 0 ? (
        <div className="card"><p className="muted">Nenhuma liga criada neste evento.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {leagues.map((l) => (
            <div key={l.id} className="card" style={{ padding: '0.85rem 1rem' }}>
              {editing === l.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <EmojiPicker value={editForm.emoji} size={40} label="ícone da liga" onChange={(em) => setEditForm({ ...editForm, emoji: em })} />
                    <input style={{ flex: 1 }} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Nome da liga" maxLength={20} />
                  </div>
                  <select value={editForm.leagueMode} onChange={(e) => setEditForm({ ...editForm, leagueMode: e.target.value })}>
                    <option value="ambas">🏅 Fantasy + 🔮 Palpites</option>
                    <option value="fantasy">🏅 Apenas Fantasy</option>
                    <option value="palpites">🔮 Apenas Palpites</option>
                  </select>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => saveEdit(l)}>Salvar</button>
                    <button className="btn-secondary" onClick={() => setEditing(null)}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-between" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>
                        {l.emoji ? `${l.emoji} ` : ''}{l.name}
                        {l.leagueMode && l.leagueMode !== 'ambas' && (
                          <span style={{ fontSize: '0.72rem', color: 'var(--muted)', marginLeft: '0.4rem' }}>
                            {l.leagueMode === 'fantasy' ? '🏅 Fantasy' : '🔮 Palpites'}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                        👥 {l.members?.length || 0} membros · Dono: {nameOf(l.createdBy)} · Código: {l.inviteCode}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button className="btn-secondary" style={{ fontSize: '0.8rem' }} onClick={() => startEdit(l)}>Editar</button>
                      <button className="btn-danger" style={{ fontSize: '0.8rem' }} onClick={() => remove(l)}>Excluir</button>
                    </div>
                  </div>

                  {/* Solicitações pendentes */}
                  {(l.pendingMembers || []).length > 0 && (
                    <div style={{ marginTop: '0.6rem', borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
                      <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '0.3rem' }}>Solicitações ({l.pendingMembers.length})</div>
                      {l.pendingMembers.map((uid) => (
                        <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.15rem 0' }}>
                          <span style={{ flex: 1, minWidth: 0, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(uid)}</span>
                          <button className="btn" style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem' }} onClick={() => approve(l, uid)}>Aceitar</button>
                          <button className="btn-secondary" style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem' }} onClick={() => reject(l, uid)}>Recusar</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Membros */}
                  {(l.members || []).length > 0 && (
                    <div style={{ marginTop: '0.6rem', borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
                      <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--muted)', marginBottom: '0.3rem' }}>Membros</div>
                      {l.members.map((uid) => (
                        <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.15rem 0' }}>
                          <span style={{ flex: 1, minWidth: 0, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {nameOf(uid)}{uid === l.createdBy && ' 👑'}
                          </span>
                          {uid !== l.createdBy && (
                            <button className="btn-secondary" style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem' }} onClick={() => kick(l, uid)}>Remover</button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ── CONFIGURAÇÕES ────────────────────────────────────────────── */
// Ferramentas de manutenção (guardadas na aba Config): restaurar escalação de um
// backup JSON e escalar no lugar de um usuário (futebol). Uso eventual.
function JsonRestoreTool({ event }) {
  const [msg, setMsg] = useState(null);
  const [matches, setMatches] = useState([]);

  useEffect(() => { getMatchesByEvent(event.id).then(setMatches).catch(() => {}); }, [event.id]);

  // Rótulos de rodada na convenção do SCORING (rodada ?? phase) — p/ o snapshot casar.
  const restoreRounds = useMemo(() => {
    const rk = (m) => (m.rodada != null ? String(m.rodada) : (m.phase || ''));
    return [...new Set(matches.map(rk).filter(Boolean))];
  }, [matches]);

  // ── Restaurar escalação de um backup JSON ──
  const [jzOpen, setJzOpen]     = useState(false);
  const [jzData, setJzData]     = useState(null);
  const [jzName, setJzName]     = useState('');
  const [jzHits, setJzHits]     = useState(null);
  const [jzPick, setJzPick]     = useState(null);
  const [jzRodada, setJzRodada] = useState('');
  const [jzBusy, setJzBusy]     = useState(false);

  const jzLoadFile = async (file) => {
    if (!file) return;
    setJzBusy(true); setMsg(null); setJzHits(null); setJzPick(null);
    try {
      const json = JSON.parse(await file.text());
      if (!json.collections?.user_teams) throw new Error('JSON inválido (sem user_teams).');
      setJzData(json);
      setMsg({ type:'success', text:`Backup carregado${json.exportedAt ? ` (${json.exportedAt})` : ''}.` });
    } catch (err) { setMsg({ type:'error', text:'Erro ao ler JSON: ' + err.message }); }
    finally { setJzBusy(false); }
  };

  const jzSearch = () => {
    if (!jzData) { setMsg({ type:'error', text:'Carregue o JSON primeiro.' }); return; }
    const teams = jzData.collections.user_teams || [];
    const nameByUid = {};
    (jzData.collections.users || []).forEach((u) => { nameByUid[u.id] = u.displayName || ''; });
    const q = jzName.trim().toLowerCase();
    const hits = teams
      .filter((t) => (t.eventId || 'default') === event.id && (t.playerIds || []).length)
      .filter((t) => !q || (nameByUid[t.uid] || '').toLowerCase().includes(q))
      .map((t) => ({ ...t, displayName: nameByUid[t.uid] || t.uid }));
    setJzHits(hits); setJzPick(null);
    if (!hits.length) setMsg({ type:'error', text:'Nenhuma escalação no JSON p/ esse nome neste evento.' });
  };

  const jzRestore = async () => {
    if (!jzPick)   { setMsg({ type:'error', text:'Escolha a escalação.' }); return; }
    if (!jzRodada) { setMsg({ type:'error', text:'Escolha a rodada de destino.' }); return; }
    setJzBusy(true); setMsg(null);
    try {
      await restoreRoundLineup(jzPick.uid, event.id, jzRodada, jzPick);
      setMsg({ type:'success', text:`✅ Escalação de ${jzPick.displayName} restaurada na rodada "${jzRodada}". Rode "🔄 Recalcular tudo".` });
    } catch (err) { setMsg({ type:'error', text:'Erro ao restaurar: ' + err.message }); }
    finally { setJzBusy(false); }
  };

  // Resumo do que o JSON tem para este evento (p/ decidir o que dá pra recuperar).
  const jzInfo = useMemo(() => {
    if (!jzData) return null;
    const teams = (jzData.collections?.user_teams || [])
      .filter((t) => (t.eventId || 'default') === event.id && (t.playerIds || []).length);
    const snapRks = [...new Set((jzData.collections?.round_lineups || [])
      .filter((s) => (s.eventId || 'default') === event.id)
      .map((s) => String(s.rodada)))];
    return { teamCount: teams.length, snapRks };
  }, [jzData, event.id]);

  // Snapshots (round_lineups) DENTRO do JSON, agrupados por (rodada, dia da
  // captura). Permite re-rotular um grupo gravado na chave errada (ex.: captura
  // bugada salvou os 16 avos como "rodada 3") para a rodada correta (r32).
  const [jzSnapPick, setJzSnapPick]     = useState(null);
  const [jzSnapTarget, setJzSnapTarget] = useState('');
  const jzSnapGroups = useMemo(() => {
    if (!jzData) return [];
    const snaps = (jzData.collections?.round_lineups || [])
      .filter((s) => (s.eventId || 'default') === event.id && (s.playerIds || []).length);
    const g = {};
    snaps.forEach((s) => {
      const day = s.capturedAt ? new Date(s.capturedAt).toLocaleDateString('pt-BR') : 'sem data';
      const key = `${s.rodada}__${day}`;
      (g[key] = g[key] || { rodada: String(s.rodada), day, snaps: [] }).snaps.push(s);
    });
    return Object.values(g).sort((a, b) => a.rodada.localeCompare(b.rodada) || a.day.localeCompare(b.day));
  }, [jzData, event.id]);

  // Quem JÁ TEM snapshot na rodada de destino é mantido (ex.: escalações que o
  // admin gravou manualmente) — as restaurações nunca sobrescrevem os existentes.
  const existingAt = async (rodada) => {
    const cur = await getRoundLineupsByEvent(event.id, rodada);
    return new Set(cur.filter((s) => (s.playerIds || []).length).map((s) => `${s.uid}__${s.sport}`));
  };

  const jzRestoreSnaps = async () => {
    if (!jzSnapPick)   { setMsg({ type:'error', text:'Escolha um grupo de snapshots.' }); return; }
    if (!jzSnapTarget) { setMsg({ type:'error', text:'Escolha a rodada de destino.' }); return; }
    setJzBusy(true); setMsg(null);
    try {
      const keep = await existingAt(jzSnapTarget);
      const todo = jzSnapPick.snaps.filter((s) => !keep.has(`${s.uid}__${s.sport}`));
      if (!window.confirm(`Restaurar snapshots (rodada "${jzSnapPick.rodada}", capturados em ${jzSnapPick.day}) como "${PHASE_LABELS[jzSnapTarget] || jzSnapTarget}"?\n\n· ${todo.length} será(ão) restaurado(s)\n· ${jzSnapPick.snaps.length - todo.length} mantido(s) (já têm escalação nessa rodada — ex.: manuais)\n\nDepois rode "🔄 Recalcular tudo".`)) return;
      let ok = 0;
      for (const s of todo) { await restoreRoundLineup(s.uid, event.id, jzSnapTarget, s); ok++; }
      setMsg({ type:'success', text:`✅ ${ok} restaurado(s) · ${jzSnapPick.snaps.length - todo.length} mantido(s). Rode "🔄 Recalcular tudo".` });
    } catch (err) { setMsg({ type:'error', text:'Erro ao restaurar snapshots: ' + err.message }); }
    finally { setJzBusy(false); }
  };

  // ── Restaurar PONTUAÇÕES do backup automático (scores_backup) ──
  // O recompute salva um backup antes de escrever; isto desfaz um recálculo ruim.
  const [sbList, setSbList] = useState(null);
  const [sbBusy, setSbBusy] = useState(false);
  const sbLoad = async () => {
    setSbBusy(true); setMsg(null);
    try {
      const list = await getScoreBackups();
      setSbList(list);
      if (!list.length) setMsg({ type:'error', text:'Nenhum backup de pontuação encontrado.' });
    } catch (err) { setMsg({ type:'error', text:'Erro ao listar backups: ' + err.message }); }
    finally { setSbBusy(false); }
  };
  const sbRestore = async (b) => {
    const when = new Date(b.createdAt).toLocaleString('pt-BR');
    if (!window.confirm(`Restaurar TODAS as pontuações do backup de ${when} (${b.count} scores)?\n\nIsso sobrescreve as pontuações atuais pelo estado daquele momento.`)) return;
    setSbBusy(true); setMsg(null);
    try {
      const n = await restoreScoresFromBackup(b.id);
      setMsg({ type:'success', text:`🛟 ${n} pontuação(ões) restauradas do backup de ${when}. NÃO rode "Recalcular tudo" até acharmos a causa.` });
    } catch (err) { setMsg({ type:'error', text:'Erro ao restaurar: ' + err.message }); }
    finally { setSbBusy(false); }
  };

  // Preenche "buracos": para cada usuário e cada rodada que TEM snapshots (de
  // outros usuários) mas onde ele não tem o dele, copia o snapshot dele da rodada
  // mais próxima (anterior; senão a seguinte). Ordem das rodadas = data dos jogos.
  const [fillBusy, setFillBusy] = useState(false);
  const fillMissingRounds = async () => {
    setFillBusy(true); setMsg(null);
    try {
      const snaps = await getAllRoundLineupsByEvent(event.id);
      const valid = snaps.filter((s) => (s.playerIds || []).length);
      if (!valid.length) { setMsg({ type:'error', text:'Nenhum snapshot no evento ainda.' }); return; }
      // Ordem cronológica das rodadas (menor data de jogo da rodada)
      const rk = (m) => (m.rodada != null ? String(m.rodada) : (m.phase || ''));
      const minDate = {};
      matches.forEach((m) => {
        const k = rk(m); if (!k || !m.date) return;
        if (minDate[k] == null || m.date < minDate[k]) minDate[k] = m.date;
      });
      const orderOf = (r) => minDate[r] ?? Infinity;
      // Por (sport, uid): rodadas existentes × rodadas do usuário
      const bySport = {};
      valid.forEach((s) => {
        const g = (bySport[s.sport] = bySport[s.sport] || { rounds: new Set(), byUid: {} });
        g.rounds.add(String(s.rodada));
        (g.byUid[s.uid] = g.byUid[s.uid] || {})[String(s.rodada)] = s;
      });
      const fills = [];
      Object.values(bySport).forEach((g) => {
        const rounds = [...g.rounds].sort((a, b) => orderOf(a) - orderOf(b));
        Object.entries(g.byUid).forEach(([uid, mine]) => {
          rounds.forEach((r, i) => {
            if (mine[r]) return;
            // fonte: rodada anterior mais próxima que ele tem; senão a seguinte
            let src = null;
            for (let j = i - 1; j >= 0 && !src; j--) src = mine[rounds[j]] || null;
            for (let j = i + 1; j < rounds.length && !src; j++) src = mine[rounds[j]] || null;
            if (src) fills.push({ uid, rodada: r, src });
          });
        });
      });
      if (!fills.length) { setMsg({ type:'success', text:'✅ Nenhum buraco: todos os usuários têm escalação em todas as rodadas com snapshot.' }); return; }
      const resume = {};
      fills.forEach((f) => { resume[f.rodada] = (resume[f.rodada] || 0) + 1; });
      const resumeTxt = Object.entries(resume).map(([r, n]) => `${PHASE_LABELS[r] || `Rodada ${r}`}: ${n}`).join(' · ');
      if (!window.confirm(`Preencher ${fills.length} escalação(ões) faltante(s)?\n\n${resumeTxt}\n\nCada usuário recebe o PRÓPRIO time da rodada mais próxima dele. Depois rode "🔄 Recalcular tudo".`)) return;
      for (const f of fills) await restoreRoundLineup(f.uid, event.id, f.rodada, f.src);
      setMsg({ type:'success', text:`🧩 ${fills.length} escalação(ões) preenchidas (${resumeTxt}). Rode "🔄 Recalcular tudo".` });
    } catch (err) { setMsg({ type:'error', text:'Erro ao preencher: ' + err.message }); }
    finally { setFillBusy(false); }
  };

  // Restaura TODOS os usuários do JSON como snapshot da rodada escolhida (lote).
  // Usa o user_teams de cada um (= o time dele no momento do backup).
  const jzRestoreAll = async () => {
    if (!jzData)   { setMsg({ type:'error', text:'Carregue o JSON primeiro.' }); return; }
    if (!jzRodada) { setMsg({ type:'error', text:'Escolha a rodada de destino.' }); return; }
    const teams = (jzData.collections?.user_teams || [])
      .filter((t) => (t.eventId || 'default') === event.id && (t.playerIds || []).length);
    if (!teams.length) { setMsg({ type:'error', text:'Nenhuma escalação no JSON para este evento.' }); return; }
    setJzBusy(true); setMsg(null);
    try {
      const keep = await existingAt(jzRodada);
      const todo = teams.filter((t) => !keep.has(`${t.uid}__${t.sport}`));
      if (!window.confirm(`Restaurar escalações do JSON como "${PHASE_LABELS[jzRodada] || `Rodada ${jzRodada}`}"?\n\n· ${todo.length} será(ão) restaurado(s) (time de cada um NESTE backup)\n· ${teams.length - todo.length} mantido(s) (já têm escalação nessa rodada — ex.: manuais)\n\nUse só se o backup é do período de escalação dessa rodada. Depois rode "🔄 Recalcular tudo".`)) return;
      let ok = 0;
      for (const t of todo) { await restoreRoundLineup(t.uid, event.id, jzRodada, t); ok++; }
      setMsg({ type:'success', text:`✅ ${ok} restaurado(s) · ${teams.length - todo.length} mantido(s) na rodada "${jzRodada}". Rode "🔄 Recalcular tudo".` });
    } catch (err) { setMsg({ type:'error', text:'Erro no lote: ' + err.message }); }
    finally { setJzBusy(false); }
  };

  return (
    <div style={{ marginTop:'1.5rem', borderTop:'1px solid var(--border)', paddingTop:'1rem' }}>
      <h3 style={{ fontSize:'0.9rem', marginBottom:'0.3rem' }}>🛠️ Recuperação (uso eventual)</h3>
      <p className="muted" style={{ fontSize:'0.75rem', marginBottom:'0.6rem' }}>
        Para casos pontuais. Após usar, rode <strong>🔄 Recalcular tudo</strong> na aba Resultados.
      </p>
      <Msg msg={msg} />
      <div className="card" style={{ padding:'0.7rem 0.9rem' }}>
        <button className="btn-secondary" onClick={() => setJzOpen((v) => !v)} style={{ fontSize:'0.8rem' }}>
          {jzOpen ? '▾' : '▸'} 🗂️ Restaurar escalação de um backup JSON
        </button>
        {jzOpen && (
          <div style={{ marginTop:'0.6rem', display:'flex', flexDirection:'column', gap:'0.5rem' }}>
            <p className="muted" style={{ fontSize:'0.76rem' }}>
              Suba um <strong>backup JSON</strong>. Acha a escalação do usuário e grava como
              <strong> snapshot da rodada</strong> escolhida — recupera a lista no perfil <strong>e</strong> os pontos.
            </p>
            <input type="file" accept="application/json,.json" onChange={(e) => jzLoadFile(e.target.files?.[0])} />
            {jzInfo && (
              <div className="muted" style={{ fontSize:'0.74rem', background:'var(--bg)', borderRadius:6, padding:'0.35rem 0.5rem' }}>
                Este JSON tem <strong>{jzInfo.teamCount}</strong> escalação(ões) (user_teams) deste evento
                {jzInfo.snapRks.length > 0 && <> · snapshots já em round_lineups: {jzInfo.snapRks.join(', ')}</>}.
              </div>
            )}
            {jzData && (
              <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap' }}>
                <input value={jzName} onChange={(e) => setJzName(e.target.value)} placeholder="Nome do usuário" style={{ flex:1, minWidth:160 }} />
                <button onClick={jzSearch} disabled={jzBusy}>🔎 Achar escalação</button>
              </div>
            )}
            {jzHits && jzHits.length > 0 && (
              <div style={{ display:'flex', flexDirection:'column', gap:'0.25rem' }}>
                {jzHits.map((t) => (
                  <button key={t.id || `${t.uid}_${t.sport}`} className="btn-secondary" onClick={() => setJzPick(t)}
                    style={{ textAlign:'left', fontSize:'0.78rem', border: jzPick === t ? '1px solid var(--primary)' : undefined }}>
                    <strong>{t.displayName}</strong> — {SPORT_LABELS[t.sport] || t.sport} · {(t.playerIds || []).length} titulares · {Object.values(t.bench || {}).filter(Boolean).length} reservas
                    <span style={{ color:'var(--muted)' }}> · uid {String(t.uid).slice(0, 6)}…</span>
                  </button>
                ))}
              </div>
            )}
            {jzPick && (
              <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap', alignItems:'center' }}>
                <span className="muted" style={{ fontSize:'0.78rem' }}>Restaurar na rodada:</span>
                <select value={jzRodada} onChange={(e) => setJzRodada(e.target.value)}>
                  <option value="">— escolher —</option>
                  {restoreRounds.map((r) => <option key={r} value={r}>{PHASE_LABELS[r] ? PHASE_LABELS[r] : `Rodada ${r}`}</option>)}
                </select>
                <button onClick={jzRestore} disabled={jzBusy}>💾 Restaurar escalação</button>
              </div>
            )}
            {jzData && (
              <div style={{ borderTop:'1px solid var(--border)', paddingTop:'0.5rem', display:'flex', gap:'0.4rem', flexWrap:'wrap', alignItems:'center' }}>
                <span className="muted" style={{ fontSize:'0.76rem' }}>📦 <strong>Em lote</strong> — restaurar TODOS na rodada:</span>
                <select value={jzRodada} onChange={(e) => setJzRodada(e.target.value)}>
                  <option value="">— escolher —</option>
                  {restoreRounds.map((r) => <option key={r} value={r}>{PHASE_LABELS[r] ? PHASE_LABELS[r] : `Rodada ${r}`}</option>)}
                </select>
                <button onClick={jzRestoreAll} disabled={jzBusy}>{jzBusy ? '⏳' : '📦 Restaurar todos do JSON'}</button>
                <span className="muted" style={{ fontSize:'0.7rem', flexBasis:'100%' }}>
                  Use só se o backup é do período de escalação dessa rodada (o time de cada um vira o snapshot daquela rodada).
                </span>
              </div>
            )}
            {jzSnapGroups.length > 0 && (
              <div style={{ borderTop:'1px solid var(--border)', paddingTop:'0.5rem', display:'flex', flexDirection:'column', gap:'0.4rem' }}>
                <span className="muted" style={{ fontSize:'0.76rem' }}>
                  🧷 <strong>Snapshots dentro do JSON</strong> (round_lineups) — escolha um grupo e a rodada de destino
                  (útil p/ re-rotular captura que foi gravada na chave errada):
                </span>
                <div style={{ display:'flex', flexWrap:'wrap', gap:'0.25rem' }}>
                  {jzSnapGroups.map((g) => (
                    <button key={`${g.rodada}__${g.day}`} className="btn-secondary" onClick={() => setJzSnapPick(g)}
                      style={{ fontSize:'0.74rem', border: jzSnapPick === g ? '1px solid var(--primary)' : undefined }}>
                      {PHASE_LABELS[g.rodada] || `Rodada ${g.rodada}`} · capturado {g.day} · {g.snaps.length} escalação(ões)
                    </button>
                  ))}
                </div>
                {jzSnapPick && (
                  <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap', alignItems:'center' }}>
                    <span className="muted" style={{ fontSize:'0.76rem' }}>Restaurar como rodada:</span>
                    <select value={jzSnapTarget} onChange={(e) => setJzSnapTarget(e.target.value)}>
                      <option value="">— escolher —</option>
                      {restoreRounds.map((r) => <option key={r} value={r}>{PHASE_LABELS[r] ? PHASE_LABELS[r] : `Rodada ${r}`}</option>)}
                    </select>
                    <button onClick={jzRestoreSnaps} disabled={jzBusy}>{jzBusy ? '⏳' : '🧷 Restaurar snapshots'}</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="card" style={{ padding:'0.7rem 0.9rem', marginTop:'1rem' }}>
        <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap', alignItems:'center' }}>
          <button className="btn-secondary" onClick={sbLoad} disabled={sbBusy} style={{ fontSize:'0.8rem' }}>
            {sbBusy ? '⏳…' : '🛟 Restaurar pontuações (backup automático)'}
          </button>
          <span className="muted" style={{ fontSize:'0.74rem', flex:1, minWidth:220 }}>
            Desfaz um recálculo ruim: volta TODAS as pontuações (fantasy + bolão) para o estado
            salvo automaticamente antes de cada "Recalcular tudo".
          </span>
        </div>
        {sbList && sbList.length > 0 && (
          <div style={{ display:'flex', flexDirection:'column', gap:'0.25rem', marginTop:'0.5rem' }}>
            {sbList.map((b) => (
              <button key={b.id} className="btn-secondary" onClick={() => sbRestore(b)} disabled={sbBusy}
                style={{ textAlign:'left', fontSize:'0.76rem' }}>
                🕐 {new Date(b.createdAt).toLocaleString('pt-BR')} · {b.count} pontuações
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="card" style={{ padding:'0.7rem 0.9rem', marginTop:'1rem' }}>
        <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap', alignItems:'center' }}>
          <button className="btn-secondary" onClick={fillMissingRounds} disabled={fillBusy} style={{ fontSize:'0.8rem' }}>
            {fillBusy ? '⏳ Preenchendo…' : '🧩 Preencher rodadas sem escalação'}
          </button>
          <span className="muted" style={{ fontSize:'0.74rem', flex:1, minWidth:220 }}>
            Para cada usuário, preenche as rodadas onde ele ficou <strong>sem escalação</strong> com o
            <strong> próprio time da rodada mais próxima</strong> (anterior; senão a seguinte). Não precisa de JSON. Mostra o resumo antes de aplicar.
          </span>
        </div>
      </div>
    </div>
  );
}

// Escalar no lugar de um usuário que não escalou no prazo (futebol). Fica na aba
// Resultados (fluxo de trabalho). Salva direto em user_teams do alvo (admin).
function LateLineupTool({ event }) {
  const [msg, setMsg] = useState(null);
  const [esOpen, setEsOpen]         = useState(false);
  const [esName, setEsName]         = useState('');
  const [esUserHits, setEsUserHits] = useState(null);
  const [esUid, setEsUid]           = useState('');
  const [esUidName, setEsUidName]   = useState('');
  const [esFormation, setEsFormation] = useState('4-3-3');
  const [esPlayers, setEsPlayers]   = useState([]);
  const [esLoaded, setEsLoaded]     = useState(false);
  const [esSel, setEsSel]           = useState([]);
  const [esCaptain, setEsCaptain]   = useState('');
  const [esBench, setEsBench]       = useState({});
  const [esBusy, setEsBusy]         = useState(false);
  const [esCopyRound, setEsCopyRound] = useState('1');

  const esSlots = FUT_FORMATIONS[esFormation] || FUT_FORMATIONS['4-3-3'];

  // Copia o time ATUAL do usuário selecionado como snapshot de uma rodada (ex.:
  // dar a rodada 1 a quem você escalou só na 2, com o mesmo time).
  const esCopyToRound = async () => {
    if (!esUid)       { setMsg({ type:'error', text:'Selecione o usuário (Buscar).' }); return; }
    if (!esCopyRound) { setMsg({ type:'error', text:'Informe a rodada de destino.' }); return; }
    setEsBusy(true); setMsg(null);
    try {
      const teams = await getUserTeamsByUid(esUid, event.id);
      const fut = (teams || []).find((t) => t.sport === 'futebol' && (t.playerIds || []).length);
      if (!fut) { setMsg({ type:'error', text:'Esse usuário não tem time de futebol salvo.' }); return; }
      await restoreRoundLineup(esUid, event.id, esCopyRound, fut);
      setMsg({ type:'success', text:`✅ Time atual de ${esUidName || esUid} copiado para a rodada "${esCopyRound}". Rode "🔄 Recalcular tudo".` });
    } catch (err) { setMsg({ type:'error', text:'Erro ao copiar: ' + err.message }); }
    finally { setEsBusy(false); }
  };

  useEffect(() => {
    if (!esOpen || esLoaded) return;
    getPlayersBySport('futebol', event.id).then((pls) => { setEsPlayers(pls); setEsLoaded(true); }).catch(() => {});
  }, [esOpen, esLoaded, event.id]);

  useEffect(() => { setEsSel(Array(esSlots.length).fill('')); setEsBench({}); setEsCaptain(''); }, [esFormation]); // eslint-disable-line

  const esTeamName = (pid) => esPlayers.find((p) => p.id === pid)?.name || '';

  const esSearchUser = async () => {
    setEsBusy(true); setMsg(null);
    try {
      const cur = await getScoresByEvent(event.id);
      const q = esName.trim().toLowerCase();
      const hits = (cur || []).filter((s) => (s.displayName || '').toLowerCase().includes(q))
        .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
      setEsUserHits(hits);
      if (!hits.length) setMsg({ type:'error', text:'Ninguém encontrado com esse nome. Você pode colar o uid manualmente.' });
    } catch (err) { setMsg({ type:'error', text:'Erro ao buscar usuário: ' + err.message }); }
    finally { setEsBusy(false); }
  };

  const esAutoBench = () => {
    const benchPos = [...new Set(esSlots)];
    const starters = new Set(esSel.filter(Boolean));
    const bench = {};
    benchPos.forEach((bp) => {
      const cand = esPlayers
        .filter((p) => futCompat(bp).includes(p.position) && !starters.has(p.id) && !Object.values(bench).includes(p.id))
        .sort((a, b) => a.name.localeCompare(b.name))[0];
      if (cand) bench[bp] = cand.id;
    });
    setEsBench(bench);
  };

  const esSave = async () => {
    if (!esUid) { setMsg({ type:'error', text:'Selecione o usuário (ou cole o uid).' }); return; }
    const playerIds = [], playerPositions = [];
    esSel.forEach((pid, i) => { if (pid) { playerIds.push(pid); playerPositions.push(esSlots[i]); } });
    if (playerIds.length !== esSlots.length) { setMsg({ type:'error', text:`Faltam jogadores: ${playerIds.length}/${esSlots.length} preenchidos.` }); return; }
    if (new Set(playerIds).size !== playerIds.length) { setMsg({ type:'error', text:'Há jogador repetido na escalação.' }); return; }
    setEsBusy(true); setMsg(null);
    try {
      await saveUserTeam(esUid, 'futebol', playerIds, esCaptain || null, event.id, playerPositions, esBench, esFormation);
      setMsg({ type:'success', text:`✅ Escalação salva para ${esUidName || esUid}. Já conta na próxima pontuação.` });
    } catch (err) { setMsg({ type:'error', text:'Erro ao salvar escalação: ' + err.message }); }
    finally { setEsBusy(false); }
  };

  if (!((event.modalidades?.includes('futebol') ?? true) && !event.genderMode)) return null;

  return (
    <div className="card" style={{ padding:'0.7rem 0.9rem', marginBottom:'1rem' }}>
      <button className="btn-secondary" onClick={() => setEsOpen((v) => !v)} style={{ fontSize:'0.8rem' }}>
        {esOpen ? '▾' : '▸'} ✍️ Escalar por um usuário (futebol)
      </button>
      <Msg msg={msg} />
      {esOpen && (
        <div style={{ marginTop:'0.6rem', display:'flex', flexDirection:'column', gap:'0.5rem' }}>
          <p className="muted" style={{ fontSize:'0.76rem' }}>
            Para quem <strong>não escalou no prazo</strong>. Monta o time e salva como o time do usuário
            (mesmo com o mercado fechado). Já conta na próxima pontuação.
          </p>
          <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap', alignItems:'center' }}>
            <input value={esName} onChange={(e) => setEsName(e.target.value)} placeholder="Nome do usuário" style={{ flex:1, minWidth:160 }} />
            <button onClick={esSearchUser} disabled={esBusy}>🔎 Buscar</button>
          </div>
          {esUserHits && esUserHits.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:'0.25rem' }}>
              {esUserHits.map((s) => (
                <button key={s.uid} className="btn-secondary" onClick={() => { setEsUid(s.uid); setEsUidName(s.displayName || s.uid); }}
                  style={{ fontSize:'0.76rem', border: esUid === s.uid ? '1px solid var(--primary)' : undefined }}>
                  {s.displayName || s.uid} <span style={{ color:'var(--muted)' }}>· {String(s.uid).slice(0, 6)}…</span>
                </button>
              ))}
            </div>
          )}
          <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap', alignItems:'center' }}>
            <input value={esUid} onChange={(e) => { setEsUid(e.target.value); setEsUidName(''); }} placeholder="uid do usuário" style={{ width:200 }} />
            <span className="muted" style={{ fontSize:'0.78rem' }}>Formação:</span>
            <select value={esFormation} onChange={(e) => setEsFormation(e.target.value)}>
              {Object.keys(FUT_FORMATIONS).map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          {esUid && (
            <div style={{ background:'var(--bg)', borderRadius:6, padding:'0.4rem 0.5rem', display:'flex', gap:'0.4rem', flexWrap:'wrap', alignItems:'center' }}>
              <span className="muted" style={{ fontSize:'0.74rem' }}>📋 Sem montar de novo: copiar o <strong>time atual</strong> deste usuário como snapshot da rodada</span>
              <input value={esCopyRound} onChange={(e) => setEsCopyRound(e.target.value)} placeholder="ex.: 1" style={{ width:70 }} />
              <button onClick={esCopyToRound} disabled={esBusy}>📋 Copiar p/ rodada</button>
            </div>
          )}
          {!esLoaded ? <p className="muted" style={{ fontSize:'0.78rem' }}>Carregando elenco…</p> : (
            <div style={{ display:'flex', flexDirection:'column', gap:'0.25rem' }}>
              {esSlots.map((slot, i) => {
                const opts = esPlayers.filter((p) => futCompat(slot).includes(p.position)).sort((a, b) => a.name.localeCompare(b.name));
                return (
                  <div key={i} style={{ display:'flex', gap:'0.4rem', alignItems:'center' }}>
                    <span style={{ fontSize:'0.7rem', fontWeight:800, minWidth:42, color:'var(--muted)' }}>{slot}</span>
                    <select value={esSel[i] || ''} onChange={(e) => setEsSel((s) => { const n = [...s]; n[i] = e.target.value; return n; })} style={{ flex:1 }}>
                      <option value="">— escolher —</option>
                      {opts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
          )}
          {esLoaded && (
            <>
              <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap', alignItems:'center' }}>
                <span className="muted" style={{ fontSize:'0.78rem' }}>Capitão (opcional):</span>
                <select value={esCaptain} onChange={(e) => setEsCaptain(e.target.value)}>
                  <option value="">— sem capitão —</option>
                  {esSel.filter(Boolean).map((pid) => <option key={pid} value={pid}>{esTeamName(pid)}</option>)}
                </select>
                <button className="btn-secondary" onClick={esAutoBench}>🪑 Auto reservas (1º de cada posição)</button>
              </div>
              {Object.keys(esBench).length > 0 && (
                <div style={{ display:'flex', flexWrap:'wrap', gap:'0.3rem' }}>
                  {[...new Set(esSlots)].map((bp) => (
                    <span key={bp} className="muted" style={{ fontSize:'0.72rem', background:'var(--bg)', borderRadius:6, padding:'0.2rem 0.45rem' }}>
                      {bp}: {esBench[bp] ? esTeamName(esBench[bp]) : '—'}
                    </span>
                  ))}
                </div>
              )}
              <button onClick={esSave} disabled={esBusy} style={{ alignSelf:'flex-start' }}>💾 Salvar escalação do usuário</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SettingsSection({ event, onUpdated }) {
  const [form, setForm] = useState({
    name:        event.name,
    shortName:   event.shortName   || '',
    description: event.description || '',
    location:    event.location    || '',
    startDate:   event.startDate   || '',
    endDate:     event.endDate     || '',
    status:      resolveEventStatus(event),
    type:        event.type        || 'amador',
    privateCode: event.privateCode || '',
    logoEmoji:   event.logoEmoji   || '',
    modalidades: event.modalidades || ['futsal'],
    genderMode:  event.genderMode  || false,
  });
  // Formata timestamp em data/hora local legível
  const fmtDT = (ms) => {
    if (!ms) return '';
    return new Date(ms).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit',
    });
  };

  // Calcula o fechamento automático: 1h antes do 1º jogo FUTURO da próxima rodada.
  // Ignora jogos cujos DOIS times estão bloqueados (irrelevantes p/ escalação) —
  // assim bloquear os times de hoje mantém o mercado aberto até o próximo jogo válido.
  const computeCloseAt = (matches, blocked) => {
    const now = Date.now();
    const blk = blocked || new Set();
    const upcoming = matches
      .filter((m) => m.status !== 'finished' && m.date && m.date > now)
      .filter((m) => !(blk.has(m.homeTeamId) && blk.has(m.awayTeamId)))
      .sort((a, b) => a.date - b.date);
    if (!upcoming.length) return null;
    const getRound = (m) => m.phase || m.rodada || '';
    const firstRound = getRound(upcoming[0]);
    const roundMatches = upcoming.filter((m) => getRound(m) === firstRound);
    const firstGame = Math.min(...roundMatches.map((m) => m.date));
    return firstGame - 60 * 60 * 1000; // 1h antes
  };

  const [marketLoading, setMarketLoading] = useState(false);
  const marketOpen       = isMarketOpen(event.market);
  const marketConfigOpen = event.market?.isOpen === true;

  // Fechamento automático vencido (closeAt passou mas isOpen ainda true):
  // finaliza igual ao fechamento manual — captura o snapshot da rodada e marca
  // fechado. Como user_teams está travado no servidor desde closeAt, o snapshot
  // sai idêntico ao do instante do fechamento.
  useEffect(() => {
    (async () => {
      try {
        const r = await finalizeExpiredMarket(event.id);
        if (r) {
          setMsg({ type: 'success', text: r.round
            ? `🔒 Fechamento automático concluído · escalações da rodada "${r.round}" salvas.`
            : '🔒 Fechamento automático concluído.' });
          onUpdated?.();
        }
      } catch { /* silencioso — o botão manual continua disponível */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id]);

  const [currentPhase, setCurrentPhase] = useState(event.currentPhase || '');
  const [msg, setMsg] = useState(null);
  const [featuring, setFeaturing] = useState(false);

  const makeFeatured = async () => {
    setFeaturing(true);
    try {
      await setFeaturedEvent(event.id);
      setMsg({ type: 'success', text: 'Evento definido como principal (home do app).' });
      onUpdated?.();
    } catch (err) {
      setMsg({ type: 'error', text: 'Erro: ' + err.message });
    } finally { setFeaturing(false); }
  };

  const toggleSport = (key) => {
    const next = form.modalidades.includes(key)
      ? form.modalidades.filter((s) => s !== key)
      : [...form.modalidades, key];
    setForm({ ...form, modalidades: next });
  };

  const save = async () => {
    if (!form.name.trim()) { setMsg({ type:'error', text:'Informe o nome.' }); return; }
    if (!form.modalidades.length) { setMsg({ type:'error', text:'Selecione ao menos uma modalidade.' }); return; }
    try {
      await updateEvent(event.id, form);
      setMsg({ type:'success', text:'Evento atualizado!' });
      onUpdated?.();
    } catch (err) { setMsg({ type:'error', text: err.message }); }
  };

  const openMarket = async () => {
    setMarketLoading(true);
    try {
      const matches = await getMatchesByEvent(event.id);
      // CONGELA a rodada que acabou antes de reabrir: como o mercado estava
      // fechado, o time atual ainda é o da rodada encerrada. Isso garante que a
      // pontuação da rodada use o snapshot (e não o time ao vivo, que muda agora).
      const ended = detectEndedRound(matches);
      if (ended) { try { await captureRoundLineups(event.id, ended); } catch { /* não bloqueia a abertura */ } }
      const teams = await getTeamsByEvent(event.id);
      const blocked = new Set(teams.filter((t) => t.noLineup).map((t) => t.id));
      const closeAt = computeCloseAt(matches, blocked);
      await setMarketConfig(event.id, { isOpen: true, openedAt: Date.now(), closeAt });
      const msg = closeAt
        ? `✅ Mercado aberto! Fechamento automático: ${fmtDT(closeAt)}.`
        : '✅ Mercado aberto! Nenhuma partida futura encontrada para fechar automaticamente.';
      setMsg({ type: 'success', text: msg });
      onUpdated?.();
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setMarketLoading(false); }
  };

  // Recalcula só o fechamento (closeAt) com os times bloqueados — SEM reabrir
  // (reabrir re-capturaria snapshot). Use após bloquear times de hoje.
  const refreshCloseAt = async () => {
    setMarketLoading(true);
    try {
      const [matches, teams] = await Promise.all([getMatchesByEvent(event.id), getTeamsByEvent(event.id)]);
      const blocked = new Set(teams.filter((t) => t.noLineup).map((t) => t.id));
      const closeAt = computeCloseAt(matches, blocked);
      await setMarketConfig(event.id, { ...(event.market || {}), closeAt });
      setMsg({ type: 'success', text: closeAt ? `⏰ Fechamento atualizado: ${fmtDT(closeAt)}.` : '⏰ Sem próximo jogo válido — sem fechamento automático.' });
      onUpdated?.();
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setMarketLoading(false); }
  };

  // Rótulo de rodada: rodada (senão phase) — MESMA convenção do perfil (matchesByRound).
  const roundKeyOf = (m) => (m.rodada != null ? String(m.rodada) : (m.phase || ''));
  // Rodada que está fechando = a dos próximos jogos (não finalizados).
  const detectRound = (matches) => {
    const upcoming = matches.filter((m) => m.status !== 'finished' && m.date).sort((a, b) => a.date - b.date);
    const base = upcoming.length ? upcoming : [...matches].filter((m) => m.date).sort((a, b) => b.date - a.date);
    return base.length ? roundKeyOf(base[0]) : null;
  };
  // Rodada que ACABOU = a do jogo finalizado mais recente. Usada ao reabrir o
  // mercado para CONGELAR a escalação dessa rodada (snapshot p/ pontuação).
  const detectEndedRound = (matches) => {
    const fin = matches.filter((m) => m.status === 'finished' && m.date).sort((a, b) => b.date - a.date);
    return fin.length ? roundKeyOf(fin[0]) : null;
  };

  // Salva o snapshot das escalações da rodada (para auditoria no perfil).
  const captureLineups = async () => {
    setMarketLoading(true);
    try {
      const matches = await getMatchesByEvent(event.id);
      // Prioriza a rodada que ACABOU (jogo finalizado mais recente) — é a que
      // precisa ser congelada p/ pontuar. Sem jogos finalizados, usa a próxima.
      const round   = detectEndedRound(matches) || detectRound(matches);
      if (!round) { setMsg({ type: 'error', text: 'Nenhuma rodada detectada para capturar.' }); return; }
      const n = await captureRoundLineups(event.id, round);
      setMsg({ type: 'success', text: `📸 Escalações da rodada "${round}" congeladas (${n}). Rode "🔄 Recalcular tudo".` });
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setMarketLoading(false); }
  };

  const closeMarket = async () => {
    setMarketLoading(true);
    try {
      // Snapshot da rodada ANTES de fechar (escalações ainda são as da rodada)
      const matches = await getMatchesByEvent(event.id);
      const round   = detectRound(matches);
      if (round) { try { await captureRoundLineups(event.id, round); } catch { /* não bloqueia o fechamento */ } }
      await setMarketConfig(event.id, { isOpen: false, closeAt: null });
      setMsg({ type: 'success', text: round ? `🔒 Mercado fechado · escalações da rodada "${round}" salvas.` : '🔒 Mercado fechado.' });
      onUpdated?.();
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setMarketLoading(false); }
  };

  const savePhase = async () => {
    try {
      await setEventCurrentPhase(event.id, currentPhase);
      setMsg({ type:'success', text: currentPhase ? `Fase atual: ${PHASE_LABELS[currentPhase]}` : 'Fase removida — limite padrão por esporte.' });
      onUpdated?.();
    } catch (err) { setMsg({ type:'error', text: err.message }); }
  };

  // Reabre temporariamente os PALPITES ANTECIPADOS (campeão/artilheiro) p/ quem
  // esqueceu, mesmo após a trava de 1h. Grava eventPredReopenUntil; o Matches lê fresco.
  const [reopenLoading, setReopenLoading] = useState(false);
  const [reopenPhase, setReopenPhase]     = useState('r32'); // 16 avos por padrão
  const reopenUntil   = event.eventPredReopenUntil || 0;
  const reopenActive  = reopenUntil > Date.now();
  const reopenEvPred = async (hours) => {
    setReopenLoading(true);
    try {
      await updateEvent(event.id, { eventPredReopenUntil: Date.now() + hours * 60 * 60 * 1000 });
      setMsg({ type:'success', text: `🔓 Palpites antecipados reabertos por ${hours}h.` });
      onUpdated?.();
    } catch (err) { setMsg({ type:'error', text: err.message }); }
    finally { setReopenLoading(false); }
  };
  // Reabre até 1h ANTES do 1º jogo de uma fase (ex.: 16avos). Calcula da agenda.
  const reopenUntilPhase = async () => {
    setReopenLoading(true);
    try {
      const ms = await getMatchesByEvent(event.id);
      const dates = ms.filter((m) => m.phase === reopenPhase).map((m) => m.date).filter(Boolean);
      if (!dates.length) {
        setMsg({ type:'error', text: `Sem partidas da fase "${PHASE_LABELS[reopenPhase]}" com data definida.` });
        return;
      }
      const target = Math.min(...dates) - 60 * 60 * 1000; // 1h antes do 1º jogo da fase
      if (target <= Date.now()) {
        setMsg({ type:'error', text: 'Essa janela já passou (o 1º jogo da fase é em menos de 1h ou já começou).' });
        return;
      }
      await updateEvent(event.id, { eventPredReopenUntil: target });
      setMsg({ type:'success', text: `🔓 Reaberto até ${fmtDT(target)} — 1h antes de ${PHASE_LABELS[reopenPhase]}.` });
      onUpdated?.();
    } catch (err) { setMsg({ type:'error', text: err.message }); }
    finally { setReopenLoading(false); }
  };
  const closeEvPredReopen = async () => {
    setReopenLoading(true);
    try {
      await updateEvent(event.id, { eventPredReopenUntil: 0 });
      setMsg({ type:'success', text: '🔒 Reabertura encerrada.' });
      onUpdated?.();
    } catch (err) { setMsg({ type:'error', text: err.message }); }
    finally { setReopenLoading(false); }
  };

  // OLIMFEF: resultado REAL do campeonato (campeão/3º/4º por modalidade + geral)
  const [champTeams, setChampTeams]     = useState([]);
  const [champResults, setChampResults] = useState(event.champResults || {});
  const [savingChamp, setSavingChamp]   = useState(false);
  useEffect(() => { if (event.genderMode) getTeamsByEvent(event.id).then(setChampTeams).catch(() => {}); }, [event.id, event.genderMode]);
  const setChamp = (mod, pos, val) => setChampResults((r) => ({ ...r, [mod]: { ...(r[mod] || {}), [pos]: val } }));
  const saveChampResults = async () => {
    setSavingChamp(true);
    try {
      await updateEvent(event.id, { champResults });
      setMsg({ type:'success', text:'🏆 Resultados de campeonato salvos. Rode "🔄 Recalcular tudo" para pontuar.' });
      onUpdated?.();
    } catch (err) { setMsg({ type:'error', text: err.message }); }
    finally { setSavingChamp(false); }
  };

  // Copa padrão (sem genderMode): resultado REAL flat — campeão/vice/3º/4º/artilheiro.
  // Schema distinto do OLIMFEF acima (não é por modalidade). Pontua event_predictions
  // salvos em Matches.jsx (campos champion/runnerUp/thirdPlace/fourthPlace/topScorer).
  const [evTeams, setEvTeams]                 = useState([]);
  const [evPlayers, setEvPlayers]             = useState([]);
  const [evChampResult, setEvChampResult]     = useState(event.champResult || {});
  const [savingEvChamp, setSavingEvChamp]     = useState(false);
  useEffect(() => {
    if (event.genderMode) return;
    getTeamsByEvent(event.id).then(setEvTeams).catch(() => {});
    getPlayersBySport('futebol', event.id).then(setEvPlayers).catch(() => {});
  }, [event.id, event.genderMode]);
  const setEvChamp = (key, val) => setEvChampResult((r) => ({ ...r, [key]: val }));
  const saveEvChampResult = async () => {
    setSavingEvChamp(true);
    try {
      await updateEvent(event.id, { champResult: evChampResult });
      setMsg({ type:'success', text:'🏆 Resultado do campeonato salvo. Rode "🔄 Recalcular tudo" para pontuar os palpites antecipados.' });
      onUpdated?.();
    } catch (err) { setMsg({ type:'error', text: err.message }); }
    finally { setSavingEvChamp(false); }
  };

  // OLIMFEF: pontos por jogador no Vôlei de Praia (sem partidas) → event.beachStats
  const [beachPlayers, setBeachPlayers] = useState([]);
  const [beachStats, setBeachStats]     = useState(event.beachStats || {});
  const [beachSearch, setBeachSearch]   = useState('');
  const [savingBeach, setSavingBeach]   = useState(false);
  useEffect(() => {
    if (event.genderMode) getPlayers()
      .then((all) => setBeachPlayers(all.filter((p) => (p.eventId || 'default') === event.id)))
      .catch(() => {});
  }, [event.id, event.genderMode]);
  const setBeachPt = (pid, val) => setBeachStats((s) => {
    const n = { ...s };
    if (val === '' || Number(val) === 0) delete n[pid]; else n[pid] = Number(val);
    return n;
  });
  const saveBeachStats = async () => {
    setSavingBeach(true);
    try {
      await updateEvent(event.id, { beachStats });
      setMsg({ type:'success', text:'🏖️ Pontos do Vôlei de Praia salvos. Rode "🔄 Recalcular tudo" para pontuar.' });
      onUpdated?.();
    } catch (err) { setMsg({ type:'error', text: err.message }); }
    finally { setSavingBeach(false); }
  };

  return (
    <>
      <h2 style={{ marginBottom:'1rem' }}>⚙️ Configurações</h2>
      <Msg msg={msg} />
      <div className="card admin-form-card">
        {/* Emoji do evento */}
        <div className="form-group">
          <label>Ícone / Bandeira do evento</label>
          <EmojiPicker
            value={form.logoEmoji}
            size={56}
            label="ícone do evento"
            onChange={(emoji) => setForm({ ...form, logoEmoji: emoji })}
          />
        </div>
        <div className="form-group"><label>Nome</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="form-group"><label>Nome curto <span className="muted" style={{ fontSize:'0.75rem', fontWeight:400 }}>(menu/dashboard — ex: "Copa do Mundo")</span></label>
          <input value={form.shortName} maxLength={24} placeholder="Opcional"
            onChange={(e) => setForm({ ...form, shortName: e.target.value })} /></div>
        <div className="form-group"><label>Descrição</label>
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div className="form-group"><label>📍 Local</label>
          <input value={form.location} placeholder="Ex: Ginásio Principal, UFXYZ"
            onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
        <div className="admin-match-meta">
          <div className="form-group" style={{ flex:1 }}><label>📅 Início</label>
            <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
          <div className="form-group" style={{ flex:1 }}><label>📅 Fim</label>
            <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
        </div>
        <div className="form-group"><label>Tipo</label>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="amador">⚽ Amador</option>
            <option value="profissional">🏆 Profissional</option>
            <option value="privado">🔒 Privado (acesso por código)</option>
          </select></div>
        {form.type === 'privado' && (
          <div className="form-group"><label>Código de acesso</label>
            <div style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
              <input value={form.privateCode} onChange={(e) => setForm({ ...form, privateCode: e.target.value.toUpperCase() })}
                placeholder="Ex: UNIV25" style={{ textTransform:'uppercase', flex:1 }} />
              <button type="button" className="btn-secondary" style={{ whiteSpace:'nowrap' }}
                onClick={() => setForm({ ...form, privateCode: Math.random().toString(36).slice(2,8).toUpperCase() })}>
                Gerar novo
              </button>
            </div>
            {form.privateCode && (
              <div className="muted" style={{ fontSize:'0.78rem', marginTop:'0.3rem' }}>
                Compartilhe este código com os participantes.
              </div>
            )}
          </div>
        )}
        <div className="form-group"><label>Status</label>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {STATUS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select></div>
        <div className="form-group"><label>Modalidades</label>
          <div className="sport-checkboxes">
            {ALL_SPORTS.map((s) => (
              <label key={s.key} className="sport-checkbox-label">
                <input type="checkbox" checked={form.modalidades.includes(s.key)}
                  onChange={() => toggleSport(s.key)} style={{ width:'auto' }} />
                {s.label}
              </label>
            ))}
          </div></div>

        {/* Modo país/gênero (OLIMFEF): times = países, gênero no jogador,
            modalidade+gênero na partida. Não afeta eventos sem a flag. */}
        <div className="form-group">
          <label className="sport-checkbox-label" style={{ cursor:'pointer' }}>
            <input type="checkbox" checked={!!form.genderMode}
              onChange={() => setForm({ ...form, genderMode: !form.genderMode })}
              style={{ width:'auto' }} />
            🌍 Modo país/gênero (OLIMFEF) — times são países, gênero no jogador, modalidade na partida
          </label>
        </div>

        {/* Mercado */}
        <div className="form-group" style={{ marginTop:'1rem' }}>
          <label>⏰ Mercado de escalação</label>
          <div style={{
            marginTop:'0.5rem', padding:'0.75rem', borderRadius:8,
            background: marketOpen ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${marketOpen ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.3)'}`,
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.4rem' }}>
              <span style={{ fontSize:'1rem' }}>
                {marketOpen ? '🟢' : marketConfigOpen ? '🟡' : '🔴'}
              </span>
              <strong style={{ color: marketOpen ? 'var(--primary)' : marketConfigOpen ? 'var(--accent)' : '#ef4444' }}>
                {marketOpen ? 'Mercado aberto' : marketConfigOpen ? 'Auto-fechado' : 'Mercado fechado'}
              </strong>
            </div>
            {marketOpen && event.market?.closeAt && (
              <p className="muted" style={{ fontSize:'0.8rem', marginBottom:'0.5rem' }}>
                Fechamento automático: <strong>{fmtDT(event.market.closeAt)}</strong>
                <br/><span style={{ fontSize:'0.72rem' }}>1h antes do 1º jogo da próxima rodada.</span>
              </p>
            )}
            {marketConfigOpen && !marketOpen && event.market?.closeAt && (
              <p className="muted" style={{ fontSize:'0.8rem', marginBottom:'0.5rem' }}>
                Fechou automaticamente em <strong>{fmtDT(event.market.closeAt)}</strong>.
              </p>
            )}
            <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap' }}>
              {/* Botão Abrir: quando fechado ou auto-fechado */}
              {!marketConfigOpen && (
                <button type="button" onClick={openMarket} disabled={marketLoading}
                  style={{ fontSize:'0.82rem' }}>
                  {marketLoading ? '⏳ Abrindo…' : '🟢 Abrir mercado'}
                </button>
              )}
              {/* Botão Fechar: sempre que isOpen=true (mesmo auto-fechado) */}
              {marketConfigOpen && (
                <button type="button" className="btn-danger" onClick={closeMarket} disabled={marketLoading}
                  style={{ fontSize:'0.82rem' }}>
                  {marketLoading ? '⏳ Fechando…' : '🔴 Fechar mercado'}
                </button>
              )}
              {/* Re-abrir quando auto-fechado */}
              {marketConfigOpen && !marketOpen && (
                <button type="button" onClick={openMarket} disabled={marketLoading}
                  style={{ fontSize:'0.82rem' }}>
                  {marketLoading ? '⏳ Abrindo…' : '🟢 Abrir nova janela'}
                </button>
              )}
              {/* Recalcula o fechamento ignorando times bloqueados (sem reabrir) */}
              {marketConfigOpen && (
                <button type="button" className="btn-secondary" onClick={refreshCloseAt} disabled={marketLoading}
                  title="Recalcula o horário de fechamento ignorando jogos de times bloqueados (não reabre nem re-captura snapshot)"
                  style={{ fontSize:'0.82rem' }}>
                  {marketLoading ? '⏳…' : '⏰ Atualizar fechamento'}
                </button>
              )}
              {/* Captura manual (útil quando o mercado fechou sozinho por TTL) */}
              <button type="button" className="btn-secondary" onClick={captureLineups} disabled={marketLoading}
                title="Salva um snapshot das escalações da rodada atual (visível no perfil dos usuários)"
                style={{ fontSize:'0.82rem' }}>
                📸 Salvar escalações
              </button>
            </div>
          </div>
          <p className="muted" style={{ fontSize:'0.75rem', marginTop:'0.4rem' }}>
            O fechamento automático é calculado 1h antes do 1º jogo da próxima rodada ao abrir o mercado.
            Ao fechar o mercado, as escalações da rodada são salvas automaticamente para auditoria.
          </p>
        </div>

        {/* Palpites antecipados — reabertura temporária (p/ quem esqueceu) */}
        <div className="form-group" style={{ marginTop:'0.75rem' }}>
          <label>🏆 Palpites antecipados (campeonato)</label>
          <p className="muted" style={{ fontSize:'0.78rem', margin:'0.2rem 0 0.6rem' }}>
            Reabre temporariamente os palpites de campeão/artilheiro para quem esqueceu — mesmo após a trava de 1h.
          </p>
          {reopenActive ? (
            <p className="success" style={{ fontSize:'0.82rem', marginBottom:'0.6rem' }}>
              ✅ Reaberto até <strong>{fmtDT(reopenUntil)}</strong>.
            </p>
          ) : (
            <p className="muted" style={{ fontSize:'0.8rem', marginBottom:'0.6rem' }}>Fechados (trava normal de 1h).</p>
          )}
          {/* Reabrir até 1h antes de uma FASE (ex.: 16avos) */}
          <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap', alignItems:'center', marginBottom:'0.5rem' }}>
            <span style={{ fontSize:'0.82rem' }}>Reabrir até 1h antes de:</span>
            <select value={reopenPhase} onChange={(e) => setReopenPhase(e.target.value)} disabled={reopenLoading} style={{ fontSize:'0.82rem' }}>
              {Object.entries(PHASE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button type="button" onClick={reopenUntilPhase} disabled={reopenLoading} style={{ fontSize:'0.82rem' }}>
              {reopenLoading ? '⏳…' : '🔓 Reabrir'}
            </button>
          </div>
          <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap' }}>
            <button type="button" className="btn-secondary" onClick={() => reopenEvPred(3)} disabled={reopenLoading} style={{ fontSize:'0.78rem' }}>
              {reopenLoading ? '⏳…' : '+3h'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => reopenEvPred(24)} disabled={reopenLoading} style={{ fontSize:'0.78rem' }}>
              {reopenLoading ? '⏳…' : '+24h'}
            </button>
            {reopenActive && (
              <button type="button" className="btn-danger" onClick={closeEvPredReopen} disabled={reopenLoading} style={{ fontSize:'0.78rem' }}>
                🔒 Fechar agora
              </button>
            )}
          </div>
          <p className="muted" style={{ fontSize:'0.72rem', marginTop:'0.4rem' }}>
            ⚠️ Reabrir até os 16avos deixa quem esqueceu palpitar — mas já tendo visto a fase de grupos.
          </p>
        </div>

        {/* OLIMFEF: resultado real do campeonato (pontua os palpites de campeão/3º/4º) */}
        {event.genderMode && (
          <div className="form-group" style={{ marginTop:'0.75rem' }}>
            <label>🏆 Resultado do campeonato (campeão/3º/4º)</label>
            <p className="muted" style={{ fontSize:'0.78rem', margin:'0.2rem 0 0.6rem' }}>
              Lance o pódio REAL de cada modalidade e o <strong>geral</strong> (dobra os pontos). Depois rode "🔄 Recalcular tudo".
            </p>
            {[...new Set([...(event.modalidades || []), 'beachvolley']), 'overall'].map((mod) => (
              <div key={mod} style={{ marginBottom:'0.6rem' }}>
                <div style={{ fontWeight:600, fontSize:'0.82rem', marginBottom:'0.25rem' }}>
                  {mod === 'overall' ? '🏆 Geral (×2)' : (SPORT_LABELS[mod] || mod)}
                </div>
                <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap' }}>
                  {[['champion','🥇'],['second','🥈'],['third','🥉'],['fourth','4º']].map(([pos, ic]) => (
                    <select key={pos} value={champResults[mod]?.[pos] || ''} onChange={(e) => setChamp(mod, pos, e.target.value)} style={{ fontSize:'0.82rem' }}>
                      <option value="">{ic} —</option>
                      {[...champTeams].sort((a,b) => a.name.localeCompare(b.name,'pt')).map((t) => (
                        <option key={t.id} value={t.id}>{ic} {t.name}</option>
                      ))}
                    </select>
                  ))}
                </div>
              </div>
            ))}
            <button type="button" onClick={saveChampResults} disabled={savingChamp} style={{ fontSize:'0.82rem' }}>
              {savingChamp ? '⏳…' : '💾 Salvar resultado do campeonato'}
            </button>
          </div>
        )}

        {/* Copa padrão: resultado real do campeonato (pontua os palpites antecipados) */}
        {!event.genderMode && (
          <div className="form-group" style={{ marginTop:'0.75rem' }}>
            <label>🏆 Resultado do campeonato (campeão/vice/3º/4º/artilheiro)</label>
            <p className="muted" style={{ fontSize:'0.78rem', margin:'0.2rem 0 0.6rem' }}>
              Lance o resultado REAL para pontuar os palpites antecipados de cada usuário. Depois rode "🔄 Recalcular tudo".
            </p>
            <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap', marginBottom:'0.5rem' }}>
              {[['champion','🥇 Campeão'],['runnerUp','🥈 Vice'],['thirdPlace','🥉 3º lugar'],['fourthPlace','4º lugar']].map(([key, label]) => (
                <select key={key} value={evChampResult[key] || ''} onChange={(e) => setEvChamp(key, e.target.value)} style={{ fontSize:'0.82rem' }}>
                  <option value="">{label} —</option>
                  {[...evTeams].sort((a,b) => a.name.localeCompare(b.name,'pt')).map((t) => (
                    <option key={t.id} value={t.id}>{label} {t.name}</option>
                  ))}
                </select>
              ))}
              <select value={evChampResult.topScorer || ''} onChange={(e) => setEvChamp('topScorer', e.target.value)} style={{ fontSize:'0.82rem' }}>
                <option value="">⚽ Artilheiro —</option>
                {[...evPlayers].sort((a,b) => a.name.localeCompare(b.name,'pt')).map((p) => (
                  <option key={p.id} value={p.id}>⚽ {p.name}</option>
                ))}
              </select>
            </div>
            <button type="button" onClick={saveEvChampResult} disabled={savingEvChamp} style={{ fontSize:'0.82rem' }}>
              {savingEvChamp ? '⏳…' : '💾 Salvar resultado do campeonato'}
            </button>
          </div>
        )}

        {/* OLIMFEF: pontos por jogador no Vôlei de Praia (fantasy sem partidas) */}
        {event.genderMode && (event.modalidades || []).includes('beachvolley') && (
          <div className="form-group" style={{ marginTop:'0.75rem' }}>
            <label>🏖️ Vôlei de Praia — pontos por jogador</label>
            <p className="muted" style={{ fontSize:'0.78rem', margin:'0.2rem 0 0.5rem' }}>
              Sem partidas: lance os pontos de cada jogador. O fantasy de praia (2M+2W) soma esses pontos.
              Depois rode "🔄 Recalcular tudo".
            </p>
            <input placeholder="Buscar jogador…" value={beachSearch} onChange={(e) => setBeachSearch(e.target.value)}
              style={{ marginBottom:'0.5rem' }} />
            <div style={{ maxHeight:280, overflowY:'auto', border:'1px solid var(--border)', borderRadius:8, padding:'0.4rem' }}>
              {beachPlayers
                .filter((p) => p.name.toLowerCase().includes(beachSearch.trim().toLowerCase()))
                .slice(0, 80)
                .map((p) => (
                  <div key={p.id} style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.2rem' }}>
                    <span style={{ flex:1, fontSize:'0.82rem' }}>{p.gender === 'masculino' ? '♂' : '♀'} {p.name}</span>
                    <input type="number" min="0" value={beachStats[p.id] ?? ''} placeholder="0"
                      onChange={(e) => setBeachPt(p.id, e.target.value)} style={{ width:70 }} />
                  </div>
                ))}
              {beachPlayers.length === 0 && <p className="muted" style={{ fontSize:'0.8rem' }}>Importe o elenco primeiro.</p>}
            </div>
            <button type="button" onClick={saveBeachStats} disabled={savingBeach} style={{ fontSize:'0.82rem', marginTop:'0.5rem' }}>
              {savingBeach ? '⏳…' : '💾 Salvar pontos do Vôlei de Praia'}
            </button>
          </div>
        )}

        {/* Fase atual (Copa do Mundo / knockouts) */}
        <div className="form-group" style={{ marginTop:'1rem' }}>
          <label>🏆 Fase atual do evento <span className="muted" style={{ fontSize:'0.75rem', fontWeight:400 }}>(define limite de jogadores por seleção)</span></label>
          <div style={{ display:'flex', gap:'0.5rem', alignItems:'center', marginTop:'0.35rem' }}>
            <select value={currentPhase} onChange={(e) => setCurrentPhase(e.target.value)} style={{ flex:1 }}>
              <option value="">— Padrão por modalidade</option>
              {Object.entries(PHASE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button type="button" onClick={savePhase} style={{ whiteSpace:'nowrap' }}>Definir fase</button>
          </div>
          {currentPhase && (
            <p className="muted" style={{ fontSize:'0.78rem', marginTop:'0.3rem' }}>
              {currentPhase === 'group' || currentPhase === 'r32' ? 'Máx. 1 jogador por seleção' :
               currentPhase === 'r16' ? 'Máx. 2 jogadores por seleção' :
               currentPhase === 'qf'  ? 'Máx. 3 jogadores por seleção' :
               currentPhase === 'sf'  ? 'Máx. 6 jogadores por seleção' :
               currentPhase === 'third' || currentPhase === 'final' ? 'Sem limite por seleção' : ''}
            </p>
          )}
        </div>

        {/* Evento principal (home do app) */}
        <div className="form-group" style={{ marginTop: '1rem' }}>
          <label>⭐ Evento principal <span className="muted" style={{ fontSize: '0.75rem', fontWeight: 400 }}>(define a liga pública / home do app)</span></label>
          {event.featured ? (
            <div style={{ marginTop: '0.35rem', color: 'var(--primary)', fontWeight: 700, fontSize: '0.9rem' }}>
              ✓ Este é o evento principal
            </div>
          ) : (
            <div style={{ marginTop: '0.35rem' }}>
              <button type="button" className="btn-secondary" onClick={makeFeatured} disabled={featuring}>
                {featuring ? 'Definindo…' : 'Tornar evento principal'}
              </button>
            </div>
          )}
        </div>

        <div className="mt-2"><button onClick={save}>{T.common.save}</button></div>
      </div>

      <JsonRestoreTool event={event} />
      <LateLineupTool event={event} />
    </>
  );
}
