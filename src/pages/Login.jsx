import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loginUser, signInWithGoogle } from '../services/auth';
import { useAuth } from '../context/AuthContext';
import { T } from '../utils/labels';
import GoogleButton from '../components/GoogleButton';
import PasswordInput from '../components/PasswordInput';
import CapitolaLogo from '../components/CapitolaLogo';
import { authErrorMessage } from '../utils/authErrors';

export default function Login() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  // Redireciona automaticamente quando o auth state atualizar após login
  useEffect(() => {
    if (!authLoading && user) navigate('/descobrir', { replace: true });
  }, [user, authLoading, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setSubmitting(true);
    try {
      await loginUser(email, password);
      navigate('/descobrir', { replace: true });
    }
    catch (err) { setError(authErrorMessage(err)); }
    finally { setSubmitting(false); }
  };

  const handleGoogle = async () => {
    setError(''); setGoogleBusy(true);
    try {
      const u = await signInWithGoogle();
      if (u) navigate('/descobrir', { replace: true }); // null = fluxo redirect em andamento
    }
    catch (err) {
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        setError(authErrorMessage(err));
      }
    }
    finally { setGoogleBusy(false); }
  };

  return (
    <div className="form">
      <div className="auth-logo"><CapitolaLogo height={44} /></div>
      <h1>{T.auth.welcomeBack}</h1>
      <p className="page-subtitle">{T.auth.signInSubtitle}</p>
      {error && <div className="error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group"><label>{T.auth.email}</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="form-group"><label>{T.auth.password}</label>
          <PasswordInput required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <button type="submit" disabled={submitting} style={{ width: '100%' }}>
          {submitting ? T.auth.signingIn : T.auth.signIn}
        </button>
      </form>

      <div className="auth-divider"><span>ou</span></div>
      <GoogleButton onClick={handleGoogle} disabled={googleBusy}
        label={googleBusy ? 'Conectando…' : 'Entrar com Google'} />

      <p className="text-center mt-2 muted">
        {T.auth.noAccount} <Link to="/register">{T.auth.register}</Link>
      </p>
    </div>
  );
}
