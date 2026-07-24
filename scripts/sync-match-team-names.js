/**
 * sync-match-team-names.js — Sincroniza homeTeamName/awayTeamName/shieldEmoji
 * nas partidas com o nome e emoji atual de cada time no Firestore.
 *
 * Uso: node scripts/sync-match-team-names.js
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const require   = createRequire(import.meta.url);
const admin     = require('firebase-admin');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const serviceAccount = JSON.parse(
  readFileSync(path.join(__dirname, 'service-account.json'), 'utf8')
);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
  console.log('🔍 Buscando evento Copa do Mundo…');
  const evSnap = await db.collection('events').get();
  const copaEvent = evSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .find((e) => e.name?.toLowerCase().includes('copa'));

  if (!copaEvent) { console.error('❌ Evento não encontrado.'); process.exit(1); }
  const eventId = copaEvent.id;
  console.log(`✅ Evento: "${copaEvent.name}" (${eventId})\n`);

  const [teamsSnap, matchesSnap] = await Promise.all([
    db.collection('teams').where('eventId', '==', eventId).get(),
    db.collection('matches').where('eventId', '==', eventId).get(),
  ]);

  // Mapa teamId → { name, shieldEmoji }
  const teamMap = {};
  teamsSnap.docs.forEach((d) => {
    teamMap[d.id] = { name: d.data().name, shieldEmoji: d.data().shieldEmoji || '' };
  });

  console.log(`📋 ${teamsSnap.size} times | ${matchesSnap.size} partidas\n`);

  const batch = db.batch();
  let updated = 0;

  for (const doc of matchesSnap.docs) {
    const m = doc.data();
    const home = teamMap[m.homeTeamId];
    const away = teamMap[m.awayTeamId];
    const update = {};

    if (home && (m.homeTeamName !== home.name || m.homeShieldEmoji !== home.shieldEmoji)) {
      update.homeTeamName    = home.name;
      update.homeShieldEmoji = home.shieldEmoji;
    }
    if (away && (m.awayTeamName !== away.name || m.awayShieldEmoji !== away.shieldEmoji)) {
      update.awayTeamName    = away.name;
      update.awayShieldEmoji = away.shieldEmoji;
    }

    if (Object.keys(update).length > 0) {
      const oldHome = m.homeTeamName;
      const oldAway = m.awayTeamName;
      batch.update(doc.ref, update);
      updated++;
      if (update.homeTeamName || update.awayTeamName) {
        console.log(`  ✏️  ${oldHome} × ${oldAway}`);
        if (update.homeTeamName)    console.log(`       home: "${oldHome}" → "${home.name}"`);
        if (update.awayTeamName)    console.log(`       away: "${oldAway}" → "${away.name}"`);
      }
    }
  }

  if (updated === 0) {
    console.log('✅ Todas as partidas já estão sincronizadas.');
  } else {
    await batch.commit();
    console.log(`\n✅ ${updated} partida(s) atualizadas.`);
  }

  process.exit(0);
}

main().catch((err) => { console.error('❌ Erro:', err.message); process.exit(1); });
