import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEvent } from '../context/EventContext';
import { useScore } from '../context/ScoreContext';
import { useLeague } from '../context/LeagueContext';
import { useToast } from '../context/ToastContext';
import {
  getUserLeagues, createLeague, updateLeague,
  leaveLeague, getLeagueByCode, getMatchesByEvent,
  getUserProfilesByUids, getUserTeamsByEvent, getPlayersByEvent, getTeamsByEvent,
  getPredictionsByUids, getLeaguesByEvent,
  requestJoinLeague, cancelJoinRequest, approveLeagueMember, rejectLeagueMember,
  getPendingRequestLeagues,
} from '../services/firestore';
import { calcFantasyPoints, predictionPoints } from '../utils/scoring';
import ShieldEmoji from '../components/ShieldEmoji';
import EmojiPicker from '../components/EmojiPicker';
import { POSITION_LABELS, fmtPts } from '../utils/labels';
import { PHASE_LABELS } from '../utils/sportRules';

/* ── helpers puros (fora do componente) ──────────────────────────── */
function computeTopDrafted(memberTeams, players, teamMap, totalMembers) {
  const count = {};
  memberTeams.forEach((team) => {
    const pids = new Set([
      ...(team.playerIds || []),
      ...Object.values(team.bench || {}).filter(Boolean),
    ]);
    pids.forEach((pid) => { count[pid] = (count[pid] || 0) + 1; });
  });
  return Object.entries(count)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([pid, cnt]) => {
      const player = players.find((p) => p.id === pid);
      if (!player) return null;
      return { player, team: teamMap[player.teamId], count: cnt, pct: Math.round((cnt / (totalMembers || 1)) * 100) };
    })
    .filter(Boolean);
}

function roundKey(m) {
  const raw = m.rodada != null ? m.rodada : m.phase;
  return raw != null ? String(raw).trim() : null;
}
function fmtRoundKey(key) {
  if (!key) return '—';
  if (/^\d+$/.test(key)) return `Rodada ${key}`;
  return PHASE_LABELS[key] || key; // r32 → "16 avos de Final", r16 → "Oitavas de Final"…
}

function computeRoundData(memberTeams, finishedMatches) {
  const rounds = {};
  finishedMatches.forEach((m) => {
    const k = roundKey(m);
    if (!k) return;
    if (!rounds[k]) rounds[k] = [];
    rounds[k].push(m);
  });
  if (!Object.keys(rounds).length) return [];
  return Object.entries(rounds)
    .map(([k, matches]) => {
      const memberScores = memberTeams.map((team) => {
        let pts = 0;
        matches.forEach((m) => {
          if (m.sport !== team.sport) return;
          (m.playerStats || []).forEach((stat) => {
            if (!team.playerIds?.includes(stat.playerId)) return;
            let p = calcFantasyPoints(stat, m, true);
            if (team.captainId === stat.playerId) p *= 2;
            pts += p;
          });
        });
        return { uid: team.uid, pts: Math.round(pts) };
      }).sort((a, b) => b.pts - a.pts);
      return { roundKey: k, memberScores };
    })
    .filter((r) => r.memberScores.some((s) => s.pts > 0));
}

function computeRoundPredictionData(memberUids, finishedMatches, predictions) {
  const predMap = {};
  predictions.forEach((p) => { predMap[`${p.uid}_${p.matchId}`] = p; });
  const rounds = {};
  finishedMatches.forEach((m) => {
    const k = roundKey(m);
    if (!k) return;
    if (!rounds[k]) rounds[k] = [];
    rounds[k].push(m);
  });
  if (!Object.keys(rounds).length) return [];
  return Object.entries(rounds)
    .map(([k, matches]) => {
      const memberScores = memberUids.map((uid) => {
        let pts = 0;
        matches.forEach((m) => {
          pts += predictionPoints(predMap[`${uid}_${m.id}`], m);
        });
        return { uid, pts: Math.round(pts) };
      }).sort((a, b) => b.pts - a.pts);
      return { roundKey: k, memberScores };
    })
    .filter((r) => r.memberScores.some((s) => s.pts > 0));
}

export default function Leagues() {
  const navigate             = useNavigate();
  const location             = useLocation();
  const { user, isAdmin, needsEmailVerification } = useAuth();
  const { eventId }          = useEvent();
  const { allScores }        = useScore();
  const { reloadLeagues, setCurrentLeague, currentLeague, toLeagueObj } = useLeague();
  const { toast, confirm } = useToast();

  const [tab, setTab]        = useState('minhas');
  const [myLeagues, setMyLeagues]     = useState([]);
  const [discoverLeagues, setDiscoverLeagues] = useState([]); // todas as ligas do evento (lazy)
  const [discoverLoaded, setDiscoverLoaded]   = useState(false);
  const [loading, setLoading]         = useState(true);
  const [searchTerm, setSearchTerm]   = useState('');

  const [pendingLeagues, setPendingLeagues] = useState([]); // ligas onde solicitei entrada

  // Limites: criar no máximo 1 liga; participar de várias (teto generoso).
  // Pedidos pendentes contam para o limite (reservam vaga). Admins: ilimitado.
  const MAX_LEAGUES    = 20;
  const myCreated      = useMemo(() => myLeagues.filter((l) => l.createdBy === user?.uid), [myLeagues, user]);
  const usedSlots      = myLeagues.length + pendingLeagues.length;
  const canCreate      = isAdmin || (myCreated.length === 0 && usedSlots < MAX_LEAGUES);
  // Pode solicitar entrada enquanto não atingir o teto de 3 ligas (participando + pendentes)
  const canJoinOther   = isAdmin || usedSlots < MAX_LEAGUES;

  // Criar liga
  const [newName, setNewName]         = useState('');
  const [newEmoji, setNewEmoji]       = useState('🏆');
  const [isPublic, setIsPublic]       = useState(false);
  const [leagueMode, setLeagueMode]   = useState('ambas');
  const [creating, setCreating]       = useState(false);
  const [createMsg, setCreateMsg]     = useState({ type: '', text: '' });

  // Entrar por código
  const [codeInput, setCodeInput]     = useState('');
  const [joining, setJoining]         = useState(false);
  const [joinMsg, setJoinMsg]         = useState({ type: '', text: '' });

  // Liga expandida para detalhes
  const [expandedLeague, setExpandedLeague] = useState(null);
  const [eventMatches, setEventMatches]     = useState([]);
  const [profilesMap, setProfilesMap]       = useState({});
  const [leagueStats, setLeagueStats]       = useState({});

  const scoreMap = useMemo(
    () => Object.fromEntries(allScores.map((s) => [s.uid, s])),
    [allScores]
  );

  const load = async () => {
    setLoading(true);
    const [mine, matches, pending] = await Promise.all([
      getUserLeagues(user.uid, eventId),
      getMatchesByEvent(eventId),
      getPendingRequestLeagues(user.uid),
    ]);
    setMyLeagues(mine);
    setPendingLeagues(pending.filter((l) => (l.eventId || 'default') === eventId));
    setEventMatches(matches);
    const allUids = [...new Set([
      ...mine.flatMap((l) => l.members || []),
      ...mine.flatMap((l) => l.pendingMembers || []), // solicitantes (p/ o dono ver nomes)
    ])];
    if (allUids.length) {
      const profiles = await getUserProfilesByUids(allUids);
      setProfilesMap(profiles);
    }
    setLoading(false);
  };

  // Aprovação (dono) e cancelamento (solicitante)
  const handleApprove = async (leagueId, uid) => {
    try { await approveLeagueMember(leagueId, uid); await load(); }
    catch { toast('Erro ao aprovar.', 'error'); }
  };
  const handleReject = async (leagueId, uid) => {
    try { await rejectLeagueMember(leagueId, uid); await load(); }
    catch { toast('Erro ao recusar.', 'error'); }
  };
  const handleCancelRequest = async (leagueId) => {
    try { await cancelJoinRequest(leagueId, user.uid); await load(); setDiscoverLoaded(false); }
    catch { toast('Erro ao cancelar.', 'error'); }
  };

  // Dono altera o modo da liga (fantasy / palpites / ambas) após criada
  const [savingMode, setSavingMode] = useState(null); // id da liga sendo salva
  const handleChangeMode = async (league, newMode) => {
    if (newMode === (league.leagueMode || 'ambas')) return;
    setSavingMode(league.id);
    try {
      await updateLeague(league.id, { leagueMode: newMode });
      await load();
      await reloadLeagues();
      // Se for a liga atualmente selecionada, reflete a mudança no contexto
      if (currentLeague?.leagueId === league.id) {
        setCurrentLeague({ ...currentLeague, leagueMode: newMode });
      }
    } catch (err) {
      console.error('Erro ao alterar modo da liga:', err?.code, err?.message, err);
      toast('Erro ao alterar o modo da liga. Tente novamente.', 'error');
    } finally {
      setSavingMode(null);
    }
  };

  useEffect(() => { if (user) load(); }, [user, eventId]);

  // "Descobrir" é lazy: só lê TODAS as ligas do evento ao abrir a aba
  // (economiza leitura de quem fica só em "Minhas ligas").
  useEffect(() => {
    if (tab !== 'descobrir' || discoverLoaded || !eventId || !user) return;
    (async () => {
      try {
        const all = await getLeaguesByEvent(eventId);
        setDiscoverLeagues(all.filter((l) => !myLeagues.some((m) => m.id === l.id) && l.createdBy !== user.uid));
      } catch { /* ignora */ }
      setDiscoverLoaded(true);
    })();
  }, [tab, discoverLoaded, eventId, user, myLeagues]);

  // Recarrega a descoberta ao trocar de evento
  useEffect(() => { setDiscoverLoaded(false); }, [eventId]);

  // Auto-expand league linked from Dashboard widget
  useEffect(() => {
    const id = location.state?.expandLeague;
    if (id) setExpandedLeague(id);
  }, [location.state?.expandLeague]);

  // Lazy-load dados detalhados da liga expandida
  useEffect(() => {
    if (!expandedLeague) return;
    const league = [...myLeagues, ...discoverLeagues].find((l) => l.id === expandedLeague);
    if (!league) return;
    const existing = leagueStats[expandedLeague];
    if (existing?.loaded || existing?.loading) return;

    setLeagueStats((prev) => ({ ...prev, [expandedLeague]: { loading: true } }));
    const eid = league.eventId || eventId;
    Promise.all([
      getUserTeamsByEvent(eid),
      getPlayersByEvent(eid),
      getTeamsByEvent(eid),
      getPredictionsByUids(league.members || []),
    ]).then(([allUserTeams, players, teams, predictions]) => {
      const memberSet  = new Set(league.members || []);
      const memberTeams = allUserTeams.filter((t) => memberSet.has(t.uid));
      const teamMap    = Object.fromEntries(teams.map((t) => [t.id, t]));
      setLeagueStats((prev) => ({
        ...prev,
        [expandedLeague]: { memberTeams, players, teamMap, predictions, loaded: true },
      }));
    });
  }, [expandedLeague, myLeagues, discoverLeagues]);

  if (!eventId) return (
    <div className="card">
      <p className="muted">Selecione um evento para ver as ligas.</p>
    </div>
  );

  const inviteUrl = (code) => `${window.location.origin}/liga/${code}`;

  const copyInvite = (code) => {
    const url = inviteUrl(code);
    navigator.clipboard?.writeText(url);
    toast('🔗 Link de convite copiado!', 'success');
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    if (!canCreate) {
      const text = myCreated.length > 0
        ? 'Você já criou uma liga. Cada usuário pode criar apenas uma liga.'
        : `Você atingiu o limite de ${MAX_LEAGUES} ligas. Saia de uma para criar outra.`;
      setCreateMsg({ type: 'error', text });
      return;
    }
    if (needsEmailVerification) {
      setCreateMsg({ type: 'error', text: 'Confirme seu email antes de criar uma liga. Verifique sua caixa de entrada.' });
      return;
    }
    setCreating(true);
    setCreateMsg({ type: '', text: '' });
    try {
      const { id, inviteCode } = await createLeague(user.uid, eventId, newName.trim(), false, leagueMode, newEmoji);
      setNewName('');
      await load();
      await reloadLeagues();
      // Entra direto na liga recém-criada e abre o painel
      setCurrentLeague(toLeagueObj({ id, name: newName.trim(), eventId, leagueMode, emoji: newEmoji, members: [user.uid] }));
      navigate('/dashboard');
      setCreateMsg({ type: 'success', text: `Liga criada! Código: ${inviteCode}` });
    } catch (err) {
      console.error('Erro ao criar liga:', err?.code, err?.message, err);
      const text = err?.code === 'permission-denied'
        ? 'Sem permissão para criar liga. Confirme seu email e tente novamente.'
        : 'Erro ao criar liga. Tente novamente.';
      setCreateMsg({ type: 'error', text });
    } finally {
      setCreating(false);
    }
  };

  const handleJoinByCode = async (e) => {
    e.preventDefault();
    if (!codeInput.trim()) return;
    setJoining(true);
    setJoinMsg({ type: '', text: '' });
    try {
      const league = await getLeagueByCode(codeInput.trim());
      if (!league) {
        setJoinMsg({ type: 'error', text: 'Liga não encontrada. Verifique o código.' });
        return;
      }
      if (league.members?.includes(user.uid)) {
        setJoinMsg({ type: 'error', text: 'Você já faz parte desta liga.' });
        return;
      }
      if (league.createdBy === user.uid) {
        setJoinMsg({ type: 'error', text: 'Você é o criador desta liga.' });
        return;
      }
      if (league.pendingMembers?.includes(user.uid)) {
        setJoinMsg({ type: 'error', text: 'Você já solicitou entrada nesta liga. Aguarde a aprovação.' });
        return;
      }
      if (!canJoinOther) {
        setJoinMsg({ type: 'error', text: `Limite atingido: você só pode participar de ${MAX_LEAGUES} ligas (incluindo pedidos pendentes).` });
        return;
      }
      await requestJoinLeague(league.id, user.uid);
      setCodeInput('');
      await load();
      setJoinMsg({ type: 'success', text: `Solicitação enviada para "${league.name}"! Aguarde o dono aceitar.` });
    } catch {
      setJoinMsg({ type: 'error', text: 'Erro ao solicitar entrada. Tente novamente.' });
    } finally {
      setJoining(false);
    }
  };

  const handleJoinPublic = async (league) => {
    if (league.createdBy === user?.uid) return;
    if (league.pendingMembers?.includes(user?.uid)) {
      toast('Você já solicitou entrada nesta liga. Aguarde a aprovação.', 'info');
      return;
    }
    if (!canJoinOther) {
      toast(`Limite atingido: você só pode participar de ${MAX_LEAGUES} ligas (incluindo pedidos pendentes).`, 'error');
      return;
    }
    try {
      await requestJoinLeague(league.id, user.uid);
      await load();
      setDiscoverLoaded(false); // refresca a descoberta (estado do botão)
      toast('Solicitação enviada! Aguarde o dono aceitar.', 'success');
    } catch {
      toast('Erro ao solicitar entrada.', 'error');
    }
  };

  const handleLeave = async (league) => {
    if (!(await confirm(`Sair da liga "${league.name}"?`))) return;
    try {
      await leaveLeague(league.id, user.uid);
      await load();
      await reloadLeagues();
    } catch {
      toast('Erro ao sair da liga.', 'error');
    }
  };

  const LeagueCard = ({ league, showLeave = false, showJoin = false, stats = {} }) => {
    const isExpanded = expandedLeague === league.id;
    const mode = league.leagueMode || 'ambas';

    const scorePts = (score) => {
      if (mode === 'fantasy')  return score?.fantasyTotal ?? 0;
      if (mode === 'palpites') return score?.predictionTotal ?? 0;
      return score?.total ?? 0;
    };

    const memberRanking = useMemo(() =>
      (league.members || [])
        .map((uid) => ({ uid, score: scoreMap[uid] }))
        .sort((a, b) => scorePts(b.score) - scorePts(a.score))
    , [league.members, scoreMap]);

    const finishedMatches = eventMatches.filter((m) => m.status === 'finished');
    const upcomingMatches = eventMatches.filter((m) => m.status !== 'finished').slice(0, 3);

    const getName = (uid, score) =>
      score?.displayName || profilesMap[uid]?.displayName || uid.slice(0, 8) + '…';

    return (
      <div className="card" style={{ padding: '1rem' }}>
        {/* Cabeçalho */}
        <div className="flex-between" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span
                style={{ fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}
                onClick={() => setExpandedLeague(isExpanded ? null : league.id)}
              >{league.emoji ? `${league.emoji} ` : ''}{league.name}</span>
              <span className="badge" style={{ background: league.isPublic ? 'var(--primary)' : 'var(--muted)', color: league.isPublic ? '#000' : '#fff', fontSize: '0.7rem', padding: '0.15rem 0.45rem', borderRadius: 99 }}>
                {league.isPublic ? 'Pública' : 'Privada'}
              </span>
              {league.leagueMode && league.leagueMode !== 'ambas' && (
                <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem', borderRadius: 99, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  {league.leagueMode === 'fantasy' ? '🏅 Fantasy' : '🔮 Palpites'}
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
              👥 {league.members?.length || 0} participantes
              {league.createdBy === user?.uid && <span> · <strong>Criador</strong></span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {showLeave && <button className="btn-secondary" style={{ fontSize: '0.82rem' }} onClick={() => handleLeave(league)}>Sair</button>}
            {showJoin && (
              league.pendingMembers?.includes(user?.uid)
                ? <button className="btn-secondary" style={{ fontSize: '0.82rem' }} onClick={() => handleCancelRequest(league.id)}>⏳ Cancelar solicitação</button>
                : <button className="btn" style={{ fontSize: '0.82rem' }} disabled={!canJoinOther} onClick={() => handleJoinPublic(league)}>Solicitar entrada</button>
            )}
            {!showJoin && league.inviteCode && <button className="btn-secondary" style={{ fontSize: '0.82rem' }} onClick={() => copyInvite(league.inviteCode)}>📋 Convite</button>}
            <button className="btn-secondary" style={{ fontSize: '0.82rem' }} onClick={() => setExpandedLeague(isExpanded ? null : league.id)}>
              {isExpanded ? '▲ Fechar' : '▼ Detalhes'}
            </button>
          </div>
        </div>

        {/* Solicitações pendentes (só o dono vê) */}
        {league.createdBy === user?.uid && (league.pendingMembers || []).length > 0 && (
          <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.6rem' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '0.4rem' }}>
              📨 Solicitações de entrada ({league.pendingMembers.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {league.pendingMembers.map((uid) => (
                <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {profilesMap[uid]?.displayName || uid.slice(0, 8) + '…'}
                  </span>
                  <button className="btn" style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }} onClick={() => handleApprove(league.id, uid)}>Aceitar</button>
                  <button className="btn-secondary" style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }} onClick={() => handleReject(league.id, uid)}>Recusar</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modo da liga (só o dono pode alterar, mesmo depois de criada) */}
        {league.createdBy === user?.uid && (
          <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.6rem' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--muted)', marginBottom: '0.4rem' }}>
              ⚙️ Modo da liga
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {[
                { value: 'ambas',    label: '🏅 Fantasy + 🔮 Palpites' },
                { value: 'fantasy',  label: '🏅 Apenas Fantasy' },
                { value: 'palpites', label: '🔮 Apenas Palpites' },
              ].map((opt) => {
                const active = mode === opt.value;
                return (
                  <button
                    key={opt.value}
                    className={active ? 'btn' : 'btn-secondary'}
                    style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem', opacity: savingMode === league.id ? 0.6 : 1 }}
                    disabled={active || savingMode === league.id}
                    onClick={() => handleChangeMode(league, opt.value)}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Painel de detalhes */}
        {isExpanded && (() => {
          const maxPts     = scorePts(memberRanking[0]?.score);
          const barMax     = maxPts || 1;
          const totalPts   = memberRanking.reduce((s, m) => s + scorePts(m.score), 0);
          const avgPts     = memberRanking.length ? Math.round(totalPts / memberRanking.length) : 0;
          const myIdx      = memberRanking.findIndex((m) => m.uid === user?.uid);
          const myEntry    = myIdx >= 0 ? memberRanking[myIdx] : null;
          const myPts      = scorePts(myEntry?.score);
          const ptsToLead  = maxPts - myPts;
          const nextAbove  = myIdx > 0 ? memberRanking[myIdx - 1] : null;
          const ptsToNext  = nextAbove ? scorePts(nextAbove.score) - myPts : 0;

          // pódio: 2º | 1º | 3º
          const podium = [memberRanking[1], memberRanking[0], memberRanking[2]];
          const podiumH      = [68, 90, 50];
          const podiumColor  = ['#6b7280', '#fbbf24', '#92400e'];
          const podiumMedal  = ['🥈', '🥇', '🥉'];

          return (
            <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>

              {/* Banner: minha posição */}
              {myEntry && (
                <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.28)', borderRadius: 10, padding: '0.6rem 0.9rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 800, fontSize: '1.4rem', color: 'var(--primary)', minWidth: 40, textAlign: 'center' }}>
                    {myIdx + 1}º
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Sua posição</span>
                    <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--muted)' }}>
                      <span><strong style={{ color: '#fff' }}>{fmtPts(myPts)}</strong> pts</span>
                      {ptsToLead > 0
                        ? <span>📍 <strong style={{ color: '#f59e0b' }}>{fmtPts(ptsToLead)} pts</strong> do líder</span>
                        : <span style={{ color: 'var(--primary)', fontWeight: 700 }}>👑 Você lidera!</span>}
                      {ptsToNext > 0 && <span>🎯 mais <strong style={{ color: '#fff' }}>{fmtPts(ptsToNext)} pts</strong> para subir</span>}
                    </div>
                  </div>
                </div>
              )}

              {/* Stats rápidas */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.1rem', flexWrap: 'wrap' }}>
                {[
                  { label: '🥇 Líder',    val: `${fmtPts(maxPts)} pts` },
                  { label: '📊 Média',    val: `${avgPts} pts` },
                  { label: '👥 Membros',  val: memberRanking.length },
                  { label: '⚽ Partidas', val: `${finishedMatches.length}/${eventMatches.length}` },
                ].map((s) => (
                  <div key={s.label} style={{ flex: 1, minWidth: 68, textAlign: 'center', background: 'var(--bg)', borderRadius: 8, padding: '0.45rem 0.25rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--primary)' }}>{s.val}</div>
                    <div style={{ fontSize: '0.67rem', color: 'var(--muted)', marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Pódio */}
              {memberRanking.length >= 2 && (
                <div style={{ marginBottom: '1.2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: '0.4rem', height: 120 }}>
                    {podium.map((entry, i) => {
                      if (!entry) return <div key={i} style={{ width: 82 }} />;
                      const isMe = entry.uid === user?.uid;
                      const pts  = scorePts(entry.score);
                      const firstName = getName(entry.uid, entry.score).split(' ')[0];
                      return (
                        <div key={entry.uid} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 82 }}>
                          <div style={{ fontSize: i === 1 ? '1.6rem' : '1.2rem', lineHeight: 1, marginBottom: 3 }}>{podiumMedal[i]}</div>
                          <div style={{ fontSize: '0.72rem', fontWeight: 700, textAlign: 'center', marginBottom: 4, color: isMe ? 'var(--primary)' : '#fff', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {firstName}
                          </div>
                          <div style={{ width: '100%', background: podiumColor[i], borderRadius: '6px 6px 0 0', height: podiumH[i], display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', paddingTop: 6, opacity: isMe ? 1 : 0.8 }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: i === 1 ? '#000' : '#fff' }}>{fmtPts(pts)}</span>
                            <span style={{ fontSize: '0.6rem', color: i === 1 ? '#000' : 'rgba(255,255,255,0.8)' }}>pts</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', margin: '0 auto', width: '80%', borderRadius: '0 0 6px 6px' }} />
                </div>
              )}

              {/* Ranking com barra de progresso */}
              <h4 style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>🏆 Ranking da liga</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
                {memberRanking.map((m, i) => {
                  const medals = ['🥇', '🥈', '🥉'];
                  const pos    = i < 3 ? medals[i] : `${i + 1}º`;
                  const score  = m.score;
                  const isMe   = m.uid === user?.uid;
                  const pts    = scorePts(score);
                  const barPct = Math.round((pts / barMax) * 100);
                  const gap    = maxPts - pts;
                  return (
                    <div key={m.uid} style={{ background: isMe ? 'rgba(34,197,94,0.08)' : 'var(--bg)', borderRadius: 8, padding: '0.4rem 0.6rem', border: isMe ? '1px solid rgba(34,197,94,0.25)' : '1px solid transparent' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 5 }}>
                        <span style={{ minWidth: 24, fontWeight: 700, fontSize: '0.85rem' }}>{pos}</span>
                        <span style={{ flex: 1, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <Link to={`/perfil/${m.uid}`} className="ranking-name-link">{getName(m.uid, score)}</Link>
                          {isMe && <span className="muted" style={{ fontSize: '0.72rem' }}> (você)</span>}
                        </span>
                        <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{fmtPts(pts)} pts</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <div style={{ flex: 1, background: 'rgba(255,255,255,0.08)', borderRadius: 99, height: 5, overflow: 'hidden' }}>
                          <div style={{ width: barPct + '%', height: '100%', background: isMe ? 'var(--primary)' : '#4b5563', borderRadius: 99 }} />
                        </div>
                        {score && mode === 'ambas' && (
                          <span className="muted" style={{ fontSize: '0.68rem', whiteSpace: 'nowrap' }}>🏅{fmtPts(score.fantasyTotal ?? 0)} 🔮{fmtPts(score.predictionTotal ?? 0)}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Jogadores mais escalados (não em liga só-bolão) ── */}
              {stats.loaded && mode !== 'palpites' && (() => {
                const topDrafted = computeTopDrafted(stats.memberTeams, stats.players, stats.teamMap, memberRanking.length);
                if (!topDrafted.length) return null;
                return (
                  <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                    <h4 style={{ fontSize: '0.85rem', marginBottom: '0.6rem' }}>📌 Jogadores mais escalados na liga</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      {topDrafted.map(({ player, team, count, pct }) => (
                        <div key={player.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg)', borderRadius: 8, padding: '0.35rem 0.6rem' }}>
                          {team?.shieldEmoji && <ShieldEmoji emoji={team.shieldEmoji} size="1rem" />}
                          <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player.name}</span>
                          <span className="muted" style={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{POSITION_LABELS[player.position] || player.position}</span>
                          <div style={{ width: 60, background: 'rgba(255,255,255,0.08)', borderRadius: 99, height: 5, overflow: 'hidden', flexShrink: 0 }}>
                            <div style={{ width: pct + '%', height: '100%', background: 'var(--primary)', borderRadius: 99 }} />
                          </div>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, minWidth: 32, textAlign: 'right' }}>{count}/{memberRanking.length}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* ── Destaques por rodada ────────────────────────── */}
              {stats.loaded && (() => {
                const fantasyData = computeRoundData(stats.memberTeams, finishedMatches);
                const predData    = computeRoundPredictionData(
                  league.members || [], finishedMatches, stats.predictions || []
                );
                if (!fantasyData.length && !predData.length) return null;

                const bestFantasy = fantasyData.reduce((best, r) => {
                  const top = r.memberScores[0];
                  return (!best || top.pts > best.pts) ? { roundKey: r.roundKey, uid: top.uid, pts: top.pts } : best;
                }, null);
                const bestPred = predData.reduce((best, r) => {
                  const top = r.memberScores[0];
                  return (!best || top.pts > best.pts) ? { roundKey: r.roundKey, uid: top.uid, pts: top.pts } : best;
                }, null);

                // Respeita o modo da liga: só-palpites não mostra destaque fantasy,
                // só-fantasy não mostra o de palpites.
                const showFantasy = mode !== 'palpites' && bestFantasy;
                const showPred    = mode !== 'fantasy'  && bestPred;
                if (!showFantasy && !showPred) return null;
                return (
                  <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                    <h4 style={{ fontSize: '0.85rem', marginBottom: '0.6rem' }}>⚡ Destaques por rodada</h4>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {showFantasy && (
                        <div style={{ flex: 1, minWidth: 150, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, padding: '0.55rem 0.75rem' }}>
                          <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>🏅 Maior pontuação em uma rodada fantasy</div>
                          <div style={{ fontWeight: 700, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getName(bestFantasy.uid, scoreMap[bestFantasy.uid])}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--primary)', marginTop: 2 }}>{fmtPts(bestFantasy.pts)} pts · {fmtRoundKey(bestFantasy.roundKey)}</div>
                        </div>
                      )}
                      {showPred && (
                        <div style={{ flex: 1, minWidth: 150, background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 8, padding: '0.55rem 0.75rem' }}>
                          <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>🔮 Maior pontuação em uma rodada de palpites</div>
                          <div style={{ fontWeight: 700, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getName(bestPred.uid, scoreMap[bestPred.uid])}</div>
                          <div style={{ fontSize: '0.78rem', color: '#60a5fa', marginTop: 2 }}>{fmtPts(bestPred.pts)} pts · {fmtRoundKey(bestPred.roundKey)}</div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Próximas partidas */}
              {upcomingMatches.length > 0 && (
                <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                  <h4 style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>📅 Próximas partidas</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.75rem' }}>
                    {upcomingMatches.map((m) => (
                      <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', padding: '0.3rem 0', borderBottom: '1px solid var(--border)', gap: '0.5rem' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap', flex: 1 }}>
                          {m.homeShieldEmoji && <ShieldEmoji emoji={m.homeShieldEmoji} size="0.9rem" />}
                          <span>{m.homeTeamName}</span>
                          <span className="muted">×</span>
                          {m.awayShieldEmoji && <ShieldEmoji emoji={m.awayShieldEmoji} size="0.9rem" />}
                          <span>{m.awayTeamName}</span>
                        </span>
                        <span className="muted" style={{ whiteSpace: 'nowrap' }}>{m.date ? new Date(m.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Link to="/matches" className="btn-secondary" style={{ display: 'block', textAlign: 'center', fontSize: '0.82rem', padding: '0.4rem', marginTop: '0.5rem' }}>
                📅 Ver calendário completo →
              </Link>
            </div>
          );
        })()}
      </div>
    );
  };

  return (
    <>
      <h1>🏆 Ligas</h1>
      <p className="page-subtitle">Crie ou participe de ligas com seus amigos.</p>

      <div className="tabs mb-2">
        {[
          { key: 'minhas',    label: `Minhas Ligas (${myLeagues.length})` },
          { key: 'descobrir', label: '🔍 Descobrir' },
          { key: 'criar',     label: '+ Criar' },
          { key: 'codigo',    label: 'Entrar por código' },
        ].map((t) => (
          <button
            key={t.key}
            className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && tab === 'minhas' && <p className="muted">Carregando…</p>}

      {/* Minhas ligas */}
      {tab === 'minhas' && !loading && (
        <>
          {myLeagues.length === 0 && pendingLeagues.length === 0 ? (
            <div className="card">
              <p className="muted">Você ainda não participa de nenhuma liga. Crie uma ou use um link/código de convite.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {myLeagues.map((l) => (
                <LeagueCard key={l.id} league={l} showLeave stats={leagueStats[l.id] || {}} />
              ))}
            </div>
          )}

          {/* Solicitações que enviei (aguardando aprovação) */}
          {pendingLeagues.length > 0 && (
            <div style={{ marginTop: '0.75rem' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--muted)', margin: '0 0 0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Solicitações enviadas
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {pendingLeagues.map((l) => (
                  <div key={l.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.85rem' }}>
                    <span style={{ flex: 1, minWidth: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
                    <span style={{ fontSize: '0.75rem', color: '#d97706' }}>⏳ Aguardando aprovação</span>
                    <button className="btn-secondary" style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }} onClick={() => handleCancelRequest(l.id)}>Cancelar</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Descobrir ligas */}
      {tab === 'descobrir' && !loading && (
        <>
          <input
            placeholder="🔍 Buscar liga por nome…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', marginBottom: '0.85rem', boxSizing: 'border-box' }}
          />
          {!canJoinOther && (
            <div className="error" style={{ marginBottom: '0.75rem' }}>
              Limite atingido: você só pode participar de <strong>{MAX_LEAGUES} ligas</strong> (incluindo pedidos pendentes).
            </div>
          )}
          {!discoverLoaded ? (
            <div className="card"><p className="muted">Carregando ligas…</p></div>
          ) : (() => {
            const term = searchTerm.trim().toLowerCase();
            const list = discoverLeagues
              .filter((l) => !term || (l.name || '').toLowerCase().includes(term));
            if (list.length === 0) {
              return <div className="card"><p className="muted">{term ? 'Nenhuma liga encontrada.' : 'Nenhuma liga disponível para entrar neste evento.'}</p></div>;
            }
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {list.map((l) => {
                  const isPending = l.pendingMembers?.includes(user?.uid);
                  return (
                    <div key={l.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.7rem 0.85rem' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
                        <div style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>
                          👥 {l.members?.length || 0}
                          {l.leagueMode && l.leagueMode !== 'ambas' && (l.leagueMode === 'fantasy' ? ' · 🏅 Fantasy' : ' · 🔮 Palpites')}
                        </div>
                      </div>
                      {isPending ? (
                        <button className="btn-secondary" style={{ fontSize: '0.78rem' }} onClick={() => handleCancelRequest(l.id)}>⏳ Cancelar</button>
                      ) : (
                        <button className="btn" style={{ fontSize: '0.78rem' }} disabled={!canJoinOther} onClick={() => handleJoinPublic(l)}>Solicitar</button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </>
      )}

      {/* Criar liga */}
      {tab === 'criar' && (
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Nova liga</h3>
          {!canCreate && (
            <div className="error" style={{ marginBottom: '0.75rem' }}>
              {myCreated.length > 0
                ? <>Você já criou uma liga. Cada usuário pode criar apenas <strong>uma liga</strong>.</>
                : <>Você atingiu o limite de <strong>{MAX_LEAGUES} ligas</strong>. Saia de uma para criar outra.</>}
            </div>
          )}
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', opacity: canCreate ? 1 : 0.5, pointerEvents: canCreate ? 'auto' : 'none' }}>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 600, marginBottom: '0.4rem' }}>Ícone da liga</div>
              <EmojiPicker value={newEmoji} size={48} label="ícone da liga" onChange={setNewEmoji} />
            </div>
            <div>
              <input
                placeholder="Nome da liga..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={20}
                required
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
              {newName.length > 14 && (
                <span style={{ fontSize: '0.72rem', color: newName.length >= 20 ? '#ef4444' : 'var(--muted)', display: 'block', textAlign: 'right', marginTop: '0.2rem' }}>
                  {newName.length}/20
                </span>
              )}
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 600, marginBottom: '0.4rem' }}>Tipo de competição</div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {[
                  { value: 'ambas',    label: '🏅 Fantasy + Palpites' },
                  { value: 'fantasy',  label: '🏅 Apenas Fantasy' },
                  { value: 'palpites', label: '🔮 Apenas Palpites' },
                ].map((opt) => (
                  <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                    <input type="radio" name="leagueMode" checked={leagueMode === opt.value} onChange={() => setLeagueMode(opt.value)} />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
            <button type="submit" disabled={creating || !newName.trim()}>
              {creating ? 'Criando…' : 'Criar liga'}
            </button>
          </form>
          {createMsg.text && (
            <div className={createMsg.type} style={{ marginTop: '0.75rem' }}>{createMsg.text}</div>
          )}
        </div>
      )}

      {/* Entrar por código */}
      {tab === 'codigo' && (
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Entrar por código de convite</h3>
          {!canJoinOther && (
            <div className="error" style={{ marginBottom: '0.75rem' }}>
              Limite atingido: você só pode participar de <strong>{MAX_LEAGUES} ligas</strong> (incluindo pedidos pendentes).
            </div>
          )}
          <form onSubmit={handleJoinByCode} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', opacity: canJoinOther ? 1 : 0.5, pointerEvents: canJoinOther ? 'auto' : 'none' }}>
            <input
              style={{ flex: 1, minWidth: '180px' }}
              placeholder="Código ou ID da liga..."
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              required
            />
            <button type="submit" disabled={joining || !codeInput.trim()}>
              {joining ? 'Enviando…' : 'Solicitar'}
            </button>
          </form>
          {joinMsg.text && (
            <div className={joinMsg.type} style={{ marginTop: '0.75rem' }}>{joinMsg.text}</div>
          )}
        </div>
      )}

    </>
  );
}
