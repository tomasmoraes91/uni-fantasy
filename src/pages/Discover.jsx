import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEvent } from '../context/EventContext';
import { useLeague } from '../context/LeagueContext';
import { getLeaguesByEvent, getLeagueByCode, requestJoinLeague } from '../services/firestore';
import EventLogo from '../components/EventLogo';

const TIPS = [
  { icon: '⚽', title: 'Escale seu time', desc: 'Monte sua escalação por modalidade e escolha um capitão para dobrar os pontos.' },
  { icon: '🔮', title: 'Dê seus palpites', desc: 'Acerte os placares das partidas e ganhe pontos no bolão.' },
  { icon: '👥', title: 'Jogue com amigos', desc: 'Entre numa liga privada e dispute o ranking com a sua galera.' },
  { icon: '🏆', title: 'Suba no ranking', desc: 'Compare seu desempenho com todos na liga pública do evento.' },
  { icon: '🏅', title: 'Ganhe conquistas', desc: 'Desbloqueie troféus conforme você joga e acerta.' },
];

export default function Discover() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { allEvents } = useEvent();
  const { publicLeague, myLeagues, setCurrentLeague, toLeagueObj, loadingLeague } = useLeague();

  const [leagues, setLeagues]   = useState([]);
  const [term, setTerm]         = useState('');
  const [code, setCode]         = useState('');
  const [busy, setBusy]         = useState(false);
  const [msg, setMsg]           = useState({ type: '', text: '' });
  const [requested, setRequested] = useState(new Set());

  const eventId = publicLeague?.eventId;
  const publicEvent = allEvents?.find((e) => e.id === eventId) || null;

  // Já tem liga privada → vai direto pro painel (cai na liga)
  useEffect(() => {
    if (!loadingLeague && myLeagues.length > 0) navigate('/dashboard', { replace: true });
  }, [loadingLeague, myLeagues, navigate]);

  // Carrega ligas do evento principal para a busca
  useEffect(() => {
    if (!eventId) return;
    getLeaguesByEvent(eventId).then((ls) => setLeagues(ls)).catch(() => {});
  }, [eventId]);

  const results = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return [];
    return leagues.filter((l) => (l.name || '').toLowerCase().includes(q)).slice(0, 12);
  }, [leagues, term]);

  const enterPublic = () => {
    if (publicLeague) setCurrentLeague(publicLeague);
    navigate('/dashboard');
  };

  // Solicita entrada — a liga só carrega depois que o dono aprovar
  const request = async (league) => {
    if (!league || !user) return;
    if (league.members?.includes(user.uid) || league.createdBy === user.uid) {
      // Já é membro: carrega direto
      setCurrentLeague(toLeagueObj(league));
      navigate('/dashboard');
      return;
    }
    if (league.pendingMembers?.includes(user.uid) || requested.has(league.id)) {
      setMsg({ type: 'success', text: `Solicitação para "${league.name}" já enviada. Aguarde o dono aceitar.` });
      return;
    }
    setBusy(true); setMsg({ type: '', text: '' });
    try {
      await requestJoinLeague(league.id, user.uid);
      setRequested((prev) => new Set([...prev, league.id]));
      setMsg({ type: 'success', text: `Solicitação enviada para "${league.name}"! Você entra na liga assim que o dono aceitar.` });
    } catch {
      setMsg({ type: 'error', text: 'Erro ao solicitar entrada. Tente novamente.' });
    } finally { setBusy(false); }
  };

  const joinByCode = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true); setMsg({ type: '', text: '' });
    try {
      const league = await getLeagueByCode(code.trim());
      if (!league) { setMsg({ type: 'error', text: 'Liga não encontrada. Confira o código.' }); return; }
      await request(league);
      setCode('');
    } catch {
      setMsg({ type: 'error', text: 'Erro ao buscar a liga.' });
    } finally { setBusy(false); }
  };

  if (loadingLeague) return <div className="loading">Carregando…</div>;

  return (
    <div className="form" style={{ maxWidth: 560 }}>
      <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
        {publicEvent && <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}><EventLogo event={publicEvent} size={48} /></div>}
        <h1 style={{ margin: 0 }}>Bem-vindo ao Capitola! 🎉</h1>
        <p className="page-subtitle" style={{ marginTop: '0.35rem' }}>
          Entre numa liga para começar a jogar{publicEvent?.shortName ? ` no ${publicEvent.shortName}` : ''}.
        </p>
      </div>

      {msg.text && <div className={msg.type} style={{ marginBottom: '0.75rem' }}>{msg.text}</div>}

      {/* Buscar liga por nome */}
      <div className="form-group">
        <label>🔍 Buscar liga privada pelo nome</label>
        <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Digite o nome da liga…" />
      </div>
      {results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem' }}>
          {results.map((l) => (
            <div key={l.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.85rem' }}>
              <span style={{ flex: 1, minWidth: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {l.emoji ? `${l.emoji} ` : ''}{l.name}
                <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.78rem' }}> · 👥 {l.members?.length || 0}</span>
              </span>
              {(requested.has(l.id) || l.pendingMembers?.includes(user?.uid))
                ? <span style={{ fontSize: '0.78rem', color: '#d97706', whiteSpace: 'nowrap' }}>⏳ Aguardando</span>
                : <button className="btn" style={{ fontSize: '0.78rem' }} disabled={busy} onClick={() => request(l)}>Solicitar</button>}
            </div>
          ))}
        </div>
      )}
      {term.trim() && results.length === 0 && (
        <p className="muted" style={{ fontSize: '0.82rem', marginTop: '-0.25rem', marginBottom: '0.75rem' }}>Nenhuma liga encontrada com esse nome.</p>
      )}

      {/* Entrar por código */}
      <form onSubmit={joinByCode} className="form-group" style={{ display: 'flex', flexDirection: 'column' }}>
        <label>🔑 Entrar por código de convite</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input style={{ flex: 1 }} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Código da liga…" />
          <button type="submit" disabled={busy || !code.trim()} style={{ whiteSpace: 'nowrap' }}>Solicitar</button>
        </div>
      </form>

      {/* Liga pública */}
      <div className="auth-divider"><span>ou</span></div>
      <button onClick={enterPublic} style={{ width: '100%' }}>
        🌐 Entrar na Liga Pública (Geral)
      </button>
      <p className="muted" style={{ fontSize: '0.78rem', textAlign: 'center', marginTop: '0.4rem' }}>
        Jogue contra todos os participantes do evento. Você pode entrar numa liga de amigos a qualquer momento depois.
      </p>

      {/* Dicas de engajamento */}
      <div className="card" style={{ marginTop: '1.5rem', padding: '1rem' }}>
        <div style={{ fontWeight: 700, marginBottom: '0.6rem' }}>Como funciona</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {TIPS.map((t) => (
            <div key={t.title} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '1.3rem', flexShrink: 0, lineHeight: 1.2 }}>{t.icon}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{t.title}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{t.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
