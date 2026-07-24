import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getMessaging, isSupported } from 'firebase/messaging';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

// App Check — garante que só o app oficial acesse Firestore/Storage (bloqueia
// clientes/API externos). Só inicializa se a site key (reCAPTCHA v3) estiver
// definida, para não quebrar ambientes sem App Check configurado ainda.
// Rollout: configurar no Console em modo "monitorar" antes de "forçar".
const appCheckSiteKey = import.meta.env.VITE_APPCHECK_SITE_KEY;
if (appCheckSiteKey) {
  // Token de debug p/ dev local. 'true' → o SDK gera e imprime um token no
  // console (registre-o no Console > App Check). Um valor != 'true' é usado
  // como token específico já registrado.
  const dbg = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
  if (import.meta.env.DEV && dbg) {
    // eslint-disable-next-line no-undef
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = dbg === 'true' ? true : dbg;
  }
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

export const auth    = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});
export const db      = getFirestore(app);
export const storage = getStorage(app);

export const getMessagingInstance = async () => {
  const supported = await isSupported();
  if (!supported) return null;
  return getMessaging(app);
};

export default app;
