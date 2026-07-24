import { useState } from 'react';

/**
 * Campo de senha com botão de mostrar/ocultar (olhinho).
 * Repassa quaisquer props extras ao <input> (required, value, onChange, etc.).
 */
export default function PasswordInput({ value, onChange, ...props }) {
  const [show, setShow] = useState(false);
  return (
    <div className="password-wrap">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        {...props}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
        title={show ? 'Ocultar senha' : 'Mostrar senha'}
        tabIndex={-1}
      >
        {show ? '🙈' : '👁️'}
      </button>
    </div>
  );
}
