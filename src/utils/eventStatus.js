/**
 * Resolve o status de um evento com retrocompatibilidade:
 * - v3+: usa o campo `status` ('ativo' | 'futuro' | 'finalizado')
 * - v2:  usa `active: true/false` → mapeia para 'ativo'/'finalizado'
 * - sem nada: assume 'ativo'
 */
export function resolveEventStatus(event) {
  if (!event) return 'ativo';
  if (event.status) return event.status;
  if (event.active === false) return 'finalizado';
  return 'ativo';
}

export const EVENT_STATUS_LABELS = {
  ativo:      '🟢 Ativo',
  futuro:     '🟡 Em breve',
  finalizado: '⚪ Encerrado',
};
