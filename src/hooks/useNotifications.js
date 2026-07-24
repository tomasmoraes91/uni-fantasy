import { useEffect, useState } from 'react';
import { requestNotificationPermission, notificationsGranted } from '../services/notifications';

/**
 * Hook que solicita permissão de notificação uma vez por sessão,
 * após o usuário estar logado. Não bloqueia nada se negado.
 */
export function useNotifications(uid) {
  const [granted, setGranted] = useState(notificationsGranted());
  const [asked,   setAsked]   = useState(false);

  useEffect(() => {
    if (!uid || asked) return;
    // Aguarda 3s para não assustar o usuário ao entrar
    const timer = setTimeout(async () => {
      setAsked(true);
      if (notificationsGranted()) { setGranted(true); return; }
      if (Notification.permission === 'denied') return; // já negou antes
      const token = await requestNotificationPermission(uid);
      setGranted(!!token);
    }, 3000);
    return () => clearTimeout(timer);
  }, [uid, asked]);

  return { granted };
}
