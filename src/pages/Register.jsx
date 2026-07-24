import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registerUser, signInWithGoogle } from '../services/auth';
import { useAuth } from '../context/AuthContext';
import { T } from '../utils/labels';
import GoogleButton from '../components/GoogleButton';
import PasswordInput from '../components/PasswordInput';
import CapitolaLogo from '../components/CapitolaLogo';
import { authErrorMessage } from '../utils/authErrors';

export default function Register() {
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const navigate = useNavigate();
  const { user, loading: authLoading, refreshProfile } = useAuth();

  // Redireciona após login (inclui retorno do fluxo redirect do Google em mobile)
  useEffect(() => {
    if (!authLoading && user) navigate('/descobrir', { replace: true });
  }, [user, authLoading, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    if (password.length < 6) { setError(T.auth.minPassword); return; }
    setLoading(true);
    try {
      await registerUser(email, password, name);
      // onAuthStateChanged dispara antes do setDoc concluir; força re-fetch do perfil
      await refreshProfile();
      navigate('/descobrir');
    }
    catch (err) { setError(authErrorMessage(err)); }
    finally { setLoading(false); }
  };

  const handleGoogle = async () => {
    setError(''); setGoogleBusy(true);
    try {
      const u = await signInWithGoogle();
      if (u) { await refreshProfile(); navigate('/descobrir'); }
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
      <h1>{T.auth.createAccount}</h1>
      <p className="page-subtitle">{T.auth.registerSubtitle}</p>
      {error && <div className="error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group"><label>{T.auth.name}</label>
          <input type="text" required maxLength={20} value={name} onChange={(e) => setName(e.target.value)} />
          {name.length > 14 && <span style={{ fontSize: '0.72rem', color: name.length >= 20 ? '#ef4444' : 'var(--muted)' }}>{name.length}/20</span>}</div>
        <div className="form-group"><label>{T.auth.email}</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="form-group"><label>{T.auth.password}</label>
          <PasswordInput required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <button type="submit" disabled={loading} style={{ width: '100%' }}>
          {loading ? T.auth.creatingAccount : T.auth.createAccount}
        </button>
      </form>

      <div className="auth-divider"><span>ou</span></div>
      <GoogleButton onClick={handleGoogle} disabled={googleBusy}
        label={googleBusy ? 'Conectando…' : 'Continuar com Google'} />

      <p className="text-center mt-2 muted">
        {T.auth.haveAccount} <Link to="/login">{T.auth.signIn}</Link>
      </p>
    </div>
  );
}
