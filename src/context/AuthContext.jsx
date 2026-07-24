import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../services/firebase';
import { getUserProfile, ensureUserProfile, ensureEmailPrivacy, consumeRedirectResult, reloadCurrentUser } from '../services/auth';
import { isAdminEmail } from '../utils/admins';


const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [emailVerified, setEmailVerified] = useState(false);

  // Captura resultado de login via redirect (fallback do Google em mobile)
  useEffect(() => {
    consumeRedirectResult().catch(() => {});
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setLoading(true);
      setUser(u);
      setEmailVerified(u?.emailVerified ?? false);
      try {
        if (u) {
          let p = await getUserProfile(u.uid);
          // Primeiro login via provedor federado (Google): cria o perfil se faltar.
          // Restrito a provedores federados para não competir com o registro email/senha,
          // que cria o doc explicitamente (com displayName escolhido).
          const isFederated = u.providerData?.some((pd) => pd.providerId === 'google.com');
          if (!p && isFederated) p = await ensureUserProfile(u);
          setProfile(p);
          // Migra e-mail de docs antigos p/ a subcoleção privada (best-effort).
          ensureEmailPrivacy(u, p);
        } else {
          setProfile(null);
        }
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  const isAdmin = profile?.role === 'admin' || profile?.isAdmin === true || isAdminEmail(user?.email);

  // Chamado após registro para garantir que o perfil do Firestore seja carregado
  // (onAuthStateChanged pode ter disparado antes do setDoc concluir)
  const refreshProfile = async () => {
    const u = auth.currentUser;
    if (!u) return;
    const p = await getUserProfile(u.uid);
    setProfile(p);
  };

  // Recarrega o usuário do Auth e atualiza o estado de verificação de email
  const reloadUser = async () => {
    const verified = await reloadCurrentUser();
    setEmailVerified(verified);
    return verified;
  };

  // Google sempre vem verificado; admins (por email) não precisam verificar
  const needsEmailVerification = !!user && !emailVerified && !isAdminEmail(user?.email);

  // Enquanto o email não estiver verificado, detecta a confirmação sozinho —
  // sem o usuário precisar sair e entrar de novo. Recarrega ao voltar pra aba
  // (clicou no link em outra aba/email) e a cada 5s como rede de segurança.
  useEffect(() => {
    if (!needsEmailVerification) return;
    let stop = false;
    const check = async () => {
      if (stop) return;
      try {
        const verified = await reloadCurrentUser();
        if (verified && !stop) setEmailVerified(true);
      } catch { /* ignora falhas transitórias de rede */ }
    };
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    const id = setInterval(check, 5000);
    return () => {
      stop = true;
      window.removeEventListener('focus', onFocus);
      clearInterval(id);
    };
  }, [needsEmailVerification]);

  return (
    <AuthContext.Provider value={{
      user, profile, loading, isAdmin,
      emailVerified, needsEmailVerification,
      refreshProfile, reloadUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
