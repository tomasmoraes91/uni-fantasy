import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEvent } from '../context/EventContext';
import { useNotificationContext } from '../context/NotificationContext';
import SportTabs, { SPORTS } from '../components/SportTabs';
import {
  getMatchesByEvent, getUserPredictions, savePrediction, getPlayers,
  getEventPrediction, saveEventPrediction, getTeamsByEvent, getPlayersBySport,
  getEventById, countryFlag,
} from '../services/firestore';
import { predictionPoints, isPredictionLocked, calcFantasyPoints, EVENT_PREDICTION_POINTS, CHAMP_POINTS } from '../utils/scoring';
import { hasGamePrediction } from '../utils/sportRules';
import { STAT_FIELDS, STAT_FIELDS_PRO } from '../utils/sportRules';
import { T, SPORT_LABELS, POSITION_LABELS, fmtPts } from '../utils/labels';
import ShieldEmoji from '../components/ShieldEmoji';
import ShieldSelect from '../components/ShieldSelect';

export default function Matches() {
  const { user }          = useAuth();
  const { eventId, currentEvent } = useEvent();
  const genderMode = !!currentEvent?.genderMode; // OLIMFEF: campeonato por modalidade + geral
  const { refresh: refreshNotifs } = useNotificationContext();
  const location = useLocation();
  const [sport, setSport]           = useState(SPORTS[0]);
  const [matches, setMatches]       = useState([]);
  const [predictions, setPredictions] = useState({});
  const [players, setPlayers]       = useState({});
  const [loading, setLoading]       = useState(true);
  const [msg, setMsg]               = useState({ type: '', text: '' });
  const [savedIds, setSavedIds]     = useState(new Set()); // para feedback visual de auto-save
  const [view, setView]             = useState(location.state?.view || 'palpites'); // 'palpites' | 'resultados' | 'calendario'
  const [expanded, setExpanded]     = useState({});
  const [predFilter, setPredFilter] = useState('all'); // 'all' | '<rodada>' | 'blank' | 'made'

  // Palpites antecipados de campeonato
  const [evPred, setEvPred]         = useState({});
  const [evTeams, setEvTeams]       = useState([]);
  const [evPlayers, setEvPlayers]   = useState([]);
  const [evPredMsg, setEvPredMsg]   = useState({ type: '', text: '' });
  const [savingEvPred, setSavingEvPred] = useState(false);
  const [evReopenUntil, setEvReopenUntil] = useState(null); // reabertura temporária do admin (lido fresco)

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [all, preds, pls] = await Promise.all([
        getMatchesByEvent(eventId),
        getUserPredictions(user.uid),
        getPlayers(),
      ]);
      setMatches(all);
      const predMap = {};
      preds.forEach((p) => { predMap[p.matchId] = { h: p.homeScore, a: p.awayScore }; });
      setPredictions(predMap);
      const plMap = {};
      pls.forEach((p) => { plMap[p.id] = p; });
      setPlayers(plMap);
      setLoading(false);
    })();
  }, [user, eventId]);

  // Carrega times e palpite de campeonato ao montar
  useEffect(() => {
    if (!eventId || !user) return;
    (async () => {
      const [teams, pls, saved, freshEv] = await Promise.all([
        getTeamsByEvent(eventId),
        getPlayersBySport('futebol', eventId).catch(() => []),
        getEventPrediction(user.uid, eventId),
        getEventById(eventId).catch(() => null), // fresco: pega reabertura do admin na hora
      ]);
      setEvTeams(teams);
      setEvPlayers(pls);
      if (saved) setEvPred(saved);
      setEvReopenUntil(freshEv?.eventPredReopenUntil ?? null);
    })();
  }, [eventId, user]);

  // Reset sport se a modalidade atual não estiver no evento
  useEffect(() => {
    if (currentEvent?.modalidades?.length) {
      setSport((prev) => currentEvent.modalidades.includes(prev) ? prev : currentEvent.modalidades[0]);
    }
  }, [currentEvent]);

  const evTeamMap = useMemo(() => Object.fromEntries(evTeams.map((t) => [t.id, t])), [evTeams]);

  const bySport  = useMemo(() => matches.filter((m) => m.sport === sport), [matches, sport]);
  // Vôlei de Praia não tem palpite por jogo (só campeonato) → fora da lista de palpites
  const upcoming = useMemo(() => bySport.filter((m) => m.status !== 'finished' && hasGamePrediction(m.sport)), [bySport]);
  const finished = useMemo(() => bySport.filter((m) => m.status === 'finished'), [bySport]);

  // Rodadas disponíveis para o filtro de palpites
  const availableRounds = useMemo(() => {
    const set = new Set();
    upcoming.forEach((m) => { if (m.rodada != null) set.add(m.rodada); });
    return [...set].sort((a, b) => a - b);
  }, [upcoming]);

  const hasPred = (m) => {
    const p = predictions[m.id];
    return !!p && p.h !== '' && p.h != null && p.a !== '' && p.a != null;
  };

  // Aplica o filtro selecionado às partidas futuras
  const filteredUpcoming = useMemo(() => upcoming.filter((m) => {
    if (predFilter === 'all')   return true;
    if (predFilter === 'blank') return !hasPred(m);
    if (predFilter === 'made')  return hasPred(m);
    return String(m.rodada) === predFilter; // filtro por rodada
  }), [upcoming, predFilter, predictions]);

  // Palpites agrupados: rodada → data → partidas
  const groupedUpcoming = useMemo(() => {
    const sorted = [...filteredUpcoming].sort((a, b) => {
      const ra = a.rodada ?? 9999, rb = b.rodada ?? 9999;
      if (ra !== rb) return ra - rb;
      return (a.date || 0) - (b.date || 0);
    });
    const byRound = {};
    sorted.forEach((m) => {
      const round = m.rodada != null ? `Rodada ${m.rodada}` : 'Sem rodada';
      const dateKey = m.date
        ? new Date(m.date).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long' })
        : 'Data a definir';
      if (!byRound[round]) byRound[round] = {};
      if (!byRound[round][dateKey]) byRound[round][dateKey] = [];
      byRound[round][dateKey].push(m);
    });
    return byRound;
  }, [filteredUpcoming]);

  // Calendário: todos agrupados por data, ordenados
  const calendarGroups = useMemo(() => {
    const sorted = [...bySport].sort((a, b) => (a.date || 0) - (b.date || 0));
    const groups = {};
    sorted.forEach((m) => {
      const dateKey = m.date
        ? new Date(m.date).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long' })
        : 'Sem data';
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(m);
    });
    return groups;
  }, [bySport]);

  const updatePred = (matchId, field, value) =>
    setPredictions((prev) => ({ ...prev, [matchId]: { ...prev[matchId], [field]: value } }));

  const autoSave = async (matchId, match) => {
    if (isPredictionLocked(match)) return;
    const p = predictions[matchId];
    if (p?.h == null || p?.a == null || p.h === '' || p.a === '') return;
    try {
      await savePrediction(user.uid, matchId, p.h, p.a);
      setSavedIds((prev) => new Set([...prev, matchId]));
      setTimeout(() => setSavedIds((prev) => { const s = new Set(prev); s.delete(matchId); return s; }), 2000);
      refreshNotifs();
    } catch { /* silencioso */ }
  };

  const saveChampionship = async () => {
    setSavingEvPred(true); setEvPredMsg({ type: '', text: '' });
    try {
      await saveEventPrediction(user.uid, eventId, evPred);
      setEvPredMsg({ type: 'success', text: 'Palpites de campeonato salvos!' });
    } catch (err) {
      setEvPredMsg({ type: 'error', text: err.message });
    } finally {
      setSavingEvPred(false);
    }
  };

  // Data da primeira partida do evento (independente do sport)
  const firstMatchDate = useMemo(() => {
    const dates = matches.map((m) => m.date).filter(Boolean);
    return dates.length ? Math.min(...dates) : null;
  }, [matches]);

  // Palpites antecipados bloqueados se: há partidas finalizadas OU < 1h para a primeira partida.
  // Admin pode REABRIR temporariamente (eventPredReopenUntil) — destrava enquanto ativo.
  const hasFinishedMatches = useMemo(() => matches.some((m) => m.status === 'finished'), [matches]);
  const evPredDeadline     = firstMatchDate ?? currentEvent?.startDate ?? null;
  const timeBasedLock      = evPredDeadline != null && Date.now() >= evPredDeadline - 60 * 60 * 1000;
  const reopenActive       = evReopenUntil != null && Date.now() < evReopenUntil;
  const isEventPredLocked  = !reopenActive && (hasFinishedMatches || timeBasedLock);
  const msToEvPredLock     = !isEventPredLocked && evPredDeadline != null
    ? evPredDeadline - 60 * 60 * 1000 - Date.now()
    : null;

  const toggle = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <>
      <h1>{T.matches.title}</h1>
      <p className="page-subtitle">Vencedor/empate +5 pts · Diferença correta +2 pts · Placar exato +5 pts bônus</p>

      {/* View tabs */}
      <div className="tabs" style={{ marginBottom: '0.75rem' }}>
        <button className={`tab ${view === 'palpites'    ? 'active' : ''}`} onClick={() => setView('palpites')}>
          🔮 Palpites
        </button>
        <button className={`tab ${view === 'resultados'  ? 'active' : ''}`} onClick={() => setView('resultados')}>
          📜 Resultados
        </button>
        <button className={`tab ${view === 'calendario'  ? 'active' : ''}`} onClick={() => setView('calendario')}>
          📅 Calendário
        </button>
      </div>

      {/* Nos palpites o filtro de modalidade fica ABAIXO dos palpites antecipados */}
      {view !== 'palpites' && (
        <SportTabs active={sport} onChange={setSport} available={currentEvent?.modalidades} />
      )}

      {msg.text && <div className={msg.type} style={{ marginBottom: '0.75rem' }}>{msg.text}</div>}

      {loading ? <p className="muted">{T.common.loading}</p> : (

        /* ── PALPITES ─────────────────────────────────────── */
        view === 'palpites' ? (
          <>
            {evTeams.length > 0 && (
              <div className="card" style={{ marginBottom: '1rem', borderLeft: '3px solid rgba(245,158,11,0.5)' }}>
                <h3 style={{ marginBottom: '0.5rem' }}>🏆 Palpites antecipados</h3>
                <p className="muted" style={{ fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                  Aposte antes da primeira partida. Bloqueado automaticamente 1 hora antes do início.
                </p>
                {reopenActive && (
                  <div style={{ color: 'var(--primary)', background: 'rgba(34,197,94,0.1)', borderRadius: '6px', padding: '0.5rem 0.75rem', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
                    ✅ Reaberto temporariamente pelo organizador — até{' '}
                    {new Date(evReopenUntil).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.
                  </div>
                )}
                {isEventPredLocked ? (
                  <div style={{ color: '#dc2626', background: 'rgba(239,68,68,0.1)', borderRadius: '6px', padding: '0.5rem 0.75rem', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
                    🔒 Palpites antecipados bloqueados —{' '}
                    {hasFinishedMatches ? 'resultados já foram inseridos no evento.' : 'falta menos de 1h para a primeira partida.'}
                  </div>
                ) : msToEvPredLock != null && msToEvPredLock > 0 && msToEvPredLock < 24 * 3_600_000 ? (
                  <div style={{ color: '#d97706', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '6px', padding: '0.4rem 0.75rem', marginBottom: '0.75rem', fontSize: '0.82rem' }}>
                    ⚠️ Fecha em {(() => {
                      const h = Math.floor(msToEvPredLock / 3_600_000);
                      const m = Math.floor((msToEvPredLock % 3_600_000) / 60_000);
                      return h > 0 ? `${h}h ${m}min` : `${m}min`;
                    })()}
                  </div>
                ) : null}
                {genderMode ? (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <p className="muted" style={{ fontSize: '0.78rem', marginBottom: '0.5rem' }}>
                      Palpite o pódio de cada modalidade — e o <strong>campeão GERAL</strong> (pontos dobrados).
                    </p>
                    {/* Vôlei de Praia sempre presente no campeonato (mesmo sem partidas) */}
                    {[...new Set([...(currentEvent?.modalidades || []), 'beachvolley']), 'overall'].map((mod) => (
                      <div key={mod} style={{ marginBottom: '0.7rem' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.3rem' }}>
                          {mod === 'overall' ? '🏆 Campeão GERAL (×2 pontos)' : (SPORT_LABELS[mod] || mod)}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.4rem' }}>
                          {[
                            { pos: 'champion', base: CHAMP_POINTS.champion, label: '🥇 Campeão' },
                            { pos: 'second',   base: CHAMP_POINTS.second,   label: '🥈 Vice-campeão' },
                            { pos: 'third',    base: CHAMP_POINTS.third,    label: '🥉 3º lugar' },
                            { pos: 'fourth',   base: CHAMP_POINTS.fourth,   label: '4º lugar' },
                          ].map(({ pos, base, label }) => (
                            <div key={pos}>
                              <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.15rem' }}>
                                <span>{label}</span>
                                <span className="muted">+{mod === 'overall' ? base * 2 : base}</span>
                              </label>
                              <ShieldSelect
                                value={evPred.champ?.[mod]?.[pos] || ''}
                                disabled={isEventPredLocked}
                                onChange={(val) => setEvPred((p) => ({ ...p, champ: { ...(p.champ || {}), [mod]: { ...((p.champ || {})[mod] || {}), [pos]: val } } }))}
                                options={[
                                  { value: '', label: '— Selecione —', emoji: null },
                                  ...[...evTeams].sort((a, b) => a.name.localeCompare(b.name, 'pt')).map((t) => ({ value: t.id, label: t.name, emoji: t.shieldEmoji || null })),
                                ]}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  {[
                    { key: 'champion',    label: '🥇 Campeão',      pts: EVENT_PREDICTION_POINTS.champion,    type: 'team' },
                    { key: 'runnerUp',    label: '🥈 Vice-campeão', pts: EVENT_PREDICTION_POINTS.runnerUp,    type: 'team' },
                    { key: 'thirdPlace',  label: '🥉 3º lugar',     pts: EVENT_PREDICTION_POINTS.thirdPlace,  type: 'team' },
                    { key: 'fourthPlace', label: '4º lugar',         pts: EVENT_PREDICTION_POINTS.fourthPlace, type: 'team' },
                    { key: 'topScorer',   label: '⚽ Artilheiro',   pts: EVENT_PREDICTION_POINTS.topScorer,   type: 'player' },
                  ].map(({ key, label, pts, type }) => (
                    <div key={key}>
                      <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.2rem' }}>
                        <span>{label}</span>
                        <span className="muted">+{pts}pts</span>
                      </label>
                      <ShieldSelect
                        value={evPred[key] || ''}
                        onChange={(val) => setEvPred((p) => ({ ...p, [key]: val }))}
                        disabled={isEventPredLocked}
                        options={[
                          { value: '', label: '— Selecione —', emoji: null },
                          ...(type === 'team'
                            ? [...evTeams]
                                .sort((a, b) => a.name.localeCompare(b.name, 'pt'))
                                .map((t) => ({ value: t.id, label: t.name, emoji: t.shieldEmoji || null }))
                            : [...evPlayers]
                                .sort((a, b) => (players[a.id]?.name || a.name || '').localeCompare(players[b.id]?.name || b.name || '', 'pt'))
                                .map((p) => {
                                  const name = players[p.id]?.name || p.name || p.id;
                                  const team = evTeamMap[p.teamId];
                                  return {
                                    value: p.id,
                                    label: team ? `${name} · ${team.name}` : name,
                                    emoji: team?.shieldEmoji || null,
                                  };
                                })
                          ),
                        ]}
                      />
                    </div>
                  ))}
                </div>
                )}
                {evPredMsg.text && <div className={evPredMsg.type} style={{ marginBottom: '0.5rem', fontSize: '0.85rem' }}>{evPredMsg.text}</div>}
                <button onClick={saveChampionship} disabled={isEventPredLocked || savingEvPred} style={{ fontSize: '0.85rem' }}>
                  {savingEvPred ? 'Salvando…' : '💾 Salvar palpites de campeonato'}
                </button>
              </div>
            )}
            {/* Filtro de modalidade — abaixo dos palpites antecipados */}
            <SportTabs active={sport} onChange={setSport} available={currentEvent?.modalidades} />
            {upcoming.length === 0 ? (
              <div className="card"><p className="muted">{T.matches.noMatches}</p></div>
            ) : (<>
            {/* Aviso do prazo por partida */}
            <div className="card" style={{ marginBottom: '0.85rem', borderLeft: '3px solid rgba(96,165,250,0.6)', padding: '0.6rem 0.85rem' }}>
              <p className="muted" style={{ fontSize: '0.8rem', margin: 0 }}>
                ⏰ O palpite de cada partida fecha <strong>1 hora antes</strong> do início dela — depois disso fica 🔒 bloqueado.
              </p>
            </div>
            {/* Filtro de palpites */}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
              {[
                { key: 'all',   label: 'Todas' },
                ...availableRounds.map((r) => ({ key: String(r), label: `Rodada ${r}` })),
                { key: 'blank', label: '○ Em branco' },
                { key: 'made',  label: '✓ Respondidos' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  className={`event-type-chip ${predFilter === key ? 'active' : ''}`}
                  onClick={() => setPredFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            {Object.keys(groupedUpcoming).length === 0 ? (
              <div className="card"><p className="muted">Nenhuma partida neste filtro.</p></div>
            ) : Object.entries(groupedUpcoming).map(([round, byDate]) => (
            <div key={round} className="palpites-round-block">
              <div className="palpites-round-header">{round}</div>
              {Object.entries(byDate).map(([dateLabel, dayMatches]) => (
                <div key={dateLabel}>
                  <div className="palpites-date-label">{dateLabel}</div>
                  {dayMatches.map((m) => {
                    const pred    = predictions[m.id] || {};
                    const locked  = isPredictionLocked(m);
                    const hasPred = pred.h != null && pred.a != null && pred.h !== '' && pred.a !== '';
                    const wasSaved = savedIds.has(m.id);
                    return (
                      <div key={m.id} className="match-card">
                        <div className="match-meta">
                          <span>
                            {SPORT_LABELS[m.sport] || m.sport}
                            {m.gender === 'masculino' ? ' ♂' : m.gender === 'feminino' ? ' ♀' : ''}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {m.date && (
                              <span className="muted" style={{ fontSize: '0.8rem' }}>
                                {new Date(m.date).toLocaleString('pt-BR', { timeZone:'America/Sao_Paulo', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                              </span>
                            )}
                            {locked
                              ? <span className="match-status" style={{ background: 'rgba(239,68,68,0.12)', color: '#dc2626' }}>🔒 Bloqueado</span>
                              : wasSaved
                                ? <span className="match-status" style={{ background: 'rgba(34,197,94,0.12)', color: 'var(--primary)' }}>✓ Salvo</span>
                                : <span className="match-status scheduled">{T.matches.scheduled}</span>
                            }
                          </div>
                        </div>
                        {locked ? (
                          <div className="pred-inline-row">
                            <ShieldEmoji emoji={m.homeShieldEmoji || countryFlag(m.homeTeamName)} size="1.3em" className="pred-shield" />
                            <span className="pred-team-home">{m.homeTeamName}</span>
                            <span className="pred-score-locked">{hasPred ? pred.h : '—'}</span>
                            <span className="pred-vs-sep">×</span>
                            <span className="pred-score-locked">{hasPred ? pred.a : '—'}</span>
                            <span className="pred-team-away">{m.awayTeamName}</span>
                            <ShieldEmoji emoji={m.awayShieldEmoji || countryFlag(m.awayTeamName)} size="1.3em" className="pred-shield" />
                          </div>
                        ) : (
                          <div className="pred-inline-row">
                            <ShieldEmoji emoji={m.homeShieldEmoji || countryFlag(m.homeTeamName)} size="1.3em" className="pred-shield" />
                            <span className="pred-team-home">{m.homeTeamName}</span>
                            <input type="number" min="0" className="pred-score-input"
                              value={pred.h ?? ''}
                              onChange={(e) => updatePred(m.id, 'h', e.target.value)}
                              onBlur={() => autoSave(m.id, m)}
                            />
                            <span className="pred-vs-sep">×</span>
                            <input type="number" min="0" className="pred-score-input"
                              value={pred.a ?? ''}
                              onChange={(e) => updatePred(m.id, 'a', e.target.value)}
                              onBlur={() => autoSave(m.id, m)}
                            />
                            <span className="pred-team-away">{m.awayTeamName}</span>
                            <ShieldEmoji emoji={m.awayShieldEmoji || countryFlag(m.awayTeamName)} size="1.3em" className="pred-shield" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            ))}
            </>
            )}
          </>

        /* ── CALENDÁRIO ───────────────────────────────────── */
        ) : view === 'calendario' ? (
          <>
            <div className="calendar-header">
              <span className="muted" style={{ fontSize: '0.9rem' }}>Todos os jogos de {SPORT_LABELS[sport] || sport}</span>
              <span className="calendar-count-badge">
                {finished.length} / {bySport.length} realizados
              </span>
            </div>
            {bySport.length === 0 ? (
              <div className="card"><p className="muted">{T.matches.noMatches}</p></div>
            ) : (
              Object.entries(calendarGroups).map(([dateLabel, dayMatches]) => (
                <div key={dateLabel} className="calendar-day-group">
                  <div className="calendar-day-label">{dateLabel}</div>
                  {dayMatches.map((m) => {
                    const isDone  = m.status === 'finished';
                    const homeWon = m.homeScore > m.awayScore;
                    const awayWon = m.awayScore > m.homeScore;
                    return (
                      <div key={m.id} className={`match-card ${isDone ? 'finished-card' : ''}`}>
                        <div className="match-meta">
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <span className={`match-card-status-dot ${isDone ? 'status-dot-done' : 'status-dot-future'}`} />
                            {isDone ? 'Finalizado' : 'Agendado'}
                          </span>
                          {m.date && (
                            <span>{new Date(m.date).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}</span>
                          )}
                        </div>
                        <div className="match-row">
                          <div className={`match-team home ${isDone && homeWon ? 'winner' : ''}`}>
                            <ShieldEmoji emoji={m.homeShieldEmoji || countryFlag(m.homeTeamName)} size="1.2em" style={{ marginRight: '0.3rem' }} />
                            {m.homeTeamName}
                          </div>
                          {isDone ? (
                            <div className="score-final">{m.homeScore} : {m.awayScore}</div>
                          ) : (
                            <div className="match-vs">x</div>
                          )}
                          <div className={`match-team ${isDone && awayWon ? 'winner' : ''}`}>
                            <ShieldEmoji emoji={m.awayShieldEmoji || countryFlag(m.awayTeamName)} size="1.2em" style={{ marginRight: '0.3rem' }} />
                            {m.awayTeamName}
                          </div>
                        </div>
                        {m.location && (
                          <div className="muted" style={{ fontSize: '0.78rem', textAlign: 'center', marginTop: '0.3rem' }}>
                            📍 {m.location}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </>

        /* ── RESULTADOS ───────────────────────────────────── */
        ) : (
          finished.length === 0 ? (
            <div className="card"><p className="muted">Nenhuma partida finalizada ainda.</p></div>
          ) : finished.map((m) => {
            const pred   = predictions[m.id];
            const earned = pred ? predictionPoints({ homeScore: pred.h, awayScore: pred.a }, m) : 0;
            const homeWon = m.homeScore > m.awayScore;
            const awayWon = m.awayScore > m.homeScore;
            const isOpen  = expanded[m.id];

            return (
              <div key={m.id} className="match-card">
                <div className="match-meta">
                  <span>
                    {SPORT_LABELS[m.sport] || m.sport}
                    {m.gender === 'masculino' ? ' ♂' : m.gender === 'feminino' ? ' ♀' : ''}
                  </span>
                  <span>{m.finishedAt ? new Date(m.finishedAt).toLocaleDateString('pt-BR') : ''}</span>
                </div>
                <div className="match-row">
                  <div className={`match-team home ${homeWon ? 'winner' : ''}`}>
                    <ShieldEmoji emoji={m.homeShieldEmoji || countryFlag(m.homeTeamName)} size="1.2em" style={{ marginRight: '0.3rem' }} />
                    {m.homeTeamName}
                  </div>
                  <div className="score-final">{m.homeScore} : {m.awayScore}</div>
                  <div className={`match-team ${awayWon ? 'winner' : ''}`}>
                    <ShieldEmoji emoji={m.awayShieldEmoji || countryFlag(m.awayTeamName)} size="1.2em" style={{ marginRight: '0.3rem' }} />
                    {m.awayTeamName}
                  </div>
                </div>

                {/* Palpite do usuário */}
                <div className="prediction-row" style={{ borderTop: '1px solid var(--border)', paddingTop: '0.6rem' }}>
                  <span className="muted">
                    Seu palpite: {pred ? `${pred.h} : ${pred.a}` : '—'}
                  </span>
                  <span style={{ marginLeft: 'auto', fontWeight: 600, color: earned > 0 ? 'var(--primary)' : 'var(--muted)' }}>
                    {earned > 0 ? `+${earned}` : earned} pts
                    {earned === 12 && ' 🎯'}
                  </span>
                </div>

                {/* Botão expandir estatísticas dos jogadores */}
                {m.playerStats?.length > 0 && (
                  <button
                    className="btn-secondary"
                    style={{ width: '100%', fontSize: '0.85rem', marginTop: '0.5rem' }}
                    onClick={() => toggle(m.id)}
                  >
                    {isOpen ? '▲ Ocultar estatísticas' : '▼ Ver estatísticas dos jogadores'}
                  </button>
                )}

                {isOpen && (
                  <div className="history-stats">
                    <table className="stats-table">
                      <thead>
                        <tr>
                          <th>Jogador</th>
                          {(m.eventType === 'profissional' && m.sport === 'futebol' ? STAT_FIELDS_PRO.futebol : (STAT_FIELDS[m.sport] || [])).map(({ field: f, label: lbl }) => (
                            <th key={f}>{lbl}</th>
                          ))}
                          <th>Pts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {m.playerStats.map((stat) => {
                          const player   = players[stat.playerId];
                          const pts      = calcFantasyPoints(stat, m, false);
                          const statCols = m.eventType === 'profissional' && m.sport === 'futebol' ? STAT_FIELDS_PRO.futebol : (STAT_FIELDS[m.sport] || []);
                          return (
                            <tr key={stat.playerId}>
                              <td>
                                <Link to={`/jogador/${stat.playerId}`} className="ranking-name-link" style={{ fontWeight: 600 }}>
                                  {player?.name || stat.playerId}
                                </Link>
                                <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                                  {POSITION_LABELS[player?.position] || player?.position}
                                </div>
                              </td>
                              {statCols.map(({ field: f }) => (
                                <td key={f}>{stat[f] ?? 0}</td>
                              ))}
                              <td style={{ fontWeight: 700, color: pts >= 0 ? 'var(--primary)' : 'var(--danger)' }}>
                                {pts > 0 ? '+' : ''}{fmtPts(pts)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        )
      )}
    </>
  );
}
