import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useEvent } from '../context/EventContext';
import SportTabs, { SPORTS } from '../components/SportTabs';
import { getMatchesByEvent, getUserPredictions, getPlayers } from '../services/firestore';
import { calcFantasyPoints, predictionPoints } from '../utils/scoring';
import { STAT_FIELDS } from '../utils/sportRules';
import { T, SPORT_LABELS, POSITION_LABELS, fmtPts } from '../utils/labels';

export default function History() {
  const { user } = useAuth();
  const { eventId } = useEvent();
  const [sport, setSport]       = useState(SPORTS[0]);
  const [matches, setMatches]   = useState([]);
  const [predictions, setPredictions] = useState({});
  const [players, setPlayers]   = useState({});
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [all, preds, pls] = await Promise.all([
        getMatchesByEvent(eventId),
        getUserPredictions(user.uid),
        import('../services/firestore').then(m => m.getPlayers())
      ]);
      setMatches(all.filter((m) => m.status === 'finished'));
      const predMap = {};
      preds.forEach((p) => { predMap[p.matchId] = { h: p.homeScore, a: p.awayScore }; });
      setPredictions(predMap);
      const plMap = {};
      pls.forEach((p) => { plMap[p.id] = p; });
      setPlayers(plMap);
      setLoading(false);
    })();
  }, [user, eventId]);

  const filtered = useMemo(() => matches.filter((m) => m.sport === sport), [matches, sport]);

  const toggle = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <>
      <h1>{T.history.title}</h1>
      <p className="page-subtitle">{T.history.subtitle}</p>
      <SportTabs active={sport} onChange={setSport} />

      {loading ? <p className="muted">{T.common.loading}</p>
      : filtered.length === 0 ? (
        <div className="card"><p className="muted">{T.history.noFinished}</p></div>
      ) : filtered.map((m) => {
        const pred = predictions[m.id];
        const predPts = pred ? predictionPoints({ homeScore: pred.h, awayScore: pred.a }, m) : 0;
        const isOpen = expanded[m.id];
        const homeWon = m.homeScore > m.awayScore;
        const awayWon = m.awayScore > m.homeScore;

        return (
          <div key={m.id} className="match-card">
            <div className="match-meta">
              <span>{SPORT_LABELS[m.sport] || m.sport}</span>
              <span>{m.finishedAt ? new Date(m.finishedAt).toLocaleDateString('pt-BR') : ''}</span>
            </div>
            <div className="match-row">
              <div className={`match-team home ${homeWon ? 'winner' : ''}`}>{m.homeTeamName}</div>
              <div className="score-final">{m.homeScore} : {m.awayScore}</div>
              <div className={`match-team ${awayWon ? 'winner' : ''}`}>{m.awayTeamName}</div>
            </div>

            {/* Palpite do usuário */}
            <div className="prediction-row" style={{ borderTop: '1px solid var(--border)', paddingTop: '0.6rem' }}>
              <span className="muted">
                {T.history.yourPrediction}: {pred ? `${pred.h} : ${pred.a}` : '—'}
              </span>
              <span style={{ marginLeft: 'auto', fontWeight: 600, color: predPts > 0 ? 'var(--primary)' : 'var(--muted)' }}>
                +{predPts} {T.common.pts}
              </span>
            </div>

            {/* Botão expandir estatísticas */}
            {m.playerStats?.length > 0 && (
              <button
                className="btn-secondary mt-2"
                style={{ width: '100%', fontSize: '0.85rem' }}
                onClick={() => toggle(m.id)}
              >
                {isOpen ? '▲ Ocultar estatísticas' : '▼ Ver estatísticas dos jogadores'}
              </button>
            )}

            {isOpen && (
              <div className="history-stats">
                <div className="history-stats-header">
                  <span>{T.history.stats}</span>
                </div>
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th>Jogador</th>
                      {(STAT_FIELDS[m.sport] || []).map(({ field: f, label: lbl }) => (
                        <th key={f}>{lbl}</th>
                      ))}
                      <th>{T.history.fantasyPoints}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.playerStats.map((stat) => {
                      const player = players[stat.playerId];
                      const pts = calcFantasyPoints(stat, m, false);
                      return (
                        <tr key={stat.playerId}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{player?.name || stat.playerId}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                              {POSITION_LABELS[player?.position] || player?.position}
                            </div>
                          </td>
                          {(STAT_FIELDS[m.sport] || []).map(({ field: f }) => (
                            <td key={f}>{stat[f] ?? 0}</td>
                          ))}
                          <td style={{ fontWeight: 700, color: pts >= 0 ? 'var(--primary)' : 'var(--danger)' }}>
                            {pts > 0 ? '+' : ''}{fmtPts(pts)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
