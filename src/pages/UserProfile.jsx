import { useEffect, useRef, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEvent } from '../context/EventContext';
import { updateDisplayName } from '../services/auth';
import { getScoresByEvent, getScoresByUid, getEvents, getUserTeamsByUid, getPlayersByEvent, getPlayersBySport, getMatchesByEvent, getTeamsByEvent, getUserBadges, getRoundLineupsByUser, getUserPredictions, getUserEventIds, getLineupStats, getEventPrediction } from '../services/firestore';
import { BADGES, RARITY } from '../utils/badges';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { isPredictionLocked, predictionPoints, isExactPrediction, roundFantasyDetail, eventPredictionPoints, EVENT_PREDICTION_POINTS } from '../utils/scoring';
import { POSITION_LABELS } from '../utils/labels';
import { PHASE_LABELS } from '../utils/sportRules';
// Rótulo de rodada: número → "Rodada N"; fase → nome (16 avos, Oitavas…)
const roundLabel = (k) => (/^\d+$/.test(String(k)) ? `Rodada ${k}` : (PHASE_LABELS[k] || k));
import ShieldEmoji from '../components/ShieldEmoji';

const SPORT_LABELS = {
  futebol: '⚽ Futebol', futsal: '⚽ Futsal',
  basketball: '🏀 Basquete', volleyball: '🏐 Vôlei', handball: '🤾 Handebol',
};

const POS_COLOR = {
  GK:  '#eab308',
  ZAG: '#3b82f6', LAT: '#3b82f6', DEF: '#3b82f6', LIB: '#3b82f6', MB1: '#3b82f6', MB2: '#3b82f6', MB: '#3b82f6',
  MCM: '#22c55e', VOL: '#22c55e', MEI: '#22c55e', FIX: '#22c55e', ALA: '#22c55e',
  PG:  '#22c55e', SG: '#22c55e', SET: '#22c55e',
  LD:  '#22c55e', LC: '#22c55e', LE: '#22c55e',
  ATA: '#ef4444', PIV: '#ef4444', WIN: '#ef4444', SF: '#ef4444',
  OPP: '#ef4444', OH1: '#ef4444', OH2: '#ef4444', OH: '#ef4444',
  LL:  '#ef4444', LP: '#ef4444',
};

export default function UserProfile() {
  const { uid: targetUid }   = useParams();
  const { user, profile: myProfile, refreshProfile } = useAuth();
  const { eventId }          = useEvent();
  const navigate             = useNavigate();

  const [profile,    setProfile]    = useState(null);
  const [scores,     setScores]     = useState([]);
  const [events,     setEvents]     = useState([]);
  const [userEventIds, setUserEventIds] = useState([]); // eventos em que o alvo participa
  const [isFriend,   setIsFriend]   = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [friendBusy, setFriendBusy] = useState(false);

  // Edição de nome (Google, 1×)
  const [editingName, setEditingName] = useState(false);
  const [nameInput,   setNameInput]   = useState('');
  const [nameBusy,    setNameBusy]    = useState(false);
  const [nameErr,     setNameErr]     = useState('');
  const [tab,           setTab]          = useState('stats');
  const [userBadges,    setUserBadges]    = useState({});
  const [activeBadgeId, setActiveBadgeId] = useState(null);
  const [topPlayers,   setTopPlayers]   = useState([]); // { pid, count }[]
  const [topPlayerMap, setTopPlayerMap] = useState({}); // pid → { player, team }

  // Aba Palpites — carregados sob demanda (auditoria: só mostra os já travados)
  const [predsList,   setPredsList]   = useState([]);
  const [predMatches, setPredMatches] = useState([]);
  const [predLoading, setPredLoading] = useState(false);
  const [predsLoaded, setPredsLoaded] = useState(false);

  // Palpite antecipado de campeonato (campeão/vice/3º/4º/artilheiro) — carregado
  // junto com a aba Palpites. Schema flat (Copa padrão, sem genderMode).
  const [evPred,     setEvPred]     = useState(null);
  const [evPredTeams, setEvPredTeams] = useState([]);
  const [evPredPlayers, setEvPredPlayers] = useState([]);

  // Aba Escalações — carregados sob demanda
  const [lineupTeams,   setLineupTeams]   = useState([]);  // user_teams do alvo (time atual)
  const [lineupSnaps,   setLineupSnaps]   = useState([]);  // snapshots por rodada (round_lineups)
  const [snapRounds,    setSnapRounds]    = useState(new Set()); // `${sport}::${rk}` com snapshot GLOBAL
  const [lineupPlayers, setLineupPlayers] = useState({});  // id → player
  const [lineupTeamMap, setLineupTeamMap] = useState({});  // teamId → team (para bandeira)
  const [lineupMatches, setLineupMatches] = useState([]);  // todas as partidas
  const [lineupLoading, setLineupLoading] = useState(false);

  // Troféu de conquistas
  const [trophyOpen, setTrophyOpen] = useState(false);
  const trophyRef = useRef(null);

  const isMe = user?.uid === targetUid;

  useEffect(() => {
    if (!trophyOpen) return;
    const h = (e) => { if (trophyRef.current && !trophyRef.current.contains(e.target)) setTrophyOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [trophyOpen]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [profSnap, eventScores, targetScores, allEvents, badges, roundLineups, evIds] = await Promise.all([
        getDoc(doc(db, 'users', targetUid)),
        getScoresByEvent(eventId),     // todos os usuários do evento atual → rank
        getScoresByUid(targetUid),     // todos os eventos do alvo → aba de eventos
        getEvents(),
        getUserBadges(targetUid),
        eventId ? getRoundLineupsByUser(targetUid, eventId) : Promise.resolve([]),
        getUserEventIds(targetUid),    // eventos em que participa (mesmo sem pontuar)
      ]);
      setProfile(profSnap.exists() ? { uid: targetUid, ...profSnap.data() } : null);
      // Une os dois conjuntos sem duplicar (mesmo doc id)
      const merged = [...eventScores];
      const seen = new Set(eventScores.map((s) => s.id));
      targetScores.forEach((s) => { if (!seen.has(s.id)) merged.push(s); });
      setScores(merged);
      setEvents(allEvents);
      setUserEventIds(evIds);
      setUserBadges(badges);
      // Conta quantas vezes cada jogador foi escalado nas rodadas passadas
      if (roundLineups.length && eventId) {
        const cnt = {};
        roundLineups.forEach((lu) => {
          (lu.playerIds || []).forEach((pid) => { cnt[pid] = (cnt[pid] || 0) + 1; });
        });
        const sorted = Object.entries(cnt).sort(([, a], [, b]) => b - a).slice(0, 10);
        setTopPlayers(sorted.map(([pid, count]) => ({ pid, count })));
        const [allPlayers, allTeams] = await Promise.all([
          getPlayersByEvent(eventId),
          getTeamsByEvent(eventId),
        ]);
        const pMap = {}; allPlayers.forEach((p) => { pMap[p.id] = p; });
        const tMap = {}; allTeams.forEach((t) => { tMap[t.id] = t; });
        const resolved = {};
        sorted.forEach(([pid]) => { resolved[pid] = { player: pMap[pid], team: tMap[pMap[pid]?.teamId] }; });
        setTopPlayerMap(resolved);
      }
      if (user && !isMe) {
        const friendSnap = await getDoc(doc(db, 'users', user.uid, 'friends', targetUid));
        setIsFriend(friendSnap.exists());
      }
      setLoading(false);
    })();
  }, [targetUid, user, eventId]);

  useEffect(() => {
    if (tab !== 'lineups' || !eventId) return;
    setLineupLoading(true);
    Promise.all([
      getUserTeamsByUid(targetUid, eventId),
      getMatchesByEvent(eventId),
      getTeamsByEvent(eventId),
      getRoundLineupsByUser(targetUid, eventId),
      getLineupStats(eventId),
    ]).then(async ([userTeams, mts, natTeams, snaps, lstats]) => {
      setLineupTeams(userTeams);
      setLineupSnaps(snaps);
      setSnapRounds(new Set(lstats?.snapRounds || []));
      setLineupMatches(mts);
      const tMap = {};
      natTeams.forEach((t) => { tMap[t.id] = t; });
      setLineupTeamMap(tMap);
      // Carrega jogadores para cada esporte do usuário (inclui pool padrão)
      const sports = [...new Set(userTeams.map((t) => t.sport).filter(Boolean))];
      const lists  = await Promise.all(sports.map((s) => getPlayersBySport(s, eventId)));
      const pMap   = {};
      lists.flat().forEach((p) => { pMap[p.id] = p; });
      setLineupPlayers(pMap);
      setLineupLoading(false);
    }).catch(() => setLineupLoading(false));
  }, [tab, targetUid, eventId]);

  // Aba Palpites: carrega sob demanda (predições do alvo + partidas, ambos cacheados)
  useEffect(() => {
    if (tab !== 'palpites' || !eventId || predsLoaded) return;
    setPredLoading(true);
    Promise.all([
      getUserPredictions(targetUid),
      getMatchesByEvent(eventId),
      getEventPrediction(targetUid, eventId),
      getTeamsByEvent(eventId),
      getPlayersBySport('futebol', eventId).catch(() => []),
    ]).then(([preds, mts, ev, tms, pls]) => {
      setPredsList(preds);
      setPredMatches(mts);
      setEvPred(ev);
      setEvPredTeams(tms || []);
      setEvPredPlayers(pls || []);
      setPredsLoaded(true);
      setPredLoading(false);
    }).catch(() => setPredLoading(false));
  }, [tab, targetUid, eventId, predsLoaded]);

  // Reinicia ao trocar de usuário/evento
  useEffect(() => { setPredsLoaded(false); }, [targetUid, eventId]);

  // Só palpites de partidas já TRAVADAS (1h antes) — transparência sem vazar
  // palpites de jogos ainda abertos. Ordenado por data.
  const predictionRows = useMemo(() => {
    const matchMap = {};
    predMatches.forEach((m) => { matchMap[m.id] = m; });
    return predsList
      .map((p) => ({ pred: p, match: matchMap[p.matchId] }))
      .filter((r) => r.match && isPredictionLocked(r.match))
      .sort((a, b) => (a.match.date ?? 0) - (b.match.date ?? 0));
  }, [predsList, predMatches]);

  // Evento atual (para resultado real do campeonato — champResult flat)
  const currentEvent = useMemo(() => events.find((e) => e.id === eventId) || null, [events, eventId]);

  // Linhas do palpite antecipado: campo, rótulo, id palpitado, id real, pts se acertou.
  const evPredRows = useMemo(() => {
    if (!evPred || !currentEvent || currentEvent.genderMode) return [];
    const teamName = (id) => evPredTeams.find((t) => t.id === id)?.name || null;
    const playerName = (id) => evPredPlayers.find((p) => p.id === id)?.name || null;
    const real = currentEvent.champResult || null;
    const defs = [
      { key: 'champion',    label: '🥇 Campeão',      icon: '🥇', pts: EVENT_PREDICTION_POINTS.champion,    name: teamName },
      { key: 'runnerUp',    label: '🥈 Vice-campeão', icon: '🥈', pts: EVENT_PREDICTION_POINTS.runnerUp,    name: teamName },
      { key: 'thirdPlace',  label: '🥉 3º lugar',     icon: '🥉', pts: EVENT_PREDICTION_POINTS.thirdPlace,  name: teamName },
      { key: 'fourthPlace', label: '4º lugar',        icon: '4️⃣', pts: EVENT_PREDICTION_POINTS.fourthPlace, name: teamName },
      { key: 'topScorer',   label: '⚽ Artilheiro',   icon: '⚽', pts: EVENT_PREDICTION_POINTS.topScorer,   name: playerName },
    ];
    return defs
      .filter((d) => evPred[d.key])
      .map((d) => {
        const guessedId = evPred[d.key];
        const realId    = real ? real[d.key] : null;
        const decided   = !!realId;
        const hit       = decided && guessedId === realId;
        return { ...d, guessedName: d.name(guessedId) || '?', hit, decided };
      });
  }, [evPred, currentEvent, evPredTeams, evPredPlayers]);

  const evPredTotal = useMemo(() => {
    if (!evPred || !currentEvent?.champResult) return null;
    return eventPredictionPoints(evPred, currentEvent.champResult);
  }, [evPred, currentEvent]);

  // Rodadas onde TODAS as partidas estão finalizadas (liberado para ver adversário)
  const completeRounds = useMemo(() => {
    const byRound = {};
    lineupMatches.forEach((m) => {
      const key = m.rodada != null ? String(m.rodada) : (m.phase || 'Sem rodada');
      if (!byRound[key]) byRound[key] = { total: 0, finished: 0 };
      byRound[key].total++;
      if (m.status === 'finished') byRound[key].finished++;
    });
    return new Set(
      Object.entries(byRound)
        .filter(([, v]) => v.total > 0 && v.total === v.finished)
        .map(([k]) => k)
    );
  }, [lineupMatches]);

  // Snapshots por (esporte + rodada) — escalação REAL daquela rodada (auditoria)
  const lineupSnapMap = useMemo(() => {
    const m = {};
    lineupSnaps.forEach((s) => { m[`${s.sport}::${s.rodada}`] = s; });
    return m;
  }, [lineupSnaps]);

  // Agrupa apenas partidas finalizadas por rodada (para calcular pontos)
  const matchesByRound = useMemo(() => {
    const map = {};
    lineupMatches.filter((m) => m.status === 'finished').forEach((m) => {
      const key = m.rodada != null ? String(m.rodada) : (m.phase || 'Sem rodada');
      if (!map[key]) map[key] = [];
      map[key].push(m);
    });
    return map;
  }, [lineupMatches]);

  // Prioriza score do evento atual; fallback para qualquer evento
  // Score do usuário NESTE evento (sem fallback cross-evento, senão vaza
  // pontuação de outro evento — ex.: basquete de outro torneio na Copa).
  const targetScore = useMemo(
    () => scores.find((s) => s.uid === targetUid && (s.eventId || 'default') === eventId) || null,
    [scores, targetUid, eventId]
  );
  // Rank somente dentro do evento atual para ser comparável
  const rank = useMemo(() => {
    const eventScores = eventId
      ? scores.filter((s) => (s.eventId || 'default') === eventId)
      : scores;
    const sorted = [...eventScores].sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
    const idx = sorted.findIndex((s) => s.uid === targetUid);
    return idx >= 0 ? idx + 1 : null;
  }, [scores, targetUid, eventId]);
  const sportBreakdown = useMemo(() => {
    if (!targetScore?.bySport) return [];
    return Object.entries(targetScore.bySport)
      .map(([sport, data]) => ({ sport, ...data }))
      .filter((x) => x.total !== 0)
      .sort((a, b) => b.total - a.total);
  }, [targetScore]);

  const openNameEdit = () => {
    setNameInput(profile?.displayName || '');
    setNameErr('');
    setEditingName(true);
  };
  const saveName = async () => {
    setNameErr(''); setNameBusy(true);
    try {
      const clean = await updateDisplayName(nameInput);
      setProfile((p) => ({ ...p, displayName: clean, nameChanged: true }));
      await refreshProfile();
      setEditingName(false);
    } catch (err) {
      setNameErr(err.message || 'Erro ao salvar o nome.');
    } finally {
      setNameBusy(false);
    }
  };

  const toggleFriend = async () => {
    if (!user || isMe) return;
    setFriendBusy(true);
    const myFriendRef     = doc(db, 'users', user.uid,  'friends',        targetUid);
    const theirRequestRef = doc(db, 'users', targetUid, 'friendRequests', user.uid);
    try {
      if (isFriend) {
        await Promise.all([deleteDoc(myFriendRef), deleteDoc(theirRequestRef)]);
        setIsFriend(false);
      } else {
        await Promise.all([
          setDoc(myFriendRef, { uid: targetUid, addedAt: Date.now(), displayName: profile?.displayName || '' }),
          setDoc(theirRequestRef, { fromUid: user.uid, displayName: myProfile?.displayName || '', sentAt: Date.now() }),
        ]);
        setIsFriend(true);
      }
    } finally { setFriendBusy(false); }
  };

  if (loading) return <div className="loading">Carregando perfil…</div>;
  if (!profile) return (
    <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
      <p className="muted">Usuário não encontrado.</p>
      <button onClick={() => navigate(-1)} className="btn-secondary" style={{ marginTop: '1rem' }}>Voltar</button>
    </div>
  );

  const displayName = profile.displayName || 'Jogador';
  const initials    = displayName.slice(0, 2).toUpperCase();

  return (
    <>
      {/* Header */}
      <div className="profile-header">
        <button className="btn-secondary profile-back" onClick={() => navigate(-1)}>← Voltar</button>
        <div className="profile-hero">
          <div className="profile-avatar">{initials}</div>
          <div className="profile-hero-info">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', position: 'relative' }}>
              {editingName ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', width: '100%', maxWidth: 320 }}>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <input
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      maxLength={20}
                      autoFocus
                      placeholder="Seu nome de exibição"
                      style={{ flex: 1, minWidth: 0 }}
                    />
                    <button onClick={saveName} disabled={nameBusy} style={{ flexShrink: 0 }}>
                      {nameBusy ? '…' : 'Salvar'}
                    </button>
                    <button className="btn-secondary" onClick={() => setEditingName(false)} disabled={nameBusy} style={{ flexShrink: 0 }}>
                      Cancelar
                    </button>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#fbbf24' }}>
                    ⚠️ Você só pode alterar seu nome <strong>uma vez</strong>. Escolha com cuidado.
                  </span>
                  {nameErr && <span style={{ fontSize: '0.72rem', color: '#ef4444' }}>{nameErr}</span>}
                </div>
              ) : (
                <h1 className="profile-name" style={{ margin: 0 }}>
                  {displayName}
                  {isMe && <span className="profile-you-badge">você</span>}
                  {isMe && profile?.provider === 'google' && !profile?.nameChanged && (
                    <button
                      onClick={openNameEdit}
                      title="Editar nome (1 vez)"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', marginLeft: '0.4rem', opacity: 0.7 }}
                    >
                      ✏️
                    </button>
                  )}
                </h1>
              )}
              {(() => {
                const earnedEntries = Object.entries(userBadges).filter(([id]) => id !== '_new' && BADGES[id]);
                if (earnedEntries.length === 0) return null;
                return (
                  <div ref={trophyRef} style={{ position: 'relative' }}>
                    <button
                      onClick={() => setTrophyOpen(v => !v)}
                      title={`${earnedEntries.length} conquista${earnedEntries.length !== 1 ? 's' : ''}`}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: '0.15rem 0.3rem',
                        borderRadius: 6, display: 'flex', alignItems: 'center', gap: '0.2rem',
                        opacity: trophyOpen ? 1 : 0.35,
                        transition: 'opacity 0.15s',
                        fontSize: '0.78rem', color: '#fbbf24', fontWeight: 700,
                      }}
                      onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                      onMouseLeave={e => { if (!trophyOpen) e.currentTarget.style.opacity = '0.35'; }}
                    >
                      🏆 <span style={{ color: 'var(--fg)' }}>{earnedEntries.length}</span>
                    </button>

                    {trophyOpen && (
                      <div style={{
                        position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 200,
                        background: 'var(--card-bg)', border: '1px solid var(--border)',
                        borderRadius: 12, padding: '0.6rem 0.7rem',
                        display: 'flex', flexWrap: 'wrap', gap: '0.35rem',
                        maxWidth: 280, boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
                        minWidth: 180,
                      }}>
                        <div style={{ width: '100%', fontSize: '0.68rem', color: 'var(--muted)', marginBottom: '0.3rem', fontWeight: 600 }}>
                          🏆 {earnedEntries.length} / {Object.keys(BADGES).length} conquistas
                        </div>
                        {earnedEntries
                          .sort(([, a], [, b]) => {
                            const order = { legendary: 0, epic: 1, rare: 2, common: 3 };
                            return (order[BADGES[a] ?.rarity] ?? 9) - (order[BADGES[b]?.rarity] ?? 9);
                          })
                          .map(([id, data]) => {
                            const def    = BADGES[id];
                            const rarity = RARITY[def?.rarity];
                            return (
                              <span
                                key={id}
                                title={`${def?.name}\n${def?.desc}\n${rarity?.label}${data.count > 1 ? ` · ${data.count}×` : ''}`}
                                style={{
                                  fontSize: '1.4rem', lineHeight: 1, cursor: 'default',
                                  filter: `drop-shadow(0 0 4px ${rarity?.border || 'transparent'})`,
                                }}
                              >
                                {def?.icon}
                              </span>
                            );
                          })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
            {rank && <div className="profile-rank-badge">#{rank} no ranking geral</div>}
          </div>
          {!isMe && (
            <button
              className={isFriend ? 'btn-secondary' : 'btn'}
              style={{ marginLeft: 'auto', alignSelf: 'center' }}
              onClick={toggleFriend} disabled={friendBusy}
            >
              {friendBusy ? '…' : isFriend ? '✓ Amigo' : '+ Adicionar amigo'}
            </button>
          )}
        </div>
      </div>

      {/* Score summary */}
      <div className="profile-score-grid">
        <div className="profile-score-card">
          <div className="profile-score-val">{targetScore?.total ?? 0}</div>
          <div className="profile-score-lbl">Pontos totais</div>
        </div>
        <div className="profile-score-card">
          <div className="profile-score-val">{targetScore?.fantasyTotal ?? 0}</div>
          <div className="profile-score-lbl">🏅 Fantasy</div>
        </div>
        <div className="profile-score-card">
          <div className="profile-score-val">{targetScore?.predictionTotal ?? 0}</div>
          <div className="profile-score-lbl">🔮 Palpites</div>
        </div>
        <div className="profile-score-card">
          <div className="profile-score-val">{rank ? `#${rank}` : '—'}</div>
          <div className="profile-score-lbl">Posição</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs mb-2">
        <button className={`tab ${tab === 'stats' ? 'active' : ''}`} onClick={() => setTab('stats')}>
          📊 Estatísticas
        </button>
        <button className={`tab ${tab === 'lineups' ? 'active' : ''}`} onClick={() => setTab('lineups')}>
          📋 Escalações
        </button>
        <button className={`tab ${tab === 'palpites' ? 'active' : ''}`} onClick={() => setTab('palpites')}>
          🔮 Palpites
        </button>
        <button className={`tab ${tab === 'badges' ? 'active' : ''}`} onClick={() => setTab('badges')}>
          🏅 Conquistas
          {Object.keys(userBadges).length > 0 && (
            <span style={{ marginLeft: '0.3rem', fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 700 }}>
              {Object.keys(userBadges).length}
            </span>
          )}
        </button>
      </div>

      {/* ── ESTATÍSTICAS ── */}
      {tab === 'stats' && (
        <>
          {sportBreakdown.length > 0 && (
            <div className="dash-section">
              <div className="dash-section-header"><h2>📊 Por modalidade</h2></div>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.9rem' }}>
                <thead>
                  <tr>
                    {['Modalidade','Fantasy','Palpites','Total'].map((h) => (
                      <th key={h} style={{ textAlign: h === 'Modalidade' ? 'left' : 'right', padding:'0.4rem 0.5rem', color:'var(--muted)', fontSize:'0.75rem', textTransform:'uppercase', borderBottom:'1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sportBreakdown.map(({ sport, fantasy, prediction, total }) => (
                    <tr key={sport}>
                      <td style={{ padding:'0.5rem', borderBottom:'1px solid var(--border)' }}>{SPORT_LABELS[sport] || sport}</td>
                      <td style={{ textAlign:'right', padding:'0.5rem', color:'var(--muted)', borderBottom:'1px solid var(--border)' }}>{fantasy}</td>
                      <td style={{ textAlign:'right', padding:'0.5rem', color:'var(--muted)', borderBottom:'1px solid var(--border)' }}>{prediction}</td>
                      <td style={{ textAlign:'right', padding:'0.5rem', fontWeight:700, color: total >= 0 ? 'var(--primary)' : '#ef4444', borderBottom:'1px solid var(--border)' }}>
                        {total > 0 ? '+' : ''}{total}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {topPlayers.length > 0 && (
            <div className="dash-section">
              <div className="dash-section-header">
                <h2>⭐ Mais escalados no campeonato</h2>
                <span className="muted" style={{ fontSize:'0.72rem' }}>{topPlayers.length} jogadores</span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:'0.25rem' }}>
                {topPlayers.map(({ pid, count }, i) => {
                  const { player, team } = topPlayerMap[pid] || {};
                  const medals = ['🥇','🥈','🥉'];
                  return (
                    <div key={pid} style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.35rem 0', borderBottom:'1px solid var(--border)' }}>
                      <span style={{ minWidth:22, fontSize:'0.82rem', textAlign:'center' }}>{medals[i] || `${i+1}º`}</span>
                      {team?.shieldEmoji && <ShieldEmoji emoji={team.shieldEmoji} size="1.1rem" />}
                      <div style={{ flex:1, minWidth:0 }}>
                        {player ? (
                          <span style={{ cursor:'pointer', color:'var(--primary)', fontWeight:600, fontSize:'0.85rem' }}
                            onClick={() => navigate(`/jogador/${pid}`)}>
                            {player.name}
                          </span>
                        ) : <span className="muted" style={{ fontSize:'0.8rem' }}>{pid}</span>}
                        {player && (
                          <div className="muted" style={{ fontSize:'0.68rem' }}>
                            {team?.name && <>{team.name} · </>}
                            {POSITION_LABELS[player.position] || player.position}
                          </div>
                        )}
                      </div>
                      <span style={{ fontWeight:800, color:'var(--accent)', fontSize:'0.85rem', flexShrink:0 }}>{count}×</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="dash-section">
            <div className="dash-section-header"><h2>🏟️ Eventos</h2></div>
            {(() => {
              // Participa do evento (tem time/é participante) OU já pontuou nele.
              const participated = events.filter((ev) =>
                userEventIds.includes(ev.id)
                || scores.some((s) => s.uid === targetUid && (s.eventId || 'default') === ev.id)
              );
              return participated.length === 0
                ? <p className="muted">Nenhum evento registrado.</p>
                : (
                  <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem' }}>
                    {participated.map((ev) => {
                      const evScore = scores.find((s) => s.uid === targetUid && (s.eventId || 'default') === ev.id);
                      return (
                        <div key={ev.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0.6rem 0', borderBottom:'1px solid var(--border)' }}>
                          <span style={{ fontWeight:600 }}>{ev.name}</span>
                          <span style={{ color:'var(--primary)', fontWeight:700 }}>{evScore?.total ?? 0} pts</span>
                        </div>
                      );
                    })}
                  </div>
                );
            })()}
          </div>
        </>
      )}

      {/* ── ESCALAÇÕES POR RODADA ── */}
      {tab === 'lineups' && (
        lineupLoading
          ? <p className="muted" style={{ padding:'2rem', textAlign:'center' }}>Carregando…</p>
          : lineupTeams.length === 0
          ? <div className="card"><p className="muted">Nenhum time escalado neste evento.</p></div>
          : (
            <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
              {lineupTeams.map((team) => {
                const playerIds = team.playerIds || [];
                const captainId = team.captainId || null;
                const rounds    = Object.keys(matchesByRound);

                // Última rodada deste esporte (jogo de maior data) + se a rodada tem
                // snapshot GLOBAL — MESMO sinal do motor de pontuação (lineup_stats).
                const globalHasSnap = (rk) => snapRounds.has(`${team.sport}::${rk}`);
                let latestRk = null, _bestD = -1;
                lineupMatches.filter((m) => m.sport === team.sport).forEach((m) => {
                  const rk = m.rodada != null ? String(m.rodada) : (m.phase || '');
                  const d = m.date || 0;
                  if (rk && d > _bestD) { _bestD = d; latestRk = rk; }
                });

                // Escalação de cada rodada: snapshot real (round_lineups) se houver.
                // Sem snapshot do usuário: cai no time atual SÓ na última rodada (ainda
                // não capturada) ou se a rodada NÃO tem snapshot global (legado/fallback).
                // Rodada passada já snapshotada sem a dele → não escalou → null.
                const lineupFor = (roundKey) => {
                  const snap = lineupSnapMap[`${team.sport}::${roundKey}`];
                  if (snap?.playerIds?.length)
                    return { ids: snap.playerIds, cap: snap.captainId ?? null, bench: snap.bench || {}, positions: snap.playerPositions || [], fromSnap: true };
                  if (globalHasSnap(roundKey) && roundKey !== latestRk) return null;
                  return { ids: playerIds, cap: captainId, bench: team.bench || {}, positions: team.playerPositions || [], fromSnap: false };
                };

                // Mostra a rodada se há escalação válida E ela pontuou (ou tem snapshot).
                const activeRounds = rounds.filter((r) => {
                  const lf = lineupFor(r);
                  if (!lf) return false;
                  if (lf.fromSnap) return true;
                  return (matchesByRound[r] || []).some((m) =>
                    (m.playerStats || []).some((st) => lf.ids.includes(st.playerId)));
                });

                if (activeRounds.length === 0 && lineupMatches.length > 0 && !isMe) return null;

                const POS_ORDER = ['GK','LAT','ZAG','MCM','ATA','FIX','ALA','PIV','PG','SG','SF','SET','OPP','OH1','OH2','MB1','MB2'];
                const sortedIds = [...playerIds].sort((a, b) => {
                  const pa = lineupPlayers[a]?.position || '';
                  const pb = lineupPlayers[b]?.position || '';
                  return POS_ORDER.indexOf(pa) - POS_ORDER.indexOf(pb);
                });

                return (
                  <div key={team.id}>
                    <h3 style={{ fontSize:'0.85rem', color:'var(--muted)', marginBottom:'0.4rem', textTransform:'uppercase', letterSpacing:'0.05em' }}>
                      {SPORT_LABELS[team.sport] || team.sport}
                    </h3>

                    {/* Se há rodadas com resultados, mostra por rodada */}
                    {activeRounds.length > 0 ? activeRounds.map((roundKey) => {
                      const { ids: rIds, cap: rCap, bench: rBench, positions: rPos, fromSnap } = lineupFor(roundKey);
                      const roundMatches = matchesByRound[roundKey] || [];
                      // Detalhamento (MESMA regra do motor): pts por jogador, reservas
                      // que entraram no lugar dos zerados e bônus de time.
                      const detail = roundFantasyDetail(
                        roundMatches,
                        { playerIds: rIds, captainId: rCap, bench: rBench, playerPositions: rPos },
                        team.sport,
                      );
                      const ptsByStarter = {};   // titular -> pts
                      const subByStarter = {};   // titular zerado -> { pid: reserva, pts }
                      detail.entries.forEach((e) => {
                        if (e.role === 'starter') ptsByStarter[e.playerId] = e.pts;
                        else if (e.role === 'starter-out') ptsByStarter[e.playerId] = 0;
                        else if (e.role === 'reserve-in') subByStarter[e.replaces] = { pid: e.playerId, pts: e.pts };
                      });
                      const rSortedIds = [...rIds].sort((a, b) => {
                        const pa = lineupPlayers[a]?.position || '';
                        const pb = lineupPlayers[b]?.position || '';
                        return POS_ORDER.indexOf(pa) - POS_ORDER.indexOf(pb);
                      });
                      const totalPts = detail.total;

                      return (
                        <div key={roundKey} className="card" style={{ padding:'0.8rem', marginBottom:'0.5rem' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.5rem' }}>
                            <strong style={{ fontSize:'0.88rem' }}>
                              {roundLabel(roundKey)}
                              {fromSnap && <span title="Escalação registrada nesta rodada (snapshot)" style={{ marginLeft:'0.3rem', fontSize:'0.62rem' }}>📸</span>}
                            </strong>
                            <span style={{ fontWeight:800, color:'var(--primary)' }}>
                              {Math.round(totalPts * 10) / 10} pts
                            </span>
                          </div>
                          <div style={{ display:'flex', flexDirection:'column', gap:'0.2rem' }}>
                            {rSortedIds.flatMap((pid) => {
                              const p = lineupPlayers[pid];
                              if (!p) return [];
                              const isCap  = pid === rCap;
                              const sub    = subByStarter[pid];   // reserva que entrou no lugar (se zerou)
                              const pts    = ptsByStarter[pid] ?? 0;
                              const shield = lineupTeamMap[p.teamId]?.shieldEmoji;
                              const c      = POS_COLOR[p.position] || 'var(--muted)';
                              const rows = [
                                <div key={pid} style={{ display:'flex', alignItems:'center', gap:'0.4rem', padding:'0.2rem 0', borderBottom:'1px solid rgba(255,255,255,0.04)', opacity: sub ? 0.5 : 1 }}>
                                  <span style={{ fontSize:'0.58rem', fontWeight:800, color:c, border:`1px solid ${c}`, borderRadius:4, padding:'0.04rem 0.28rem', flexShrink:0, minWidth:'2rem', textAlign:'center', letterSpacing:'0.02em' }}>
                                    {p.position || '—'}
                                  </span>
                                  {shield && <ShieldEmoji emoji={shield} size="1rem" />}
                                  <span style={{ flex:1, fontSize:'0.82rem', fontWeight: isCap ? 700 : 400, textDecoration: sub ? 'line-through' : 'none' }}>{p.name}</span>
                                  {isCap && <span style={{ background:'#fbbf24', color:'#000', borderRadius:3, padding:'0 3px', fontSize:'0.6rem', fontWeight:800, flexShrink:0 }}>C</span>}
                                  {sub && <span title="Zerou — substituído pelo reserva" style={{ fontSize:'0.6rem', color:'var(--muted)', flexShrink:0 }}>↓ saiu</span>}
                                  <span style={{ fontWeight:700, fontSize:'0.8rem', color: pts >= 0 ? 'var(--primary)' : '#ef4444', minWidth:42, textAlign:'right' }}>
                                    {pts > 0 ? '+' : ''}{Math.round(pts * 10) / 10}
                                  </span>
                                </div>,
                              ];
                              if (sub) {
                                const rp = lineupPlayers[sub.pid];
                                if (rp) {
                                  const rc      = POS_COLOR[rp.position] || 'var(--muted)';
                                  const rshield = lineupTeamMap[rp.teamId]?.shieldEmoji;
                                  rows.push(
                                    <div key={`${pid}-res`} style={{ display:'flex', alignItems:'center', gap:'0.4rem', padding:'0.2rem 0 0.2rem 0.7rem', borderBottom:'1px solid rgba(255,255,255,0.04)', background:'rgba(34,197,94,0.06)' }}>
                                      <span style={{ fontSize:'0.7rem', flexShrink:0 }}>🔄</span>
                                      <span style={{ fontSize:'0.58rem', fontWeight:800, color:rc, border:`1px solid ${rc}`, borderRadius:4, padding:'0.04rem 0.28rem', flexShrink:0, minWidth:'2rem', textAlign:'center', letterSpacing:'0.02em' }}>
                                        {rp.position || '—'}
                                      </span>
                                      {rshield && <ShieldEmoji emoji={rshield} size="1rem" />}
                                      <span style={{ flex:1, fontSize:'0.8rem' }}>{rp.name} <span style={{ fontSize:'0.6rem', color:'var(--muted)' }}>(reserva)</span></span>
                                      <span style={{ fontWeight:700, fontSize:'0.8rem', color: sub.pts >= 0 ? 'var(--primary)' : '#ef4444', minWidth:42, textAlign:'right' }}>
                                        {sub.pts > 0 ? '+' : ''}{Math.round(sub.pts * 10) / 10}
                                      </span>
                                    </div>,
                                  );
                                }
                              }
                              return rows;
                            })}
                            {detail.bonus !== 0 && (
                              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.2rem 0', fontSize:'0.78rem', color:'var(--muted)' }}>
                                <span>🛡️ Bônus de time</span>
                                <span style={{ fontWeight:700, color: detail.bonus >= 0 ? 'var(--primary)' : '#ef4444', minWidth:42, textAlign:'right' }}>
                                  {detail.bonus > 0 ? '+' : ''}{Math.round(detail.bonus * 10) / 10}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }) : (
                      /* Sem rodadas concluídas ainda */
                      <div className="card" style={{ padding:'0.8rem' }}>
                        <p className="muted" style={{ fontSize:'0.78rem', marginBottom:'0.5rem' }}>
                          {isMe ? 'Time escalado — aguardando resultados' : '🔒 Disponível após a conclusão da rodada'}
                        </p>
                        {isMe && (
                          <div style={{ display:'flex', flexDirection:'column', gap:'0.15rem' }}>
                            {sortedIds.map((pid) => {
                              const p      = lineupPlayers[pid];
                              if (!p) return null;
                              const isCap  = pid === captainId;
                              const shield = lineupTeamMap[p.teamId]?.shieldEmoji;
                              return (
                                <div key={pid} style={{ display:'flex', alignItems:'center', gap:'0.4rem', fontSize:'0.82rem', padding:'0.15rem 0' }}>
                                  {(() => { const c = POS_COLOR[p.position] || 'var(--muted)'; return (
                                    <span style={{ fontSize:'0.58rem', fontWeight:800, color:c, border:`1px solid ${c}`, borderRadius:4, padding:'0.04rem 0.28rem', flexShrink:0, minWidth:'2rem', textAlign:'center', letterSpacing:'0.02em' }}>
                                      {p.position || '—'}
                                    </span>
                                  ); })()}
                                  {shield && <ShieldEmoji emoji={shield} size="1rem" />}
                                  <span style={{ flex:1 }}>{p.name}</span>
                                  {isCap && <span style={{ background:'#fbbf24', color:'#000', borderRadius:3, padding:'0 3px', fontSize:'0.6rem', fontWeight:800 }}>C</span>}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
      )}

      {/* ── PALPITES (auditoria) ── */}
      {tab === 'palpites' && (
        predLoading ? (
          <div className="card"><p className="muted">Carregando palpites…</p></div>
        ) : (
        <>
          {evPredRows.length > 0 && (
            <div className="card" style={{ padding: '1rem', marginBottom: '0.75rem' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
                <h3 style={{ fontSize:'0.9rem', margin:0 }}>🏆 Palpite antecipado</h3>
                {evPredTotal != null && (
                  <strong style={{ color:'var(--primary)', fontSize:'0.85rem' }}>+{evPredTotal} pts</strong>
                )}
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:'0.35rem' }}>
                {evPredRows.map((r) => (
                  <div key={r.key} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'var(--bg)', borderRadius:8, padding:'0.45rem 0.7rem', fontSize:'0.82rem' }}>
                    <span className="muted">{r.label}</span>
                    <span style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}>
                      <span>{r.guessedName}</span>
                      {!r.decided ? (
                        <span style={{ color:'#d97706' }}>🔒 aguardando</span>
                      ) : r.hit ? (
                        <strong style={{ color:'#22c55e' }}>✓ +{r.pts}</strong>
                      ) : (
                        <span className="muted">✗</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {predictionRows.length === 0 ? (
          <div className="card"><p className="muted">Nenhum palpite travado para exibir. Os palpites aparecem aqui assim que cada partida fecha (1h antes do início).</p></div>
        ) : (
          <div className="card" style={{ padding: '1rem' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
              <h3 style={{ fontSize:'0.9rem', margin:0 }}>🔮 Palpites travados</h3>
              <span className="muted" style={{ fontSize:'0.7rem' }}>🔒 visível após o fechamento</span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem' }}>
              {predictionRows.map(({ pred, match }) => {
                const finished = match.status === 'finished';
                const pts   = finished ? predictionPoints(pred, match) : null;
                const exact = finished && isExactPrediction(pred, match);
                return (
                  <div key={match.id} style={{ background:'var(--bg)', borderRadius:8, padding:'0.5rem 0.7rem' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', fontSize:'0.85rem' }}>
                      {match.homeShieldEmoji && <ShieldEmoji emoji={match.homeShieldEmoji} size="1rem" />}
                      <span style={{ flex:1, textAlign:'right', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{match.homeTeamName}</span>
                      <strong style={{ color:'var(--primary)', whiteSpace:'nowrap' }}>{pred.homeScore} × {pred.awayScore}</strong>
                      <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{match.awayTeamName}</span>
                      {match.awayShieldEmoji && <ShieldEmoji emoji={match.awayShieldEmoji} size="1rem" />}
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'0.25rem', fontSize:'0.72rem' }}>
                      <span className="muted">{match.date ? new Date(match.date).toLocaleString('pt-BR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '—'}</span>
                      {finished ? (
                        <span>
                          <span className="muted">Resultado {match.homeScore} × {match.awayScore} · </span>
                          <strong style={{ color: pts > 0 ? 'var(--primary)' : 'var(--muted)' }}>+{pts} pts</strong>
                          {exact && <span style={{ color:'#22c55e', marginLeft:'0.3rem' }}>✓ exato</span>}
                        </span>
                      ) : (
                        <span style={{ color:'#d97706' }}>🔒 aguardando o jogo</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          )}
        </>
        )
      )}

      {/* ── CONQUISTAS ── */}
      {tab === 'badges' && (
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.9rem', margin: 0 }}>🏅 Conquistas</h3>
            <span className="muted" style={{ fontSize: '0.75rem' }}>
              {Object.keys(userBadges).length} / {Object.keys(BADGES).length} desbloqueadas
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '0.6rem' }}>
            {Object.entries(BADGES).map(([id, def]) => {
              const earned = userBadges[id];
              const rarity = RARITY[def.rarity];
              return (
                <div key={id}
                  onClick={() => setActiveBadgeId(prev => prev === id ? null : id)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem',
                    padding: '0.7rem 0.4rem', borderRadius: 12, textAlign: 'center', cursor: 'pointer',
                    background: earned ? `${rarity.border}12` : 'transparent',
                    border: `2px solid ${earned ? rarity.border : 'rgba(255,255,255,0.08)'}`,
                    boxShadow: earned ? `0 0 14px ${rarity.glow}, inset 0 0 8px ${rarity.border}18` : 'none',
                    transition: 'all 0.2s', position: 'relative',
                    outline: activeBadgeId === id ? `2px solid ${rarity.border}` : 'none',
                    outlineOffset: 2,
                  }}>
                  <span style={{ fontSize: '2rem', lineHeight: 1, filter: earned ? 'none' : 'grayscale(1) brightness(0.35)' }}>
                    {def.icon}
                  </span>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, lineHeight: 1.2, color: earned ? rarity.text : 'rgba(255,255,255,0.18)' }}>
                    {def.name}
                  </span>
                  {earned ? (
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, marginTop: 1, background: rarity.border + '22', color: rarity.text, border: `1px solid ${rarity.border}55`, borderRadius: 99, padding: '0.08rem 0.4rem' }}>
                      {earned.count}× · {rarity.label}
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.12)' }}>{rarity.label}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tooltip de conquista (clique / tap) */}
      {activeBadgeId && (() => {
        const def    = BADGES[activeBadgeId];
        const earned = userBadges[activeBadgeId];
        const rarity = RARITY[def?.rarity];
        return (
          <div className="badge-tap-tooltip" onClick={() => setActiveBadgeId(null)}
            style={{ borderTopColor: rarity?.border || 'var(--border)' }}>
            <span style={{ fontSize: '2rem', flexShrink: 0 }}>{def?.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: rarity?.text }}>{def?.name}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.15rem' }}>{def?.desc}</div>
              {earned
                ? <div style={{ fontSize: '0.7rem', color: rarity?.text, marginTop: '0.2rem' }}>{rarity?.label} · {earned.count}×</div>
                : <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '0.2rem' }}>🔒 Ainda não conquistada</div>
              }
            </div>
            <span style={{ flexShrink: 0, fontSize: '1rem', color: 'var(--muted)' }}>✕</span>
          </div>
        );
      })()}
    </>
  );
}
