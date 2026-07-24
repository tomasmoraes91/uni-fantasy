import { useState, useRef, useEffect } from 'react';
import ShieldEmoji from './ShieldEmoji';

/**
 * Custom select dropdown with search filter.
 * options: [{ value, label, emoji }]
 */
export default function ShieldSelect({ value, onChange, options, disabled }) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState('');
  const ref      = useRef(null);
  const inputRef = useRef(null);
  const selected = options.find((o) => o.value === value);

  // Fecha ao clicar fora
  useEffect(() => {
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  // Foca o input de busca ao abrir; limpa ao fechar
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    } else {
      setSearch('');
    }
  }, [open]);

  const q = search.toLowerCase();
  const filtered = options.filter(
    (o) => o.value === '' || o.label.toLowerCase().includes(q)
  );

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Botão principal */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '0.45rem',
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: '6px', padding: '0.4rem 0.65rem',
          color: selected ? 'var(--text)' : 'var(--muted)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: '0.88rem', textAlign: 'left', opacity: disabled ? 0.6 : 1,
        }}
      >
        {selected?.emoji && <ShieldEmoji emoji={selected.emoji} size="1.2em" />}
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : '— Selecione —'}
        </span>
        <span style={{ color: 'var(--muted)', fontSize: '0.7rem', flexShrink: 0 }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, zIndex: 200,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '6px', boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
        }}>
          {/* Campo de busca */}
          <div style={{ padding: '0.35rem 0.4rem', borderBottom: '1px solid var(--border)' }}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Buscar…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                borderRadius: '4px', padding: '0.28rem 0.5rem',
                fontSize: '0.82rem', color: 'var(--text)', outline: 'none',
              }}
            />
          </div>

          {/* Lista filtrada */}
          <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '0.5rem 0.65rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                Nenhum resultado
              </div>
            ) : filtered.map((o) => (
              <div
                key={o.value}
                onClick={() => { onChange(o.value); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.45rem',
                  padding: '0.4rem 0.65rem', cursor: 'pointer', fontSize: '0.88rem',
                  color: o.value === value ? 'var(--primary)' : o.value === '' ? 'var(--muted)' : 'var(--text)',
                  background: o.value === value ? 'rgba(34,197,94,0.1)' : 'transparent',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = o.value === value ? 'rgba(34,197,94,0.1)' : 'transparent';
                }}
              >
                {o.emoji
                  ? <ShieldEmoji emoji={o.emoji} size="1.2em" />
                  : <span style={{ display: 'inline-block', width: '1.2em', flexShrink: 0 }} />}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {o.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
