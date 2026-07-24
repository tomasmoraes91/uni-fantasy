import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { useEvent } from './EventContext';
import { getUserLeagues } from '../services/firestore';
import { resolveEventStatus } from '../utils/eventStatus';

const LeagueContext = createContext(null);

/* Evento principal: marcado com featured; senão o ativo mais recente; senão o 1º. */
function featuredEvent(events) {
  return events.find((e) => e.featured)
      || [...events].filter((e) => resolveEventStatus(e) === 'ativo')
                    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0]
      || events[0]
      || null;
}

export function LeagueProvider({ children }) {
  const { user } = useAuth();
  const { allEvents, selectEvent, loadingEvents } = useEvent();

  const [myLeagues, setMyLeagues]           = useState([]);
  const [currentLeague, setCurrentLeagueSt] = useState(null);
  const [loadingLeague, setLoadingLeague]   = useState(true);

  const storageKey = user ? `capitola_last_league_${user.uid}` : null;

  // Liga pública (virtual) de um evento = todos os participantes.
  // Usa o próprio nome do evento (fica mais bonito no dashboard).
  const publicLeagueFor = (ev) => ev && ({
    kind: 'public', leagueId: null, eventId: ev.id,
    name: ev.name, shortName: ev.shortName || ev.name,
    leagueMode: 'ambas', memberUids: null,
  });
  const toLeagueObj = (l) => ({
    kind: 'private', leagueId: l.id, eventId: l.eventId || 'default',
    name: l.name, shortName: l.name, emoji: l.emoji || '',
    leagueMode: l.leagueMode || 'ambas', memberUids: l.members || [],
  });

  const applyEvent = (eventId) => {
    // Se o eventId da liga não casa com nenhum evento (liga antiga/órfã com
    // eventId 'default' ou inválido), cai no evento principal em vez de deixar
    // currentEvent NULO (que dava 5 modalidades padrão, "sem jogos" e crash).
    const ev = allEvents.find((e) => e.id === eventId) || featuredEvent(allEvents);
    if (ev) selectEvent(ev);
  };

  const setCurrentLeague = (league) => {
    setCurrentLeagueSt(league);
    if (storageKey) {
      localStorage.setItem(storageKey, league.kind === 'public' ? 'public' : league.leagueId);
    }
    applyEvent(league.eventId);
  };

  // Resolve a liga padrão ao logar / carregar eventos
  useEffect(() => {
    if (loadingEvents) return;
    if (!user) {
      setMyLeagues([]); setCurrentLeagueSt(null); setLoadingLeague(false);
      return;
    }
    (async () => {
      setLoadingLeague(true);
      const leagues = await getUserLeagues(user.uid); // todas as ligas do usuário
      setMyLeagues(leagues);

      const feat   = featuredEvent(allEvents);
      const lastId = localStorage.getItem(`capitola_last_league_${user.uid}`);

      let chosen = null;
      if (lastId === 'public' && feat) {
        chosen = publicLeagueFor(feat);
      } else if (lastId) {
        const l = leagues.find((x) => x.id === lastId);
        if (l) chosen = toLeagueObj(l);
      }
      if (!chosen) {
        if (leagues.length) {
          // cai na privada por padrão (a mais recente)
          const recent = [...leagues].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
          chosen = toLeagueObj(recent);
        } else if (feat) {
          chosen = publicLeagueFor(feat);
        }
      }

      if (chosen) {
        setCurrentLeagueSt(chosen);
        applyEvent(chosen.eventId);
      }
      setLoadingLeague(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loadingEvents]);

  const reloadLeagues = async () => {
    if (!user) return [];
    const leagues = await getUserLeagues(user.uid);
    setMyLeagues(leagues);
    return leagues;
  };

  const publicLeague = publicLeagueFor(featuredEvent(allEvents));

  return (
    <LeagueContext.Provider value={{
      currentLeague, myLeagues, publicLeague, loadingLeague,
      setCurrentLeague, reloadLeagues,
      toLeagueObj, publicLeagueFor,
    }}>
      {children}
    </LeagueContext.Provider>
  );
}

export const useLeague = () => useContext(LeagueContext);
