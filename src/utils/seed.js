/**
 * Seed Firestore with initial demo data.
 *
 * Usage from the browser console (after logging in once):
 *   import('./src/utils/seed.js').then(m => m.seed())
 *
 * Or call seed() once from any temporary button. Safe to re-run —
 * it overwrites the same documents.
 */

import { collection, doc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';

const TEAMS = [
  // Futsal
  { id: 'fut_a', name: 'Engineering Lions',  sport: 'futsal' },
  { id: 'fut_b', name: 'Medicine Eagles',     sport: 'futsal' },
  { id: 'fut_c', name: 'Law Sharks',          sport: 'futsal' },
  { id: 'fut_d', name: 'Arts Wolves',         sport: 'futsal' },
  // Basketball
  { id: 'bsk_a', name: 'Engineering Bulls',   sport: 'basketball' },
  { id: 'bsk_b', name: 'Medicine Hawks',      sport: 'basketball' },
  { id: 'bsk_c', name: 'Law Tigers',          sport: 'basketball' },
  { id: 'bsk_d', name: 'Arts Panthers',       sport: 'basketball' },
  // Volleyball
  { id: 'vol_a', name: 'Engineering Falcons', sport: 'volleyball' },
  { id: 'vol_b', name: 'Medicine Bears',      sport: 'volleyball' },
  { id: 'vol_c', name: 'Law Cobras',          sport: 'volleyball' },
  { id: 'vol_d', name: 'Arts Dragons',        sport: 'volleyball' }
];

/* 4 players per team = 16 per sport = 48 total */
function buildPlayers() {
  const players = [];
  const positions = {
    futsal:     ['GK', 'DEF', 'WIN', 'PIV'],
    basketball: ['PG', 'SG', 'SF', 'PF'],
    volleyball: ['SET', 'OPP', 'OH',  'MB']
  };
  TEAMS.forEach((team) => {
    for (let i = 1; i <= 4; i++) {
      players.push({
        id: `${team.id}_p${i}`,
        name: `${team.name.split(' ')[0]} Player ${i}`,
        teamId: team.id,
        sport: team.sport,
        position: positions[team.sport][i - 1]
      });
    }
  });
  return players;
}

const MATCHES = [
  // Futsal
  { id: 'm_fut_1', sport: 'futsal', homeTeamId: 'fut_a', awayTeamId: 'fut_b', date: Date.now() + 86400000 * 1, status: 'scheduled' },
  { id: 'm_fut_2', sport: 'futsal', homeTeamId: 'fut_c', awayTeamId: 'fut_d', date: Date.now() + 86400000 * 2, status: 'scheduled' },
  { id: 'm_fut_3', sport: 'futsal', homeTeamId: 'fut_a', awayTeamId: 'fut_c', date: Date.now() + 86400000 * 5, status: 'scheduled' },
  // Basketball
  { id: 'm_bsk_1', sport: 'basketball', homeTeamId: 'bsk_a', awayTeamId: 'bsk_b', date: Date.now() + 86400000 * 1, status: 'scheduled' },
  { id: 'm_bsk_2', sport: 'basketball', homeTeamId: 'bsk_c', awayTeamId: 'bsk_d', date: Date.now() + 86400000 * 3, status: 'scheduled' },
  // Volleyball
  { id: 'm_vol_1', sport: 'volleyball', homeTeamId: 'vol_a', awayTeamId: 'vol_b', date: Date.now() + 86400000 * 2, status: 'scheduled' },
  { id: 'm_vol_2', sport: 'volleyball', homeTeamId: 'vol_c', awayTeamId: 'vol_d', date: Date.now() + 86400000 * 4, status: 'scheduled' }
];

export async function seed() {
  // Teams
  for (const t of TEAMS) {
    await setDoc(doc(db, 'teams', t.id), t);
  }
  // Players
  for (const p of buildPlayers()) {
    await setDoc(doc(db, 'players', p.id), p);
  }
  // Matches — embed team names for easy display
  const teamMap = Object.fromEntries(TEAMS.map((t) => [t.id, t.name]));
  for (const m of MATCHES) {
    await setDoc(doc(db, 'matches', m.id), {
      ...m,
      homeTeamName: teamMap[m.homeTeamId],
      awayTeamName: teamMap[m.awayTeamId]
    });
  }
  console.log('✅ Seed complete: 12 teams, 48 players, 7 matches.');
}
