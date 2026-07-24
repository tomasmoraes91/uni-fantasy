import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { useEvent } from './EventContext';
import {
  getFriendRequests, getUserTeamsByUid, getMatchesByEvent, getUserPredictions,
  getUserBadges, clearNewBadge, getOwnedLeaguesWithRequests,
} from '../services/firestore';
import { BADGES } from '../utils/badges';

const Ctx = createContext({
  notifications: [], totalCount: 0,
  friendCount: 0, teamCount: 0, predictionsCount: 0, roundsCount: 0,
  dismissRound: () => {}, refresh: () => {},
});

export function useNotificationContext() { return useContext(Ctx); }

function fmtRound(key) {
  if (/^\d+$/.test(key)) return `Rodada ${key}`;
  return key;
}

export function NotificationProvider({ children }) {
  const { user }              = useAuth();
  const { eventId }           = useEvent();

  const [friendRequests,   setFriendRequests]   = useState([]);
  const [noTeam,           setNoTeam]           = useState(false);
  const [noPredictions,    setNoPredictions]    = useState(false);
  const [completedRounds,  setCompletedRounds]  = useState([]);
  const [newBadges,        setNewBadges]        = useState([]); // IDs de conquistas recém-ganhas
  const [leagueRequests,   setLeagueRequests]   = useState([]); // ligas minhas com pedidos pendentes

  const load = useCallback(async () => {
    if (!user || !eventId) return;
    try {
      const [reqs, userTeams, matches, preds, badgeData, ownedReq] = await Promise.all([
        getFriendRequests(user.uid),
        getUserTeamsByUid(user.uid, eventId),
        getMatchesByEvent(eventId),
        getUserPredictions(user.uid),
        getUserBadges(user.uid),
        getOwnedLeaguesWithRequests(user.uid),
      ]);
      setNewBadges(Array.isArray(badgeData._new) ? badgeData._new : []);
      setLeagueRequests(ownedReq);

      // 1. Friend requests
      setFriendRequests(reqs);

      // 2. No team escalated
      setNoTeam(!userTeams.some((t) => (t.playerIds || []).length > 0));

      // 3. No predictions for next rodada
      const predSet  = new Set(preds.map((p) => p.matchId));
      const upcoming = matches.filter((m) => m.status !== 'finished');
      if (upcoming.length > 0) {
        const sorted   = [...upcoming].sort((a, b) => (a.date || 0) - (b.date || 0));
        const nextKey  = sorted[0].rodada ?? sorted[0].phase;
        const nextSlot = nextKey
          ? upcoming.filter((m) => (m.rodada ?? m.phase) === nextKey)
          : [sorted[0]];
        setNoPredictions(nextSlot.some((m) => !predSet.has(m.id)));
      } else {
        setNoPredictions(false);
      }

      // 4. Rodadas concluídas (todas as partidas finalizadas)
      const dismissedKey = `capitola_notif_${eventId}`;
      const dismissed    = new Set(JSON.parse(localStorage.getItem(dismissedKey) || '[]'));
      const total = {}, done = {};
      matches.forEach((m) => {
        const k = String(m.rodada ?? m.phase ?? '').trim();
        if (!k) return;
        total[k] = (total[k] || 0) + 1;
        if (m.status === 'finished') done[k] = (done[k] || 0) + 1;
      });
      setCompletedRounds(
        Object.keys(total).filter((k) => done[k] === total[k] && !dismissed.has(k))
      );
    } catch (err) {
      console.error('[Notifications]', err);
    }
  }, [user, eventId]);

  useEffect(() => { load(); }, [load]);

  const dismissRound = useCallback((roundKey) => {
    const key       = `capitola_notif_${eventId}`;
    const dismissed = new Set(JSON.parse(localStorage.getItem(key) || '[]'));
    dismissed.add(roundKey);
    localStorage.setItem(key, JSON.stringify([...dismissed]));
    setCompletedRounds((prev) => prev.filter((r) => r !== roundKey));
  }, [eventId]);

  const dismissBadge = useCallback((badgeId) => {
    if (!user) return;
    setNewBadges((prev) => prev.filter((id) => id !== badgeId));
    clearNewBadge(user.uid, badgeId);
  }, [user]);

  // Dispensa genérica: esconde QUALQUER notificação localmente (por id, persistido).
  const [hiddenIds, setHiddenIds] = useState(new Set());
  useEffect(() => {
    if (!user) { setHiddenIds(new Set()); return; }
    try { setHiddenIds(new Set(JSON.parse(localStorage.getItem(`capitola_notif_hidden_${user.uid}`) || '[]'))); }
    catch { setHiddenIds(new Set()); }
  }, [user]);
  const hideNotification = useCallback((id) => {
    if (!user) return;
    setHiddenIds((prev) => {
      const next = new Set(prev); next.add(id);
      localStorage.setItem(`capitola_notif_hidden_${user.uid}`, JSON.stringify([...next]));
      return next;
    });
  }, [user]);
  // Ponto único de dispensa para o X de qualquer notificação
  const dismiss = useCallback((n) => {
    if (!n) return;
    if (n.type === 'new_badge') dismissBadge(n.badgeId);
    else if (n.roundKey)        dismissRound(n.roundKey);
    else                        hideNotification(n.id);
  }, [dismissBadge, dismissRound, hideNotification]);

  const rawNotifications = [
    // Novas conquistas
    ...newBadges.map((badgeId) => {
      const def = BADGES[badgeId];
      return {
        id: `badge_${badgeId}`, type: 'new_badge', icon: def?.icon || '🏅', menu: null,
        message: `Nova conquista: ${def?.name || badgeId}`,
        link: '/minhapontuacao', linkState: { badgesExpanded: true },
        badgeId, dismissable: true,
      };
    }),
    ...friendRequests.map((r) => ({
      id: `friend_${r.fromUid}`, type: 'friend_request', icon: '👥', menu: 'comunidade',
      message: `${r.displayName || 'Alguém'} quer ser seu amigo`,
      link: '/comunidade',
    })),
    ...leagueRequests.map((l) => ({
      id: `league_req_${l.id}`, type: 'league_request', icon: '📨', menu: null,
      message: `${(l.pendingMembers || []).length} pedido(s) para entrar em "${l.name}"`,
      link: '/ligas',
    })),
    ...(noTeam ? [{
      id: 'no_team', type: 'no_team', icon: '🏆', menu: 'team',
      message: 'Você ainda não escalou seu time',
      link: '/team',
    }] : []),
    ...(noPredictions ? [{
      id: 'no_preds', type: 'no_predictions', icon: '🔮', menu: 'palpites',
      message: 'Você não tem palpites para a próxima rodada',
      link: '/matches',
    }] : []),
    ...completedRounds.flatMap((r) => [
      {
        id: `round_${r}`, type: 'round_complete', icon: '⚡', menu: 'palpites',
        message: `Resultados da ${fmtRound(r)} disponíveis`,
        link: '/matches', linkState: { view: 'resultados' },
        roundKey: r, dismissable: true,
      },
      {
        id: `team_${r}`, type: 'update_team', icon: '🏆', menu: 'team',
        message: `${fmtRound(r)} encerrada — atualize sua escalação`,
        link: '/team',
        roundKey: r, dismissable: true,
      },
    ]),
  ];

  // Remove as que o usuário dispensou (X). Contagens derivam da lista já filtrada.
  const notifications = rawNotifications.filter((n) => !hiddenIds.has(n.id));

  return (
    <Ctx.Provider value={{
      notifications,
      totalCount:       notifications.length,
      friendCount:      notifications.filter((n) => n.type === 'friend_request').length,
      teamCount:        notifications.filter((n) => n.type === 'no_team' || n.type === 'update_team').length,
      predictionsCount: notifications.filter((n) => n.type === 'no_predictions').length,
      roundsCount:      notifications.filter((n) => n.type === 'round_complete').length,
      badgesCount:      notifications.filter((n) => n.type === 'new_badge').length,
      dismissRound,
      dismissBadge,
      dismiss,
      refresh: load,
    }}>
      {children}
    </Ctx.Provider>
  );
}
