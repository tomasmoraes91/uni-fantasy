import { SPORT_LABELS } from '../utils/labels';

export const SPORTS = ['futebol', 'futsal', 'basketball', 'volleyball', 'handball'];

export default function SportTabs({ active, onChange, available }) {
  // 'available' é opcional: filtra só os esportes do evento atual
  const list = available?.length ? SPORTS.filter((s) => available.includes(s)) : SPORTS;
  return (
    <div className="tabs">
      {list.map((s) => (
        <button
          key={s}
          className={`tab ${active === s ? 'active' : ''}`}
          onClick={() => onChange(s)}
        >
          {SPORT_LABELS[s] || s}
        </button>
      ))}
    </div>
  );
}
