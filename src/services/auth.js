import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  sendEmailVerification,
  signOut,
  updateProfile
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import { auth, db } from './firebase';
import { invalidateCache } from './firestore';

// E-mail fica numa subcoleção privada (lida só pelo dono + admin), nunca no
// doc público `users`. O próprio usuário sempre tem o e-mail via Firebase Auth.
async function savePrivateEmail(uid, email) {
  try {
    await setDoc(doc(db, 'users', uid, 'private', 'profile'),
      { email: email || '' }, { merge: true });
  } catch { /* best-effort */ }
}

/**
 * Migração: se um doc público ainda tiver o campo `email` (usuários antigos),
 * move para a subcoleção privada e remove do público. Chamada no login.
 * Recebe o profile já carregado para não fazer uma leitura extra.
 */
export async function ensureEmailPrivacy(user, profile) {
  if (!user || !profile || profile.email === undefined) return;
  await savePrivateEmail(user.uid, profile.email || user.email);
  try { await updateDoc(doc(db, 'users', user.uid), { email: deleteField() }); }
  catch { /* best-effort */ }
}

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function registerUser(email, password, displayName) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName });
  await setDoc(doc(db, 'users', cred.user.uid), {
    uid: cred.user.uid,
    displayName,
    role: 'user',
    createdAt: Date.now()
  });
  await savePrivateEmail(cred.user.uid, email);
  // Envia o email de verificação (não bloqueia o registro se falhar)
  try { await sendEmailVerification(cred.user); } catch { /* ignora */ }
  return cred.user;
}

/** Reenvia o email de verificação para o usuário atual. */
export async function resendVerificationEmail() {
  if (!auth.currentUser) throw new Error('Você não está autenticado.');
  await sendEmailVerification(auth.currentUser);
}

/** Recarrega o usuário do Auth e retorna se o email já está verificado. */
export async function reloadCurrentUser() {
  if (!auth.currentUser) return false;
  await auth.currentUser.reload();
  const verified = auth.currentUser.emailVerified === true;
  // Força um novo ID token: as Security Rules leem `email_verified` do token
  // (cache de ~1h), então sem refresh a escrita ainda seria negada.
  if (verified) await auth.currentUser.getIdToken(true);
  return verified;
}

/**
 * Garante que exista um documento de perfil para o usuário.
 * Usado no primeiro login via Google (Auth cria a conta, mas não o doc do Firestore).
 * Não sobrescreve um perfil existente.
 */
export async function ensureUserProfile(user) {
  if (!user) return null;
  const ref  = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();
  const profile = {
    uid:         user.uid,
    displayName: (user.displayName || user.email?.split('@')[0] || 'Jogador').slice(0, 20),
    role:        'user',
    photoURL:    user.photoURL || '',
    provider:    'google',
    createdAt:   Date.now(),
  };
  await setDoc(ref, profile);
  await savePrivateEmail(user.uid, user.email);
  return profile;
}

/**
 * Login com Google. Tenta popup (melhor no desktop) e cai para redirect
 * quando o popup é bloqueado ou não suportado (comum em browsers mobile).
 * Retorna o user no caso popup; no caso redirect retorna null e o resultado
 * é capturado por consumeRedirectResult() ao recarregar.
 */
export async function signInWithGoogle() {
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    await ensureUserProfile(cred.user);
    return cred.user;
  } catch (err) {
    const fallbackCodes = [
      'auth/popup-blocked',
      'auth/operation-not-supported-in-this-environment',
      'auth/web-storage-unsupported',
    ];
    if (fallbackCodes.includes(err.code)) {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    // popup-closed-by-user / cancelled-popup-request: usuário desistiu — propaga sem redirect
    throw err;
  }
}

/**
 * Consome o resultado de um signInWithRedirect (chamado uma vez no boot do app).
 * Cria o perfil se for o primeiro login. Retorna o user ou null.
 */
export async function consumeRedirectResult() {
  const result = await getRedirectResult(auth);
  if (result?.user) {
    await ensureUserProfile(result.user);
    return result.user;
  }
  return null;
}

export async function loginUser(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logoutUser() {
  return signOut(auth);
}

/**
 * Altera o nome de exibição do usuário. Marca nameChanged=true para limitar a 1×.
 * Atualiza o perfil do Auth e o doc do Firestore.
 */
export async function updateDisplayName(newName) {
  const u = auth.currentUser;
  if (!u) throw new Error('Você não está autenticado.');
  const clean = (newName || '').trim().slice(0, 20);
  if (clean.length < 2) throw new Error('O nome precisa ter ao menos 2 caracteres.');
  await updateProfile(u, { displayName: clean });
  await updateDoc(doc(db, 'users', u.uid), { displayName: clean, nameChanged: true });
  invalidateCache(`profile:${u.uid}`, 'users:all');
  return clean;
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}
