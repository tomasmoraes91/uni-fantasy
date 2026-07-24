import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './firebase';

/**
 * Faz upload de uma imagem e retorna a URL pública.
 * path: ex. 'players/playerId', 'teams/teamId', 'events/eventId'
 */
export async function uploadImage(path, file) {
  if (!file) throw new Error('Nenhum arquivo selecionado.');
  const MAX_MB = 2;
  if (file.size > MAX_MB * 1024 * 1024) throw new Error(`Imagem deve ter no máximo ${MAX_MB}MB.`);
  if (!file.type.startsWith('image/')) throw new Error('Apenas imagens são permitidas.');

  const ext      = file.name.split('.').pop();
  const fullPath = `${path}.${ext}`;
  const storageRef = ref(storage, fullPath);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

export async function uploadPlayerPhoto(playerId, file) {
  return uploadImage(`players/${playerId}`, file);
}

export async function uploadTeamShield(teamId, file) {
  return uploadImage(`teams/${teamId}`, file);
}

export async function uploadEventLogo(eventId, file) {
  return uploadImage(`events/${eventId}`, file);
}

/** Widget de upload reutilizável — retorna { url, loading, error, pick } */
export function createUploadHandler(onUpload) {
  return async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await onUpload(file);
  };
}
