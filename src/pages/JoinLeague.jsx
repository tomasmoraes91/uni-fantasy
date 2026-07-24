import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getLeagueByCode, requestJoinLeague, getUserLeagues } from '../services/firestore';

export default function JoinLeague() {
  const { code }      = useParams();
  const { user }      = useAuth();
  const navigate      = useNavigate();
  const [league, setLeague]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining,      setJoining]      = useState(false);
  const [joined,       setJoined]       = useState(false);   // já é membro
  const [requested,    setRequested]    = useState(false);   // solicitação enviada/pendente
  const [error,        setError]        = useState('');
  const [canJoinOther, setCanJoinOther] = useState(true);

  useEffect(() => {
    (async () => {
      const [l, userLeagues] = await Promise.all([
        getLeagueByCode(code),
        user ? getUserLeagues(user.uid) : Promise.resolve([]),
      ]);
      setLeague(l);
      if (l && l.members?.includes(user?.uid)) setJoined(true);
      if (l && l.pendingMembers?.includes(user?.uid)) setRequested(true);
      // Pode participar de várias ligas de terceiros (teto generoso)
      if (l && l.createdBy !== user?.uid) {
        setCanJoinOther(userLeagues.length < 20);
      }
      setLoading(false);
    })();
  }, [code, user]);

  const handleJoin = async () => {
    if (!league || !user) return;
    if (league.createdBy === user.uid) { setError('Você é o criador desta liga.'); return; }
    if (!canJoinOther) {
      setError('Limite de ligas atingido.');
      return;
    }
    setJoining(true);
    try {
      await requestJoinLeague(league.id, user.uid);
      setRequested(true);
    } catch (e) {
      setError('Erro ao solicitar entrada. Tente novamente.');
    } finally {
      setJoining(false);
    }
  };

  if (loading) return <p className="muted">Carregando…</p>;

  if (!league) return (
    <div className="form" style={{ marginTop: '3rem' }}>
      <h1>🏆 Link inválido</h1>
      <div className="card" style={{ marginTop: '1rem' }}>
        <p className="muted">Liga não encontrada. Verifique o link de convite.</p>
        <Link to="/comunidade" className="btn" style={{ marginTop: '1rem', display: 'inline-block' }}>
          ← Voltar para Comunidade
        </Link>
      </div>
    </div>
  );

  return (
    <div className="form" style={{ marginTop: '3rem' }}>
      <h1>🏆 Convite para Liga</h1>
      <p className="page-subtitle">Você foi convidado para entrar em uma liga!</p>

      <div className="card">
        <h2 style={{ marginBottom: '0.4rem' }}>{league.name}</h2>
        <div className="stat-breakdown" style={{ marginBottom: '1rem' }}>
          <span>👥 {league.members?.length || 0} participantes</span>
          <span>Código: <strong>{league.inviteCode}</strong></span>
        </div>

        {error && <div className="error">{error}</div>}
        {!canJoinOther && !joined && (
          <div className="error" style={{ marginBottom: '0.75rem' }}>
            Limite de ligas atingido.
          </div>
        )}

        {joined ? (
          <>
            <div className="success">Você já faz parte desta liga!</div>
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
              <Link to="/comunidade" className="btn">Ver na Comunidade</Link>
              <Link to="/rankings"   className="btn-secondary">Ver Rankings</Link>
            </div>
          </>
        ) : requested ? (
          <>
            <div className="success">⏳ Solicitação enviada! Aguarde o dono da liga aceitar.</div>
            <Link to="/ligas" className="btn-secondary" style={{ marginTop: '1rem', display: 'inline-block' }}>Ver minhas ligas</Link>
          </>
        ) : (
          <button onClick={handleJoin} disabled={joining || !canJoinOther} style={{ width: '100%' }}>
            {joining ? 'Enviando…' : 'Solicitar entrada'}
          </button>
        )}
      </div>
    </div>
  );
}
