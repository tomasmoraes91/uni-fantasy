import { createContext, useContext, useEffect, useState } from 'react';
import { getEvents } from '../services/firestore';
import { useAuth } from './AuthContext';

const EventContext = createContext(null);

export function EventProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [allEvents, setAllEvents]         = useState([]);
  const [currentEvent, setCurrentEvent]   = useState(null);
  const [loadingEvents, setLoadingEvents] = useState(true);

  useEffect(() => {
    // Aguarda o auth resolver antes de buscar eventos
    if (authLoading) return;

    // Sem usuário logado, limpa e encerra loading
    if (!user) {
      setAllEvents([]);
      setLoadingEvents(false);
      return;
    }

    (async () => {
      setLoadingEvents(true);
      const evs = await getEvents();
      setAllEvents(evs);

      // Restaura seleção da sessão (apenas se o evento ainda existe)
      const saved = sessionStorage.getItem('selectedEventId');
      const found = evs.find((e) => e.id === saved);
      if (found) setCurrentEvent(found);
      // Se só existe 1 evento ativo, seleciona automaticamente
      // (retrocompat: status='ativo' OU active===true OU sem nenhum dos campos)
      else {
        const actives = evs.filter((e) => {
          if (e.status) return e.status === 'ativo';
          return e.active !== false;
        });
        if (actives.length === 1) setCurrentEvent(actives[0]);
      }
      setLoadingEvents(false);
    })();
  }, [user, authLoading]);

  const selectEvent = (ev) => {
    setCurrentEvent(ev);
    sessionStorage.setItem('selectedEventId', ev?.id || '');
  };

  const clearEvent = () => {
    setCurrentEvent(null);
    sessionStorage.removeItem('selectedEventId');
  };

  const eventId = currentEvent?.id || 'default';

  return (
    <EventContext.Provider value={{
      allEvents,
      currentEvent,
      selectEvent,
      clearEvent,
      eventId,
      loadingEvents,
    }}>
      {children}
    </EventContext.Provider>
  );
}

export const useEvent = () => useContext(EventContext);
