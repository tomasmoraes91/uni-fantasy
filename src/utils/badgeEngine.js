/**
 * badgeEngine.js — Motor de cálculo e concessão de insígnias.
 * Chamado após recomputeAllScores() no painel admin.
 */
import {
  getMatchesByEvent, getUserTeamsByEvent, getAllScores,
  getPredictionsByUids, awardBadge, getBadgeProcessedRounds, markBadgeRoundsProcessed,
  getAllRoundLineupsByEvent, getFriends, getEventById, revokeEventOnlyBadges,
  getLeaguesByEvent,
} from '../services/firestore';
import { resolveEventStatus } from './eventStatus';
import { calcFantasyPoints, predictionPoints } from './scoring';

function matchKey(m) {
  const raw = m.rodada != null ? m.rodada : m.phase;
  return raw != null ? String(raw).trim() : null;
}

function calcUserRoundPts(uid, matches, userTeams) {
  let total = 0;
  userTeams.filter((t) => t.uid === uid).forEach((team) => {
    matches.filter((m) => m.sport === team.sport).forEach((m) => {
      (m.playerStats || []).forEach((stat) => {
        if (!(team.playerIds || []).includes(stat.playerId)) return;
        let p = calcFantasyPoints(stat, m, true);
        if (team.captainId === stat.playerId) p *= 2;
        total += p;
      });
    });
  });
  return Math.round(total * 10) / 10;
}

function consecutiveStreak(uid, sortedKeys, roundIdx, memberSet) {
  let streak = 0;
  for (let i = roundIdx; i >= 0; i--) {
    if (memberSet.has(sortedKeys[i])) streak++;
    else break;
  }
  return streak;
}

export async function checkAndAwardBadges(eventId) {
  try {
    const [matches, userTeams, allScores, processedRounds, roundLineups, eventDoc] = await Promise.all([
      getMatchesByEvent(eventId),
      getUserTeamsByEvent(eventId),
      getAllScores(),
      getBadgeProcessedRounds(eventId),
      getAllRoundLineupsByEvent(eventId),
      getEventById(eventId),
    ]);

    const isEventFinished = resolveEventStatus(eventDoc) === 'finalizado';

    const eventScores = allScores.filter((s) => s.eventId === eventId);
    const uids        = [...new Set(userTeams.map((t) => t.uid))];

    // Se o evento ainda não finalizou, revoga badges de campeonato concedidos prematuramente
    if (!isEventFinished && uids.length > 0) {
      await Promise.all(uids.map((uid) => revokeEventOnlyBadges(uid)));
    }

    const predictions = await getPredictionsByUids(uids);
    const predMap = {};
    predictions.forEach((p) => { predMap[`${p.uid}_${p.matchId}`] = p; });

    // Agrupa partidas por rodada
    const byRound = {};
    matches.forEach((m) => {
      const k = matchKey(m);
      if (!k) return;
      if (!byRound[k]) byRound[k] = [];
      byRound[k].push(m);
    });

    // Rodadas com TODAS as partidas finalizadas, em ordem
    const sortedRoundKeys = Object.keys(byRound)
      .filter((k) => byRound[k].every((m) => m.status === 'finished'))
      .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));

    // ── Pré-cômputos para toda a série de rodadas ────────────────────

    // Pontuação de cada jogador por rodada (sem bônus de capitão)
    const playerPtsByRound = {};
    sortedRoundKeys.forEach((rk) => {
      playerPtsByRound[rk] = {};
      byRound[rk].forEach((m) => {
        (m.playerStats || []).forEach((stat) => {
          const pts = calcFantasyPoints(stat, m, false);
          playerPtsByRound[rk][stat.playerId] = (playerPtsByRound[rk][stat.playerId] || 0) + pts;
        });
      });
    });

    // Pontuação fantasy de cada user por rodada + rank acumulado + top scorer por rodada
    const cumFantasy          = {};
    const rankAtRound         = {};
    const perRoundScores      = {}; // roundKey → uid → pts
    const topScorerCountByUid = {}; // uid → quantas rodadas foi o 1º
    uids.forEach((uid) => { cumFantasy[uid] = 0; });

    sortedRoundKeys.forEach((roundKey) => {
      perRoundScores[roundKey] = {};
      uids.forEach((uid) => {
        const pts = calcUserRoundPts(uid, byRound[roundKey], userTeams);
        perRoundScores[roundKey][uid] = pts;
        cumFantasy[uid] += pts;
      });
      const sorted = [...uids].sort((a, b) => cumFantasy[b] - cumFantasy[a]);
      rankAtRound[roundKey] = {};
      sorted.forEach((uid, i) => { rankAtRound[roundKey][uid] = i + 1; });
      // Quem foi o maior pontuador NESSA rodada (não cumulativo)
      const topEntry = Object.entries(perRoundScores[roundKey]).sort(([, a], [, b]) => b - a)[0];
      if (topEntry && topEntry[1] > 0) {
        topScorerCountByUid[topEntry[0]] = (topScorerCountByUid[topEntry[0]] || 0) + 1;
      }
    });

    // Round lineups agrupadas por rodada e por uid
    const lineupsByRound = {};
    roundLineups.forEach((l) => {
      if (!l.rodada) return;
      if (!lineupsByRound[l.rodada]) lineupsByRound[l.rodada] = [];
      lineupsByRound[l.rodada].push(l);
    });

    const lineupRoundsByUid = {};
    uids.forEach((uid) => { lineupRoundsByUid[uid] = new Set(); });
    roundLineups.forEach((l) => {
      if (l.uid && l.rodada && lineupRoundsByUid[l.uid]) lineupRoundsByUid[l.uid].add(l.rodada);
    });

    // Rodadas com palpites completos por uid
    const fullPredByUid = {};
    uids.forEach((uid) => { fullPredByUid[uid] = new Set(); });
    sortedRoundKeys.forEach((rk) => {
      const rMatches = byRound[rk];
      uids.forEach((uid) => {
        if (rMatches.every((m) => predMap[`${uid}_${m.id}`])) fullPredByUid[uid].add(rk);
      });
    });

    const newProcessed = [];

    // ── Loop por rodada ──────────────────────────────────────────────
    for (let ri = 0; ri < sortedRoundKeys.length; ri++) {
      const roundKey     = sortedRoundKeys[ri];
      if (processedRounds.includes(roundKey)) continue;

      const roundMatches      = byRound[roundKey];
      const roundAwards       = [];
      const roundPlayerPts    = playerPtsByRound[roundKey] || {};
      const roundScores       = perRoundScores[roundKey]   || {};
      const scoreSorted       = Object.entries(roundScores).sort(([, a], [, b]) => b - a);
      const maxRoundPts       = scoreSorted[0]?.[1];
      const minRoundPts       = scoreSorted[scoreSorted.length - 1]?.[1];
      const topPlayerId       = Object.entries(roundPlayerPts).sort(([, a], [, b]) => b - a)[0]?.[0];
      const prevRoundKey      = ri > 0 ? sortedRoundKeys[ri - 1] : null;
      const roundLineupSubset = lineupsByRound[roundKey] || [];

      // Jogadores mais escalados na rodada (para vidente)
      const pickCounts = {};
      roundLineupSubset.forEach((l) => {
        (l.playerIds || []).forEach((pid) => { pickCounts[pid] = (pickCounts[pid] || 0) + 1; });
      });
      const top3Pids = Object.entries(pickCounts)
        .sort(([, a], [, b]) => b - a).slice(0, 3).map(([pid]) => pid);

      for (const uid of uids) {
        const myTeams  = userTeams.filter((t) => t.uid === uid);
        const myPids   = new Set(myTeams.flatMap((t) => t.playerIds || []));
        const captains = myTeams.map((t) => t.captainId).filter(Boolean);

        // ── Lineup desta rodada (snapshot) ──────────────────────────
        const myRoundLineup    = roundLineupSubset.filter((l) => l.uid === uid);
        const myRoundPids      = new Set(myRoundLineup.flatMap((l) => l.playerIds || []));
        const hasRoundLineup   = myRoundLineup.some((l) => (l.playerIds || []).length > 0);

        // ── Pontuações dos meus jogadores na rodada ──────────────────
        const myPtsList = [...myPids]
          .map((pid) => roundPlayerPts[pid])
          .filter((v) => v !== undefined);

        // eagle_eye
        if (topPlayerId && myPids.has(topPlayerId)) roundAwards.push({ uid, badge: 'eagle_eye' });

        // captain_right / captain_wrong
        if (captains.length) {
          const capPts   = captains.map((c) => roundPlayerPts[c] || 0);
          const nonZero  = myPtsList.filter((v) => v !== 0);
          if (nonZero.length) {
            const maxMy = Math.max(...nonZero);
            const minMy = Math.min(...nonZero);
            if (capPts.some((p) => p === maxMy)) roundAwards.push({ uid, badge: 'captain_right' });
            if (capPts.some((p) => p === minMy && minMy < maxMy)) roundAwards.push({ uid, badge: 'captain_wrong' });
          }
        }

        // toxic / all_negative
        if (myPtsList.some((v) => v < 0)) roundAwards.push({ uid, badge: 'toxic' });
        const nonZeroPts = myPtsList.filter((v) => v !== 0);
        if (nonZeroPts.length > 0 && nonZeroPts.every((v) => v < 0)) roundAwards.push({ uid, badge: 'all_negative' });

        // top3_scorer / worst_scorer
        if (scoreSorted.length >= 4) {
          const myRank = scoreSorted.findIndex(([u]) => u === uid);
          if (myRank >= 0 && myRank < 3)                              roundAwards.push({ uid, badge: 'top3_scorer' });
          if (roundScores[uid] === minRoundPts && myRank === scoreSorted.length - 1)
            roundAwards.push({ uid, badge: 'worst_scorer' });
        }

        // atirador: todos os jogadores com pts > 0
        if (myPtsList.length > 0 && myPtsList.every((v) => v > 0)) roundAwards.push({ uid, badge: 'atirador' });

        // sortudo: pelo menos 1 jogador negativo mas total do user é positivo
        if (myPtsList.some((v) => v < 0) && (roundScores[uid] ?? 0) > 0) roundAwards.push({ uid, badge: 'sortudo' });

        // comeback / fall
        if (prevRoundKey) {
          const prev = rankAtRound[prevRoundKey]?.[uid] || 0;
          const curr = rankAtRound[roundKey]?.[uid]     || 0;
          if (prev > 0 && curr > 0) {
            if (prev - curr >= 10) roundAwards.push({ uid, badge: 'comeback' });
            if (curr - prev >= 10) roundAwards.push({ uid, badge: 'fall' });
          }
        }

        // vidente: lineup inclui os 3 mais escalados da rodada
        if (top3Pids.length === 3 && top3Pids.every((pid) => myRoundPids.has(pid))) {
          roundAwards.push({ uid, badge: 'vidente' });
        }

        // teimoso: escalou jogador que pontuou negativo na rodada anterior
        if (prevRoundKey) {
          const prevPts = playerPtsByRound[prevRoundKey] || {};
          const repeatedNeg = [...myRoundPids].some((pid) => (prevPts[pid] ?? 0) < 0 && prevPts[pid] !== undefined);
          if (repeatedNeg) roundAwards.push({ uid, badge: 'teimoso' });
        }

        // scouting: sem nenhum jogador em comum com a rodada anterior
        if (prevRoundKey) {
          const prevLineup = (lineupsByRound[prevRoundKey] || [])
            .filter((l) => l.uid === uid)
            .flatMap((l) => l.playerIds || []);
          if (prevLineup.length > 0 && myRoundPids.size > 0) {
            if (!prevLineup.some((pid) => myRoundPids.has(pid))) roundAwards.push({ uid, badge: 'scouting' });
          }
        }

        // ── Palpites ─────────────────────────────────────────────────
        const roundPreds = roundMatches.map((m) => ({ match: m, pred: predMap[`${uid}_${m.id}`] }));
        const hasPreds   = roundPreds.filter((x) => x.pred);
        const allFilled  = hasPreds.length === roundMatches.length && roundMatches.length > 0;

        if (hasPreds.length > 0) {
          const pts        = hasPreds.map((x) => predictionPoints(x.pred, x.match));
          const allOk      = pts.every((p) => p > 0);
          const allBad     = pts.every((p) => p === 0);
          const exactCount = hasPreds.filter((x) => {
            const ph = Number(x.pred.homeScore), pa = Number(x.pred.awayScore);
            return ph === x.match.homeScore && pa === x.match.awayScore;
          }).length;

          if (allOk  && allFilled) roundAwards.push({ uid, badge: 'rodada_perfeita' });
          if (allBad && allFilled) roundAwards.push({ uid, badge: 'all_wrong' });
          if (exactCount >= 1)     roundAwards.push({ uid, badge: 'exact_score' });
          if (exactCount >= 3)     roundAwards.push({ uid, badge: 'hat_trick_exact' });
          if (exactCount === roundMatches.length && roundMatches.length > 0)
            roundAwards.push({ uid, badge: 'all_exact_round' });

          // apostador: acertou resultado de partida com 2+ gols de diferença
          hasPreds.forEach((x) => {
            if (predictionPoints(x.pred, x.match) > 0) {
              if (Math.abs((x.match.homeScore ?? 0) - (x.match.awayScore ?? 0)) >= 2)
                roundAwards.push({ uid, badge: 'apostador' });
            }
          });

          // geometra: 3 resultados corretos com a mesma diferença de gols
          const correctByDiff = {};
          hasPreds.forEach((x) => {
            if (predictionPoints(x.pred, x.match) > 0) {
              const diff = Math.abs((x.match.homeScore ?? 0) - (x.match.awayScore ?? 0));
              correctByDiff[diff] = (correctByDiff[diff] || 0) + 1;
            }
          });
          if (Object.values(correctByDiff).some((v) => v >= 3)) roundAwards.push({ uid, badge: 'geometra' });

          // relampago: todos os palpites da rodada em menos de 5 minutos
          if (allFilled) {
            const times = hasPreds.map((x) => x.pred.submittedAt).filter(Boolean);
            if (times.length === hasPreds.length && times.length >= 2) {
              const range = Math.max(...times) - Math.min(...times);
              if (range < 5 * 60 * 1000) roundAwards.push({ uid, badge: 'relampago' });
            }
          }
        }

        if (allFilled) roundAwards.push({ uid, badge: 'compromissado_palpites' });
        if (roundMatches.length > 0 && hasPreds.length === 0) roundAwards.push({ uid, badge: 'no_show' });

        // energia_total: tinha lineup E deu todos os palpites
        if (hasRoundLineup && allFilled) roundAwards.push({ uid, badge: 'energia_total' });

        // ── Streaks ──────────────────────────────────────────────────
        const pStreak = consecutiveStreak(uid, sortedRoundKeys, ri, fullPredByUid[uid]);
        if (pStreak === 3) roundAwards.push({ uid, badge: 'palpites_streak_3' });
        if (pStreak === 5) roundAwards.push({ uid, badge: 'palpites_streak_5' });

        const eStreak = consecutiveStreak(uid, sortedRoundKeys, ri, lineupRoundsByUid[uid]);
        if (eStreak === 3) roundAwards.push({ uid, badge: 'escalacao_streak_3' });
        if (eStreak === 5) roundAwards.push({ uid, badge: 'escalacao_streak_5' });
      }

      await Promise.all(roundAwards.map(({ uid, badge }) => awardBadge(uid, badge)));
      newProcessed.push(roundKey);
    }

    // ── Badges de evento — apenas quando o evento estiver finalizado ──
    if (isEventFinished) {
      if (eventScores.length >= 3) {
        const sorted     = [...eventScores].sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
        const fantSorted = [...eventScores].sort((a, b) => (b.fantasyTotal ?? 0) - (a.fantasyTotal ?? 0));
        const eventAwards = [];

        sorted.slice(0, 3).forEach((s, i) => {
          eventAwards.push({ uid: s.uid, badge: 'leader' });
          if (i === 0) eventAwards.push({ uid: s.uid, badge: 'champion' });
          if (i < 3)   eventAwards.push({ uid: s.uid, badge: 'podium' });
        });
        if ((fantSorted[0]?.fantasyTotal ?? 0) > 0)
          eventAwards.push({ uid: fantSorted[0].uid, badge: 'onisciente' });

        eventScores.filter((s) => (s.total ?? 0) > 0).forEach((s) => {
          eventAwards.push({ uid: s.uid, badge: 'first_steps' });
        });
        eventScores.filter((s) => (s.total ?? 0) >= 100).forEach((s) => {
          eventAwards.push({ uid: s.uid, badge: 'mestre' });
        });

        await Promise.all(eventAwards.map(({ uid, badge }) => awardBadge(uid, badge)));
      }

      // compromissado_escalacao: teve lineup em TODAS as rodadas finalizadas
      if (sortedRoundKeys.length > 0) {
        const compAwards = [];
        uids.forEach((uid) => {
          if (sortedRoundKeys.every((rk) => lineupRoundsByUid[uid].has(rk)))
            compAwards.push({ uid, badge: 'compromissado_escalacao' });
        });
        await Promise.all(compAwards.map(({ uid, badge }) => awardBadge(uid, badge)));
      }

      // magnetico: maior pontuador em 3+ rodadas
      {
        const magAwards = [];
        uids.forEach((uid) => {
          if ((topScorerCountByUid[uid] || 0) >= 3) magAwards.push({ uid, badge: 'magnetico' });
        });
        await Promise.all(magAwards.map(({ uid, badge }) => awardBadge(uid, badge)));
      }

      // termometro: ao menos 1 resultado correto em TODAS as rodadas
      if (sortedRoundKeys.length > 0) {
        const termAwards = [];
        uids.forEach((uid) => {
          const hasCorrectInAll = sortedRoundKeys.every((rk) =>
            byRound[rk].some((m) => {
              const pred = predMap[`${uid}_${m.id}`];
              return pred && predictionPoints(pred, m) > 0;
            })
          );
          if (hasCorrectInAll) termAwards.push({ uid, badge: 'termometro' });
        });
        await Promise.all(termAwards.map(({ uid, badge }) => awardBadge(uid, badge)));
      }

      // veterano: participou de 3+ eventos (via allScores)
      {
        const eventCountByUid = {};
        allScores.forEach((s) => {
          if ((s.total ?? 0) > 0) {
            if (!eventCountByUid[s.uid]) eventCountByUid[s.uid] = new Set();
            eventCountByUid[s.uid].add(s.eventId);
          }
        });
        const vetAwards = [];
        Object.entries(eventCountByUid).forEach(([uid, evtSet]) => {
          if (evtSet.size >= 3) vetAwards.push({ uid, badge: 'veterano' });
        });
        await Promise.all(vetAwards.map(({ uid, badge }) => awardBadge(uid, badge)));
      }

      // ── Fidelidade ao jogador ───────────────────────────────────────
      if (roundLineups.length > 0) {
        const pickCount = {};
        roundLineups.forEach((lu) => {
          if (!pickCount[lu.uid]) pickCount[lu.uid] = {};
          (lu.playerIds || []).forEach((pid) => {
            pickCount[lu.uid][pid] = (pickCount[lu.uid][pid] || 0) + 1;
          });
        });
        const loyaltyAwards = [];
        Object.entries(pickCount).forEach(([uid, counts]) => {
          const max = Math.max(...Object.values(counts), 0);
          if (max >= 3)  loyaltyAwards.push({ uid, badge: 'loyal_fan' });
          if (max >= 5)  loyaltyAwards.push({ uid, badge: 'symbiosis' });
          if (max >= 10) loyaltyAwards.push({ uid, badge: 'eternal_partner' });
        });
        await Promise.all(loyaltyAwards.map(({ uid, badge }) => awardBadge(uid, badge)));
      }

      // ── Amigos ─────────────────────────────────────────────────────
      if (newProcessed.length > 0 && uids.length > 0) {
        const friendResults = await Promise.all(
          uids.map(async (uid) => ({ uid, count: (await getFriends(uid)).length }))
        );
        const friendAwards = [];
        friendResults.forEach(({ uid, count }) => {
          if (count >= 1)  friendAwards.push({ uid, badge: 'friends_1' });
          if (count >= 5)  friendAwards.push({ uid, badge: 'friends_5' });
          if (count >= 10) friendAwards.push({ uid, badge: 'friends_10' });
        });
        await Promise.all(friendAwards.map(({ uid, badge }) => awardBadge(uid, badge)));
      }
    } // fim isEventFinished

    // ── Ligas ──────────────────────────────────────────────────────────
    {
      const leagues = await getLeaguesByEvent(eventId);
      const leagueAwards = [];
      leagues.forEach((lg) => {
        const members = lg.members || [];
        // Fundador (criador da liga)
        if (lg.createdBy) leagueAwards.push({ uid: lg.createdBy, badge: 'league_founder' });
        // Entrosado (membros que não são o criador)
        members.filter((m) => m !== lg.createdBy).forEach((m) => leagueAwards.push({ uid: m, badge: 'league_member' }));
        // Anfitrião (liga com 5+ membros)
        if (members.length >= 5 && lg.createdBy) leagueAwards.push({ uid: lg.createdBy, badge: 'league_popular' });
        // Rei da Liga (1º numa liga privada de 3+ membros, ao fim do evento)
        if (isEventFinished && members.length >= 3) {
          const ranked = members
            .map((uid) => ({ uid, total: eventScores.find((s) => s.uid === uid)?.total ?? 0 }))
            .sort((a, b) => b.total - a.total);
          if (ranked[0] && ranked[0].total > 0) leagueAwards.push({ uid: ranked[0].uid, badge: 'league_champion' });
        }
      });
      await Promise.all(leagueAwards.map(({ uid, badge }) => awardBadge(uid, badge)));
    }

    if (newProcessed.length > 0) {
      await markBadgeRoundsProcessed(eventId, newProcessed);
    }
  } catch (err) {
    console.error('[BadgeEngine]', err);
  }
}
