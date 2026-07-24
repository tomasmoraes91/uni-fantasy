/**
 * Admins "donos" do app — reconhecidos pelo email do login Google.
 * Funciona independente do campo `role` no Firestore (bootstrap à prova de falhas).
 * IMPORTANTE: manter esta lista idêntica à do firestore.rules.
 */
export const ADMIN_EMAILS = [
  'beicinn20@gmail.com',
  'tomasmoraes@gmail.com',
  'angelo.santos.penga@gmail.com',
];

export function isAdminEmail(email) {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}
