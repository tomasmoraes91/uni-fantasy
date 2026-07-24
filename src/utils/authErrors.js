/**
 * Traduz códigos de erro do Firebase Auth para mensagens em português.
 */
const MESSAGES = {
  'auth/invalid-credential':     'E-mail ou senha incorretos.',
  'auth/wrong-password':         'E-mail ou senha incorretos.',
  'auth/user-not-found':         'Não encontramos uma conta com esse e-mail.',
  'auth/invalid-email':          'E-mail inválido.',
  'auth/missing-password':       'Informe sua senha.',
  'auth/email-already-in-use':   'Este e-mail já está cadastrado. Tente entrar.',
  'auth/weak-password':          'A senha precisa ter ao menos 6 caracteres.',
  'auth/too-many-requests':      'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
  'auth/network-request-failed': 'Falha de conexão. Verifique sua internet.',
  'auth/user-disabled':          'Esta conta foi desativada.',
  'auth/popup-blocked':          'O popup foi bloqueado pelo navegador. Tentando outro método…',
  'auth/operation-not-allowed':  'Este método de login não está habilitado.',
  'auth/requires-recent-login':  'Por segurança, entre novamente para concluir esta ação.',
};

export function authErrorMessage(err) {
  if (!err) return 'Ocorreu um erro. Tente novamente.';
  const code = err.code || '';
  if (MESSAGES[code]) return MESSAGES[code];
  // Fallback: remove o prefixo "Firebase:" e o código entre parênteses
  const raw = (err.message || '').replace('Firebase: ', '').replace(/\(auth\/[^)]+\)\.?/, '').trim();
  return raw || 'Ocorreu um erro. Tente novamente.';
}
