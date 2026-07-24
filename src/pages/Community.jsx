import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useScore } from '../context/ScoreContext';
import { useNotificationContext } from '../context/NotificationContext';
import { searchUsers, getFriends, getFriendRequests } from '../services/firestore';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../services/firebase';

export default function Community() {
  const { user, profile }  = useAuth();
  const { allScores }      = useScore();
  const { refresh: refreshNotifs } = useNotificationContext();
  const [friends, setFriends]     = useState([]);
  const [requests, setRequests]   = useState([]);
  const [query,   setQuery]       = useState('');
  const [results, setResults]     = useState([]);
  const [searching, setSearching] = useState(false);
  const [tab,     setTab]         = useState('amigos');

  const loadFriends  = async () => { if (!user) return; setFriends(await getFriends(user.uid)); };
  const loadRequests = async () => { if (!user) return; setRequests(await getFriendRequests(user.uid)); };

  useEffect(() => {
    loadFriends();
    loadRequests();
  }, [user]);

  const handleSearch = async (e) => {
    const q = e.target.value;
    setQuery(q);
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    const res = await searchUsers(q);
    setResults(res.filter((u) => u.uid !== user?.uid));
    setSearching(false);
  };

  // Adiciona/remove amigo e gerencia o pedido na subcoleção do outro
  const toggleFriend = async (targetUser) => {
    const myFriendRef      = doc(db, 'users', user.uid, 'friends', targetUser.uid);
    const theirRequestRef  = doc(db, 'users', targetUser.uid, 'friendRequests', user.uid);
    const isFriend = friends.some((f) => f.uid === targetUser.uid);

    if (isFriend) {
      await Promise.all([
        deleteDoc(myFriendRef),
        deleteDoc(theirRequestRef),   // remove o pedido que eu enviei
      ]);
    } else {
      await Promise.all([
        setDoc(myFriendRef, {
          uid: targetUser.uid,
          displayName: targetUser.displayName || '',
          addedAt: Date.now(),
        }),
        setDoc(theirRequestRef, {
          fromUid:     user.uid,
          displayName: profile?.displayName || user.displayName || '',
          sentAt:      Date.now(),
        }),
      ]);
    }
    await loadFriends();
  };

  // Adiciona o remetente de volta e remove o pedido
  const addFromRequest = async (req) => {
    const myFriendRef    = doc(db, 'users', user.uid, 'friends', req.fromUid);
    const myRequestRef   = doc(db, 'users', user.uid, 'friendRequests', req.fromUid);
    await Promise.all([
      setDoc(myFriendRef, {
        uid:         req.fromUid,
        displayName: req.displayName || '',
        addedAt:     Date.now(),
      }),
      deleteDoc(myRequestRef),
    ]);
    await Promise.all([loadFriends(), loadRequests()]);
    refreshNotifs();
  };

  // Dispensa o pedido sem adicionar
  const dismissRequest = async (req) => {
    await deleteDoc(doc(db, 'users', user.uid, 'friendRequests', req.fromUid));
    await loadRequests();
    refreshNotifs();
  };

  const scoreMap = useMemo(() =>
    Object.fromEntries(allScores.map((s) => [s.uid, s])), [allScores]
  );

  const friendIds = useMemo(
    () => new Set([...friends.map((f) => f.uid), user?.uid]),
    [friends, user]
  );
  const friendRanking = useMemo(() =>
    allScores
      .filter((s) => friendIds.has(s.uid))
      .map((s) => ({
        ...s,
        fantasyTotal:    s.fantasyTotal    ?? 0,
        predictionTotal: s.predictionTotal ?? 0,
        total:           (s.fantasyTotal ?? 0) + (s.predictionTotal ?? 0),
      }))
      .sort((a, b) => b.total - a.total)
      .map((s, i) => ({ ...s, rank: i + 1 })),
    [allScores, friendIds]
  );

  // Pedidos que ainda não são amigos
  const pendingRequests = useMemo(
    () => requests.filter((r) => !friends.some((f) => f.uid === r.fromUid)),
    [requests, friends]
  );

  const MEDALS = ['🥇', '🥈', '🥉'];

  return (
    <>
      <h1>👥 Comunidade</h1>
      <p className="page-subtitle">Acompanhe seus amigos e compare pontuações.</p>

      {/* Busca */}
      <div className="card community-search-card">
        <div className="community-search-row">
          <input
            className="community-search-input"
            placeholder="🔍 Buscar jogadores por nome..."
            value={query}
            onChange={handleSearch}
          />
        </div>
        {searching && <p className="muted" style={{ fontSize:'0.85rem', marginTop:'0.5rem' }}>Buscando…</p>}
        {results.length > 0 && (
          <div className="community-results">
            {results.map((u) => {
              const isFriend = friends.some((f) => f.uid === u.uid);
              const score    = scoreMap[u.uid];
              return (
                <div key={u.uid} className="community-result-row">
                  <div className="community-user-info">
                    <div className="community-avatar">{(u.displayName || '?').slice(0,2).toUpperCase()}</div>
                    <div>
                      <Link to={`/perfil/${u.uid}`} className="ranking-name-link" style={{ fontWeight:700 }}>
                        {u.displayName || 'Jogador'}
                      </Link>
                      {score && <div className="muted" style={{ fontSize:'0.78rem' }}>{score.total ?? 0} pts</div>}
                    </div>
                  </div>
                  <button
                    className={isFriend ? 'btn-secondary' : 'btn'}
                    style={{ fontSize:'0.82rem', padding:'0.3rem 0.75rem' }}
                    onClick={() => toggleFriend(u)}
                  >
                    {isFriend ? '✓ Amigo' : '+ Adicionar'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Abas */}
      <div className="tabs mb-2">
        {[
          { key: 'amigos',   label: `👥 Amigos (${friends.length})` },
          { key: 'pedidos',  label: pendingRequests.length > 0
              ? `📬 Pedidos`
              : '📬 Pedidos',
            badge: pendingRequests.length },
          { key: 'ranking',  label: '🏆 Ranking entre amigos' },
        ].map((t) => (
          <button
            key={t.key}
            className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
            style={{ position: 'relative' }}
          >
            {t.label}
            {t.badge > 0 && (
              <span style={{
                position: 'absolute', top: '2px', right: '4px',
                background: '#dc2626', color: '#fff',
                borderRadius: '50%', fontSize: '0.65rem',
                width: '16px', height: '16px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, lineHeight: 1,
              }}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Lista de amigos */}
      {tab === 'amigos' && (
        friends.length === 0 ? (
          <div className="card">
            <p className="muted">Você ainda não tem amigos adicionados. Use a busca acima para encontrar jogadores.</p>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
            {friends.map((f) => {
              const score = scoreMap[f.uid];
              return (
                <div key={f.uid} className="card community-friend-row">
                  <div className="community-user-info">
                    <div className="community-avatar">{(f.displayName || '?').slice(0,2).toUpperCase()}</div>
                    <div>
                      <Link to={`/perfil/${f.uid}`} className="ranking-name-link" style={{ fontWeight:700 }}>
                        {f.displayName || 'Jogador'}
                      </Link>
                      <div className="muted" style={{ fontSize:'0.78rem' }}>
                        {score ? `${score.total ?? 0} pts totais` : 'Sem pontuação'}
                      </div>
                    </div>
                  </div>
                  <div className="flex" style={{ gap:'0.5rem', alignItems:'center' }}>
                    {score && (
                      <span style={{ fontWeight:700, color:'var(--primary)', fontSize:'0.9rem' }}>
                        {score.total ?? 0} pts
                      </span>
                    )}
                    <button
                      className="btn-secondary"
                      style={{ fontSize:'0.78rem', padding:'0.25rem 0.6rem' }}
                      onClick={() => toggleFriend(f)}
                    >
                      Remover
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Pedidos recebidos */}
      {tab === 'pedidos' && (
        pendingRequests.length === 0 ? (
          <div className="card">
            <p className="muted">Nenhum pedido de amizade pendente.</p>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
            {pendingRequests.map((req) => {
              const score = scoreMap[req.fromUid];
              return (
                <div key={req.fromUid} className="card community-friend-row">
                  <div className="community-user-info">
                    <div className="community-avatar">
                      {(req.displayName || '?').slice(0,2).toUpperCase()}
                    </div>
                    <div>
                      <Link to={`/perfil/${req.fromUid}`} className="ranking-name-link" style={{ fontWeight:700 }}>
                        {req.displayName || 'Jogador'}
                      </Link>
                      <div className="muted" style={{ fontSize:'0.78rem' }}>
                        {score ? `${score.total ?? 0} pts` : 'Sem pontuação'} · te adicionou como amigo
                      </div>
                    </div>
                  </div>
                  <div className="flex" style={{ gap:'0.4rem' }}>
                    <button
                      className="btn"
                      style={{ fontSize:'0.78rem', padding:'0.25rem 0.65rem' }}
                      onClick={() => addFromRequest(req)}
                    >
                      + Adicionar
                    </button>
                    <button
                      className="btn-secondary"
                      style={{ fontSize:'0.78rem', padding:'0.25rem 0.6rem' }}
                      onClick={() => dismissRequest(req)}
                    >
                      Dispensar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Ranking entre amigos */}
      {tab === 'ranking' && (
        friendRanking.length === 0 ? (
          <div className="card"><p className="muted">Adicione amigos para ver o ranking.</p></div>
        ) : (
          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            <table className="ranking-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Jogador</th>
                  <th style={{ textAlign:'right' }}>🏅</th>
                  <th style={{ textAlign:'right' }}>🔮</th>
                  <th style={{ textAlign:'right', paddingRight:'0.75rem' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {friendRanking.map((r) => (
                  <tr key={r.uid} className={`ranking-row ${r.uid === user?.uid ? 'me' : ''}`}>
                    <td className="ranking-rank">{MEDALS[r.rank-1] || `${r.rank}º`}</td>
                    <td>
                      <Link to={`/perfil/${r.uid}`} className="ranking-name-link">
                        {r.displayName || 'Anônimo'}
                      </Link>
                      {r.uid === user?.uid && <span className="muted" style={{ fontSize:'0.75rem', marginLeft:6 }}>(você)</span>}
                    </td>
                    <td style={{ textAlign:'right', color:'var(--muted)', fontSize:'0.9rem' }}>{r.fantasyTotal ?? 0}</td>
                    <td style={{ textAlign:'right', color:'var(--muted)', fontSize:'0.9rem' }}>{r.predictionTotal ?? 0}</td>
                    <td className="ranking-points">{r.total ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </>
  );
}
