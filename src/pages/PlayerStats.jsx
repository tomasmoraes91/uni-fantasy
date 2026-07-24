import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { calcFantasyPoints } from '../utils/scoring';
import { STAT_FIELDS, STAT_FIELDS_PRO, PHASE_LABELS } from '../utils/sportRules';
import { POSITION_LABELS, SPORT_LABELS } from '../utils/labels';
import { useEvent } from '../context/EventContext';
import { getMatchesByEvent, getPlayersByEvent, getTeamsByEvent, getPlayerById } from '../services/firestore';
import ShieldEmoji from '../components/ShieldEmoji';

// Abreviações 2-3 chars para cabeçalhos da tabela (tooltip mostra nome completo)
const STAT_SHORT = {
  goals:'G', assists:'AS', shotsOnPost:'TR', shotsDefended:'FD',
  shotsOut:'FF', foulsSuffered:'FS', penaltySuffered:'PS',
  penaltyMissed:'PM', offsides:'IMP', tackles:'DSM',
  ownGoals:'GC', yellowCards:'CA', redCards:'CV',
  foulsCommitted:'FC', penaltyCommitted:'PC',
  penaltySaved:'DP', cleanSheet:'CS', saves:'DEF',
  goalsConceded:'GS', points:'PTS', fouls:'FLT', exclusions:'EXC',
};

const PT_MULT = {
  futebol: {
    goals: 8, assists: 5, shotsOnPost: 3, shotsDefended: 1.2, shotsOut: 0.8,
    foulsSuffered: 0.5, penaltySuffered: 1, penaltyMissed: -4, offsides: -0.1,
    tackles: 1.5, ownGoals: -3, yellowCards: -1, redCards: -3,
    foulsCommitted: -0.3, penaltyCommitted: -1, penaltySaved: 7,
    cleanSheet: 5, saves: 1.3, goalsConceded: -1,
  },
  futsal:     { goals: 8, yellowCards: -1, redCards: -3 },
  basketball: { points: 1, fouls: -1 },
  handball:   { goals: 4, exclusions: -3 },
};

// Chave normalizada de uma partida (rodada tem prioridade sobre phase)
function matchKey(m) {
  const raw = m.rodada != null ? m.rodada : m.phase;
  return raw != null ? String(raw).trim() : null;
}
// Verifica se a chave corresponde a uma rodada da fase de grupos (1, 2 ou 3)
function isGroupRoundKey(key) {
  return key === '1' || key === '2' || key === '3' ||
    key === 'Rodada 1' || key === 'Rodada 2' || key === 'Rodada 3' ||
    /^[123][ªa]/.test(key);
}
// Label para exibição (número puro → "Rodada N", fase conhecida → nome, outros → raw)
function periodLabel(key) {
  if (PHASE_LABELS[key]) return PHASE_LABELS[key];
  if (/^\d+$/.test(key)) return `Rodada ${key}`;
  return key;
}

const COLORS = ['var(--primary)', '#60a5fa', '#f472b6'];

/* ── PlayerSelector — componente puro (sem hooks de contexto) ── */
function PlayerSelector({ allPlayers, allTeams, teamMap, currentId, color, placeholder, onSelect }) {
  const [open, setOpen]           = useState(false);
  const [search, setSearch]       = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [posFilter, setPosFilter]   = useState('');

  const current = currentId ? allPlayers.find((p) => p.id === currentId) : null;
  const currentTeam = current ? teamMap[current.teamId] : null;

  const positions = useMemo(
    () => [...new Set(allPlayers.map((p) => p.position).filter(Boolean))].sort(),
    [allPlayers],
  );

  const filtered = useMemo(
    () => allPlayers
      .filter((p) => {
        if (teamFilter && p.teamId !== teamFilter) return false;
        if (posFilter  && p.position !== posFilter)  return false;
        if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    [allPlayers, teamFilter, posFilter, search],
  );

  return (
    <div style={{ position: 'relative', flex: 2, minWidth: 170 }}>
      {open && <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />}
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          background: 'var(--bg)', borderRadius: 8,
          padding: '0.4rem 0.7rem', cursor: 'pointer',
          border: `1px solid ${color || 'var(--border)'}`,
        }}
      >
        {currentTeam?.shieldEmoji && <ShieldEmoji emoji={currentTeam.shieldEmoji} size="1rem" />}
        <span style={{ flex: 1, fontWeight: 600, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: color && current ? color : 'inherit' }}>
          {current ? current.name : (placeholder || 'Selecionar jogador…')}
        </span>
        <span style={{ fontSize: '0.62rem', opacity: 0.4 }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 100, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', maxHeight: 400, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 260, width: 'max-content' }}>
          <div style={{ padding: '0.45rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            <input
              autoFocus placeholder="Buscar…" value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 2, minWidth: 100, fontSize: '0.8rem', padding: '0.3rem 0.4rem', borderRadius: 6, background: 'var(--bg)', color: '#fff', border: '1px solid var(--border)' }}
            />
            <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}
              style={{ flex: 1, minWidth: 90, fontSize: '0.74rem', padding: '0.3rem', borderRadius: 6, background: 'var(--bg)', color: '#fff', border: '1px solid var(--border)' }}>
              <option value="">Todos os times</option>
              {allTeams.slice().sort((a, b) => a.name.localeCompare(b.name)).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <select value={posFilter} onChange={(e) => setPosFilter(e.target.value)}
              style={{ flex: 1, minWidth: 80, fontSize: '0.74rem', padding: '0.3rem', borderRadius: 6, background: 'var(--bg)', color: '#fff', border: '1px solid var(--border)' }}>
              <option value="">Todas posições</option>
              {positions.map((pos) => (
                <option key={pos} value={pos}>{POSITION_LABELS[pos] || pos}</option>
              ))}
            </select>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0 && (
              <p className="muted" style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.8rem' }}>Nenhum jogador encontrado.</p>
            )}
            {filtered.map((p) => {
              const t = teamMap[p.teamId];
              const active = p.id === currentId;
              return (
                <div key={p.id}
                  onClick={() => { onSelect(p.id); setOpen(false); setSearch(''); setTeamFilter(''); setPosFilter(''); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.4rem 0.7rem', cursor: 'pointer', background: active ? 'rgba(34,197,94,0.1)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  {t?.shieldEmoji && <ShieldEmoji emoji={t.shieldEmoji} size="0.85rem" />}
                  <span style={{ flex: 1, fontSize: '0.83rem', fontWeight: active ? 700 : 400 }}>{p.name}</span>
                  <span className="muted" style={{ fontSize: '0.68rem' }}>{POSITION_LABELS[p.position] || p.position}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, sub, accent }) {
  return (
    <div style={{ flex: 1, minWidth: 72, background: 'var(--bg)', borderRadius: 10, padding: '0.55rem 0.4rem', textAlign: 'center' }}>
      <div style={{ fontWeight: 800, fontSize: '1.1rem', color: accent || 'var(--primary)' }}>{value}</div>
      <div style={{ fontSize: '0.66rem', color: 'var(--muted)', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

/* computa dados de um jogador a partir das partidas activadas */
function buildData(player, playerId, teamMap, activatedMatches) {
  if (!player) return null;
  const s = player.sport || 'futebol';
  const matches = activatedMatches
    .filter((m) => (m.playerStats || []).some((st) => st.playerId === playerId))
    .sort((a, b) => (b.date || 0) - (a.date || 0))
    .map((m) => {
      const stat = (m.playerStats || []).find((st) => st.playerId === playerId);
      return { ...m, stat, pts: stat ? calcFantasyPoints(stat, m) : 0 };
    });
  const aggStats = {};
  matches.forEach((m) => {
    Object.entries(m.stat || {}).forEach(([k, v]) => {
      if (k !== 'playerId' && k !== 'teamId' && typeof v === 'number' && v !== 0)
        aggStats[k] = (aggStats[k] || 0) + v;
    });
  });
  const totalPts  = Math.round(matches.reduce((acc, m) => acc + m.pts, 0) * 10) / 10;
  const avgPts    = matches.length ? Math.round(totalPts / matches.length * 10) / 10 : 0;
  const bestMatch = matches.reduce((b, m) => (!b || m.pts > b.pts) ? m : b, null);

  const base = STAT_FIELDS[s] || [];
  const pro  = STAT_FIELDS_PRO[s] || [];
  const seen = new Set(base.map((f) => f.field));
  const allFields = [...base, ...pro.filter((f) => !seen.has(f.field))];
  const relevantFields = allFields.filter((f) => aggStats[f.field] || PT_MULT[s]?.[f.field]);

  return { player, team: teamMap[player.teamId], sport: s, matches, aggStats, totalPts, avgPts, bestMatch, relevantFields };
}

export default function PlayerStats() {
  const { playerId }      = useParams();
  const navigate          = useNavigate();
  const [searchParams]    = useSearchParams();
  const { eventId }       = useEvent();

  const [allPlayers,      setAllPlayers]      = useState([]);
  const [allTeams,        setAllTeams]        = useState([]);
  const [allMatches,      setAllMatches]      = useState([]);
  const [finishedMatches, setFinishedMatches] = useState([]);
  const [loading,        setLoading]        = useState(true);

  const [period,        setPeriod]        = useState('all');
  const [compareSlots,  setCompareSlots]  = useState([]);
  const [expandedMatchId, setExpandedMatchId] = useState(null);
  const [evtSport,      setEvtSport]      = useState('');
  const initSort = searchParams.get('sort') || '_pts';
  const initDir  = searchParams.get('dir')  || 'desc';
  const [evtSort, setEvtSort] = useState({ field: initSort, dir: initDir });

  useEffect(() => {
    if (!eventId) return;
    setLoading(true);
    setCompareSlots([]);
    setExpandedMatchId(null);
    Promise.all([
      getPlayersByEvent(eventId),
      getTeamsByEvent(eventId),
      getMatchesByEvent(eventId),
      playerId ? getPlayerById(playerId) : Promise.resolve(null),
    ]).then(([players, teams, matches, directPlayer]) => {
      let finalPlayers = players;
      if (directPlayer && !players.find((p) => p.id === directPlayer.id)) {
        finalPlayers = [directPlayer, ...players];
      }
      setAllPlayers(finalPlayers);
      setAllTeams(teams);
      setAllMatches(matches);
      setFinishedMatches(matches.filter((m) => m.status === 'finished'));
      setLoading(false);
    }).catch((err) => {
      console.error('[PlayerStats] erro ao carregar:', err);
      setLoading(false);
    });
  }, [eventId]);

  useEffect(() => { setExpandedMatchId(null); }, [period]);

  const teamMap = useMemo(
    () => Object.fromEntries(allTeams.map((t) => [t.id, t])),
    [allTeams],
  );

  const player = useMemo(() => allPlayers.find((p) => p.id === playerId), [allPlayers, playerId]);

  // Períodos dinâmicos: derivados das partidas reais (rodada > phase)
  const dynamicPeriods = useMemo(() => {
    const list = [{ key: 'all', label: 'Campeonato', filter: null }];
    const seen = new Set(['all', 'fase-de-grupos']);
    finishedMatches.forEach((m) => {
      const key = matchKey(m);
      if (!key || seen.has(key)) return;
      seen.add(key);
      list.push({
        key,
        label: periodLabel(key),
        filter: (match) => matchKey(match) === key,
      });
    });
    // Adiciona "Fase de Grupos" quando existem rodadas 1, 2 ou 3
    const groupKeys = new Set(list.filter(p => isGroupRoundKey(p.key)).map(p => p.key));
    if (groupKeys.size > 0) {
      list.splice(1, 0, {
        key: 'fase-de-grupos',
        label: 'Fase de Grupos',
        filter: (match) => { const k = matchKey(match); return k != null && groupKeys.has(k); },
      });
    }
    return list;
  }, [finishedMatches]);

  const activatedMatches = useMemo(() => {
    if (period === 'all') return finishedMatches;
    const p = dynamicPeriods.find((o) => o.key === period);
    return p?.filter ? finishedMatches.filter(p.filter) : finishedMatches;
  }, [period, finishedMatches, dynamicPeriods]);

  // Só exibe períodos em que o jogador principal participou
  const playerFinishedMatches = useMemo(
    () => finishedMatches.filter((m) => (m.playerStats || []).some((st) => st.playerId === playerId)),
    [finishedMatches, playerId],
  );
  const availablePeriods = useMemo(
    () => dynamicPeriods.filter((p) => !p.filter || playerFinishedMatches.some(p.filter)),
    [dynamicPeriods, playerFinishedMatches],
  );

  const primaryData = useMemo(
    () => buildData(player, playerId, teamMap, activatedMatches),
    [player, playerId, teamMap, activatedMatches],
  );

  const compareData = useMemo(
    () => compareSlots
      .filter(Boolean)
      .map((cid) => {
        const p = allPlayers.find((pl) => pl.id === cid);
        return buildData(p, cid, teamMap, activatedMatches);
      })
      .filter(Boolean),
    [compareSlots, allPlayers, teamMap, activatedMatches],
  );

  const allActiveData = primaryData ? [primaryData, ...compareData] : [];
  const isComparing   = allActiveData.length > 1;

  /* campos union para comparação */
  const compareFields = useMemo(() => {
    const seen   = new Set();
    const fields = [];
    allActiveData.forEach((d) => {
      d.relevantFields.forEach((f) => {
        if (!seen.has(f.field)) { seen.add(f.field); fields.push(f); }
      });
    });
    return fields;
  }, [allActiveData]);

  /* ── Event stats table ── */
  const eventSports = useMemo(
    () => [...new Set(allPlayers.map((p) => p.sport).filter(Boolean))],
    [allPlayers],
  );
  const currentEvtSport = evtSport || eventSports[0] || 'futebol';

  const [evtRodada, setEvtRodada] = useState('all');

  // Reset rodada filter when sport changes
  useEffect(() => { setEvtRodada('all'); }, [currentEvtSport]);

  // Períodos relevantes para o esporte atual (reutiliza dynamicPeriods com filtro de sport)
  const evtRodadas = useMemo(() => {
    const sportKeys = new Set(
      finishedMatches
        .filter((m) => m.sport === currentEvtSport)
        .map((m) => matchKey(m))
        .filter(Boolean),
    );
    return dynamicPeriods.filter((p) => {
      if (p.key === 'all') return false;
      if (p.key === 'fase-de-grupos') return [...sportKeys].some(isGroupRoundKey);
      return sportKeys.has(p.key);
    });
  }, [finishedMatches, currentEvtSport, dynamicPeriods]);

  // Partidas do esporte atual, filtradas pela rodada da tabela
  const evtMatchesFiltered = useMemo(() => {
    const base = activatedMatches.filter((m) => m.sport === currentEvtSport);
    if (evtRodada === 'all') return base;
    const p = dynamicPeriods.find((d) => d.key === evtRodada);
    return p?.filter ? base.filter(p.filter) : base;
  }, [activatedMatches, currentEvtSport, evtRodada, dynamicPeriods]);

  const evtStatFields = useMemo(() => {
    const base = STAT_FIELDS[currentEvtSport] || [];
    const pro  = STAT_FIELDS_PRO[currentEvtSport] || [];
    const seen = new Set(base.map((f) => f.field));
    return [...base, ...pro.filter((f) => !seen.has(f.field))];
  }, [currentEvtSport]);

  const eventStatRows = useMemo(() => {
    const acc = {};
    evtMatchesFiltered
      .forEach((m) => {
        (m.playerStats || []).forEach((stat) => {
          if (!acc[stat.playerId]) acc[stat.playerId] = { _pts: 0 };
          evtStatFields.forEach((f) => {
            if (stat[f.field]) acc[stat.playerId][f.field] = (acc[stat.playerId][f.field] || 0) + (stat[f.field] || 0);
          });
          acc[stat.playerId]._pts += calcFantasyPoints(stat, m);
        });
      });
    return Object.entries(acc)
      .map(([pid, row]) => {
        const p = allPlayers.find((pl) => pl.id === pid);
        if (!p) return null;
        return {
          ...row, playerId: pid, player: p, team: teamMap[p.teamId],
          _pts: Math.round((row._pts || 0) * 10) / 10,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const va = Number(a[evtSort.field]) || 0;
        const vb = Number(b[evtSort.field]) || 0;
        return evtSort.dir === 'desc' ? vb - va : va - vb;
      });
  }, [evtMatchesFiltered, allPlayers, teamMap, evtStatFields, evtSort]);

  // Só exibe colunas onde ao menos um jogador tem valor não-zero
  const activeEvtStatFields = useMemo(
    () => evtStatFields.filter((f) => eventStatRows.some((r) => (r[f.field] || 0) !== 0)),
    [evtStatFields, eventStatRows],
  );

  const toggleSort = (field) =>
    setEvtSort((prev) => prev.field === field
      ? { field, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
      : { field, dir: 'desc' });

  const addCompare = (id) => {
    if (id === playerId || compareSlots.includes(id)) return;
    setCompareSlots((prev) => prev.length >= 2 ? [...prev.slice(0, 1), id] : [...prev, id]);
  };

  const removeCompare = (idx) =>
    setCompareSlots((prev) => prev.filter((_, i) => i !== idx));

  if (loading) return <p className="muted" style={{ padding: '2rem', textAlign: 'center' }}>Carregando…</p>;

  /* ────────────────────── RENDER ────────────────────── */
  return (
    <div style={{ maxWidth: 920, margin: '0 auto' }}>

      {/* ── Top bar ── */}
      <div className="card" style={{ marginBottom: '1rem', padding: '0.7rem 1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>

          {/* Primary selector */}
          <div style={{ display:'flex', gap:'0.3rem', flex:2, minWidth:170 }}>
            <PlayerSelector
              allPlayers={allPlayers} allTeams={allTeams} teamMap={teamMap}
              currentId={playerId} color={COLORS[0]}
              onSelect={(id) => { navigate(`/jogador/${id}`); setCompareSlots([]); }}
            />
            {playerId && (
              <button onClick={() => { navigate('/jogadores'); setCompareSlots([]); }}
                title="Voltar às estatísticas gerais"
                style={{ padding:'0.3rem 0.5rem', background:'transparent', border:'1px solid var(--border)', borderRadius:6, color:'var(--muted)', cursor:'pointer', fontSize:'0.8rem', flexShrink:0 }}>
                ✕
              </button>
            )}
          </div>

          {/* Compare slots */}
          {compareSlots.map((cid, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '0.3rem', flex: 2, minWidth: 160 }}>
              <PlayerSelector
                allPlayers={allPlayers.filter((p) => p.id !== playerId && !compareSlots.filter((_, i) => i !== idx).includes(p.id))}
                allTeams={allTeams} teamMap={teamMap}
                currentId={cid || ''} color={COLORS[idx + 1]}
                placeholder="Escolher jogador…"
                onSelect={(id) => setCompareSlots((prev) => prev.map((c, i) => i === idx ? id : c))}
              />
              <button
                onClick={() => removeCompare(idx)}
                style={{ padding: '0.3rem 0.5rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', fontSize: '0.8rem' }}
              >✕</button>
            </div>
          ))}

          {/* Add compare button */}
          {playerId && compareSlots.length < 2 && (
            <button
              onClick={() => setCompareSlots((prev) => [...prev, ''])}
              style={{ padding: '0.4rem 0.65rem', background: 'transparent', border: '1px dashed var(--border)', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer', fontSize: '0.77rem', whiteSpace: 'nowrap' }}
            >
              + Comparar
            </button>
          )}

          {/* Period pills — dinâmico, só mostra fases com partidas */}
          <div style={{ overflowX: 'auto', flexShrink: 0, marginLeft: 'auto', maxWidth: '100%' }}>
            <div style={{ display: 'flex', gap: '0.3rem', paddingBottom: '2px' }}>
              {availablePeriods.map((p) => (
                <button key={p.key} onClick={() => setPeriod(p.key)}
                  style={{
                    padding: '0.3rem 0.65rem', fontSize: '0.75rem', whiteSpace: 'nowrap', flexShrink: 0,
                    fontWeight: period === p.key ? 700 : 400,
                    background: period === p.key ? 'var(--primary)' : 'var(--bg)',
                    color: period === p.key ? '#000' : 'var(--text)',
                    border: `1px solid ${period === p.key ? 'var(--primary)' : 'var(--border)'}`,
                    borderRadius: 20, cursor: 'pointer',
                  }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Player panels ── */}
      {allActiveData.length > 0 && (
        <>
          {/* Hero cards */}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${allActiveData.length}, 1fr)`, gap: '0.6rem', marginBottom: '1rem' }}>
            {allActiveData.map((d, idx) => {
              const { player: p, team: t, matches, totalPts, avgPts, bestMatch } = d;
              const col = COLORS[idx];
              return (
                <div key={p.id} className="card" style={{ padding: '0.9rem', borderTop: `3px solid ${col}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.7rem', flexWrap: 'wrap' }}>
                    {t?.shieldEmoji && <ShieldEmoji emoji={t.shieldEmoji} size="1.8rem" />}
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '1rem' }}>{p.name}</div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--muted)', marginTop: 1 }}>
                        {POSITION_LABELS[p.position] || p.position}
                        {t && <> · {t.name}</>}
                        {SPORT_LABELS[p.sport] && <> · {SPORT_LABELS[p.sport]}</>}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    <MetricCard label="Total" value={`${totalPts} pts`} accent={col} />
                    <MetricCard label="Partidas" value={matches.length} />
                    <MetricCard label="Média" value={matches.length ? `${avgPts.toFixed(1)}` : '—'} sub="pts/jogo" />
                    <MetricCard label="Melhor" value={bestMatch ? `${Math.round(bestMatch.pts * 10) / 10} pts` : '—'}
                      sub={bestMatch ? `R${bestMatch.rodada ?? '?'}` : undefined} accent="#fbbf24" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stats breakdown / comparison */}
          {compareFields.length > 0 && (
            <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
              <h3 style={{ fontSize: '0.88rem', marginBottom: '0.75rem' }}>
                {isComparing ? '⚖️ Comparação de estatísticas' : '📊 Estatísticas detalhadas'}
              </h3>

              {isComparing ? (
                /* Comparison table */
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ flex: 1, fontSize: '0.73rem', color: 'var(--muted)' }}>Estatística</span>
                    {allActiveData.map((d, i) => (
                      <span key={d.player.id} style={{ minWidth: 78, textAlign: 'center', fontSize: '0.72rem', fontWeight: 700, color: COLORS[i] }}>
                        {d.player.name.split(' ')[0]}
                      </span>
                    ))}
                  </div>
                  {compareFields.map((f) => {
                    const vals     = allActiveData.map((d) => d.aggStats[f.field] || 0);
                    const mults    = allActiveData.map((d) => PT_MULT[d.sport]?.[f.field] || 0);
                    const contribs = vals.map((v, i) => Math.round(v * mults[i] * 10) / 10);
                    const maxC     = Math.max(...contribs.map(Math.abs), 0.001);
                    if (vals.every((v) => v === 0) && mults.every((m) => m === 0)) return null;
                    return (
                      <div key={f.field} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ flex: 1, fontSize: '0.8rem', color: 'var(--muted)' }}>{f.label}</span>
                        {allActiveData.map((d, i) => {
                          const val     = d.aggStats[f.field] || 0;
                          const contrib = contribs[i];
                          const barPct  = (Math.abs(contrib) / maxC) * 100;
                          const pos     = contrib >= 0;
                          return (
                            <div key={d.player.id} style={{ minWidth: 78, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                              <div style={{ fontSize: '0.82rem', fontWeight: 700 }}>{val}</div>
                              <div style={{ width: 56, background: 'rgba(255,255,255,0.08)', borderRadius: 99, height: 5, overflow: 'hidden' }}>
                                <div style={{ width: barPct + '%', height: '100%', background: pos ? COLORS[i] : '#ef4444', borderRadius: 99, opacity: 0.85 }} />
                              </div>
                              <div style={{ fontSize: '0.68rem', color: pos ? COLORS[i] : '#ef4444' }}>
                                {contrib > 0 ? '+' : ''}{contrib}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Single player stat bars */
                (() => {
                  const d    = primaryData;
                  const maxC = Math.max(...d.relevantFields.map((f) => Math.abs((d.aggStats[f.field] || 0) * (PT_MULT[d.sport]?.[f.field] || 0))), 1);
                  return d.relevantFields.map((f) => {
                    const val  = d.aggStats[f.field] || 0;
                    const mult = PT_MULT[d.sport]?.[f.field] || 0;
                    if (val === 0 && mult === 0) return null;
                    const contrib = Math.round(val * mult * 10) / 10;
                    const barPct  = Math.min(Math.abs(contrib) / maxC * 100, 100);
                    const pos     = contrib >= 0;
                    return (
                      <div key={f.field} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--muted)' }}>{f.label}</span>
                        <span style={{ minWidth: 28, textAlign: 'right', fontWeight: 700, fontSize: '0.82rem' }}>{val}</span>
                        <div style={{ width: 80, background: 'rgba(255,255,255,0.07)', borderRadius: 99, height: 6, overflow: 'hidden', flexShrink: 0 }}>
                          <div style={{ width: barPct + '%', height: '100%', background: pos ? '#22c55e' : '#ef4444', borderRadius: 99 }} />
                        </div>
                        <span style={{ minWidth: 42, textAlign: 'right', fontSize: '0.82rem', fontWeight: 700, color: pos ? '#22c55e' : '#ef4444' }}>
                          {pos ? '+' : ''}{contrib} pts
                        </span>
                      </div>
                    );
                  });
                })()
              )}
            </div>
          )}

          {/* Match history (primary player only) */}
          {primaryData && (
            <div className="card" style={{ marginBottom: '1rem', padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '0.7rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '0.88rem', margin: 0 }}>📅 Histórico de partidas — {primaryData.player.name}</h3>
                <span className="muted" style={{ fontSize: '0.7rem' }}>Clique para ver pontuação</span>
              </div>

              {primaryData.matches.length === 0 ? (
                <p className="muted" style={{ padding: '1rem', textAlign: 'center' }}>
                  {period === 'all' ? 'Nenhuma partida finalizada.' : `Nenhuma partida finalizada em "${PERIODS.find((p) => p.key === period)?.label}".`}
                </p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="ranking-table" style={{ minWidth: 380 }}>
                    <thead>
                      <tr>
                        <th>Partida</th>
                        <th className="ranking-num-col">R</th>
                        <th className="ranking-num-col">Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {primaryData.matches.flatMap((m) => {
                        const expanded = expandedMatchId === m.id;
                        const ptColor  = m.pts < 0 ? '#ef4444' : m.pts > 0 ? 'var(--primary)' : 'var(--muted)';
                        const rows = [
                          <tr key={m.id} className="ranking-row"
                            onClick={() => setExpandedMatchId(expanded ? null : m.id)}
                            style={{ cursor: 'pointer', background: expanded ? 'rgba(34,197,94,0.06)' : undefined }}>
                            <td>
                              <div style={{ fontWeight: 600, fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                                {m.homeTeamName} × {m.awayTeamName}
                              </div>
                              <div className="muted" style={{ fontSize: '0.7rem' }}>
                                {m.homeScore}–{m.awayScore}
                                {m.date && ` · ${new Date(m.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`}
                              </div>
                            </td>
                            <td className="ranking-num-col ranking-secondary">{m.rodada ?? '—'}</td>
                            <td className="ranking-num-col" style={{ fontWeight: 700, color: ptColor }}>
                              {m.pts > 0 ? '+' : ''}{Math.round(m.pts * 10) / 10}
                            </td>
                          </tr>,
                        ];
                        if (expanded) {
                          const breakdown = primaryData.relevantFields
                            .map((f) => {
                              const val  = m.stat?.[f.field] || 0;
                              const mult = PT_MULT[primaryData.sport]?.[f.field] || 0;
                              if (val === 0) return null;
                              const pts = Math.round(val * mult * 10) / 10;
                              return { label: f.label, val, mult, pts };
                            })
                            .filter(Boolean);
                          rows.push(
                            <tr key={`${m.id}-exp`}>
                              <td colSpan={3} style={{ padding: 0 }}>
                                <div style={{ background: 'rgba(0,0,0,0.25)', padding: '0.6rem 1rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem 1.2rem' }}>
                                  {breakdown.length === 0
                                    ? <span className="muted" style={{ fontSize: '0.78rem' }}>Sem estatísticas registradas.</span>
                                    : breakdown.map((b) => (
                                      <span key={b.label} style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                                        <span className="muted">{b.label}: </span>
                                        <strong>{b.val}</strong>
                                        {b.mult !== 0 && (
                                          <span style={{ color: b.pts >= 0 ? 'var(--primary)' : '#ef4444' }}>
                                            {' → '}{b.pts >= 0 ? '+' : ''}{b.pts} pts
                                          </span>
                                        )}
                                      </span>
                                    ))
                                  }
                                </div>
                              </td>
                            </tr>,
                          );
                        }
                        return rows;
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Event stats table ── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3 style={{ fontSize: '0.88rem', margin: 0 }}>📊 Estatísticas do evento</h3>
            {eventSports.length > 1 && (
              <select value={currentEvtSport} onChange={(e) => setEvtSport(e.target.value)}
                style={{ fontSize: '0.78rem', padding: '0.25rem 0.4rem', borderRadius: 6, background: 'var(--bg)', color: '#fff', border: '1px solid var(--border)' }}>
                {eventSports.map((s) => <option key={s} value={s}>{SPORT_LABELS[s] || s}</option>)}
              </select>
            )}
          </div>
          {evtRodadas.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: '0.72rem' }}>Rodada:</span>
              {[{ key: 'all', label: 'Campeonato' }, ...evtRodadas].map(({ key: r, label }) => (
                <button key={r} type="button" onClick={() => setEvtRodada(r)}
                  style={{ fontSize: '0.72rem', padding: '0.18rem 0.55rem', borderRadius: 20, cursor: 'pointer',
                    background: evtRodada === r ? 'var(--primary)' : 'var(--surface-2)',
                    color:      evtRodada === r ? '#000' : 'var(--text)',
                    border:    `1px solid ${evtRodada === r ? 'var(--primary)' : 'var(--border)'}`,
                    fontWeight: evtRodada === r ? 700 : 400 }}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {eventStatRows.length === 0 ? (
          <p className="muted" style={{ padding: '1rem', textAlign: 'center' }}>Nenhuma estatística disponível.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="ranking-table" style={{ minWidth: 420 }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Jogador</th>
                  {activeEvtStatFields.map((f) => (
                    <th key={f.field} className="ranking-num-col"
                      onClick={() => toggleSort(f.field)}
                      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                      title={f.label}>
                      {STAT_SHORT[f.field] || f.label.split(' ')[0]}{evtSort.field === f.field ? (evtSort.dir === 'desc' ? '↓' : '↑') : ''}
                    </th>
                  ))}
                  <th className="ranking-num-col"
                    onClick={() => toggleSort('_pts')}
                    style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Pts{evtSort.field === '_pts' ? (evtSort.dir === 'desc' ? '↓' : '↑') : ''}
                  </th>
                </tr>
              </thead>
              <tbody>
                {eventStatRows.map((row, i) => {
                  const medals   = ['🥇', '🥈', '🥉'];
                  const isActive = row.playerId === playerId;
                  return (
                    <tr key={row.playerId}
                      className={`ranking-row ${isActive ? 'me' : ''}`}
                      onClick={() => navigate(`/jogador/${row.playerId}`)}
                      style={{ cursor: 'pointer' }}>
                      <td className="ranking-rank">{medals[i] || `${i + 1}º`}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          {row.team?.shieldEmoji && <ShieldEmoji emoji={row.team.shieldEmoji} size="0.9rem" />}
                          <div>
                            <div style={{ fontWeight: isActive ? 700 : 500, fontSize: '0.85rem' }}>{row.player.name}</div>
                            <div className="muted" style={{ fontSize: '0.68rem' }}>
                              {row.team?.name} · {POSITION_LABELS[row.player.position] || row.player.position}
                            </div>
                          </div>
                        </div>
                      </td>
                      {activeEvtStatFields.map((f) => (
                        <td key={f.field} className="ranking-num-col ranking-secondary">{row[f.field] || 0}</td>
                      ))}
                      <td className="ranking-points" style={{ color: row._pts < 0 ? '#ef4444' : 'var(--primary)' }}>
                        {row._pts}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
