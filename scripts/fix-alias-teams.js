/**
 * fix-alias-teams.js — Corrige pares de times com nomes em idiomas diferentes
 * (ex: "Côte d'Ivoire" e "Costa do Marfim" são o mesmo país)
 *
 * Usa: node scripts/fix-alias-teams.js
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

// Pares a mesclar: [nomeA, nomeB]
// O que tiver mais jogadores é mantido; o outro é deletado e as partidas redirecionadas
const MERGE_PAIRS = [
  ["Côte d'Ivoire",              'Costa do Marfim'],
  ['Rep. Democrática do Congo',  'República Democrática do Congo'],
  ['Rep. Democrática do Congo',  'Congo'],
  ['República da Coreia',        'Coreia do Sul'],
  ['Curaçao',                    'Curaçau'],
];

async function main() {
  console.log('🔍 Buscando evento Copa do Mundo…');
  const evSnap = await db.collection('events').get();
  const copaEvent = evSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .find((e) => e.name?.toLowerCase().includes('copa'));

  if (!copaEvent) { console.error('❌ Evento não encontrado.'); process.exit(1); }
  const eventId = copaEvent.id;
  console.log(`✅ Evento: "${copaEvent.name}" (${eventId})\n`);

  const teamsSnap = await db.collection('teams')
    .where('eventId', '==', eventId)
    .where('sport', '==', 'futebol')
    .get();
  const teams = teamsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const byName = Object.fromEntries(teams.map((t) => [t.name, t]));

  for (const [nameA, nameB] of MERGE_PAIRS) {
    const teamA = byName[nameA];
    const teamB = byName[nameB];

    if (!teamA && !teamB) { console.log(`⏭ Nenhum dos dois existe: "${nameA}" / "${nameB}"`); continue; }
    if (!teamA || !teamB) {
      const exists = teamA || teamB;
      console.log(`✅ Apenas um existe: "${exists.name}" — nada a fazer`);
      continue;
    }

    // Contar jogadores de cada
    const [pcA, pcB] = await Promise.all([
      db.collection('players').where('teamId', '==', teamA.id).get(),
      db.collection('players').where('teamId', '==', teamB.id).get(),
    ]);

    // Escolhe keeper (quem tem mais jogadores)
    let keeper, toDelete;
    if (pcA.size >= pcB.size) { keeper = teamA; toDelete = teamB; }
    else                       { keeper = teamB; toDelete = teamA; }

    const toDeletePlayerCount = toDelete.id === teamA.id ? pcA.size : pcB.size;
    console.log(`\n── Mesclando "${nameA}" e "${nameB}":`);
    console.log(`   ✔ Keeper:  "${keeper.name}" (${keeper.id}) — ${keeper.id === teamA.id ? pcA.size : pcB.size} jogadores`);
    console.log(`   🗑 Deletar: "${toDelete.name}" (${toDelete.id}) — ${toDeletePlayerCount} jogadores`);

    // Redirecionar partidas
    const matchesSnap = await db.collection('matches').where('eventId', '==', eventId).get();
    const affected = matchesSnap.docs.filter((d) => {
      const m = d.data();
      return m.homeTeamId === toDelete.id || m.awayTeamId === toDelete.id;
    });

    if (affected.length > 0) {
      console.log(`   🔄 Atualizando ${affected.length} partida(s)…`);
      const batch = db.batch();
      for (const d of affected) {
        const m = d.data();
        const update = {};
        if (m.homeTeamId === toDelete.id) {
          update.homeTeamId      = keeper.id;
          update.homeTeamName    = keeper.name;
          update.homeShieldEmoji = keeper.shieldEmoji || '';
        }
        if (m.awayTeamId === toDelete.id) {
          update.awayTeamId      = keeper.id;
          update.awayTeamName    = keeper.name;
          update.awayShieldEmoji = keeper.shieldEmoji || '';
        }
        batch.update(d.ref, update);
      }
      await batch.commit();
    }

    // Deletar jogadores do time removido (se tiver algum)
    const playersToDelete = toDelete.id === teamA.id ? pcA : pcB;
    if (playersToDelete.size > 0) {
      console.log(`   🗑 Deletando ${playersToDelete.size} jogador(es) do time duplicado…`);
      const batch = db.batch();
      playersToDelete.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    await db.collection('teams').doc(toDelete.id).delete();
    console.log(`   ✅ "${toDelete.name}" deletado`);
  }

  console.log('\n✅ Concluído!');
  process.exit(0);
}

main().catch((err) => { console.error('❌ Erro:', err.message); process.exit(1); });
