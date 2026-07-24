import { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext(null);

const TYPE_BG = {
  success: 'rgba(34,197,94,0.95)',
  error:   'rgba(239,68,68,0.95)',
  info:    'rgba(59,130,246,0.95)',
};

/**
 * Notificações in-app (toast) e confirmação (modal) — substituem alert()/confirm()
 * nativos. Uso: const { toast, confirm } = useToast();
 *   toast('Salvo!', 'success')
 *   if (!(await confirm('Tem certeza?'))) return;
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null); // { message, resolve }
  const idRef = useRef(0);

  const toast = useCallback((message, type = 'info') => {
    const id = ++idRef.current;
    setToasts((list) => [...list, { id, message, type }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 3500);
  }, []);

  const confirm = useCallback((message) =>
    new Promise((resolve) => setConfirmState({ message, resolve })), []);

  const closeConfirm = (result) => {
    confirmState?.resolve(result);
    setConfirmState(null);
  };

  return (
    <ToastContext.Provider value={{ toast, confirm }}>
      {children}

      {/* Toasts */}
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: '1.25rem', display: 'flex',
        flexDirection: 'column', alignItems: 'center', gap: '0.5rem', zIndex: 9999, pointerEvents: 'none' }}>
        {toasts.map((t) => (
          <div key={t.id} role="status" style={{
            background: TYPE_BG[t.type] || TYPE_BG.info, color: '#fff', padding: '0.7rem 1.1rem',
            borderRadius: 10, fontSize: '0.88rem', maxWidth: '90%', textAlign: 'center',
            boxShadow: '0 6px 20px rgba(0,0,0,0.25)', whiteSpace: 'pre-line' }}>
            {t.message}
          </div>
        ))}
      </div>

      {/* Modal de confirmação */}
      {confirmState && (
        <div onClick={() => closeConfirm(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 10000 }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ maxWidth: 380, width: '100%', padding: '1.25rem' }}>
            <p style={{ margin: '0 0 1.25rem', whiteSpace: 'pre-line', lineHeight: 1.45 }}>{confirmState.message}</p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => closeConfirm(false)}>Cancelar</button>
              <button onClick={() => closeConfirm(true)}>Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
