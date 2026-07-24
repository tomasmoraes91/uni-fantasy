export const RARITY = {
  common:    { label: 'Comum',    border: '#6b7280', glow: 'rgba(107,114,128,0.35)', text: '#9ca3af' },
  rare:      { label: 'Raro',     border: '#3b82f6', glow: 'rgba(59,130,246,0.55)',  text: '#60a5fa' },
  epic:      { label: 'Épico',    border: '#8b5cf6', glow: 'rgba(139,92,246,0.65)',  text: '#a78bfa' },
  legendary: { label: 'Lendário', border: '#f59e0b', glow: 'rgba(245,158,11,0.75)',  text: '#fbbf24' },
};

export const BADGES = {
  // ── Fantasy: desempenho na rodada ──────────────────────────────
  eagle_eye: {
    name: 'Olho de Águia',
    desc: 'O maior pontuador da rodada estava na sua escalação.',
    icon: '🦅', rarity: 'rare',
  },
  captain_right: {
    name: 'Capitão Certo',
    desc: 'Seu capitão foi o maior pontuador da sua escalação na rodada.',
    icon: '⭐', rarity: 'rare',
  },
  captain_wrong: {
    name: 'Capitão Errado',
    desc: 'Seu capitão foi o pior pontuador da sua escalação na rodada.',
    icon: '😬', rarity: 'common',
  },
  toxic: {
    name: 'Tóxico',
    desc: 'Escalou ao menos um jogador com pontuação negativa na rodada.',
    icon: '☠️', rarity: 'common',
  },
  all_negative: {
    name: 'Desastre Total',
    desc: 'Toda a sua escalação ficou com pontuação negativa ou zerada na rodada.',
    icon: '💀', rarity: 'epic',
  },
  top3_scorer: {
    name: 'Voando',
    desc: 'Ficou entre os 3 maiores pontuadores do fantasy na rodada.',
    icon: '🚀', rarity: 'rare',
  },
  worst_scorer: {
    name: 'Lanterninha',
    desc: 'Pior pontuador do fantasy na rodada.',
    icon: '🏮', rarity: 'common',
  },

  // ── Palpites ───────────────────────────────────────────────────
  vidente: {
    name: 'Vidente',
    desc: 'Sua escalação incluiu os 3 jogadores mais escalados por todos os usuários na rodada.',
    icon: '🔮', rarity: 'epic',
  },
  all_wrong: {
    name: 'Cego',
    desc: 'Errou todos os palpites de uma rodada.',
    icon: '🙈', rarity: 'common',
  },
  exact_score: {
    name: 'Placar Certeiro',
    desc: 'Acertou o placar exato de uma partida.',
    icon: '🎯', rarity: 'rare',
  },
  hat_trick_exact: {
    name: 'Oráculo',
    desc: 'Acertou 3 ou mais placares exatos em uma rodada.',
    icon: '🧿', rarity: 'legendary',
  },
  rodada_perfeita: {
    name: 'Rodada Perfeita',
    desc: 'Acertou o vencedor (ou empate) de todas as partidas de uma rodada.',
    icon: '✅', rarity: 'epic',
  },
  all_exact_round: {
    name: 'Placar Perfeito',
    desc: 'Acertou o placar exato de todas as partidas de uma rodada.',
    icon: '💯', rarity: 'legendary',
  },

  // ── Comprometimento ────────────────────────────────────────────
  compromissado_palpites: {
    name: 'Compromissado',
    desc: 'Enviou palpite para todas as partidas de uma rodada.',
    icon: '📝', rarity: 'rare',
  },
  compromissado_escalacao: {
    name: 'Sempre Pronto',
    desc: 'Teve time escalado em todas as rodadas de uma fase do evento.',
    icon: '⚡', rarity: 'rare',
  },
  // Sequências de compromisso
  palpites_streak_3: {
    name: 'Em Série (Palpites)',
    desc: 'Enviou todos os palpites em 3 rodadas consecutivas.',
    icon: '🔥', rarity: 'rare',
  },
  palpites_streak_5: {
    name: 'Implacável (Palpites)',
    desc: 'Enviou todos os palpites em 5 rodadas consecutivas.',
    icon: '🌋', rarity: 'epic',
  },
  escalacao_streak_3: {
    name: 'Em Série (Escalação)',
    desc: 'Teve time escalado em 3 rodadas consecutivas.',
    icon: '📈', rarity: 'rare',
  },
  escalacao_streak_5: {
    name: 'Implacável (Escalação)',
    desc: 'Teve time escalado em 5 rodadas consecutivas.',
    icon: '🏋️', rarity: 'epic',
  },

  // ── Classificação ──────────────────────────────────────────────
  champion: {
    name: 'Campeão',
    desc: 'Terminou em 1º lugar no ranking do evento.',
    icon: '🏆', rarity: 'legendary',
  },
  podium: {
    name: 'Pódio',
    desc: 'Terminou no top 3 do ranking do evento.',
    icon: '🥉', rarity: 'rare',
  },
  leader: {
    name: 'Líder',
    desc: 'Chegou ao 1º lugar do ranking em algum momento.',
    icon: '👑', rarity: 'rare',
  },
  comeback: {
    name: 'Remontada',
    desc: 'Subiu 10 ou mais posições no ranking em uma única rodada.',
    icon: '⬆️', rarity: 'epic',
  },
  fall: {
    name: 'Queda Livre',
    desc: 'Caiu 10 ou mais posições no ranking em uma única rodada.',
    icon: '📉', rarity: 'common',
  },

  // ── Fidelidade ao jogador ─────────────────────────────────────
  loyal_fan: {
    name: 'Fiel Torcedor',
    desc: 'Escalou o mesmo jogador em 3 ou mais rodadas.',
    icon: '🤝', rarity: 'rare',
  },
  symbiosis: {
    name: 'Simbiose',
    desc: 'Escalou o mesmo jogador em 5 ou mais rodadas.',
    icon: '💞', rarity: 'epic',
  },
  eternal_partner: {
    name: 'Parceiro Eterno',
    desc: 'Escalou o mesmo jogador em 10 ou mais rodadas.',
    icon: '🔗', rarity: 'legendary',
  },

  // ── Engajamento ────────────────────────────────────────────────
  first_steps: {
    name: 'Primeiros Passos',
    desc: 'Participou do primeiro evento.',
    icon: '👶', rarity: 'common',
  },
  no_show: {
    name: 'Sumiço',
    desc: 'Não enviou nenhum palpite em uma rodada inteira.',
    icon: '👻', rarity: 'common',
  },

  // ── Amigos ─────────────────────────────────────────────────────
  friends_1: {
    name: 'Social',
    desc: 'Adicionou pelo menos 1 amigo na plataforma.',
    icon: '👋', rarity: 'common',
  },
  friends_5: {
    name: 'Popular',
    desc: 'Adicionou 5 ou mais amigos na plataforma.',
    icon: '👥', rarity: 'rare',
  },
  friends_10: {
    name: 'Comunidade',
    desc: 'Adicionou 10 ou mais amigos na plataforma.',
    icon: '🌐', rarity: 'epic',
  },

  // ── Ligas ──────────────────────────────────────────────────────
  league_founder: {
    name: 'Fundador',
    desc: 'Criou a sua própria liga.',
    icon: '🚩', rarity: 'common',
  },
  league_member: {
    name: 'Entrosado',
    desc: 'Entrou em uma liga criada por outro jogador.',
    icon: '🤝', rarity: 'common',
  },
  league_popular: {
    name: 'Anfitrião',
    desc: 'Sua liga alcançou 5 ou mais membros.',
    icon: '🎉', rarity: 'rare',
  },
  league_champion: {
    name: 'Rei da Liga',
    desc: 'Terminou em 1º lugar em uma liga privada (3+ membros) ao fim do evento.',
    icon: '👑', rarity: 'legendary',
  },

  // ── Palpites avançados ─────────────────────────────────────────
  apostador: {
    name: 'Apostador',
    desc: 'Acertou o resultado de uma partida com 2 ou mais gols de diferença.',
    icon: '🎲', rarity: 'rare',
  },
  geometra: {
    name: 'Geômetra',
    desc: 'Acertou 3 resultados com a mesma diferença de gols numa única rodada.',
    icon: '📐', rarity: 'epic',
  },
  termometro: {
    name: 'Termômetro',
    desc: 'Acertou ao menos 1 resultado correto em todas as rodadas do campeonato.',
    icon: '🌡️', rarity: 'epic',
  },
  relampago: {
    name: 'Relâmpago',
    desc: 'Enviou todos os palpites de uma rodada em menos de 5 minutos.',
    icon: '⚡', rarity: 'rare',
  },

  // ── Fantasy avançado ───────────────────────────────────────────
  atirador: {
    name: 'Atirador',
    desc: 'Todos os seus jogadores escalados pontuaram positivo na rodada.',
    icon: '🎯', rarity: 'rare',
  },
  sortudo: {
    name: 'Sortudo',
    desc: 'Tinha jogador com pontuação negativa no time, mas seu total da rodada ficou positivo.',
    icon: '🎪', rarity: 'rare',
  },
  scouting: {
    name: 'Scouting',
    desc: 'Escalou times completamente diferentes em duas rodadas consecutivas (sem repetir nenhum jogador).',
    icon: '🔄', rarity: 'epic',
  },
  magnetico: {
    name: 'Magnético',
    desc: 'Foi o maior pontuador do fantasy em 3 rodadas diferentes.',
    icon: '🧲', rarity: 'epic',
  },
  onisciente: {
    name: 'Onisciente',
    desc: 'Maior pontuador de fantasy do campeonato.',
    icon: '💰', rarity: 'legendary',
  },

  // ── Progressão / Engajamento ───────────────────────────────────
  veterano: {
    name: 'Veterano',
    desc: 'Participou de 3 ou mais eventos diferentes.',
    icon: '🏁', rarity: 'rare',
  },
  mestre: {
    name: 'Mestre',
    desc: 'Acumulou 100 ou mais pontos totais no campeonato.',
    icon: '🎓', rarity: 'epic',
  },
  energia_total: {
    name: 'Energia Total',
    desc: 'Completou escalação e todos os palpites numa mesma rodada.',
    icon: '🔋', rarity: 'rare',
  },

  // ── Temáticos ──────────────────────────────────────────────────
  teimoso: {
    name: 'Teimoso',
    desc: 'Escalou novamente um jogador que pontuou negativo na rodada anterior.',
    icon: '😤', rarity: 'common',
  },
};
