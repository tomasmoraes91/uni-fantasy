import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { useEvent } from './EventContext';
import { getScoresByEvent } from '../services/firestore';

const ScoreContext = createContext(null);

export function ScoreProvider({ children }) {
  const { user } = useAuth();
  const { eventId, currentEvent } = useEvent();
  const [myScore,  setMyScore]  = useState(null);
  const [allScores, setAllScores] = useState([]);

  const refresh = async () => {
    // Sem evento REAL selecionado não carrega — evita getScoresByEvent('default'),
    // que lê a coleção `scores` inteira (getAllScores).
    if (!user || !currentEvent) { setAllScores([]); setMyScore(null); return; }
    // allScores já vem do agregado (1 leitura); meu score é derivado dele,
    // evitando um getUserScore separado.
    const all = await getScoresByEvent(eventId);
    setAllScores(all);
    setMyScore(all.find((s) => s.uid === user.uid && (s.eventId || 'default') === eventId) || null);
  };

  useEffect(() => { refresh(); }, [user?.uid, eventId, currentEvent]);

  const myTotal = myScore?.total ?? 0;
  const myRank  = (() => {
    const sorted = [...allScores].sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
    const idx    = sorted.findIndex((s) => s.uid === user?.uid);
    return idx >= 0 ? idx + 1 : null;
  })();

  return (
    <ScoreContext.Provider value={{ myScore, myTotal, myRank, allScores, refresh }}>
      {children}
    </ScoreContext.Provider>
  );
}

export const useScore = () => useContext(ScoreContext);
