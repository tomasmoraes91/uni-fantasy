import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useEvent } from '../context/EventContext';
import { useLeague } from '../context/LeagueContext';
import { getScoresByEvent, getFriends } from '../services/firestore';
import { SPORT_LABELS } from '../utils/labels';
import { Link, useLocation } from 'react-router-dom';

const MEDALS = ['🥇', '🥈', '🥉'];
const SPORT_ICONS = { futebol: '⚽', futsal: '⚽', basketball: '🏀', handball: '🤾', volleyball: '🏐' };

function extractPts(score, tab) {
  if (tab === 'overall')     return score.total ?? 0;
  if (tab === 'predictions') return score.predictionTotal ?? 0;
  if (tab === 'fantasy')     return score.fantasyTotal ?? 0;
  const v = score.bySport?.[tab];
  if (v == null) return 0;
  return typeof v === 'object' ? v.total : v;
}
function extractFantasy(score, tab) {
  if (tab === 'overall')     return score.fantasyTotal ?? 0;
  if (tab === 'fantasy')     return score.fantasyTotal ?? 0;
  if (tab === 'predictions') return 0;
  const v = score.bySport?.[tab];
  return typeof v === 'object' ? v.fantasy : 0;
}
function extractPred(score, tab) {
  if (tab === 'overall')     return score.predictionTotal ?? 0;
  if (tab === 'predictions') return score.predictionTotal ?? 0;
  if (tab === 'fantasy')     return 0;
  const v = score.bySport?.[tab];
  return typeof v === 'object' ? v.prediction : 0;
}

export default function Rankings() {
  const { user } = useAuth();
  const { eventId, currentEvent } = useEvent();
  const { currentLeague } = useLeague();
  const location = useLocation();
  const [scores,    setScores]    = useState([]);
  const [friendIds, setFriendIds] = useState(new Set());
  const [tab,       setTab]       = useState(location.state?.tab || 'overall');
  const [loading,   setLoading]   = useState(true);
  const [showFriendsOnly, setShowFriendsOnly] = useState(false);

  // Abas respeitam o modo da liga: só-palpite mostra só Palpites; só-fantasy só
  // Fantasy (e modalidades); 'ambas'/pública mostra tudo.
  const leagueMode = currentLeague?.leagueMode || 'ambas';
  const tabs = useMemo(() => {
    const mods = currentEvent?.modalidades || [];
    if (leagueMode === 'palpites') return [{ key: 'predictions', label: '🔮 Palpites' }];
    const sportTabs = mods.map((s) => ({ key: s, label: (SPORT_ICONS[s] || '') + ' ' + (SPORT_LABELS[s] || s) }));
    if (leagueMode === 'fantasy') {
      return mods.length <= 1 ? [{ key: 'fantasy', label: '🏅 Fantasy' }] : sportTabs;
    }
    if (mods.length <= 1) {
      return [
        { key: 'overall',     label: 'Geral' },
        { key: 'fantasy',     label: '🏅 Fantasy' },
        { key: 'predictions', label: '🔮 Palpites' },
      ];
    }
    return [{ key: 'overall', label: 'Geral' }, ...sportTabs];
  }, [currentEvent, leagueMode]);

  // Se a aba atual não existe no modo da liga (troca de liga/evento), volta p/ a 1ª.
  useEffect(() => {
    if (!tabs.some((t) => t.key === tab)) setTab(tabs[0]?.key || 'overall');
  }, [tabs]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [s, friends] = await Promise.all([
        getScoresByEvent(eventId),
        user ? getFriends(user.uid) : [],
      ]);
      setScores(s);
      setFriendIds(new Set(friends.map((f) => f.uid)));
      setLoading(false);
    })();
  }, [eventId]);

  const ranked = useMemo(() => {
    // Liga privada → só membros; liga pública (memberUids null) → todos do evento.
    const memberSet = currentLeague?.memberUids ? new Set(currentLeague.memberUids) : null;
    return [...scores]
      .filter((s) => (!memberSet || memberSet.has(s.uid))
                  && (!showFriendsOnly || s.uid === user?.uid || friendIds.has(s.uid)))
      .sort((a, b) => extractPts(b, tab) - extractPts(a, tab))
      .map((s, i) => ({
        ...s,
        rank:       i + 1,
        points:     extractPts(s, tab),
        fantasy:    extractFantasy(s, tab),
        prediction: extractPred(s, tab),
      }));
  }, [scores, tab, showFriendsOnly, friendIds, currentLeague]);

  const myEntry = ranked.find((r) => r.uid === user?.uid);

  const showFantasyCol  = tab !== 'predictions';
  const showPredCol     = tab !== 'fantasy';

  return (
    <>
      <h1>Ranking</h1>
      <p className="page-subtitle">Veja sua posição na liga.</p>

      {myEntry && (
        <div className="my-rank-card">
          <div className="my-rank-position">
            {MEDALS[myEntry.rank - 1] || `#${myEntry.rank}`}
          </div>
          <div className="my-rank-info">
            <div className="my-rank-name">{myEntry.displayName}</div>
            <div className="my-rank-pts">{myEntry.points} pontos</div>
            <div className="stat-breakdown" style={{ marginTop: '0.2rem' }}>
              {showFantasyCol && <span>🏅 Fantasy: <strong>{myEntry.fantasy}</strong></span>}
              {showPredCol    && <span>🔮 Palpites: <strong>{myEntry.prediction}</strong></span>}
            </div>
          </div>
        </div>
      )}

      <div className="flex-between mb-1" style={{ flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
        <div className="tabs" style={{ marginBottom: 0 }}>
          {tabs.map((t) => (
            <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        {friendIds.size > 0 && (
          <button
            className={showFriendsOnly ? 'btn' : 'btn-secondary'}
            style={{ fontSize: '0.82rem', padding: '0.3rem 0.75rem' }}
            onClick={() => setShowFriendsOnly((v) => !v)}
          >
            👥 {showFriendsOnly ? 'Ver todos' : 'Só amigos'}
          </button>
        )}
      </div>

      {loading ? <p className="muted">Carregando…</p>
      : ranked.length === 0 ? (
        <div className="card"><p className="muted">Ainda não há pontuações.</p></div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="ranking-table">
            <colgroup>
              <col style={{ width: '60px' }} />
              <col />
              {showFantasyCol && <col style={{ width: '70px' }} />}
              {showPredCol    && <col style={{ width: '70px' }} />}
              <col style={{ width: '80px' }} />
            </colgroup>
            <thead>
              <tr>
                <th>#</th>
                <th>Jogador</th>
                {showFantasyCol && <th className="ranking-num-col">🏅</th>}
                {showPredCol    && <th className="ranking-num-col">🔮</th>}
                <th className="ranking-num-col">Total</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r) => (
                <tr key={r.uid} className={`ranking-row ${r.uid === user?.uid ? 'me' : friendIds.has(r.uid) ? 'friend' : ''}`}>
                  <td className="ranking-rank">{MEDALS[r.rank - 1] || `${r.rank}º`}</td>
                  <td>
                    <Link to={`/perfil/${r.uid}`} className="ranking-name-link">
                      {r.displayName || 'Anônimo'}
                    </Link>
                    {r.uid === user?.uid && <span className="muted" style={{ fontSize: '0.75rem', marginLeft: 6 }}>(você)</span>}
                  </td>
                  {showFantasyCol && <td className="ranking-num-col ranking-secondary">{r.fantasy}</td>}
                  {showPredCol    && <td className="ranking-num-col ranking-secondary">{r.prediction}</td>}
                  <td className="ranking-points">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
