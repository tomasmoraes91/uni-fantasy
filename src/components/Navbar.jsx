import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate, useLocation, Link } from 'react-router-dom';
import { logoutUser } from '../services/auth';
import { useAuth } from '../context/AuthContext';
import { useEvent } from '../context/EventContext';
import { useLeague } from '../context/LeagueContext';
import { useScore } from '../context/ScoreContext';
import { useNotificationContext } from '../context/NotificationContext';
import { T } from '../utils/labels';
import CapitolaLogo from './CapitolaLogo';
import EventLogo from './EventLogo';

export default function Navbar() {
  const navigate            = useNavigate();
  const location            = useLocation();
  const { isAdmin }         = useAuth();
  const { currentEvent, clearEvent } = useEvent();
  const { currentLeague, myLeagues, publicLeague, setCurrentLeague, toLeagueObj } = useLeague();
  const { myTotal, myRank } = useScore();
  const {
    notifications, totalCount,
    friendCount, teamCount, predictionsCount, roundsCount,
    dismissRound, dismissBadge, dismiss, refresh: refreshNotifs,
  } = useNotificationContext();

  const [menuOpen,   setMenuOpen]   = useState(false);
  const [notifOpen,  setNotifOpen]  = useState(false);
  const [leagueOpen, setLeagueOpen] = useState(false);
  const menuRef   = useRef(null);
  const notifRef  = useRef(null);
  const leagueRef = useRef(null);

  // Fecha os dropdowns ao clicar fora
  useEffect(() => {
    const h = (e) => {
      if (menuRef.current   && !menuRef.current.contains(e.target))   setMenuOpen(false);
      if (notifRef.current  && !notifRef.current.contains(e.target))  setNotifOpen(false);
      if (leagueRef.current && !leagueRef.current.contains(e.target)) setLeagueOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  useEffect(() => { setMenuOpen(false); setNotifOpen(false); setLeagueOpen(false); }, [location.pathname]);

  const handleLogout  = async () => { await logoutUser(); navigate('/login'); };
  const goToPanel     = ()       => { navigate('/dashboard'); setMenuOpen(false); };
  const goEvents      = ()       => { clearEvent(); navigate('/'); setMenuOpen(false); };

  const selectLeague = (l) => { setCurrentLeague(l); setLeagueOpen(false); navigate('/dashboard'); };
  const isCurrent = (l) =>
    l.kind === 'public' ? currentLeague?.kind === 'public' : currentLeague?.leagueId === l.leagueId;
  const isEventsActive = location.pathname === '/';
  const palpitesOnly = currentLeague?.leagueMode === 'palpites'; // liga só de palpites

  const palpitesCount = predictionsCount + roundsCount;

  return (
    <nav className="navbar">
      <div className="nav-inner">

        {/* Logo → painel da liga atual */}
        <div className="nav-left">
          <CapitolaLogo onClick={goToPanel} />
        </div>

        {/* Switcher de liga */}
        <div className="nav-center" ref={leagueRef}>
          {currentLeague ? (
            <div className="nav-league-wrapper">
              {/* Pílula inteira → abre a lista de ligas */}
              <button className="nav-event-pill" onClick={() => { setLeagueOpen(v => !v); setMenuOpen(false); setNotifOpen(false); }} title="Trocar liga">
                {currentLeague.kind === 'public' && currentEvent
                  ? <EventLogo event={currentEvent} size={18} style={{ flexShrink: 0 }} />
                  : <span style={{ flexShrink: 0 }}>{currentLeague.emoji || '🏆'}</span>}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {currentLeague.kind === 'public' ? (currentEvent?.shortName || currentLeague.shortName || currentLeague.name) : currentLeague.name}
                </span>
                <span style={{ flexShrink: 0, opacity: 0.6, fontSize: '0.7rem' }}>▾</span>
              </button>

              {leagueOpen && (
                <div className="nav-dropdown nav-league-dropdown">
                  <div style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--muted)', padding: '0.3rem 0.9rem 0.15rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Trocar liga
                  </div>
                  {publicLeague && (
                    <button className={`nav-dd-item ${isCurrent(publicLeague) ? 'active' : ''}`} onClick={() => selectLeague(publicLeague)}>
                      🌐 {publicLeague.shortName || publicLeague.name}
                    </button>
                  )}
                  {myLeagues.map((l) => {
                    const obj = toLeagueObj(l);
                    return (
                      <button key={l.id} className={`nav-dd-item ${isCurrent(obj) ? 'active' : ''}`} onClick={() => selectLeague(obj)}>
                        {l.emoji || '🏆'} {l.name}
                      </button>
                    );
                  })}
                  <div className="nav-dd-divider" />
                  <NavLink to="/ligas" className="nav-dd-item">➕ Buscar / criar liga</NavLink>
                </div>
              )}
            </div>
          ) : (
            <span className="nav-event-pill nav-event-pill--empty">Sem liga</span>
          )}
        </div>

        {/* Direita: pontuação + sino + menu */}
        <div className="nav-right">
          {currentEvent && myRank && (
            <div className="nav-score-chip" onClick={() => navigate('/rankings')} title="Ver ranking">
              <span className="nav-score-rank">#{myRank}</span>
              <span className="nav-score-sep">·</span>
              <span className="nav-score-pts">{myTotal} pts</span>
            </div>
          )}

          {/* Sino de notificações */}
          {currentEvent && (
            <div className="nav-notif-wrapper" ref={notifRef}>
              <button
                className={`nav-notif-btn ${notifOpen ? 'open' : ''}`}
                onClick={() => { const o = !notifOpen; setNotifOpen(o); setMenuOpen(false); if (o) refreshNotifs?.(); }}
                aria-label="Notificações"
              >
                🔔
                {totalCount > 0 && <span className="nav-notif-badge">{totalCount}</span>}
              </button>

              {notifOpen && (
                <div className="nav-notif-dropdown">
                  <div className="nav-notif-header">Notificações</div>
                  {notifications.length === 0 ? (
                    <p className="nav-notif-empty">Nenhuma notificação</p>
                  ) : (
                    notifications.map((n) => (
                      <div key={n.id} className="nav-notif-item">
                        <Link
                          to={n.link}
                          state={n.linkState}
                          className="nav-notif-link"
                          onClick={() => {
                            if (n.type === 'new_badge') dismissBadge(n.badgeId);
                            else if (n.dismissable) dismissRound(n.roundKey);
                            setNotifOpen(false);
                          }}
                        >
                          <span className="nav-notif-icon">{n.icon}</span>
                          <span className="nav-notif-msg">{n.message}</span>
                        </Link>
                        <button
                          className="nav-notif-dismiss"
                          onClick={() => { dismiss(n); }}
                          title="Dispensar"
                        >✕</button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* Menu hamburguer */}
          <div className="nav-menu-wrapper" ref={menuRef}>
            <button
              className={`nav-dots-btn ${menuOpen ? 'open' : ''}`}
              onClick={() => { const o = !menuOpen; setMenuOpen(o); setNotifOpen(false); if (o) refreshNotifs?.(); }}
              aria-label="Menu"
            >
              <span /><span /><span />
              {currentEvent && totalCount > 0 && (
                <span className="nav-menu-badge">{totalCount}</span>
              )}
            </button>

            {menuOpen && (
              <div className="nav-dropdown">

                {/* Notificações — visíveis só em mobile (bell oculto) */}
                {notifications.length > 0 && (
                  <div className="nav-dd-notif-section">
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--muted)', padding: '0.3rem 0.75rem 0.1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      🔔 Notificações
                      {totalCount > 0 && <span className="nav-dd-badge" style={{ marginLeft: 6 }}>{totalCount}</span>}
                    </div>
                    {notifications.map((n) => (
                      <div key={n.id} style={{ display: 'flex', alignItems: 'center' }}>
                        <Link
                          to={n.link}
                          state={n.linkState}
                          className="nav-dd-item"
                          style={{ flex: 1, fontSize: '0.8rem' }}
                          onClick={() => {
                            if (n.type === 'new_badge') dismissBadge(n.badgeId);
                            else if (n.dismissable) dismissRound(n.roundKey);
                            setMenuOpen(false);
                          }}
                        >
                          {n.icon} {n.message}
                        </Link>
                        <button
                          className="nav-notif-dismiss"
                          onClick={() => { dismiss(n); }}
                        >✕</button>
                      </div>
                    ))}
                    <div className="nav-dd-divider" />
                  </div>
                )}

                {isAdmin && (
                  <button className={`nav-dd-item ${isEventsActive ? 'active' : ''}`} onClick={goEvents}>
                    🏟️ Eventos
                  </button>
                )}
                <NavLink to="/comunidade" className={({ isActive }) => `nav-dd-item${isActive ? ' active' : ''}`}>
                  👥 Comunidade
                  {friendCount > 0 && <span className="nav-dd-badge">{friendCount}</span>}
                </NavLink>
                {currentEvent && (<>
                  <NavLink to="/dashboard" className={({ isActive }) => `nav-dd-item${isActive ? ' active' : ''}`}>📊 Painel</NavLink>
                  {!palpitesOnly && (
                    <NavLink to="/team" className={({ isActive }) => `nav-dd-item${isActive ? ' active' : ''}`}>
                      🏆 Meu Time
                      {teamCount > 0 && <span className="nav-dd-badge">!</span>}
                    </NavLink>
                  )}
                  <NavLink to="/matches" className={({ isActive }) => `nav-dd-item${isActive ? ' active' : ''}`}>
                    🔮 Palpites
                    {palpitesCount > 0 && <span className="nav-dd-badge">{palpitesCount}</span>}
                  </NavLink>
                  <NavLink to="/rankings"  className={({ isActive }) => `nav-dd-item${isActive ? ' active' : ''}`}>🏅 Ranking</NavLink>
                  <NavLink to="/minhapontuacao" className={({ isActive }) => `nav-dd-item${isActive ? ' active' : ''}`}>📊 Minha Pontuação</NavLink>
                  {!palpitesOnly && (
                    <NavLink to="/jogadores" className={({ isActive }) => `nav-dd-item${isActive ? ' active' : ''}`}>📈 Estatísticas</NavLink>
                  )}
                  <NavLink to="/ligas"     className={({ isActive }) => `nav-dd-item${isActive ? ' active' : ''}`}>🏆 Ligas</NavLink>
                  <NavLink to="/rules"     className={({ isActive }) => `nav-dd-item${isActive ? ' active' : ''}`}>📘 Regras</NavLink>
                </>)}
                {isAdmin && (
                  <NavLink to="/admin" className={({ isActive }) => `nav-dd-item${isActive ? ' active' : ''}`}>⚙️ Admin</NavLink>
                )}
                <div className="nav-dd-divider" />
                <button className="nav-dd-item nav-dd-logout" onClick={handleLogout}>{T.nav.logout}</button>
              </div>
            )}
          </div>
        </div>

      </div>
    </nav>
  );
}
