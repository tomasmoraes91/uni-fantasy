import { useState } from 'react';
import { useEvent } from '../context/EventContext';
import { T } from '../utils/labels';

export default function EventSelector() {
  const { events, currentEvent, selectEvent, loading } = useEvent();
  const [open, setOpen] = useState(false);

  if (loading) return null;

  // Se não há eventos cadastrados, não exibe nada
  if (events.length === 0) return null;

  // Se só há um evento e já está selecionado, mostra só o banner discreto
  if (!open && currentEvent) {
    return (
      <div className="event-banner">
        <span>📅 {currentEvent.name}</span>
        {events.length > 1 && (
          <button className="event-change-btn" onClick={() => setOpen(true)}>
            {T.events.change}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="event-selector-overlay">
      <div className="event-selector-box">
        <h2>{T.events.selectTitle}</h2>
        <p className="muted">{T.events.selectSubtitle}</p>
        <div className="event-list">
          {events.map((ev) => (
            <button
              key={ev.id}
              className={`event-option ${currentEvent?.id === ev.id ? 'active' : ''}`}
              onClick={() => { selectEvent(ev); setOpen(false); }}
            >
              <strong>{ev.name}</strong>
              {ev.description && <span className="muted">{ev.description}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
