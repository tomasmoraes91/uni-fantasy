import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEvent } from '../context/EventContext';
import { useLeague } from '../context/LeagueContext';
import { useScore } from '../context/ScoreContext';
import {
  getMatchesByEvent,
  getPlayers, getTeamsByEvent, countryFlag,
  getUserLeagues, getMarketConfig,
  getAllRoundLineupsByEvent, getLineupStats, getUserBadges,
  getUserTeamsByEvent,
} from '../services/firestore';
import { calcFantasyPoints } from '../utils/scoring';
import { SPORT_LABELS, fmtPts } from '../utils/labels';
import { BADGES, RARITY } from '../utils/badges';
import ShieldEmoji from '../components/ShieldEmoji';
import EventLogo from '../components/EventLogo';
import { useNotificationContext } from '../context/NotificationContext';

const SPORT_ICONS = { futsal:'⚽', basketball:'🏀', volleyball:'🏐', handball:'🤾' };

// Badges relevantes ao evento exibidos no ranking
const RANKING_BADGE_IDS = [
  'champion', 'podium', 'leader', 'onisciente', 'mestre', 'magnetico',
  'top3_scorer', 'eagle_eye', 'rodada_perfeita', 'termometro',
  'hat_trick_exact', 'vidente', 'compromissado_escalacao',
];

function TrophyBadges({ badgeData }) {
  const [open, setOpen] = useState(false);

  const earned = RANKING_BADGE_IDS
    .filter((id) => badgeData?.[id] && BADGES[id])
    .map((id) => ({ id, def: BADGES[id], data: badgeData[id] }));

  if (earned.length === 0) return null;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.08rem', flexShrink: 0 }}>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        title={`${earned.length} conquista${earned.length !== 1 ? 's' : ''}`}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: '0 0.08rem',
          fontSize: '0.63rem', fontWeight: 700, color: '#fbbf24',
          opacity: 0.35, lineHeight: 1,
        }}
      >
        🏆{earned.length}
      </button>
      {open && earned.map(({ id, def, data }) => (
        <span key={id}
          title={`${def.name}: ${def.desc}${data.count > 1 ? ` (${data.count}×)` : ''}`}
          style={{ fontSize: '0.72rem', lineHeight: 1, cursor: 'default',
            filter: `drop-shadow(0 0 2px ${RARITY[def.rarity]?.border || 'transparent'})` }}
        >
          {def.icon}
        </span>
      ))}
    </span>
  );
}

export default function Dashboard() {
  const { user, profile } = useAuth();
  const { eventId, currentEvent, allEvents } = useEvent();
  const { currentLeague, publicLeague, setCurrentLeague, toLeagueObj } = useLeague();
  const publicEvent = allEvents?.find((e) => e.id === publicLeague?.eventId) || null;
  const { myTotal, myRank, myScore: scoreCtx, allScores } = useScore();
  const { teamCount, predictionsCount, roundsCount } = useNotificationContext();
  const navigate = useNavigate();

  const [matches,   setMatches]   = useState([]);
  const [players,   setPlayers]   = useState([]);
  const [teams,     setTeams]     = useState([]);
  const [userTeams, setUserTeams] = useState([]);
  const [myLeagues, setMyLeagues] = useState([]);
  const [market,    setMarket]    = useState(null);
  const [marketLeft, setMarketLeft] = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [rankBadgeData, setRankBadgeData] = useState({});

  useEffect(() => {
    if (!currentEvent) { navigate('/'); return; }
    if (!user) return;
    (async () => {
      setLoading(true);
      try {
        const [allMatches, allPlayers, leagues, eventTeams, mkt] = await Promise.all([
          getMatchesByEvent(eventId),
          getPlayers(),
          getUserLeagues(user.uid, eventId),
          getTeamsByEvent(eventId),
          getMarketConfig(eventId),
        ]);
        setMatches(allMatches);
        setPlayers(allPlayers.filter((p) => (p.eventId || 'default') === eventId));
        setMyLeagues(leagues);
        setTeams(eventTeams);
        setMarket(mkt);
      } catch (err) {
        console.error('[Dashboard] erro ao carregar dados:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, eventId, currentEvent]);

  // Contagem regressiva para fechamento do mercado
  useEffect(() => {
    if (!market?.closeAt) return;
    const tick = () => {
      const diff = market.closeAt - Date.now();
      setMarketLeft(diff > 0 ? diff : 0);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [market]);

  const formatTimeLeft = (ms) => {
    if (ms <= 0) return 'encerrado';
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const s = Math.floor((ms % 60_000) / 1_000);
    if (h > 0) return `${h}h ${m}min`;
    if (m > 0) return `${m}min ${s}s`;
    return `${s}s`;
  };

  /* ── derived data ─────────────────────────────────────── */
  const upcoming = useMemo(
    () => matches.filter((m) => m.status !== 'finished'),
    [matches]
  );
  const finished = useMemo(
    () => matches.filter((m) => m.status === 'finished'),
    [matches]
  );

  const [rankSport, setRankSport] = useState('overall');

  // Modo do dashboard: fantasy | palpites (bolão) | geral.
  // Liga só-palpites abre em palpites; só-fantasy em fantasy; 'ambas'/pública abre em geral com toggle.
  const leagueMode = currentLeague?.leagueMode || 'ambas';
  const [dashMode, setDashMode] = useState(
    leagueMode === 'palpites' ? 'palpites' : leagueMode === 'fantasy' ? 'fantasy' : 'geral'
  );
  const showModeToggle = leagueMode === 'ambas';

  const rankForMode = (m) => m === 'palpites' ? '__prediction' : m === 'fantasy' ? '__fantasy' : 'overall';

  // Sincroniza o modo + ranking quando troca de liga
  useEffect(() => {
    const m = leagueMode === 'palpites' ? 'palpites'
            : leagueMode === 'fantasy'  ? 'fantasy'
            : 'geral';
    setDashMode(m);
    setRankSport(rankForMode(m));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLeague?.leagueId, currentLeague?.kind, leagueMode]);

  const switchMode = (m) => { setDashMode(m); setRankSport(rankForMode(m)); };
  const showFantasyWidgets = dashMode === 'fantasy' || dashMode === 'geral';

  // Scores no escopo da liga atual (membros, se privada)
  const isPrivateLeague = !!currentLeague?.memberUids;
  const leagueScores = useMemo(() => {
    const set = currentLeague?.memberUids ? new Set(currentLeague.memberUids) : null;
    return set ? allScores.filter((s) => set.has(s.uid)) : allScores;
  }, [allScores, currentLeague]);

  // Modalidades presentes nas partidas deste evento
  const sportsInEvent = useMemo(
    () => [...new Set(matches.map((m) => m.sport).filter(Boolean))],
    [matches]
  );

  // Tabs de ranking: modalidade única → Geral / Fantasy / Palpites
  const rankTabs = useMemo(() => {
    if (sportsInEvent.length <= 1) {
      return [
        { key: 'overall',       label: 'Geral' },
        { key: '__fantasy',     label: '🏅 Fantasy' },
        { key: '__prediction',  label: '🔮 Bolão' },
      ];
    }
    const icons = { futsal:'⚽', basketball:'🏀', volleyball:'🏐', handball:'🤾', futebol:'⚽' };
    return [
      { key: 'overall', label: 'Geral' },
      { key: '__fantasy',    label: '🏅 Fantasy' },
      { key: '__prediction', label: '🔮 Bolão' },
      ...sportsInEvent.map((s) => ({ key: s, label: icons[s] ? `${icons[s]} ${SPORT_LABELS[s] || s}` : (SPORT_LABELS[s] || s) })),
    ];
  }, [sportsInEvent]);

  // Ranking top-6 — filtrável por modalidade ou tipo, e por liga (membros)
  const topRanking = useMemo(() => {
    const memberSet = currentLeague?.memberUids ? new Set(currentLeague.memberUids) : null;
    const base = memberSet ? allScores.filter((s) => memberSet.has(s.uid)) : allScores;
    return [...base]
      .sort((a, b) => {
        if (rankSport === 'overall')      return (b.total ?? 0) - (a.total ?? 0);
        if (rankSport === '__fantasy')    return (b.fantasyTotal ?? 0) - (a.fantasyTotal ?? 0);
        if (rankSport === '__prediction') return (b.predictionTotal ?? 0) - (a.predictionTotal ?? 0);
        const bv = b.bySport?.[rankSport]?.total ?? 0;
        const av = a.bySport?.[rankSport]?.total ?? 0;
        return bv - av;
      })
      .slice(0, 6)
      .map((s) => ({
        ...s,
        displayPts: rankSport === 'overall'      ? (s.total ?? 0)
          : rankSport === '__fantasy'             ? (s.fantasyTotal ?? 0)
          : rankSport === '__prediction'          ? (s.predictionTotal ?? 0)
          : (s.bySport?.[rankSport]?.total ?? 0),
      }));
  }, [allScores, rankSport, currentLeague]);


  // Posição do usuário em cada liga
  const leagueRanks = useMemo(() => {
    const result = {};
    myLeagues.forEach((l) => {
      const memberSet = new Set(l.members || []);
      const sorted = [...allScores]
        .filter((s) => memberSet.has(s.uid))
        .sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
      const idx = sorted.findIndex((s) => s.uid === user?.uid);
      result[l.id] = { rank: idx >= 0 ? idx + 1 : null, size: sorted.length };
    });
    return result;
  }, [myLeagues, allScores, user]);

  // Busca badges dos usuários no ranking
  useEffect(() => {
    if (topRanking.length === 0) return;
    Promise.all(topRanking.map((s) => getUserBadges(s.uid).then((b) => [s.uid, b])))
      .then((entries) => setRankBadgeData(Object.fromEntries(entries)));
  }, [topRanking]);


  // Widget filter states
  const [scorersScope, setScorersScope] = useState('campeonato'); // 'campeonato' | 'ultima_rodada'
  const [pickedScope,  setPickedScope]  = useState('rodada');     // 'rodada' | 'geral'
  const [lineupStats,  setLineupStats]  = useState(null);         // { counts: {pid: n} }
  const [loadingLineups,  setLoadingLineups]  = useState(false);
  const [showPicked,   setShowPicked]   = useState(false);        // "Mais escalados" sob demanda
  const [pickedLoading, setPickedLoading] = useState(false);

  // Carrega os times de todos só quando o usuário abre "Mais escalados"
  // (economiza leitura de quem não usa o widget).
  useEffect(() => {
    if (!showPicked || !eventId || !user) return;
    setPickedLoading(true);
    getUserTeamsByEvent(eventId)
      .then((teams) => setUserTeams(teams))
      .catch(() => {})
      .finally(() => setPickedLoading(false));
  }, [showPicked, eventId, user]);

  // Última rodada finalizada (para filtro de maiores pontuadores)
  const latestRodada = useMemo(() => {
    if (!finished.length) return null;
    const sorted = [...finished].sort((a, b) => (b.date || 0) - (a.date || 0));
    return sorted[0].phase || sorted[0].rodada || null;
  }, [finished]);

  // Contagem histórica de "mais escalados" quando "Geral" é selecionado.
  // Lê o agregado (1 doc); se ainda não existir, faz fallback p/ os lineups crus.
  useEffect(() => {
    if (pickedScope !== 'geral' || lineupStats !== null || !eventId) return;
    setLoadingLineups(true);
    (async () => {
      try {
        let stats = await getLineupStats(eventId);
        if (!stats) {
          const lineups = await getAllRoundLineupsByEvent(eventId);
          const counts = {};
          lineups.forEach((l) => (l.playerIds || []).forEach((pid) => { counts[pid] = (counts[pid] || 0) + 1; }));
          stats = { counts };
        }
        setLineupStats(stats);
      } catch { /* ignora */ }
      setLoadingLineups(false);
    })();
  }, [pickedScope, lineupStats, eventId]);

  const topScorers = useMemo(() => {
    const matchesToUse = scorersScope === 'ultima_rodada' && latestRodada
      ? finished.filter((m) => (m.phase || m.rodada) === latestRodada)
      : finished;
    const acc = {};
    matchesToUse.forEach((m) => {
      (m.playerStats || []).forEach((stat) => {
        const pts = calcFantasyPoints(stat, m, false);
        if (!acc[stat.playerId]) acc[stat.playerId] = { playerId: stat.playerId, sport: m.sport, pts: 0 };
        acc[stat.playerId].pts += pts;
      });
    });
    return Object.values(acc).sort((a, b) => b.pts - a.pts).slice(0, 5);
  }, [finished, latestRodada, scorersScope]);

  // Melhores pontuadores por modalidade (basquete, vôlei, handebol).
  // Métrica = pontos/gols marcados (stat.points + stat.goals) somados por jogador.
  const SCORER_SPORTS = ['futebol', 'futsal', 'basketball', 'volleyball', 'handball'];
  const SCORER_UNIT   = { futebol: 'gols', futsal: 'gols', basketball: 'cestas', volleyball: 'pontos', handball: 'gols' };
  const scorersByModality = useMemo(() => {
    const out = {};
    SCORER_SPORTS.forEach((sp) => {
      const acc = {};
      finished.filter((m) => m.sport === sp).forEach((m) => {
        (m.playerStats || []).forEach((stat) => {
          const g = (stat.goals ?? 0) + (stat.points ?? 0);
          if (!g) return;
          acc[stat.playerId] = (acc[stat.playerId] || 0) + g;
        });
      });
      out[sp] = Object.entries(acc)
        .map(([playerId, val]) => ({ playerId, val }))
        .sort((a, b) => b.val - a.val)
        .slice(0, 3);
    });
    return out;
  }, [finished]);

  // Artilheiros (lista única) — usado nos eventos SEM modo país/gênero (ex.: Copa)
  const genderMode = !!currentEvent?.genderMode;
  // Filtro do widget de pontuadores (OLIMFEF): modalidades com pontuador individual
  // (gols/cestas) presentes no evento. Vôlei fica de fora (sem stat individual).
  const [scorerSport, setScorerSport] = useState('');
  const scorerModalities = SCORER_SPORTS.filter((s) => s !== 'volleyball' && (currentEvent?.modalidades || []).includes(s));
  const activeScorerSport = scorerSport || scorerModalities[0] || 'basketball';
  const topGoalScorers = useMemo(() => {
    const acc = {};
    finished.forEach((m) => {
      (m.playerStats || []).forEach((stat) => {
        const g = (stat.goals ?? 0) + (stat.points ?? 0);
        if (!g) return;
        acc[stat.playerId] = (acc[stat.playerId] || 0) + g;
      });
    });
    return Object.entries(acc).map(([playerId, goals]) => ({ playerId, goals }))
      .sort((a, b) => b.goals - a.goals).slice(0, 5);
  }, [finished]);

  // Estatísticas gerais
  const stats = useMemo(() => {
    const totalMatches   = finished.length;
    const scheduledCount = upcoming.length;
    return { totalMatches, scheduledCount };
  }, [finished, upcoming]);

  // Pontuação vem do ScoreContext (compartilhado com Navbar)
  const myFantasy = scoreCtx?.fantasyTotal ?? 0;
  const myPred    = scoreCtx?.predictionTotal ?? 0;
  // Posição no ESCOPO da liga (membros) e no MODO atual (palpites/fantasy/geral),
  // para liga só-bolão não mostrar rank/fantasy do geral.
  const myDisplayRank = useMemo(() => {
    const uid = scoreCtx?.uid;
    if (!uid) return myRank;
    const metric = (s) => dashMode === 'palpites' ? (s?.predictionTotal ?? 0)
      : dashMode === 'fantasy' ? (s?.fantasyTotal ?? 0) : (s?.total ?? 0);
    const sorted = [...leagueScores].sort((a, b) => metric(b) - metric(a));
    const idx = sorted.findIndex((s) => s.uid === uid);
    return idx >= 0 ? idx + 1 : myRank;
  }, [leagueScores, dashMode, scoreCtx?.uid, myRank]);

  // Próximas 2 partidas do evento, agrupadas por data
  const matchesByDate = useMemo(() => {
    const now = Date.now();
    const groups = {};
    [...upcoming]
      .filter((m) => m.date && m.date >= now)
      .sort((a, b) => a.date - b.date)
      .slice(0, 6)
      .forEach((m) => {
        const key = new Date(m.date).toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'short' });
        if (!groups[key]) groups[key] = [];
        groups[key].push(m);
      });
    return groups;
  }, [upcoming]);

  // Jogadores mais escalados — conta em quantos user_teams cada jogador aparece
  const playerMap    = Object.fromEntries(players.map((p) => [p.id, p]));
  const teamEmojiMap = Object.fromEntries(teams.map((t) => [t.id, t.shieldEmoji || '']));

  const mostPicked = useMemo(() => {
    const counts = {};
    // "Geral": soma a contagem histórica (agregado de round_lineups)…
    if (pickedScope === 'geral' && lineupStats?.counts) {
      Object.entries(lineupStats.counts).forEach(([pid, n]) => { counts[pid] = (counts[pid] || 0) + n; });
    }
    // …e sempre soma os times atuais (já carregados).
    userTeams.forEach((team) => {
      (team.playerIds || []).forEach((pid) => { counts[pid] = (counts[pid] || 0) + 1; });
    });
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([pid, count]) => ({ pid, count, player: playerMap[pid] }))
      .filter((x) => x.player);
  }, [userTeams, playerMap, pickedScope, lineupStats]);

  if (loading) return <div className="loading">Carregando painel…</div>;

  return (
    <>
      {/* Header do evento */}
      <div className="dash-event-header">
        <div>
          <h1 className="dash-event-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <EventLogo event={currentEvent} size={28} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentEvent?.shortName || currentEvent?.name}</span>
          </h1>
          <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--primary)', marginTop: '0.15rem' }}>
            {currentLeague?.kind === 'private' ? `${currentLeague.emoji || '🏆'} ${currentLeague.name}` : '🌐 Liga Pública'}
          </div>
          <p className="page-subtitle" style={{ marginTop: '0.1rem' }}>
            Bem-vindo, {profile?.displayName || 'jogador'}!
          </p>
          {showModeToggle && (
            <div className="dash-mode-toggle">
              <button className={dashMode === 'fantasy' ? 'active' : ''} onClick={() => switchMode('fantasy')}>🏅 Fantasy</button>
              <button className={dashMode === 'palpites' ? 'active' : ''} onClick={() => switchMode('palpites')}>🔮 Bolão</button>
              <button className={dashMode === 'geral' ? 'active' : ''} onClick={() => switchMode('geral')}>🌐 Geral</button>
            </div>
          )}
        </div>
        <div className="dash-quick-actions">
          {leagueMode !== 'palpites' && (
            <Link to="/team" className="btn btn-secondary" style={{ position: 'relative' }}>
              🏆 Meu Time
              {teamCount > 0 && <span className="dash-notif-dot">{teamCount}</span>}
            </Link>
          )}
          <Link to="/matches" className="btn" style={{ position: 'relative' }}>
            🔮 Palpites
            {(predictionsCount + roundsCount) > 0 && <span className="dash-notif-dot">{predictionsCount + roundsCount}</span>}
          </Link>
        </div>
      </div>

      {/* Alerta de fechamento de mercado */}
      {market?.closeAt && marketLeft != null && marketLeft > 0 && marketLeft < 24 * 3_600_000 && (
        <Link to="/team" style={{ textDecoration: 'none' }}>
          <div className="market-alert-banner" style={{
            background: marketLeft < 3_600_000 ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
            border: `1px solid ${marketLeft < 3_600_000 ? 'rgba(239,68,68,0.4)' : 'rgba(245,158,11,0.4)'}`,
            color: marketLeft < 3_600_000 ? '#dc2626' : '#d97706',
            borderRadius: 'var(--radius)', padding: '0.6rem 1rem',
            marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
            fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer',
          }}>
            {marketLeft < 3_600_000 ? '🔴' : '⚠️'}
            Mercado fecha em <strong>{formatTimeLeft(marketLeft)}</strong> — ajuste seu time →
          </div>
        </Link>
      )}

      {/* Grid 2 colunas — ordem: pontuação | próximas, estatísticas | ranking, escalados | artilheiros, pontuadores | ligas */}
      <div className="dash-grid">

        {/* Col A R1 — Minha pontuação */}
        <Link to="/minhapontuacao" style={{ textDecoration: 'none', color: 'var(--fg)' }}>
          <div className="dash-section" style={{ cursor: 'pointer', height: '100%', boxSizing: 'border-box' }}>
            <div className="dash-section-header">
              <h2 style={{ color: 'var(--fg)' }}>🏅 Minha pontuação</h2>
              <span style={{ fontSize: '0.8rem', color: 'var(--primary)' }}>Ver →</span>
            </div>
            <div className="dash-stats-row">
              <div className="dash-stat-box">
                <div className="dash-stat-val">#{myDisplayRank}</div>
                <div className="dash-stat-lbl">Posição</div>
              </div>
              {dashMode === 'geral' && (
                <div className="dash-stat-box">
                  <div className="dash-stat-val">{myTotal}</div>
                  <div className="dash-stat-lbl">Total pts</div>
                </div>
              )}
              {(dashMode === 'geral' || dashMode === 'fantasy') && (
                <div className="dash-stat-box">
                  <div className="dash-stat-val">{myFantasy}</div>
                  <div className="dash-stat-lbl">Fantasy</div>
                </div>
              )}
              {(dashMode === 'geral' || dashMode === 'palpites') && (
                <div className="dash-stat-box">
                  <div className="dash-stat-val">{myPred}</div>
                  <div className="dash-stat-lbl">Palpites</div>
                </div>
              )}
            </div>
          </div>
        </Link>

        {/* Col B R1 — Estatísticas do evento */}
        <div className="dash-section">
          <div className="dash-section-header"><h2>📊 {isPrivateLeague ? 'Estatísticas da liga' : 'Estatísticas do evento'}</h2></div>
          <div className="dash-stats-row">
            <div className="dash-stat-box">
              <div className="dash-stat-val">{stats.totalMatches}</div>
              <div className="dash-stat-lbl">Partidas realizadas</div>
            </div>
            <div className="dash-stat-box">
              <div className="dash-stat-val">{stats.scheduledCount}</div>
              <div className="dash-stat-lbl">Partidas restantes</div>
            </div>
            <div className="dash-stat-box">
              <div className="dash-stat-val">
                {leagueScores.length > 0
                  ? Math.round(leagueScores.reduce((sum, s) => sum + (s.total ?? 0), 0) / leagueScores.length)
                  : 0}
              </div>
              <div className="dash-stat-lbl">Média de pontos</div>
            </div>
            <div className="dash-stat-box">
              <div className="dash-stat-val">{isPrivateLeague ? (currentLeague.memberUids?.length || 0) : leagueScores.length}</div>
              <div className="dash-stat-lbl">{isPrivateLeague ? 'Participantes' : 'Usuários ativos'}</div>
            </div>
          </div>
        </div>

        {/* Col A R2 — Ranking */}
        <div className="dash-section">
          <div className="dash-section-header">
            <h2>{dashMode === 'palpites' ? '🔮 Ranking do Bolão' : dashMode === 'fantasy' ? '🏅 Ranking Fantasy' : '🏆 Ranking'}</h2>
            <Link to="/rankings" state={{ tab: dashMode === 'palpites' ? 'predictions' : dashMode === 'fantasy' ? 'fantasy' : 'overall' }} className="dash-see-all">Completo →</Link>
          </div>
          {/* Sub-tabs de filtro só no modo Geral */}
          {dashMode === 'geral' && (
            <div className="dash-rank-sport-tabs">
              {rankTabs.map((t) => (
                <button key={t.key}
                  className={`dash-rank-sport-tab ${rankSport === t.key ? 'active' : ''}`}
                  onClick={() => setRankSport(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
          {topRanking.length === 0 ? (
            <p className="muted" style={{ fontSize:'0.85rem' }}>Ainda sem pontuações.</p>
          ) : (
            <div className="dash-ranking-list">
              {topRanking.map((s, i) => {
                const medals = ['🥇','🥈','🥉'];
                const pos    = i < 3 ? medals[i] : `${i+1}º`;
                const isMe   = s.uid === user?.uid;
                return (
                  <div key={s.uid} className={`dash-rank-row ${isMe ? 'me' : ''}`}>
                    <span className="dash-rank-pos">{pos}</span>
                    <span className="dash-rank-name" style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', minWidth: 0, overflow: 'hidden' }}>
                      <Link to={`/perfil/${s.uid}`} className="ranking-name-link" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.displayName || '—'}
                      </Link>
                      {isMe && <span style={{ flexShrink: 0, fontSize: '0.75rem' }}>(você)</span>}
                      <TrophyBadges badgeData={rankBadgeData[s.uid]} />
                    </span>
                    <span className="dash-rank-pts">{fmtPts(s.displayPts)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Col B R2 — Próximas partidas */}
        <div className="dash-section">
          <div className="dash-section-header">
            <h2>📅 Próximas partidas</h2>
            <Link to="/matches" state={{ view: 'calendario' }} className="dash-see-all">Ver todas →</Link>
          </div>
          {Object.keys(matchesByDate).length === 0 ? (
            <p className="muted">Nenhuma partida agendada.</p>
          ) : (
            Object.entries(matchesByDate).map(([date, ms]) => (
              <div key={date} className="dash-date-group">
                <div className="dash-date-label">{date}</div>
                {ms.map((m) => {
                  const homeEmoji = m.homeShieldEmoji || teamEmojiMap[m.homeTeamId] || countryFlag(m.homeTeamName) || '';
                  const awayEmoji = m.awayShieldEmoji || teamEmojiMap[m.awayTeamId] || countryFlag(m.awayTeamName) || '';
                  return (
                    <div key={m.id} className="dash-match-row dash-match-row-link"
                      onClick={() => navigate('/matches', { state: { view: 'palpites' } })}
                      title="Clique para dar palpite"
                    >
                      {m.gender === 'masculino' && <span style={{ fontSize: '0.75rem', flexShrink: 0 }}>♂</span>}
                      {m.gender === 'feminino'  && <span style={{ fontSize: '0.75rem', flexShrink: 0 }}>♀</span>}
                      <ShieldEmoji emoji={homeEmoji} size="1.1em" />
                      <span className="dash-team">{m.homeTeamName}</span>
                      <span className="dash-vs">x</span>
                      <span className="dash-team" style={{ textAlign: 'right' }}>{m.awayTeamName}</span>
                      <ShieldEmoji emoji={awayEmoji} size="1.1em" />
                      {m.date && (
                        <span className="dash-match-time">
                          {new Date(m.date).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Widgets de fantasy (modo fantasy e geral) */}
        {showFantasyWidgets && (<>
        {/* Col A R3 — Mais escalados */}
        <div className="dash-section">
          <div className="dash-section-header">
            <h2>⭐ Mais escalados</h2>
            {showPicked && (
            <div style={{ display:'flex', gap:'0.3rem', alignItems:'center' }}>
              <Link to="/jogadores?sort=_picked&dir=desc" className="dash-see-all">Ver mais →</Link>
              {[{ k:'rodada', l:'Rodada' }, { k:'geral', l:'Geral' }].map(({ k, l }) => (
                <button key={k} type="button" onClick={() => setPickedScope(k)}
                  style={{ fontSize:'0.68rem', padding:'0.15rem 0.45rem', borderRadius:99, cursor:'pointer',
                    background: pickedScope === k ? 'var(--primary)' : 'var(--surface-2)',
                    color: pickedScope === k ? '#000' : 'var(--muted)',
                    border:`1px solid ${pickedScope === k ? 'var(--primary)' : 'var(--border)'}` }}>
                  {l}
                </button>
              ))}
            </div>
            )}
          </div>
          {!showPicked ? (
            <button type="button" className="btn-secondary" style={{ fontSize:'0.82rem', width:'100%' }} onClick={() => setShowPicked(true)}>
              👀 Ver mais escalados
            </button>
          ) : pickedLoading && mostPicked.length === 0 ? (
            <p className="muted">Carregando…</p>
          ) : mostPicked.length === 0 ? (
            <p className="muted">{loadingLineups ? 'Carregando…' : 'Ainda sem escalações.'}</p>
          ) : (
            <div className="dash-ranking-list">
              {mostPicked.map((x, i) => {
                const pos = i < 3 ? ['🥇','🥈','🥉'][i] : `${i+1}º`;
                const shield = teamEmojiMap[x.player.teamId];
                return (
                  <div key={x.pid} className="dash-rank-row">
                    <span className="dash-rank-pos">{pos}</span>
                    <span className="dash-rank-name" style={{ display:'flex', alignItems:'center', gap:'0.3rem', overflow:'hidden' }}>
                      {shield && <ShieldEmoji emoji={shield} size="1.1em" style={{ flexShrink:0 }} />}
                      <Link to={`/jogador/${x.pid}`} className="ranking-name-link" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{x.player.name}</Link>
                    </span>
                    <span className="dash-rank-pts" style={{ color:'var(--accent)' }}>{x.count}×</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Col B R3 — Maiores pontuadores */}
        <div className="dash-section">
          <div className="dash-section-header">
            <h2>🔥 Maiores pontuadores</h2>
            <div style={{ display:'flex', gap:'0.3rem', alignItems:'center' }}>
              <Link to="/jogadores?sort=_pts&dir=desc" className="dash-see-all">Ver mais →</Link>
              {[{ k:'campeonato', l:'Campeonato' }, { k:'ultima_rodada', l:'Última rodada' }].map(({ k, l }) => (
                <button key={k} type="button" onClick={() => setScorersScope(k)}
                  style={{ fontSize:'0.68rem', padding:'0.15rem 0.45rem', borderRadius:99, cursor:'pointer',
                    background: scorersScope === k ? 'var(--primary)' : 'var(--surface-2)',
                    color: scorersScope === k ? '#000' : 'var(--muted)',
                    border:`1px solid ${scorersScope === k ? 'var(--primary)' : 'var(--border)'}` }}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          {topScorers.length === 0 ? (
            <p className="muted">Nenhuma partida finalizada{scorersScope === 'ultima_rodada' ? ' na última rodada' : ''}.</p>
          ) : (
            <div className="dash-ranking-list">
              {topScorers.map((s, i) => {
                const pl     = playerMap[s.playerId];
                const pos    = i < 3 ? ['🥇','🥈','🥉'][i] : `${i+1}º`;
                const shield = pl ? teamEmojiMap[pl.teamId] : null;
                return (
                  <div key={s.playerId} className="dash-rank-row">
                    <span className="dash-rank-pos">{pos}</span>
                    <span className="dash-rank-name" style={{ display:'flex', alignItems:'center', gap:'0.3rem', overflow:'hidden' }}>
                      {shield && <ShieldEmoji emoji={shield} size="1.1em" style={{ flexShrink:0 }} />}
                      {pl
                        ? <Link to={`/jogador/${s.playerId}`} className="ranking-name-link" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{pl.name}</Link>
                        : s.playerId}
                    </span>
                    <span className="dash-rank-pts">{fmtPts(s.pts)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Col A R4 — Artilheiros (Copa: lista única · OLIMFEF: por modalidade) */}
        <div className="dash-section">
          {genderMode ? (
            <>
              <div className="dash-section-header">
                <h2>🏆 Artilheiros & pontuadores</h2>
                <Link to="/jogadores?sort=goals&dir=desc" className="dash-see-all">Ver mais →</Link>
              </div>
              {/* Filtro por modalidade (mostra também as sem resultado ainda) */}
              <div style={{ display:'flex', gap:'0.35rem', flexWrap:'wrap', marginBottom:'0.6rem' }}>
                {scorerModalities.map((sp) => (
                  <button key={sp} type="button"
                    className={`event-type-chip ${activeScorerSport === sp ? 'active' : ''}`}
                    style={{ fontSize:'0.72rem' }}
                    onClick={() => setScorerSport(sp)}>
                    {SPORT_LABELS[sp] || sp}
                  </button>
                ))}
              </div>
              {(() => {
                const list = scorersByModality[activeScorerSport] || [];
                if (!list.length) {
                  return <p className="muted" style={{ fontSize:'0.85rem' }}>Sem resultados de {SPORT_LABELS[activeScorerSport] || activeScorerSport} ainda.</p>;
                }
                return (
                  <>
                    <div style={{ fontSize:'0.72rem', color:'var(--muted)', marginBottom:'0.25rem' }}>por {SCORER_UNIT[activeScorerSport] || 'pontos'}</div>
                    <div className="dash-ranking-list">
                      {list.map((s, i) => {
                        const pl     = playerMap[s.playerId];
                        const pos    = ['🥇','🥈','🥉'][i] || `${i+1}º`;
                        const shield = pl ? teamEmojiMap[pl.teamId] : null;
                        return (
                          <div key={s.playerId} className="dash-rank-row">
                            <span className="dash-rank-pos">{pos}</span>
                            <span className="dash-rank-name" style={{ display:'flex', alignItems:'center', gap:'0.3rem', overflow:'hidden' }}>
                              {shield && <ShieldEmoji emoji={shield} size="1.1em" style={{ flexShrink:0 }} />}
                              {pl
                                ? <Link to={`/jogador/${s.playerId}`} className="ranking-name-link" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{pl.name}</Link>
                                : s.playerId}
                            </span>
                            <span className="dash-rank-pts" style={{ color:'var(--accent)' }}>{s.val}</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </>
          ) : (
            <>
              <div className="dash-section-header">
                <h2>⚽ Artilheiros</h2>
                <Link to="/jogadores?sort=goals&dir=desc" className="dash-see-all">Ver mais →</Link>
              </div>
              {topGoalScorers.length === 0 ? (
                <p className="muted">Nenhuma partida finalizada ainda.</p>
              ) : (
                <div className="dash-ranking-list">
                  {topGoalScorers.map((s, i) => {
                    const pl     = playerMap[s.playerId];
                    const pos    = i < 3 ? ['🥇','🥈','🥉'][i] : `${i+1}º`;
                    const shield = pl ? teamEmojiMap[pl.teamId] : null;
                    return (
                      <div key={s.playerId} className="dash-rank-row">
                        <span className="dash-rank-pos">{pos}</span>
                        <span className="dash-rank-name" style={{ display:'flex', alignItems:'center', gap:'0.3rem', overflow:'hidden' }}>
                          {shield && <ShieldEmoji emoji={shield} size="1.1em" style={{ flexShrink:0 }} />}
                          {pl
                            ? <Link to={`/jogador/${s.playerId}`} className="ranking-name-link" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{pl.name}</Link>
                            : s.playerId}
                        </span>
                        <span className="dash-rank-pts" style={{ color:'var(--accent)' }}>{s.goals}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
        </>)}

        {/* Col B R4 — Minhas Ligas */}
        <div className="dash-section">
          <div className="dash-section-header">
            <h2>🏆 Minhas Ligas</h2>
            <Link to="/ligas" className="dash-see-all">Ver todas →</Link>
          </div>
          {(
            <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem' }}>
              {/* Liga pública (sempre presente) */}
              {publicLeague && (
                <button
                  onClick={() => { setCurrentLeague(publicLeague); navigate('/dashboard'); }}
                  style={{
                    display:'flex', alignItems:'center', gap:'0.6rem',
                    padding:'0.55rem 0.75rem', borderRadius:10, width:'100%', textAlign:'left',
                    background: currentLeague?.kind === 'public' ? 'rgba(34,197,94,0.1)' : 'var(--surface-2)',
                    border:`1px solid ${currentLeague?.kind === 'public' ? 'rgba(34,197,94,0.35)' : 'var(--border)'}`,
                    cursor:'pointer',
                  }}
                >
                  <span style={{ flex:1, minWidth:0, display:'flex', alignItems:'center', gap:'0.4rem', overflow:'hidden', fontWeight:600, fontSize:'0.88rem', color:'var(--text)' }}>
                    {publicEvent ? <EventLogo event={publicEvent} size={18} /> : '🌐'}
                    <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{publicLeague.shortName || publicLeague.name}</span>
                  </span>
                  <span style={{ flexShrink:0, fontSize:'0.7rem', color:'var(--muted)' }}>Geral</span>
                </button>
              )}

              {myLeagues.length === 0 && (
                <div style={{ textAlign:'center', padding:'0.6rem 0' }}>
                  <p className="muted" style={{ marginBottom:'0.5rem', fontSize:'0.85rem' }}>Você ainda não está numa liga privada.</p>
                  <Link to="/ligas" className="btn" style={{ fontSize:'0.85rem' }}>+ Criar ou entrar</Link>
                </div>
              )}

              {myLeagues.slice(0, 4).map((l) => {
                const lr   = leagueRanks[l.id];
                const rank = lr?.rank;
                const size = l.members?.length || 0;
                const isActive = currentLeague?.leagueId === l.id;
                return (
                  <button
                    key={l.id}
                    onClick={() => { setCurrentLeague(toLeagueObj(l)); navigate('/dashboard'); }}
                    style={{
                      display:'flex', alignItems:'center', gap:'0.6rem', width:'100%', textAlign:'left',
                      padding:'0.55rem 0.75rem', borderRadius:10, cursor:'pointer',
                      background: isActive ? 'rgba(34,197,94,0.1)' : 'var(--surface-2)',
                      border:`1px solid ${isActive ? 'rgba(34,197,94,0.35)' : 'var(--border)'}`,
                      transition:'border-color 0.15s',
                    }}
                  >
                    {/* Nome */}
                    <span style={{ flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight:600, fontSize:'0.88rem', color:'var(--text)' }}>
                      {l.emoji || '🏆'} {l.name}
                    </span>

                    {/* Posição */}
                    {rank && (
                      <span style={{
                        flexShrink:0, fontSize:'0.7rem', fontWeight:700,
                        color:'var(--primary)', background:'rgba(34,197,94,0.12)',
                        border:'1px solid rgba(34,197,94,0.25)',
                        borderRadius:99, padding:'0.15rem 0.5rem', whiteSpace:'nowrap',
                      }}>
                        {rank}º lugar
                      </span>
                    )}

                    {/* Membros */}
                    <span style={{ flexShrink:0, fontSize:'0.72rem', color:'var(--muted)', whiteSpace:'nowrap' }}>
                      👥 {size}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </>
  );
}
