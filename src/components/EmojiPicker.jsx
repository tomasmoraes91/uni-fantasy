import { useEffect, useRef, useState } from 'react';
import ShieldEmoji from './ShieldEmoji';

// Copa do Mundo 2026 — 48 seleções (confirmadas + prováveis por confederação)
const WC2026_FLAGS = [
  // CONMEBOL
  '🇧🇷','🇦🇷','🇺🇾','🇨🇴','🇪🇨','🇵🇾','🇧🇴','🇻🇪','🇨🇱','🇵🇪',
  // CONCACAF
  '🇺🇸','🇲🇽','🇨🇦','🇨🇷','🇯🇲','🇵🇦','🇭🇳','🇬🇹','🇸🇻','🇹🇹','🇳🇮','🇧🇿','🇬🇾','🇭🇹','🇧🇧','🇨🇺',
  // UEFA
  '🇩🇪','🇫🇷','🇪🇸','🇵🇹','🇬🇧','🇮🇹','🇳🇱','🇧🇪','🇨🇭','🇦🇹','🇩🇰','🇸🇪','🇳🇴','🇵🇱','🇭🇷','🇷🇸','🇸🇰','🇭🇺','🇷🇴','🇬🇷','🇹🇷','🇺🇦','🇸🇮','🇦🇱','🇨🇿','🇫🇮','🇮🇸','🇧🇦','🇧🇬','🇰🇿',
  // CAF
  '🇲🇦','🇸🇳','🇳🇬','🇪🇬','🇨🇮','🇨🇲','🇬🇭','🇩🇿','🇹🇳','🇲🇱','🇿🇦','🇬🇦','🇨🇩','🇸🇩','🇧🇫','🇲🇿','🇹🇿','🇿🇲','🇧🇯','🇬🇳',
  // AFC
  '🇯🇵','🇰🇷','🇸🇦','🇮🇷','🇦🇺','🇶🇦','🇮🇶','🇯🇴','🇦🇪','🇰🇼','🇴🇲','🇺🇿','🇨🇳','🇹🇭','🇻🇳','🇮🇩','🇧🇭',
  // OFC
  '🇳🇿','🇫🇯',
];

const GROUPS = {
  'Copa 2026': WC2026_FLAGS,
  'Esportes': [
    '⚽','🏀','🏐','🤾','🎾','🏈','🏒','⚾','🏑','🥊','🏓','🏸',
    '🏆','🥇','🥈','🥉','🏅','🎖️','🎽','🤸','⛳','🎯',
  ],
  'Animais': [
    '🦁','🐯','🦅','🐺','🦊','🐻','🐲','🦈','🐆','🦏','🦬','🐘',
    '🦒','🦋','🦉','🐬','🐋','🦂','🐊','🐃','🦃','🦚','🐓',
  ],
  'Símbolos': [
    '⭐','🌟','💫','🔥','❄️','⚡','🌊','🏔️','🌙','☀️','💎','👑',
    '🛡️','⚔️','🏹','🎯','💥','🌈','🎪','🏟️','🎭','🎨','🏴‍☠️','🚀',
  ],
};

export default function EmojiPicker({ value, onChange, size = 42, label = 'emoji' }) {
  const [open, setOpen]     = useState(false);
  const [tab, setTab]       = useState('Copa 2026');
  const [custom, setCustom] = useState('');
  const [pos, setPos]       = useState({ top: 0, left: 0 });
  const triggerRef = useRef();
  const boxRef     = useRef();

  // Fecha ao clicar fora
  useEffect(() => {
    const h = (e) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        boxRef.current && !boxRef.current.contains(e.target)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Posiciona o dropdown via fixed para evitar clipping por overflow:hidden
  const handleOpen = () => {
    if (open) { setOpen(false); return; }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow > 320 ? rect.bottom + 6 : rect.top - 330;
      setPos({ top, left: Math.min(rect.left, window.innerWidth - 280) });
    }
    setOpen(true);
  };

  const select = (emoji) => { onChange(emoji); setOpen(false); setCustom(''); };

  return (
    <>
      <div
        ref={triggerRef}
        onClick={handleOpen}
        title={`Clique para escolher ${label}`}
        className="emoji"
        style={{
          width: size, height: size, fontSize: size * 0.58,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--surface-2)', border: '2px dashed var(--border)',
          borderRadius: '8px', cursor: 'pointer', userSelect: 'none',
          transition: 'border-color 0.15s', flexShrink: 0,
        }}
      >
        {value
          ? <ShieldEmoji emoji={value} size={`${size * 0.58}px`} />
          : <span style={{ fontSize: size * 0.35, opacity: 0.5 }}>+</span>}
      </div>

      {open && (
        <div
          ref={boxRef}
          style={{
            position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '0.75rem', padding: '0.75rem',
            width: 272, maxHeight: 340, overflowY: 'auto',
            boxShadow: '0 6px 28px rgba(0,0,0,0.28)',
          }}
        >
          {/* Tabs de grupo */}
          <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
            {Object.keys(GROUPS).map((g) => (
              <button
                key={g}
                onClick={() => setTab(g)}
                style={{
                  fontSize: '0.7rem', padding: '0.2rem 0.55rem', borderRadius: 99, border: 'none',
                  background: tab === g ? 'var(--primary)' : 'var(--surface-2)',
                  color: tab === g ? '#000' : 'var(--text)', cursor: 'pointer',
                  fontWeight: tab === g ? 700 : 400,
                }}
              >
                {g}
              </button>
            ))}
          </div>

          {/* Grid de emojis */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem', marginBottom: '0.6rem' }}>
            {GROUPS[tab].map((e, i) => (
              <button
                key={i}
                onClick={() => select(e)}
                style={{
                  width: 36, height: 36, border: 'none', borderRadius: '0.4rem',
                  background: value === e ? 'rgba(34,197,94,0.18)' : 'transparent',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 2,
                }}
              >
                <ShieldEmoji emoji={e} size="1.35rem" />
              </button>
            ))}
          </div>

          {/* Emoji personalizado */}
          <div style={{ display: 'flex', gap: '0.4rem', borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
            <input
              placeholder="Cole qualquer emoji…"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              style={{ flex: 1, fontSize: '1.1rem', padding: '0.3rem 0.5rem' }}
            />
            <button onClick={() => { if (custom.trim()) select(custom.trim()); }} style={{ padding: '0.3rem 0.7rem' }}>
              OK
            </button>
          </div>
        </div>
      )}
    </>
  );
}
