/**
 * sportRules.js — Fonte única de verdade para regras por modalidade.
 * Consumido por: scoring.js, FantasyTeam.jsx, Admin.jsx, labels.js
 *
 * ESTRUTURA DE STATS no Firestore (match.playerStats[]):
 *   { playerId, teamId, ...campos específicos por esporte }
 *
 * Futsal:         goals, yellowCards, redCards
 * Futebol campo:  goals, assists, yellowCards, redCards
 * Basquete:       points, fouls
 * Handebol:       goals, exclusions
 * Vôlei:          (pontuação é por partida/time, não por jogador)
 */

/* Modalidades sem palpite POR JOGO (só palpite de campeonato). Têm fantasy
   (escalação) e partidas normais, mas a aba de palpites não mostra os jogos. */
export const NO_GAME_PREDICTION_SPORTS = ['beachvolley'];
export const hasGamePrediction = (sport) => !NO_GAME_PREDICTION_SPORTS.includes(sport);

/* (legado) Modalidades totalmente só-campeonato — mantido vazio por ora. */
export const PREDICTION_ONLY_SPORTS = [];
export const isPredictionOnly = (sport) => PREDICTION_ONLY_SPORTS.includes(sport);

/* Escalação no modo país/gênero (OLIMFEF) — SEM posição por jogador; o "slot" é
   o GÊNERO exigido. mixed=cota fixa de gênero (slots gendered + 1 reserva por
   gênero); perGender=competições masc/fem separadas (count + 2 reservas). */
export const OLIMFEF_LINEUP = {
  basketball: { mixed: true,  slots: ['masculino', 'masculino', 'feminino'], label: 'Basquete 3x3' },
  beachvolley:{ mixed: true,  slots: ['masculino', 'masculino', 'feminino', 'feminino'], label: 'Vôlei de Praia' },
  volleyball: { mixed: false, count: 6, reserves: 2, label: 'Vôlei' },
  futsal:     { mixed: false, count: 5, reserves: 2, label: 'Futsal' },
  handball:   { mixed: false, count: 7, reserves: 2, label: 'Handebol' },
};
export const isMixedModality = (modality) => !!OLIMFEF_LINEUP[modality]?.mixed;
// Slots (gêneros exigidos, em ordem) de uma escalação OLIMFEF
export function olimfefSlots(modality, lineupGender) {
  const c = OLIMFEF_LINEUP[modality];
  if (!c) return [];
  return c.mixed ? [...c.slots] : Array(c.count).fill(lineupGender);
}

/* ── Configuração de escalação ─────────────────────────────────────── */
export const SQUAD_CONFIG = {
  futebol: {
    total: 11,
    positions: ['GK', 'LAT', 'ZAG', 'ZAG', 'LAT', 'MCM', 'MCM', 'MCM', 'ATA', 'ATA', 'ATA'],
    positionLabels: { GK: 'Goleiro', LAT: 'Lateral', ZAG: 'Zagueiro', MCM: 'Meio Campo', ATA: 'Atacante' },
    maxPerTeam: 4,
    fieldColor: 'linear-gradient(180deg,#064e3b 0%,#065f46 100%)',
    sportLabel: 'Futebol',
    icon: '⚽',
  },
  futsal: {
    total: 5,
    positions: ['GK', 'FIX', 'ALA', 'ALA', 'PIV'],
    positionLabels: { GK: 'Goleiro', FIX: 'Fixo', ALA: 'Ala', PIV: 'Pivô' },
    maxPerTeam: 2,
    fieldColor: 'linear-gradient(180deg,#166534 0%,#15803d 100%)',
    sportLabel: 'Futsal',
    icon: '⚽',
  },
  basketball: {
    total: 3,
    positions: ['PG', 'SG', 'SF'],
    positionLabels: { PG: 'Armador', SG: 'Ala-Armador', SF: 'Ala' },
    maxPerTeam: 2,
    fieldColor: 'linear-gradient(180deg,#92400e 0%,#b45309 100%)',
    sportLabel: 'Basquete',
    icon: '🏀',
  },
  handball: {
    total: 7,
    positions: ['GK', 'LD', 'LC', 'LP', 'LE', 'LL', 'PIV'],
    positionLabels: {
      GK: 'Goleiro', LD: 'Armador D', LC: 'Armador C',
      LP: 'Pivô', LE: 'Armador E', LL: 'Ponta E', PIV: 'Ponta D',
    },
    maxPerTeam: 3,
    fieldColor: 'linear-gradient(180deg,#7c2d12 0%,#c2410c 100%)',
    sportLabel: 'Handebol',
    icon: '🤾',
  },
  volleyball: {
    total: 6,
    positions: ['SET', 'OPP', 'OH1', 'OH2', 'MB1', 'MB2'],
    positionLabels: {
      SET: 'Levantador', OPP: 'Oposto',
      OH1: 'Ponteiro', OH2: 'Ponteiro',
      MB1: 'Central', MB2: 'Central',
    },
    maxPerTeam: 3,
    fieldColor: 'linear-gradient(180deg,#1e3a8a 0%,#1d4ed8 100%)',
    sportLabel: 'Vôlei',
    icon: '🏐',
  },
};

/* ── Campos de estatísticas por esporte ────────────────────────────── */
// Cada entrada: { field, label, min, step, allowNegative }
export const STAT_FIELDS = {
  futebol: [
    { field: 'goals',       label: 'Gols',        min: 0 },
    { field: 'yellowCards', label: 'C. Amarelo',   min: 0 },
    { field: 'redCards',    label: 'C. Vermelho',  min: 0 },
  ],
  futsal: [
    { field: 'goals',       label: 'Gols',        min: 0 },
    { field: 'yellowCards', label: 'C. Amarelo',   min: 0 },
    { field: 'redCards',    label: 'C. Vermelho',  min: 0 },
  ],
  basketball: [
    { field: 'points', label: 'Pontos', min: 0 },
    { field: 'fouls',  label: 'Faltas',  min: 0 },
  ],
  handball: [
    { field: 'goals',      label: 'Gols',         min: 0 },
    { field: 'exclusions', label: 'Advertências', min: 0 }, // 2min — penaliza
  ],
  volleyball: [
    // Sem stats individuais — pontuação pelo resultado por sets do time
  ],
};

/* ── Campos de estatísticas — versão PROFISSIONAL ──────────────────── */
export const STAT_FIELDS_PRO = {
  futebol: [
    { field: 'goals',            label: 'Gols',              min: 0 },
    { field: 'assists',          label: 'Assistências',       min: 0 },
    { field: 'shotsOnPost',      label: 'Fin. trave',         min: 0 },
    { field: 'shotsDefended',    label: 'Fin. defendida',     min: 0 },
    { field: 'shotsOut',         label: 'Fin. fora',          min: 0 },
    { field: 'foulsSuffered',    label: 'Falta sofrida',      min: 0 },
    { field: 'penaltySuffered',  label: 'Pênalti sofrido',    min: 0 },
    { field: 'penaltyMissed',    label: 'Pênalti perdido',    min: 0 },
    { field: 'offsides',         label: 'Impedimento',        min: 0 },
    { field: 'tackles',          label: 'Desarme',            min: 0 },
    { field: 'ownGoals',         label: 'Gol contra',         min: 0 },
    { field: 'yellowCards',      label: 'C. Amarelo',         min: 0 },
    { field: 'redCards',         label: 'C. Vermelho',        min: 0 },
    { field: 'foulsCommitted',   label: 'Falta cometida',     min: 0 },
    { field: 'penaltyCommitted', label: 'Pênalti cometido',   min: 0 },
    { field: 'penaltySaved',     label: 'Def. pênalti (GK)',  min: 0 },
    { field: 'cleanSheet',       label: 'Sem gols (GK)',      min: 0 },
    { field: 'saves',            label: 'Defesas (GK)',       min: 0 },
    { field: 'goalsConceded',    label: 'Gols sofridos (GK)', min: 0 },
  ],
};

/* ── Motor de pontuação por esporte ────────────────────────────────── */

/**
 * FUTEBOL DE CAMPO — AMADOR
 * Gol: +5 | Assistência: +3 | C. Amarelo: -2 | C. Vermelho: -5
 */
export function calcFutebolPoints(stat, match, isInUserTeam) {
  let pts = 0;
  pts += (stat.goals       || 0) *  8;
  pts += (stat.yellowCards || 0) * -1;
  pts += (stat.redCards    || 0) * -3;
  return pts;
}

/**
 * FUTEBOL DE CAMPO — PROFISSIONAL
 */
export function calcFutebolPointsPro(stat) {
  let pts = 0;
  pts += (stat.goals            || 0) *  8.0;
  pts += (stat.assists          || 0) *  5.0;
  pts += (stat.shotsOnPost      || 0) *  3.0;
  pts += (stat.shotsDefended    || 0) *  1.2;
  pts += (stat.shotsOut         || 0) *  0.8;
  pts += (stat.foulsSuffered    || 0) *  0.5;
  pts += (stat.penaltySuffered  || 0) *  1.0;
  pts += (stat.penaltyMissed    || 0) * -4.0;
  pts += (stat.offsides         || 0) * -0.1;
  pts += (stat.tackles          || 0) *  1.5;
  pts += (stat.ownGoals         || 0) * -3.0;
  pts += (stat.yellowCards      || 0) * -1.0;
  pts += (stat.redCards         || 0) * -3.0;
  pts += (stat.foulsCommitted   || 0) * -0.3;
  pts += (stat.penaltyCommitted || 0) * -1.0;
  pts += (stat.penaltySaved     || 0) *  7.0;
  pts += (stat.cleanSheet       || 0) *  5.0;
  pts += (stat.saves            || 0) *  1.3;
  pts += (stat.goalsConceded    || 0) * -1.0;
  return pts;
}

/**
 * FUTSAL
 * Marcador de gol: +5
 * Por gol marcado pelo time: +1 ao time (distribuído igual entre jogadores escalados)
 * Por gol sofrido pelo time: -1 ao time
 * Cartão amarelo: -2
 * Cartão vermelho: -5
 */
export function calcFutsalPoints(stat, match, isInUserTeam) {
  let pts = 0;
  pts += (stat.goals       || 0) *  8;
  pts += (stat.yellowCards || 0) * -1;
  pts += (stat.redCards    || 0) * -3;
  return pts;
}

/**
 * Bônus de time por partida — chamado UMA VEZ por (teamId × match),
 * independente de quantos jogadores do time estão escalados.
 * Aplicado em recomputeAllScores, somado ao total da partida.
 */
export function calcTeamBonus(teamId, match, sport) {
  const isHome      = teamId === match.homeTeamId;
  const myScore     = isHome ? Number(match.homeScore) : Number(match.awayScore);
  const opScore     = isHome ? Number(match.awayScore) : Number(match.homeScore);
  const diff        = myScore - opScore;

  switch (sport) {
    case 'futebol':
      if (match.eventType === 'profissional') return 0;
      return myScore - opScore;
    case 'futsal':
      // +1 por gol marcado, -1 por gol sofrido
      return myScore - opScore;
    case 'basketball':
      // +diferença (positivo = vitória, negativo = derrota)
      return diff;
    case 'handball':
      // +saldo de gols
      return diff;
    case 'volleyball':
      // Vôlei não tem bônus de time — pontuação é inteiramente pelo resultado (calcVolleyballPoints)
      return 0;
    case 'beachvolley':
      return 0; // só pontos por jogador
    default:
      return 0;
  }
}

/**
 * BASQUETE
 * Ponto: +1
 * Falta: -1
 * Vitória: +(diferença de pontos)
 * Derrota: -(diferença de pontos)
 */
export function calcBasketballPoints(stat, match) {
  let pts = 0;
  pts += (stat.points || 0) * 1;
  pts += (stat.fouls  || 0) * -1;
  // Diferença de pontos aplicada via calcTeamBonus() — não aqui.
  return pts;
}

/**
 * HANDEBOL
 * Gol: +4
 * Exclusão: -3
 * Vitória: +saldo de gols
 * Derrota: -saldo de gols
 */
export function calcHandballPoints(stat, match) {
  let pts = 0;
  pts += (stat.goals      || 0) * 4;
  pts += (stat.exclusions || 0) * -3;
  // Saldo de gols aplicado via calcTeamBonus() — não aqui.
  return pts;
}

/**
 * VÔLEI — pontuação é por resultado (sets), não por jogador individual.
 * Todos os jogadores escalados do time recebem os mesmos pontos.
 *
 * Vitória 2×0: +5     Derrota 0×2: -5
 * Vitória 2×1: +3     Derrota 1×2: -3
 * Ajuste fino: +(diff de pontos / 2) ou -(diff / 2)
 *
 * homeScore/awayScore = número de sets vencidos (2 ou 1)
 * match.homePoints/awayPoints = total de pontos no jogo (opcional)
 */
export function calcVolleyballPoints(stat, match) {
  const isHome  = stat.teamId === match.homeTeamId;
  const mySets  = isHome ? Number(match.homeScore) : Number(match.awayScore);
  const opSets  = isHome ? Number(match.awayScore) : Number(match.homeScore);

  // Pontos base por sets
  let pts = 0;
  if (mySets === 2 && opSets === 0) pts = 5;
  else if (mySets === 2 && opSets === 1) pts = 3;
  else if (mySets === 1 && opSets === 2) pts = -3;
  else if (mySets === 0 && opSets === 2) pts = -5;

  return pts;
}

/**
 * Dispatcher principal — retorna os pontos fantasy de um stat+match.
 * Substitui fantasyPointsForPlayer() do scoring.js antigo.
 */
export function calcFantasyPoints(stat, match, isInUserTeam = true) {
  switch (match.sport) {
    case 'futebol':
      return match.eventType === 'profissional'
        ? calcFutebolPointsPro(stat)
        : calcFutebolPoints(stat, match, isInUserTeam);
    case 'futsal':     return calcFutsalPoints(stat, match, isInUserTeam);
    case 'basketball': return calcBasketballPoints(stat, match);
    case 'handball':   return calcHandballPoints(stat, match);
    case 'volleyball': return calcVolleyballPoints(stat, match);
    case 'beachvolley':return (stat.points || 0); // só pontos por jogador (sem partidas)
    default:           return calcFutsalPoints(stat, match, isInUserTeam);
  }
}

/* ── Validação de escalação (frontend + usado na lógica de salvar) ── */
/* ── Fases de competição (ex: Copa do Mundo) ───────────────────────── */
export const PHASE_LABELS = {
  group: 'Fase de Grupos',
  r32:   '16 avos de Final',
  r16:   'Oitavas de Final',
  qf:    'Quartas de Final',
  sf:    'Semifinal',
  third: 'Disputa de 3º/4º',
  final: 'Final',
};

export const PHASE_MAX_PER_TEAM = {
  group: 1,
  r32:   1,
  r16:   2,
  qf:    3,
  sf:    6,
  third: Infinity,
  final: Infinity,
};

/* Limite de reservas da MESMA seleção no banco, por fase. Escala junto com a
   eliminação: nas fases finais restam poucas seleções e o banco (5 vagas no
   futebol) precisa admitir repetição para continuar preenchível. Na disputa de
   3º e na final só 2 seleções pontuam na rodada → sem limite. */
export const PHASE_BENCH_MAX_PER_TEAM = {
  group: 1,
  r32:   1,
  r16:   1,
  qf:    2,
  sf:    3,
  third: Infinity,
  final: Infinity,
};

export function validateSquad(sport, playerIds) {
  const cfg = SQUAD_CONFIG[sport];
  if (!cfg) return { valid: false, error: `Modalidade desconhecida: ${sport}` };
  if (playerIds.length !== cfg.total) {
    return {
      valid: false,
      error: `${cfg.sportLabel} precisa de exatamente ${cfg.total} jogadores.`,
    };
  }
  return { valid: true, error: null };
}

/* ── Helpers de label ────────────────────────────────────────────── */
export function getSquadLabel(sport, overridePositions) {
  const cfg = SQUAD_CONFIG[sport];
  if (!cfg) return '5 jogadores';
  const positions = overridePositions || cfg.positions;
  const total = positions.length;
  const counts = {};
  positions.forEach((p) => { counts[p] = (counts[p] || 0) + 1; });
  const parts = Object.entries(counts).map(([pos, n]) => {
    const label = cfg.positionLabels[pos] || pos;
    return `${n} ${label}`;
  });
  return `${total} jogadores: ${parts.join(', ')}`;
}
