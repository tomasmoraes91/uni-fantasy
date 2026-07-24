/**
 * seed-matches-copa.js — Insere as partidas da fase de grupos da Copa do Mundo 2026
 *
 * Uso: node scripts/seed-matches-copa.js
 *
 * - Deleta todas as partidas existentes do evento Copa do Mundo
 * - Cria times ausentes no Firestore
 * - Insere as 72 partidas da 1ª, 2ª e 3ª rodada
 * - Horários em UTC (convertidos de BRT = UTC-3)
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

// ── Conversão BRT → UTC ───────────────────────────────────────────
// BRT = UTC-3; JS Date.UTC normaliza horas > 23 automaticamente
function brt(year, month, day, hour, minute = 0) {
  return Date.UTC(year, month - 1, day, hour + 3, minute);
}

// ── Times: emoji para criação de times ausentes ───────────────────
const TEAM_EMOJI = {
  'África do Sul':                  '🇿🇦',
  'Alemanha':                       '🇩🇪',
  'Arábia Saudita':                 '🇸🇦',
  'Argélia':                        '🇩🇿',
  'Argentina':                      '🇦🇷',
  'Austrália':                      '🇦🇺',
  'Áustria':                        '🇦🇹',
  'Bélgica':                        '🇧🇪',
  'Bósnia e Herzegovina':           '🇧🇦',
  'Brasil':                         '🇧🇷',
  'Cabo Verde':                     '🇨🇻',
  'Canadá':                         '🇨🇦',
  'Catar':                          '🇶🇦',
  'Colômbia':                       '🇨🇴',
  'Croácia':                        '🇭🇷',
  "Côte d'Ivoire":                  '🇨🇮',
  'Curaçao':                        '🇨🇼',
  'Egito':                          '🇪🇬',
  'Equador':                        '🇪🇨',
  'Escócia':                        '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'Espanha':                        '🇪🇸',
  'Estados Unidos':                 '🇺🇸',
  'França':                         '🇫🇷',
  'Gana':                           '🇬🇭',
  'Haiti':                          '🇭🇹',
  'Holanda':                        '🇳🇱',
  'Inglaterra':                     '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'Iraque':                         '🇮🇶',
  'Irã':                            '🇮🇷',
  'Japão':                          '🇯🇵',
  'Jordânia':                       '🇯🇴',
  'Marrocos':                       '🇲🇦',
  'México':                         '🇲🇽',
  'Nova Zelândia':                  '🇳🇿',
  'Noruega':                        '🇳🇴',
  'Panamá':                         '🇵🇦',
  'Paraguai':                       '🇵🇾',
  'Portugal':                       '🇵🇹',
  'Rep. Democrática do Congo':      '🇨🇩',
  'República da Coreia':            '🇰🇷',
  'República Tcheca':               '🇨🇿',
  'Senegal':                        '🇸🇳',
  'Suécia':                         '🇸🇪',
  'Suíça':                          '🇨🇭',
  'Tunísia':                        '🇹🇳',
  'Turquia':                        '🇹🇷',
  'Uruguai':                        '🇺🇾',
  'Uzbequistão':                    '🇺🇿',
};

// Alias: nome na tabela de jogos → nome canônico no Firestore
const ALIASES = {
  'Costa do Marfim':                "Côte d'Ivoire",
  'Curaçau':                        'Curaçao',
  'República Democrática do Congo': 'Rep. Democrática do Congo',
};

// ── Tabela de jogos ───────────────────────────────────────────────
// [rodada, grupo, mandante, visitante, timestamp_utc_ms, local]
const MATCHES = [
  // ──────────────── 1ª RODADA ────────────────
  ['1ª rodada', 'A', 'México',                      'África do Sul',               brt(2026,6,11,16),    'Cidade do México, México'],
  ['1ª rodada', 'A', 'República da Coreia',          'República Tcheca',            brt(2026,6,11,23),    'Guadalajara, México'],

  ['1ª rodada', 'B', 'Canadá',                      'Bósnia e Herzegovina',        brt(2026,6,12,16),    'Toronto, Canadá'],
  ['1ª rodada', 'D', 'Estados Unidos',               'Paraguai',                    brt(2026,6,12,22),    'Los Angeles, EUA'],

  ['1ª rodada', 'B', 'Catar',                       'Suíça',                       brt(2026,6,13,16),    'Santa Clara, EUA'],
  ['1ª rodada', 'C', 'Brasil',                       'Marrocos',                    brt(2026,6,13,19),    'Nova York/Nova Jersey, EUA'],
  ['1ª rodada', 'C', 'Haiti',                        'Escócia',                     brt(2026,6,13,22),    'Boston, EUA'],
  ['1ª rodada', 'D', 'Austrália',                    'Turquia',                     brt(2026,6,14, 1),    'Vancouver, Canadá'],

  ['1ª rodada', 'E', 'Alemanha',                     'Curaçau',                     brt(2026,6,14,14),    'Houston, EUA'],
  ['1ª rodada', 'F', 'Holanda',                      'Japão',                       brt(2026,6,14,17),    'Dallas, EUA'],
  ['1ª rodada', 'E', 'Costa do Marfim',              'Equador',                     brt(2026,6,14,20),    'Filadélfia, EUA'],
  ['1ª rodada', 'F', 'Suécia',                       'Tunísia',                     brt(2026,6,14,23),    'Monterrey, México'],

  ['1ª rodada', 'H', 'Espanha',                      'Cabo Verde',                  brt(2026,6,15,13),    'Atlanta, EUA'],
  ['1ª rodada', 'G', 'Bélgica',                      'Egito',                       brt(2026,6,15,16),    'Seattle, EUA'],
  ['1ª rodada', 'H', 'Arábia Saudita',               'Uruguai',                     brt(2026,6,15,19),    'Miami, EUA'],
  ['1ª rodada', 'G', 'Irã',                          'Nova Zelândia',               brt(2026,6,15,22),    'Los Angeles, EUA'],

  ['1ª rodada', 'I', 'França',                       'Senegal',                     brt(2026,6,16,16),    'Nova York/Nova Jersey, EUA'],
  ['1ª rodada', 'I', 'Iraque',                       'Noruega',                     brt(2026,6,16,19),    'Boston, EUA'],
  ['1ª rodada', 'J', 'Argentina',                    'Argélia',                     brt(2026,6,16,22),    'Kansas City, EUA'],
  ['1ª rodada', 'J', 'Áustria',                      'Jordânia',                    brt(2026,6,17, 1),    'Santa Clara, EUA'],

  ['1ª rodada', 'K', 'Portugal',                     'República Democrática do Congo', brt(2026,6,17,14), 'Houston, EUA'],
  ['1ª rodada', 'L', 'Inglaterra',                   'Croácia',                     brt(2026,6,17,17),    'Dallas, EUA'],
  ['1ª rodada', 'L', 'Gana',                         'Panamá',                      brt(2026,6,17,20),    'Toronto, Canadá'],
  ['1ª rodada', 'K', 'Uzbequistão',                  'Colômbia',                    brt(2026,6,17,21),    'Cidade do México, México'],

  // ──────────────── 2ª RODADA ────────────────
  ['2ª rodada', 'A', 'República Tcheca',             'África do Sul',               brt(2026,6,18,13),    'Atlanta, EUA'],
  ['2ª rodada', 'B', 'Suíça',                        'Bósnia e Herzegovina',        brt(2026,6,18,16),    'Los Angeles, EUA'],
  ['2ª rodada', 'B', 'Canadá',                       'Catar',                       brt(2026,6,18,19),    'Vancouver, Canadá'],
  ['2ª rodada', 'A', 'México',                       'República da Coreia',         brt(2026,6,18,22),    'Guadalajara, México'],

  ['2ª rodada', 'D', 'Estados Unidos',               'Austrália',                   brt(2026,6,19,16),    'Seattle, EUA'],
  ['2ª rodada', 'C', 'Escócia',                      'Marrocos',                    brt(2026,6,19,19),    'Boston, EUA'],
  ['2ª rodada', 'C', 'Brasil',                       'Haiti',                       brt(2026,6,19,21,30), 'Filadélfia, EUA'],
  ['2ª rodada', 'D', 'Turquia',                      'Paraguai',                    brt(2026,6,20, 0),    'Santa Clara, EUA'],

  ['2ª rodada', 'F', 'Holanda',                      'Suécia',                      brt(2026,6,20,14),    'Houston, EUA'],
  ['2ª rodada', 'E', 'Alemanha',                     'Costa do Marfim',             brt(2026,6,20,17),    'Toronto, Canadá'],
  ['2ª rodada', 'E', 'Equador',                      'Curaçau',                     brt(2026,6,20,21),    'Kansas City, EUA'],
  ['2ª rodada', 'F', 'Tunísia',                      'Japão',                       brt(2026,6,20,23),    'Monterrey, México'],

  ['2ª rodada', 'H', 'Espanha',                      'Arábia Saudita',              brt(2026,6,21,13),    'Atlanta, EUA'],
  ['2ª rodada', 'G', 'Bélgica',                      'Irã',                         brt(2026,6,21,16),    'Los Angeles, EUA'],
  ['2ª rodada', 'H', 'Uruguai',                      'Cabo Verde',                  brt(2026,6,21,19),    'Miami, EUA'],
  ['2ª rodada', 'G', 'Nova Zelândia',                'Egito',                       brt(2026,6,21,22),    'Vancouver, Canadá'],

  ['2ª rodada', 'J', 'Argentina',                    'Áustria',                     brt(2026,6,22,14),    'Dallas, EUA'],
  ['2ª rodada', 'I', 'França',                       'Iraque',                      brt(2026,6,22,18),    'Filadélfia, EUA'],
  ['2ª rodada', 'I', 'Noruega',                      'Senegal',                     brt(2026,6,22,21),    'Nova York/Nova Jersey, EUA'],
  ['2ª rodada', 'J', 'Jordânia',                     'Argélia',                     brt(2026,6,23, 0),    'Santa Clara, EUA'],

  ['2ª rodada', 'K', 'Portugal',                     'Uzbequistão',                 brt(2026,6,23,14),    'Houston, EUA'],
  ['2ª rodada', 'L', 'Inglaterra',                   'Gana',                        brt(2026,6,23,17),    'Boston, EUA'],
  ['2ª rodada', 'L', 'Panamá',                       'Croácia',                     brt(2026,6,23,20),    'Toronto, Canadá'],
  ['2ª rodada', 'K', 'Colômbia',                     'República Democrática do Congo', brt(2026,6,23,23), 'Guadalajara, México'],

  // ──────────────── 3ª RODADA ────────────────
  ['3ª rodada', 'B', 'Suíça',                        'Canadá',                      brt(2026,6,24,16),    'Vancouver, Canadá'],
  ['3ª rodada', 'B', 'Bósnia e Herzegovina',          'Catar',                       brt(2026,6,24,16),    'Seattle, EUA'],
  ['3ª rodada', 'C', 'Escócia',                       'Brasil',                      brt(2026,6,24,19),    'Miami, EUA'],
  ['3ª rodada', 'C', 'Marrocos',                      'Haiti',                       brt(2026,6,24,19),    'Atlanta, EUA'],
  ['3ª rodada', 'A', 'República Tcheca',              'México',                      brt(2026,6,24,22),    'Cidade do México, México'],
  ['3ª rodada', 'A', 'África do Sul',                 'República da Coreia',         brt(2026,6,24,22),    'Monterrey, México'],

  ['3ª rodada', 'E', 'Equador',                       'Alemanha',                    brt(2026,6,25,17),    'Nova York/Nova Jersey, EUA'],
  ['3ª rodada', 'E', 'Curaçau',                       'Costa do Marfim',             brt(2026,6,25,17),    'Filadélfia, EUA'],
  ['3ª rodada', 'F', 'Japão',                         'Suécia',                      brt(2026,6,25,20),    'Dallas, EUA'],
  ['3ª rodada', 'F', 'Tunísia',                       'Holanda',                     brt(2026,6,25,20),    'Kansas City, EUA'],
  ['3ª rodada', 'D', 'Turquia',                       'Estados Unidos',              brt(2026,6,25,23),    'Los Angeles, EUA'],
  ['3ª rodada', 'D', 'Paraguai',                      'Austrália',                   brt(2026,6,25,23),    'Santa Clara, EUA'],

  ['3ª rodada', 'I', 'Noruega',                       'França',                      brt(2026,6,26,16),    'Boston, EUA'],
  ['3ª rodada', 'I', 'Senegal',                       'Iraque',                      brt(2026,6,26,16),    'Toronto, Canadá'],
  ['3ª rodada', 'H', 'Cabo Verde',                    'Arábia Saudita',              brt(2026,6,26,21),    'Houston, EUA'],
  ['3ª rodada', 'H', 'Uruguai',                       'Espanha',                     brt(2026,6,26,21),    'Guadalajara, México'],
  ['3ª rodada', 'G', 'Egito',                         'Irã',                         brt(2026,6,27, 0),    'Seattle, EUA'],
  ['3ª rodada', 'G', 'Nova Zelândia',                 'Bélgica',                     brt(2026,6,27, 0),    'Vancouver, Canadá'],

  ['3ª rodada', 'L', 'Panamá',                        'Inglaterra',                  brt(2026,6,27,18),    'Nova York/Nova Jersey, EUA'],
  ['3ª rodada', 'L', 'Croácia',                       'Gana',                        brt(2026,6,27,18),    'Filadélfia, EUA'],
  ['3ª rodada', 'K', 'Colômbia',                      'Portugal',                    brt(2026,6,27,20,30), 'Miami, EUA'],
  ['3ª rodada', 'K', 'República Democrática do Congo','Uzbequistão',                 brt(2026,6,27,20,30), 'Atlanta, EUA'],
  ['3ª rodada', 'J', 'Argélia',                       'Áustria',                     brt(2026,6,27,23),    'Kansas City, EUA'],
  ['3ª rodada', 'J', 'Jordânia',                      'Argentina',                   brt(2026,6,27,23),    'Dallas, EUA'],
];

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  console.log('🔍 Buscando evento Copa do Mundo…');
  const evSnap = await db.collection('events').get();
  const copaEvent = evSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .find((e) => e.name?.toLowerCase().includes('copa'));

  if (!copaEvent) {
    console.error('❌ Evento "Copa do Mundo" não encontrado.');
    console.log('Eventos:', evSnap.docs.map((d) => d.data().name).join(', '));
    process.exit(1);
  }

  const eventId = copaEvent.id;
  console.log(`✅ Evento: "${copaEvent.name}" (${eventId})\n`);

  // ── 1. Carregar times existentes ──
  const teamsSnap = await db.collection('teams')
    .where('eventId', '==', eventId)
    .where('sport', '==', 'futebol')
    .get();

  const firestoreTeams = {}; // canonical name → { id, shieldEmoji }
  teamsSnap.docs.forEach((d) => {
    const data = d.data();
    firestoreTeams[data.name] = { id: d.id, shieldEmoji: data.shieldEmoji || '' };
  });
  console.log(`📋 ${Object.keys(firestoreTeams).length} times já no Firestore`);

  // ── 2. Resolver todos os times da tabela → id ──
  const allNames = new Set();
  MATCHES.forEach(([,, home, away]) => { allNames.add(home); allNames.add(away); });

  const resolved = {}; // fixture name → { id, name, shieldEmoji }

  for (const fixtureName of allNames) {
    const canonical = ALIASES[fixtureName] || fixtureName;
    if (firestoreTeams[canonical]) {
      resolved[fixtureName] = { id: firestoreTeams[canonical].id, name: canonical, shieldEmoji: firestoreTeams[canonical].shieldEmoji };
    } else {
      const emoji = TEAM_EMOJI[canonical] || TEAM_EMOJI[fixtureName] || '';
      console.log(`➕ Criando time ausente: ${canonical} ${emoji}`);
      const ref = await db.collection('teams').add({
        name: canonical, sport: 'futebol', eventId, shieldEmoji: emoji,
      });
      resolved[fixtureName] = { id: ref.id, name: canonical, shieldEmoji: emoji };
      firestoreTeams[canonical] = { id: ref.id, shieldEmoji: emoji };
    }
  }

  // ── 3. Deletar partidas existentes ──
  const existing = await db.collection('matches').where('eventId', '==', eventId).get();
  if (existing.docs.length > 0) {
    console.log(`\n🗑️  Deletando ${existing.docs.length} partidas existentes…`);
    // Delete in chunks of 500
    for (let i = 0; i < existing.docs.length; i += 500) {
      const batch = db.batch();
      existing.docs.slice(i, i + 500).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }

  // ── 4. Inserir partidas ──
  const eventType = copaEvent.type || 'profissional';
  console.log(`\n⚽ Inserindo ${MATCHES.length} partidas (eventType=${eventType})…\n`);

  const batch = db.batch();
  let count = 0;

  for (const [rodada, grupo, homeName, awayName, dateMs, location] of MATCHES) {
    const home = resolved[homeName];
    const away = resolved[awayName];

    if (!home || !away) {
      console.warn(`⚠️  Não resolvido: ${homeName} ou ${awayName}`);
      continue;
    }

    const ref = db.collection('matches').doc();
    batch.set(ref, {
      sport:           'futebol',
      eventId,
      eventType,
      homeTeamId:      home.id,
      awayTeamId:      away.id,
      homeTeamName:    home.name,
      awayTeamName:    away.name,
      homeShieldEmoji: home.shieldEmoji,
      awayShieldEmoji: away.shieldEmoji,
      date:            dateMs,
      location,
      rodada,
      group:           `Grupo ${grupo}`,
      gender:          'masculino',
      status:          'scheduled',
    });

    const dt = new Date(dateMs).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
    console.log(`  [${rodada}] Grupo ${grupo}: ${homeName} × ${awayName}  —  ${dt}`);
    count++;
  }

  await batch.commit();
  console.log(`\n✅ ${count} partidas inseridas com sucesso!`);
  process.exit(0);
}

main().catch((err) => { console.error('❌ Erro:', err.message); process.exit(1); });
