import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEvent } from '../context/EventContext';
import { useAuth } from '../context/AuthContext';
import { resolveEventStatus } from '../utils/eventStatus';
import { getUserEventIds, getEventByPrivateCode, joinEvent, leaveEvent } from '../services/firestore';
import ShieldEmoji from '../components/ShieldEmoji';
import EventLogo from '../components/EventLogo';

const STATUS_CONFIG = {
  ativo:      { label: 'Ativo',     color: 'var(--primary)', bg: 'rgba(34,197,94,0.12)',  icon: '🟢' },
  futuro:     { label: 'Em breve',  color: 'var(--accent)',  bg: 'rgba(245,158,11,0.12)', icon: '🟡' },
  finalizado: { label: 'Encerrado', color: 'var(--muted)',   bg: 'rgba(139,148,163,0.1)', icon: '⚪' },
};
const SPORT_ICONS  = { futebol:'⚽', futsal:'⚽', basketball:'🏀', volleyball:'🏐', handball:'🤾' };
const SPORT_LABELS = { futebol:'Futebol', futsal:'Futsal', basketball:'Basquete', volleyball:'Vôlei', handball:'Handebol' };
const TYPE_LABELS  = { all: 'Todos', profissional: '🏆 Profissional', amador: '⚽ Amador' };

export default function EventsHome() {
  const { allEvents, currentEvent, selectEvent, loadingEvents } = useEvent();
  const { profile, user } = useAuth();
  const navigate = useNavigate();

  const [myEventIds, setMyEventIds]   = useState([]);
  const [typeFilter, setTypeFilter]   = useState('all');
  const [searchTerm, setSearchTerm]   = useState('');
  const [privateCode, setPrivateCode] = useState('');
  const [privateMsg,  setPrivateMsg]  = useState({ type: '', text: '' });
  const [loadingCode, setLoadingCode] = useState(false);
  const [joiningId,  setJoiningId]   = useState(null);

  const loadMyIds = () => getUserEventIds(user.uid).then(setMyEventIds);

  useEffect(() => { if (user?.uid) loadMyIds(); }, [user]);

  const handleSelect = (ev) => { selectEvent(ev); navigate('/dashboard'); };

  const handleJoin = async (ev) => {
    setJoiningId(ev.id);
    try {
      await joinEvent(user.uid, ev.id);
      await loadMyIds();
    } finally { setJoiningId(null); }
  };

  const handleLeave = async (ev) => {
    if (!confirm(`Sair do evento "${ev.name}"?`)) return;
    setJoiningId(ev.id);
    try {
      await leaveEvent(user.uid, ev.id);
      await loadMyIds();
      if (currentEvent?.id === ev.id) selectEvent(null);
    } finally { setJoiningId(null); }
  };

  const handlePrivateCode = async () => {
    if (!privateCode.trim()) return;
    setLoadingCode(true); setPrivateMsg({ type: '', text: '' });
    try {
      const ev = await getEventByPrivateCode(privateCode);
      if (!ev) {
        setPrivateMsg({ type: 'error', text: 'Código não encontrado. Verifique e tente novamente.' });
      } else {
        await joinEvent(user.uid, ev.id);
        await loadMyIds();
        setPrivateMsg({ type: 'success', text: `Você entrou em "${ev.name}"!` });
        setPrivateCode('');
        handleSelect(ev);
      }
    } catch {
      setPrivateMsg({ type: 'error', text: 'Erro ao buscar evento.' });
    } finally { setLoadingCode(false); }
  };

  if (loadingEvents) return <div className="loading">Carregando eventos…</div>;

  const myEvents     = allEvents.filter((e) => myEventIds.includes(e.id));
  const myAtivos     = myEvents.filter((e) => resolveEventStatus(e) === 'ativo');
  const myFuturos    = myEvents.filter((e) => resolveEventStatus(e) === 'futuro');
  const myEncerrados = myEvents.filter((e) => resolveEventStatus(e) === 'finalizado');
  // Eventos privados só acessíveis via código; excluídos da listagem pública
  const publicEvents = allEvents.filter((e) => !myEventIds.includes(e.id) && e.type !== 'privado');

  const filterEvents = (evs) => {
    let filtered = evs;
    if (typeFilter !== 'all') filtered = filtered.filter((e) => e.type === typeFilter);
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter((e) =>
        (e.name || '').toLowerCase().includes(q) ||
        (e.description || '').toLowerCase().includes(q) ||
        (e.location || '').toLowerCase().includes(q)
      );
    }
    return filtered;
  };

  const filtered    = filterEvents(publicEvents);
  const ativos      = filtered.filter((e) => resolveEventStatus(e) === 'ativo');
  const futuros     = filtered.filter((e) => resolveEventStatus(e) === 'futuro');
  const finalizados = filtered.filter((e) => resolveEventStatus(e) === 'finalizado');
  const hasFilters  = typeFilter !== 'all' || searchTerm.trim();
  const noneFound   = hasFilters && ativos.length === 0 && futuros.length === 0 && finalizados.length === 0;

  return (
    <div className="events-home">
      <div className="events-home-header">
        <h1>Olá, {profile?.displayName || 'jogador'} 👋</h1>
        <p className="page-subtitle">
          {myEvents.length > 0 ? 'Seus eventos estão abaixo.' : 'Escolha um evento para entrar.'}
        </p>
      </div>

      {/* ── Meus Eventos ───────────────────────────────────── */}
      {myEvents.length > 0 && (
        <>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.25rem', marginTop: '0.5rem' }}>⭐ Meus eventos</h2>
          {myAtivos.length > 0 && (
            <EventSection title="🟢 Ativos" events={myAtivos}
              currentEvent={currentEvent} onSelect={handleSelect}
              onLeave={handleLeave} joiningId={joiningId} isMine />
          )}
          {myFuturos.length > 0 && (
            <EventSection title="🟡 Em breve" events={myFuturos}
              currentEvent={currentEvent} onSelect={handleSelect}
              onLeave={handleLeave} joiningId={joiningId} isMine />
          )}
          {myEncerrados.length > 0 && (
            <EventSection title="⚪ Encerrados" events={myEncerrados}
              currentEvent={currentEvent} onSelect={handleSelect}
              onLeave={handleLeave} joiningId={joiningId} isMine />
          )}
        </>
      )}

      {/* ── Busca e Filtros ─────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '1rem', padding: '1rem 1.25rem' }}>
        <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>
          {myEvents.length > 0 ? 'Outros eventos' : 'Buscar eventos'}
        </h3>

        <div className="events-search-bar">
          <input
            type="text"
            placeholder="Buscar por nome, local…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="event-type-filter">
          {Object.entries(TYPE_LABELS).map(([val, lbl]) => (
            <button
              key={val}
              className={`event-type-chip ${typeFilter === val ? 'active' : ''}`}
              onClick={() => setTypeFilter(val)}
            >
              {lbl}
            </button>
          ))}
        </div>

        {/* Código privado */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
          <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            🔒 Tem um código de evento privado?
          </p>
          <div className="events-search-bar">
            <input
              type="text"
              placeholder="Código do evento (ex: ABC123)"
              value={privateCode}
              onChange={(e) => setPrivateCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handlePrivateCode()}
              maxLength={20}
            />
            <button onClick={handlePrivateCode} disabled={loadingCode || !privateCode.trim()}>
              {loadingCode ? '…' : 'Entrar'}
            </button>
          </div>
          {privateMsg.text && <div className={privateMsg.type} style={{ marginTop: '0.4rem' }}>{privateMsg.text}</div>}
        </div>
      </div>

      {allEvents.length === 0 && (
        <div className="card text-center" style={{ padding: '3rem 1rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>📅</div>
          <h3>Nenhum evento disponível</h3>
          <p className="muted">Aguarde o administrador criar um evento.</p>
        </div>
      )}

      {/* ── Outros eventos ──────────────────────────────────── */}
      {ativos.length > 0 && (
        <EventSection title="🟢 Eventos ativos" events={ativos}
          currentEvent={currentEvent} onSelect={handleSelect}
          onJoin={handleJoin} joiningId={joiningId} selectable />
      )}
      {futuros.length > 0 && (
        <EventSection title="🟡 Em breve" events={futuros}
          currentEvent={currentEvent} onSelect={handleSelect}
          onJoin={handleJoin} joiningId={joiningId} selectable={false} />
      )}
      {finalizados.length > 0 && (
        <EventSection title="⚪ Encerrados" events={finalizados}
          currentEvent={currentEvent} onSelect={handleSelect}
          onJoin={handleJoin} joiningId={joiningId} selectable />
      )}
      {noneFound && (
        <div className="card text-center" style={{ padding: '2rem 1rem' }}>
          <p className="muted">Nenhum evento encontrado com os filtros aplicados.</p>
        </div>
      )}
    </div>
  );
}

function EventSection({ title, events, currentEvent, onSelect, onJoin, onLeave, joiningId, selectable = true, isMine = false }) {
  return (
    <div className="event-section">
      <h2 className="event-section-title">{title}</h2>
      <div className="event-cards-grid">
        {events.map((ev) => {
          const status     = resolveEventStatus(ev);
          const cfg        = STATUS_CONFIG[status] || STATUS_CONFIG.futuro;
          const isSelected = currentEvent?.id === ev.id;
          const sports     = ev.modalidades || [];
          const loading    = joiningId === ev.id;

          return (
            <div
              key={ev.id}
              className={`event-card ${isSelected ? 'selected' : ''} ${!selectable && !isMine ? 'disabled' : ''}`}
              style={{ '--event-color': cfg.color, '--event-bg': cfg.bg }}
              onDoubleClick={() => (selectable || isMine) && onSelect?.(ev)}
            >
              {isSelected && <div className="event-card-selected-badge">✓ Selecionado</div>}

              <div className="event-card-status" style={{ color: cfg.color, background: cfg.bg }}>
                {cfg.icon} {cfg.label}
              </div>

              {(ev.logoComponent || ev.logoEmoji || ev.logoUrl) && (
                <div style={{ margin: '0.4rem 0', display: 'flex', justifyContent: 'center' }}>
                  <EventLogo event={ev} size={40} />
                </div>
              )}

              <h3 className="event-card-name" onClick={() => selectable && onSelect?.(ev)} style={{ cursor: selectable ? 'pointer' : 'default' }}>{ev.name}</h3>
              {ev.description && <p className="event-card-desc muted">{ev.description}</p>}
              {(ev.startDate || ev.location) && (
                <div className="event-card-meta">
                  {ev.startDate && <span>📅 {new Date(ev.startDate).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}{ev.endDate ? ` – ${new Date(ev.endDate).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}` : ''}</span>}
                  {ev.location && <span>📍 {ev.location}</span>}
                </div>
              )}

              {sports.length > 0 && (
                <div className="event-card-sports">
                  {sports.map((s) => (
                    <span key={s} className="sport-chip">
                      {SPORT_ICONS[s] || '🏅'} {SPORT_LABELS[s] || s}
                    </span>
                  ))}
                </div>
              )}

              {ev.type && ev.type !== 'privado' && (
                <div className="muted" style={{ fontSize: '0.78rem', marginTop: '0.3rem' }}>
                  {ev.type === 'profissional' ? '🏆 Profissional' : '⚽ Amador'}
                </div>
              )}

              {/* Ações */}
              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                {isMine ? (
                  <>
                    <button
                      className="btn"
                      style={{ flex: 1, fontSize: '0.82rem', padding: '0.4rem' }}
                      onClick={() => onSelect?.(ev)}
                    >
                      {isSelected ? 'Entrar novamente →' : 'Abrir evento →'}
                    </button>
                    <button
                      className="btn-secondary"
                      style={{ fontSize: '0.82rem', padding: '0.4rem 0.75rem' }}
                      disabled={loading}
                      onClick={() => onLeave?.(ev)}
                    >
                      {loading ? '…' : 'Sair'}
                    </button>
                  </>
                ) : selectable ? (
                  <button
                    className="btn"
                    style={{ flex: 1, fontSize: '0.82rem', padding: '0.4rem' }}
                    disabled={loading}
                    onClick={() => { onJoin?.(ev); onSelect?.(ev); }}
                  >
                    {loading ? '…' : 'Participar →'}
                  </button>
                ) : (
                  <div className="event-card-cta muted">Disponível em breve</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
