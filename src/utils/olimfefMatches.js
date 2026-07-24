/**
 * Agenda fixa de partidas do OLIMFEF (importada pelo botão no Admin).
 * date = timestamp ms (fuso -03:00). Países casam pelo nome do time.
 */
const mk = (dd, time, sport, gender, home, away) => ({
  sport, gender, home, away,
  date: new Date(`2026-06-${dd}T${time}:00-03:00`).getTime(),
});

export const OLIMFEF_MATCHES = [
  // ── 15/06 manhã ──
  mk('15', '07:30', 'handball', 'masculino', 'Brasil',   'França'),
  mk('15', '08:20', 'handball', 'feminino',  'Brasil',   'França'),
  mk('15', '09:10', 'handball', 'masculino', 'Portugal', 'Holanda'),
  mk('15', '10:00', 'handball', 'feminino',  'Portugal', 'Holanda'),
  mk('15', '10:50', 'handball', 'masculino', 'Brasil',   'Portugal'),
  // ── 15/06 tarde ──
  mk('15', '13:20', 'futsal', 'masculino', 'Portugal', 'França'),
  mk('15', '14:10', 'futsal', 'feminino',  'Portugal', 'França'),
  mk('15', '15:00', 'futsal', 'masculino', 'Brasil',   'Holanda'),
  mk('15', '15:50', 'futsal', 'feminino',  'Brasil',   'Holanda'),
  mk('15', '16:40', 'futsal', 'masculino', 'Brasil',   'França'),
  // ── 16/06 manhã ──
  mk('16', '07:30', 'volleyball', 'feminino',  'Brasil',   'França'),
  mk('16', '08:20', 'volleyball', 'masculino', 'Brasil',   'França'),
  mk('16', '09:10', 'volleyball', 'masculino', 'Portugal', 'Holanda'),
  mk('16', '10:00', 'volleyball', 'feminino',  'Portugal', 'Holanda'),
  mk('16', '10:50', 'volleyball', 'masculino', 'Brasil',   'Portugal'),
  // ── 16/06 tarde ──
  mk('16', '13:20', 'volleyball', 'feminino', 'Brasil',   'Portugal'),
  mk('16', '14:10', 'basketball', 'misto',    'Portugal', 'França'),
  mk('16', '14:40', 'basketball', 'misto',    'Brasil',   'Holanda'),
  mk('16', '15:10', 'basketball', 'misto',    'Brasil',   'França'),
  mk('16', '15:40', 'basketball', 'misto',    'Portugal', 'Holanda'),
  mk('16', '16:10', 'basketball', 'misto',    'Brasil',   'Portugal'),
  mk('16', '16:40', 'basketball', 'misto',    'Holanda',  'França'),
  // ── 17/06 manhã ──
  mk('17', '07:30', 'futsal', 'feminino',  'Brasil',   'França'),
  mk('17', '08:20', 'futsal', 'masculino', 'Portugal', 'Holanda'),
  mk('17', '09:10', 'futsal', 'feminino',  'Portugal', 'Holanda'),
  mk('17', '10:00', 'futsal', 'masculino', 'Brasil',   'Portugal'),
  mk('17', '10:50', 'futsal', 'feminino',  'Brasil',   'Portugal'),
  // ── 17/06 tarde ──
  mk('17', '13:20', 'futsal',     'masculino', 'Holanda',  'França'),
  mk('17', '14:10', 'futsal',     'feminino',  'Holanda',  'França'),
  mk('17', '15:00', 'volleyball', 'feminino',  'França',   'Holanda'),
  mk('17', '15:50', 'volleyball', 'feminino',  'Portugal', 'França'),
  mk('17', '16:40', 'volleyball', 'feminino',  'Brasil',   'Holanda'),
  // ── 18/06 manhã ──
  mk('18', '08:20', 'volleyball', 'masculino', 'França',   'Holanda'),
  mk('18', '09:10', 'volleyball', 'masculino', 'Portugal', 'França'),
  mk('18', '10:00', 'volleyball', 'masculino', 'Brasil',   'Holanda'),
  mk('18', '10:50', 'handball',   'feminino',  'Brasil',   'Portugal'),
  // ── 18/06 tarde ──
  mk('18', '13:20', 'handball', 'masculino', 'França',   'Holanda'),
  mk('18', '14:10', 'handball', 'masculino', 'Portugal', 'França'),
  mk('18', '15:00', 'handball', 'feminino',  'França',   'Holanda'),
  mk('18', '15:50', 'handball', 'masculino', 'Brasil',   'Holanda'),
  mk('18', '16:40', 'handball', 'feminino',  'Portugal', 'França'),
  // ── 19/06 manhã ──
  mk('19', '07:30', 'handball', 'feminino', 'Brasil', 'Holanda'),
];
