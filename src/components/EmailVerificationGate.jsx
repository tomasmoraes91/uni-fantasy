import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { resendVerificationEmail, logoutUser } from '../services/auth';
import CapitolaLogo from './CapitolaLogo';

/**
 * Tela de bloqueio exibida quando o usuário (email/senha) ainda não confirmou
 * o email. Permite reenviar o link, recarregar após confirmar, ou sair.
 */
export default function EmailVerificationGate() {
  const { user, reloadUser } = useAuth();
  const navigate = useNavigate();
  const [msg, setMsg]   = useState('');
  const [err, setErr]   = useState('');
  const [busy, setBusy] = useState(false);

  const handleResend = async () => {
    setMsg(''); setErr(''); setBusy(true);
    try {
      await resendVerificationEmail();
      setMsg('Email de verificação reenviado! Confira sua caixa de entrada e o spam.');
    } catch (e) {
      setErr(e.code === 'auth/too-many-requests'
        ? 'Muitas tentativas. Aguarde alguns minutos antes de reenviar.'
        : (e.message || 'Erro ao reenviar o email.'));
    } finally { setBusy(false); }
  };

  const handleCheck = async () => {
    setMsg(''); setErr(''); setBusy(true);
    try {
      const verified = await reloadUser();
      if (!verified) setErr('Ainda não detectamos a confirmação. Clique no link do email e tente de novo.');
      // Se verificado, o gate desmonta sozinho (estado muda no contexto).
    } catch {
      setErr('Não foi possível verificar agora. Tente novamente.');
    } finally { setBusy(false); }
  };

  const handleLogout = async () => { await logoutUser(); navigate('/login'); };

  return (
    <div className="form" style={{ textAlign: 'center' }}>
      <div className="auth-logo"><CapitolaLogo height={44} /></div>
      <h1>✉️ Confirme seu email</h1>
      <p className="page-subtitle">
        Enviamos um link de confirmação para<br />
        <strong>{user?.email}</strong>
      </p>
      <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '1.25rem' }}>
        Você precisa confirmar seu email para acessar o app. Abra o link que enviamos
        (verifique também a pasta de spam) e depois clique em “Já confirmei”.
      </p>

      {msg && <div className="success" style={{ marginBottom: '0.75rem' }}>{msg}</div>}
      {err && <div className="error"   style={{ marginBottom: '0.75rem' }}>{err}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <button onClick={handleCheck} disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Verificando…' : '✅ Já confirmei'}
        </button>
        <button onClick={handleResend} disabled={busy} className="btn-secondary" style={{ width: '100%' }}>
          Reenviar email
        </button>
        <button onClick={handleLogout} className="btn-secondary" style={{ width: '100%' }}>
          Sair
        </button>
      </div>
    </div>
  );
}
