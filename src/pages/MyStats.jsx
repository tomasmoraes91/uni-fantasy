import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEvent } from '../context/EventContext';
import { useScore } from '../context/ScoreContext';
import { getMatchesByEvent, getUserPredictions, getPlayers, getUserBadges } from '../services/firestore';
import { BADGES, RARITY } from '../utils/badges';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../services/firebase';
import { calcFantasyPoints, predictionPoints } from '../utils/scoring';
import { SPORT_LABELS, POSITION_LABELS, fmtPts } from '../utils/labels';
import { SQUAD_CONFIG } from '../utils/sportRules';

const SPORT_ICONS = { futebol:'⚽', futsal:'⚽', basketball:'🏀', volleyball:'🏐', handball:'🤾' };

// Cor da sigla de posição: amarelo=goleiro, azul=defensor, verde=meio, vermelho=atacante
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

export default function MyStats() {
  const { user }       = useAuth();
  const { eventId }    = useEvent();
  const { myScore, myTotal, myRank } = useScore();
  const location = useLocation();

  const [matches,    setMatches]    = useState([]);
  const [userTeams,  setUserTeams]  = useState([]);
  const [players,    setPlayers]    = useState({});
  const [preds,      setPreds]      = useState({});
  const [userBadges,     setUserBadges]     = useState({});
  const [badgesExpanded, setBadgesExpanded] = useState(!!location.state?.badgesExpanded);
  const [activeBadgeId,  setActiveBadgeId]  = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [sportFilter,    setSportFilter]    = useState('all');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [allMatches, predsRaw, teamsSnap, allPlayers, badges] = await Promise.all([
        getMatchesByEvent(eventId),
        getUserPredictions(user.uid),
        getDocs(query(collection(db, 'user_teams'), where('uid', '==', user.uid))),
        getPlayers(),   // cacheado em memória; cobre pool do evento + padrão
        getUserBadges(user.uid),
      ]);

      const teams = teamsSnap.docs
        .map((d) => d.data())
        .filter((t) => (t.eventId || 'default') === eventId);

      const plMap = {};
      allPlayers.forEach((p) => { plMap[p.id] = p; });

      const predMap = {};
      predsRaw.forEach((p) => { predMap[p.matchId] = { h: p.homeScore, a: p.awayScore }; });

      setMatches(allMatches.filter((m) => m.status === 'finished'));
      setUserTeams(teams);
      setPlayers(plMap);
      setPreds(predMap);
      setUserBadges(badges);
      setLoading(false);
    })();
  }, [user, eventId]);

  // Constrói stats por jogador: {playerId → {player, sport, matchPts: [{matchId, homeTeam, awayTeam, pts}], total, isCaptain}}
  const playerStats = useMemo(() => {
    const acc = {};
    userTeams.forEach((team) => {
      (team.playerIds || []).forEach((pid) => {
        if (!acc[pid]) {
          acc[pid] = {
            player: players[pid],
            sport: team.sport,
            isCaptain: team.captainId === pid,
            matchPts: [],
            total: 0,
          };
        }
      });
      matches.forEach((m) => {
        if (m.sport !== team.sport) return;
        (m.playerStats || []).forEach((stat) => {
          if (!team.playerIds?.includes(stat.playerId)) return;
          let pts = calcFantasyPoints(stat, m, false);
          if (team.captainId === stat.playerId) pts *= 2;
          if (!acc[stat.playerId]) return;
          acc[stat.playerId].matchPts.push({
            matchId: m.id,
            date: m.date,
            homeTeam: m.homeTeamName,
            awayTeam: m.awayTeamName,
            homeScore: m.homeScore,
            awayScore: m.awayScore,
            pts,
            isCaptainMatch: team.captainId === stat.playerId,
          });
          acc[stat.playerId].total += pts;
        });
      });
    });
    return acc;
  }, [userTeams, matches, players]);

  // Stats por palpite
  const predStats = useMemo(() => {
    return matches.map((m) => {
      const pred = preds[m.id];
      if (!pred) return null;
      const earned = predictionPoints({ homeScore: pred.h, awayScore: pred.a }, m);
      return { matchId: m.id, date: m.date, homeTeam: m.homeTeamName, awayTeam: m.awayTeamName,
               homeScore: m.homeScore, awayScore: m.awayScore, pred, earned, sport: m.sport };
    }).filter(Boolean);
  }, [matches, preds]);

  // Agrupa partidas por rodada — rodada tem prioridade sobre phase
  const matchesByRound = useMemo(() => {
    const map = {};
    matches.forEach((m) => {
      const key = m.rodada != null ? String(m.rodada) : (m.phase || 'Sem rodada');
      if (!map[key]) map[key] = [];
      map[key].push(m);
    });
    return map;
  }, [matches]);

  // Para cada rodada: pontos do usuário (soma de todos os seus times)
  const roundStats = useMemo(() => {
    return Object.entries(matchesByRound).map(([roundKey, roundMatches]) => {
      let pts = 0;
      userTeams.forEach((team) => {
        const playerIds = team.playerIds || [];
        roundMatches.forEach((m) => {
          if (m.sport !== team.sport) return;
          (m.playerStats || []).forEach((st) => {
            if (!playerIds.includes(st.playerId)) return;
            let p = calcFantasyPoints(st, m, false);
            if (team.captainId === st.playerId) p *= 2;
            pts += p;
          });
        });
      });
      return { roundKey, pts: Math.round(pts * 10) / 10, matchCount: roundMatches.length };
    }).filter((r) => r.matchCount > 0);
  }, [matchesByRound, userTeams]);

  const bestRound  = roundStats.length ? roundStats.reduce((b, r) => r.pts > b.pts ? r : b) : null;
  const worstRound = roundStats.length > 1 ? roundStats.reduce((b, r) => r.pts < b.pts ? r : b) : null;

  // Jogador mais escalado (do time atual, aparece em mais rodadas com estatísticas)
  const playerUsage = useMemo(() => {
    const acc = {};
    userTeams.forEach((team) => {
      (team.playerIds || []).forEach((pid) => {
        const hasStats = Object.values(matchesByRound).some((ms) =>
          ms.some((m) => m.sport === team.sport && (m.playerStats || []).some((s) => s.playerId === pid))
        );
        if (!hasStats || !players[pid]) return;
        if (!acc[pid]) acc[pid] = { name: players[pid].name, rounds: 0 };
        acc[pid].rounds++;
      });
    });
    return Object.values(acc).sort((a, b) => b.rounds - a.rounds).slice(0, 5);
  }, [userTeams, matchesByRound, players]);

  const myFantasy = myScore?.fantasyTotal ?? 0;
  const myPred    = myScore?.predictionTotal ?? 0;

  const sports = ['futebol', 'futsal', 'basketball', 'volleyball', 'handball'];
  const activeSports = sports.filter((s) =>
    userTeams.some((t) => t.sport === s) || predStats.some((p) => p.sport === s)
  );

  const filteredPlayerStats = Object.values(playerStats).filter(
    (x) => sportFilter === 'all' || x.sport === sportFilter
  );
  const filteredPredStats = predStats.filter(
    (p) => sportFilter === 'all' || p.sport === sportFilter
  );

  if (loading) return <div className="loading">Carregando estatísticas…</div>;

  return (
    <>
      <h1>📊 Minha pontuação</h1>
      <p className="page-subtitle">Detalhe de cada jogador, partida e palpite.</p>

      {/* Resumo geral */}
      <div className="card mb-2" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)' }}>#{myRank}</span>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Posição geral</div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{myTotal} pts totais</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--primary)' }}>{myFantasy}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>🏅 Fantasy</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--accent)' }}>{myPred}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>🔮 Palpites</div>
          </div>
        </div>
      </div>

      {/* Breakdown por modalidade */}
      {activeSports.length > 1 && (
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {[{ key: 'all', label: 'Todos' }, ...activeSports.map((s) => ({ key: s, label: SPORT_LABELS[s] || s }))].map(({ key, label }) => (
            <button
              key={key}
              className={`event-type-chip ${sportFilter === key ? 'active' : ''}`}
              onClick={() => setSportFilter(key)}
            >
              {key !== 'all' && (SPORT_ICONS[key] || '')} {label}
            </button>
          ))}
        </div>
      )}

      {/* ── Conquistas (recolhível) ──────────────────────── */}
      {(() => {
        const earnedEntries = Object.entries(BADGES).filter(([id]) => userBadges[id]);
        const allEntries    = Object.entries(BADGES);
        const displayed     = badgesExpanded ? allEntries : earnedEntries;
        const earnedCount   = earnedEntries.length;
        return (
          <div className="card mb-2" style={{ padding: '0.75rem 1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: badgesExpanded || earnedCount > 0 ? '0.65rem' : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>🏅 Conquistas</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{earnedCount}/{allEntries.length}</span>
              </div>
              <button
                onClick={() => setBadgesExpanded(v => !v)}
                style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem 0.4rem' }}
              >
                {badgesExpanded ? 'Recolher ▲' : 'Ver todas ▼'}
              </button>
            </div>
            {displayed.length === 0 && !badgesExpanded ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: 0 }}>Nenhuma conquista ainda.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(82px, 1fr))', gap: '0.45rem' }}>
                {displayed.map(([id, def]) => {
                  const earned = userBadges[id];
                  const rarity = RARITY[def.rarity];
                  return (
                    <div key={id}
                      onClick={() => setActiveBadgeId(prev => prev === id ? null : id)}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem',
                        padding: '0.55rem 0.25rem', borderRadius: 10, textAlign: 'center', cursor: 'pointer',
                        background: earned ? `${rarity.border}12` : 'transparent',
                        border: `2px solid ${activeBadgeId === id ? rarity.border : earned ? rarity.border : 'rgba(255,255,255,0.06)'}`,
                        boxShadow: earned ? `0 0 10px ${rarity.glow}` : 'none',
                        outline: activeBadgeId === id ? `2px solid ${rarity.border}` : 'none',
                        outlineOffset: 2,
                      }}>
                      <span style={{ fontSize: '1.5rem', lineHeight: 1, filter: earned ? 'none' : 'grayscale(1) brightness(0.3)' }}>
                        {def.icon}
                      </span>
                      <span style={{ fontSize: '0.6rem', fontWeight: 700, lineHeight: 1.2, color: earned ? rarity.text : 'rgba(255,255,255,0.15)' }}>
                        {def.name}
                      </span>
                      {earned && (
                        <span style={{ fontSize: '0.52rem', fontWeight: 700, background: rarity.border + '22', color: rarity.text, border: `1px solid ${rarity.border}55`, borderRadius: 99, padding: '0.04rem 0.3rem' }}>
                          {earned.count}×
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Análise por rodada ───────────────────────────── */}
      {roundStats.length > 0 && (
        <>
          <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>📅 Análise por rodada</h2>

          {/* Cards de destaque */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:'0.5rem', marginBottom:'0.75rem' }}>
            {bestRound && (
              <div className="card" style={{ padding:'0.65rem', textAlign:'center', borderTop:'2px solid var(--primary)' }}>
                <div style={{ fontSize:'0.68rem', color:'var(--muted)', marginBottom:2 }}>🏆 Melhor rodada</div>
                <div style={{ fontWeight:800, fontSize:'1.1rem', color:'var(--primary)' }}>{bestRound.pts} pts</div>
                <div style={{ fontSize:'0.75rem' }}>{bestRound.roundKey}</div>
              </div>
            )}
            {worstRound && (
              <div className="card" style={{ padding:'0.65rem', textAlign:'center', borderTop:'2px solid #ef4444' }}>
                <div style={{ fontSize:'0.68rem', color:'var(--muted)', marginBottom:2 }}>📉 Pior rodada</div>
                <div style={{ fontWeight:800, fontSize:'1.1rem', color:'#ef4444' }}>{worstRound.pts} pts</div>
                <div style={{ fontSize:'0.75rem' }}>{worstRound.roundKey}</div>
              </div>
            )}
            {playerUsage[0] && (
              <div className="card" style={{ padding:'0.65rem', textAlign:'center', borderTop:'2px solid #60a5fa' }}>
                <div style={{ fontSize:'0.68rem', color:'var(--muted)', marginBottom:2 }}>⭐ Mais escalado</div>
                <div style={{ fontWeight:700, fontSize:'0.88rem' }}>{playerUsage[0].name}</div>
                <div style={{ fontSize:'0.75rem', color:'var(--muted)' }}>{playerUsage[0].rounds} rodada{playerUsage[0].rounds !== 1 ? 's' : ''}</div>
              </div>
            )}
          </div>

          {/* Tabela de rodadas */}
          <div className="card mb-2" style={{ padding:0, overflow:'hidden' }}>
            <table className="ranking-table">
              <thead>
                <tr>
                  <th>Rodada</th>
                  <th className="ranking-num-col">Partidas</th>
                  <th className="ranking-num-col">Pts fantasy</th>
                </tr>
              </thead>
              <tbody>
                {roundStats.map((r) => (
                  <tr key={r.roundKey} className="ranking-row"
                    style={{ background: r === bestRound ? 'rgba(34,197,94,0.06)' : r === worstRound ? 'rgba(239,68,68,0.06)' : undefined }}>
                    <td style={{ fontSize:'0.85rem' }}>
                      {r.roundKey}
                      {r === bestRound  && <span style={{ marginLeft:6, fontSize:'0.7rem' }}>🏆</span>}
                      {r === worstRound && <span style={{ marginLeft:6, fontSize:'0.7rem' }}>📉</span>}
                    </td>
                    <td className="ranking-num-col ranking-secondary">{r.matchCount}</td>
                    <td className="ranking-num-col" style={{ fontWeight:700, color: r.pts >= 0 ? 'var(--primary)' : '#ef4444' }}>
                      {r.pts > 0 ? '+' : ''}{r.pts}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Jogadores escalados — widget único ───────────── */}
      <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>🏅 Meus jogadores escalados</h2>
      {filteredPlayerStats.length === 0 ? (
        <div className="card mb-2"><p className="muted">Nenhum jogador escalado ainda.</p></div>
      ) : (
        <div className="card mb-2" style={{ padding: '0.75rem 1rem' }}>
          {/* Agrupa por esporte */}
          {['futebol','futsal','basketball','volleyball','handball']
            .filter((s) => filteredPlayerStats.some((x) => x.sport === s))
            .map((sport) => {
              const sportPlayers = filteredPlayerStats
                .filter((x) => x.sport === sport)
                .sort((a, b) => b.total - a.total);
              return (
                <div key={sport} style={{ marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {SPORT_ICONS[sport]} {SPORT_LABELS[sport] || sport}
                  </div>
                  {sportPlayers.map((x) => {
                    const p = x.player;
                    if (!p) return null;
                    const pos = p.position || '';
                    const posColor = POS_COLOR[pos] || 'var(--muted)';
                    return (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.28rem 0', borderBottom: '1px solid var(--border)' }}>
                        {/* Sigla da posição colorida */}
                        <span style={{
                          fontSize: '0.6rem', fontWeight: 800, color: posColor,
                          border: `1px solid ${posColor}`, borderRadius: 4,
                          padding: '0.05rem 0.3rem', flexShrink: 0, letterSpacing: '0.02em',
                          minWidth: '2.2rem', textAlign: 'center',
                        }}>
                          {pos || '—'}
                        </span>
                        {/* Nome + capitão */}
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '0.3rem', overflow: 'hidden' }}>
                          <Link to={`/jogador/${p.id}`} style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.name}
                          </Link>
                          {x.isCaptain && <span className="captain-badge" style={{ flexShrink: 0, fontSize: '0.6rem' }}>C</span>}
                        </div>
                        {/* Pontos */}
                        <span style={{ flexShrink: 0, fontWeight: 700, fontSize: '0.85rem', color: x.total >= 0 ? 'var(--primary)' : 'var(--danger)' }}>
                          {x.total > 0 ? '+' : ''}{fmtPts(x.total)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })
          }
        </div>
      )}

      {/* ── Palpites ─────────────────────────────────────── */}
      <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem', marginTop: '0.5rem' }}>🔮 Meus palpites</h2>
      {filteredPredStats.length === 0 ? (
        <div className="card mb-2"><p className="muted">Nenhum palpite enviado ainda.</p></div>
      ) : (
        filteredPredStats
          .sort((a, b) => (b.date || 0) - (a.date || 0))
          .map((ps) => {
            const exact = ps.pred.h === ps.homeScore && ps.pred.a === ps.awayScore;
            const hit   = ps.earned > 0;
            return (
              <div key={ps.matchId} className="card mb-2" style={{ padding: '0.75rem 1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                      {ps.homeTeam} {ps.homeScore}×{ps.awayScore} {ps.awayTeam}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                      {SPORT_LABELS[ps.sport] || ps.sport}
                      {ps.date ? ` · ${new Date(ps.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}` : ''}
                      {' '}· Seu palpite: {ps.pred.h}×{ps.pred.a}
                      {exact ? ' 🎯' : ''}
                    </div>
                  </div>
                  <span style={{ fontWeight: 700, fontSize: '1rem', color: hit ? 'var(--primary)' : 'var(--muted)' }}>
                    {hit ? `+${ps.earned}` : '0'} pts
                  </span>
                </div>
              </div>
            );
          })
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
