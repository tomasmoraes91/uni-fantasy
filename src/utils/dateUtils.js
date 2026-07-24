const SP_TZ = 'America/Sao_Paulo';

export function formatDateSP(ts, opts = {}) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('pt-BR', {
    timeZone: SP_TZ,
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    ...opts,
  });
}

export function formatDateKeySP(ts) {
  if (!ts) return 'Sem data';
  return new Date(ts).toLocaleDateString('pt-BR', {
    timeZone: SP_TZ,
    weekday: 'long', day: '2-digit', month: 'long',
  });
}

export function formatTimeSP(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('pt-BR', {
    timeZone: SP_TZ,
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatDateOnlySP(ts, opts = {}) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('pt-BR', {
    timeZone: SP_TZ,
    day: '2-digit', month: 'short', year: 'numeric',
    ...opts,
  });
}
