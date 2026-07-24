/**
 * NotificationService — Firebase Cloud Messaging (FCM)
 *
 * SETUP NECESSÁRIO (feito uma vez no console Firebase):
 *   1. Firebase Console → Project Settings → Cloud Messaging → Web Push certificates
 *   2. Gere um par de chaves VAPID e copie a chave pública
 *   3. Adicione ao .env: VITE_FIREBASE_VAPID_KEY=<chave pública>
 *   4. Coloque o arquivo firebase-messaging-sw.js na pasta /public (veja abaixo)
 *
 * ARQUIVO /public/firebase-messaging-sw.js necessário — gerado automaticamente
 * pelo método setupServiceWorker() abaixo se ainda não existir.
 */
import { getToken, onMessage } from 'firebase/messaging';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db, getMessagingInstance } from './firebase';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

/**
 * Salva o FCM token no Firestore em users/{uid}/fcmTokens/{token}
 * Estrutura: { token, platform: 'web', updatedAt, enabled: true }
 */
async function saveTokenToFirestore(uid, token) {
  if (!uid || !token) return;
  await setDoc(
    doc(db, 'users', uid, 'fcmTokens', token.slice(-20)),
    { token, platform: 'web', updatedAt: Date.now(), enabled: true },
    { merge: true }
  );
}

/**
 * Solicita permissão de notificação e retorna o FCM token.
 * Retorna null se negado ou não suportado.
 */
export async function requestNotificationPermission(uid) {
  try {
    // Verifica suporte
    if (!('Notification' in window)) return null;

    const messaging = await getMessagingInstance();
    if (!messaging) return null;

    // Solicita permissão
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    if (!VAPID_KEY) {
      console.warn('[FCM] VITE_FIREBASE_VAPID_KEY não configurada. Token não gerado.');
      return null;
    }

    // Obtém token FCM
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (token && uid) await saveTokenToFirestore(uid, token);
    return token;
  } catch (err) {
    // Erro comum em localhost sem HTTPS — silencioso em dev
    console.warn('[FCM] Não foi possível obter token:', err.message);
    return null;
  }
}

/**
 * Verifica se o usuário já concedeu permissão.
 */
export function notificationsGranted() {
  return 'Notification' in window && Notification.permission === 'granted';
}

/**
 * Ouve mensagens em foreground (app aberto).
 * Retorna unsubscribe function.
 */
export async function onForegroundMessage(callback) {
  const messaging = await getMessagingInstance();
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => {
    callback(payload);
  });
}

/**
 * Verifica se o usuário tem token salvo no Firestore.
 */
export async function hasStoredToken(uid) {
  if (!uid) return false;
  try {
    const ref   = doc(db, 'users', uid);
    const snap  = await getDoc(ref);
    const data  = snap.data();
    return !!(data?.fcmToken || data?.notificationsEnabled);
  } catch {
    return false;
  }
}
