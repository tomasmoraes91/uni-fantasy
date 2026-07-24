/**
 * fix-duplicate-teams.js — Corrige times duplicados no evento Copa do Mundo
 *
 * Para cada grupo de duplicatas:
 *  - Mantém o time que tem jogadores (ou o primeiro, se nenhum tiver)
 *  - Redireciona todas as partidas para o time mantido
 *  - Deleta os times duplicados (e seus jogadores, se existirem)
 *
 * Uso: node scripts/fix-duplicate-teams.js
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

// Normaliza nome para comparação: minúsculo, sem acentos, sem espaços extras
function normalize(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/[''']/g, '')
    .trim();
}

async function main() {
  console.log('🔍 Buscando evento Copa do Mundo…');
  const evSnap = await db.collection('events').get();
  const copaEvent = evSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .find((e) => e.name?.toLowerCase().includes('copa'));

  if (!copaEvent) { console.error('❌ Evento não encontrado.'); process.exit(1); }
  const eventId = copaEvent.id;
  console.log(`✅ Evento: "${copaEvent.name}" (${eventId})\n`);

  // ── Carregar times e jogadores ──
  const [teamsSnap, playersSnap, matchesSnap] = await Promise.all([
    db.collection('teams').where('eventId', '==', eventId).where('sport', '==', 'futebol').get(),
    db.collection('players').where('eventId', '==', eventId).where('sport', '==', 'futebol').get(),
    db.collection('matches').where('eventId', '==', eventId).get(),
  ]);

  const teams   = teamsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const players = playersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const matches = matchesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Contagem de jogadores por time
  const playerCount = {};
  players.forEach((p) => { playerCount[p.teamId] = (playerCount[p.teamId] || 0) + 1; });

  console.log(`📋 ${teams.length} times | ${players.length} jogadores | ${matches.length} partidas\n`);

  // ── Agrupar duplicatas por nome normalizado ──
  const groups = {}; // normalizedName → [team, ...]
  teams.forEach((t) => {
    const key = normalize(t.name);
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });

  const duplicates = Object.entries(groups).filter(([, arr]) => arr.length > 1);

  if (duplicates.length === 0) {
    console.log('✅ Nenhuma duplicata encontrada!');
    process.exit(0);
  }

  console.log(`⚠️  ${duplicates.length} grupo(s) de duplicatas encontrado(s):\n`);

  for (const [key, arr] of duplicates) {
    console.log(`\n── "${key}" — ${arr.length} ocorrências:`);
    arr.forEach((t) => console.log(`   ${t.id}  "${t.name}"  ${t.shieldEmoji || ''}  (${playerCount[t.id] || 0} jogadores)`));

    // Escolhe o keeper: preferência a quem tem mais jogadores, depois quem aparece nas partidas
    const withPlayers = arr.filter((t) => (playerCount[t.id] || 0) > 0);
    let keeper, toDelete;

    if (withPlayers.length >= 1) {
      // Mantém o que tem mais jogadores
      keeper    = withPlayers.sort((a, b) => (playerCount[b.id] || 0) - (playerCount[a.id] || 0))[0];
      toDelete  = arr.filter((t) => t.id !== keeper.id);
    } else {
      // Nenhum tem jogadores — mantém o que aparece em mais partidas
      const matchCount = (t) =>
        matches.filter((m) => m.homeTeamId === t.id || m.awayTeamId === t.id).length;
      keeper   = arr.sort((a, b) => matchCount(b) - matchCount(a))[0];
      toDelete = arr.filter((t) => t.id !== keeper.id);
    }

    console.log(`   ✔ Keeper: "${keeper.name}" (${keeper.id})`);
    console.log(`   🗑 Deletar: ${toDelete.map((t) => `"${t.name}" (${t.id})`).join(', ')}`);

    // Redirecionar partidas
    const affectedMatches = matches.filter((m) =>
      toDelete.some((t) => m.homeTeamId === t.id || m.awayTeamId === t.id)
    );

    if (affectedMatches.length > 0) {
      console.log(`   🔄 Atualizando ${affectedMatches.length} partida(s)…`);
      const batch = db.batch();
      for (const m of affectedMatches) {
        const update = {};
        toDelete.forEach((t) => {
          if (m.homeTeamId === t.id) {
            update.homeTeamId      = keeper.id;
            update.homeTeamName    = keeper.name;
            update.homeShieldEmoji = keeper.shieldEmoji || '';
          }
          if (m.awayTeamId === t.id) {
            update.awayTeamId      = keeper.id;
            update.awayTeamName    = keeper.name;
            update.awayShieldEmoji = keeper.shieldEmoji || '';
          }
        });
        batch.update(db.collection('matches').doc(m.id), update);
      }
      await batch.commit();
    }

    // Deletar jogadores dos times removidos (se existirem)
    for (const t of toDelete) {
      const pToDelete = players.filter((p) => p.teamId === t.id);
      if (pToDelete.length > 0) {
        console.log(`   🗑 Deletando ${pToDelete.length} jogador(es) do time duplicado "${t.name}"…`);
        const batch = db.batch();
        pToDelete.forEach((p) => batch.delete(db.collection('players').doc(p.id)));
        await batch.commit();
      }
      // Deletar o time
      await db.collection('teams').doc(t.id).delete();
      console.log(`   ✅ Time "${t.name}" (${t.id}) deletado`);
    }
  }

  console.log('\n✅ Correção concluída!');
  process.exit(0);
}

main().catch((err) => { console.error('❌ Erro:', err.message); process.exit(1); });
