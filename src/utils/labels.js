/**
 * Labels centralizados em pt-BR.
 * Toda a UI consome desse arquivo para manter consistência terminológica.
 */

// Formata pontos: arredonda p/ no máx. 2 casas e remove zeros à toa
// (evita o ruído de ponto flutuante, ex.: 18.400000000000002 → 18.4).
export const fmtPts = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const SPORT_LABELS = {
  futebol:    'Futebol',
  futsal:     'Futsal',
  basketball: 'Basquete',
  volleyball: 'Vôlei',
  handball:   'Handebol',
  beachvolley:'🏖️ Vôlei de Praia',
};

export const POSITION_LABELS = {
  // Futebol de campo
  ZAG: 'Zagueiro', LAT: 'Lateral', MCM: 'Meio Campo', VOL: 'Volante', MEI: 'Meia', ATA: 'Atacante',
  // Futsal
  GK: 'Goleiro', FIX: 'Fixo', ALA: 'Ala', PIV: 'Pivô',
  // Basquete
  PG: 'Armador', SG: 'Ala-Armador', SF: 'Ala', PF: 'Ala-Pivô', C: 'Pivô',
  // Vôlei
  SET: 'Levantador', OPP: 'Oposto', OH1: 'Ponteiro', OH2: 'Ponteiro',
  MB1: 'Central', MB2: 'Central', LIB: 'Líbero',
  // Handebol
  LD: 'Armador D', LC: 'Armador C', LP: 'Pivô', LE: 'Armador E', LL: 'Ponta E',
  // legado (não remover — docs antigos podem ter essas posições)
  DEF: 'Fixo', WIN: 'Ala', OH: 'Ponteiro', MB: 'Central',
};

export const STAT_LABELS = {
  goals: 'Gols', assists: 'Assistências', yellow: 'C. amarelo', red: 'C. vermelho',
};

/* Por esporte — usado no Histórico e no Admin */
export const STAT_LABELS_BY_SPORT = {
  futebol:    { goals: 'Gols', assists: 'Assist.', yellowCards: 'C. Amarelo', redCards: 'C. Vermelho' },
  futsal:     { goals: 'Gols',    yellowCards: 'C. Amarelo', redCards: 'C. Vermelho' },
  basketball: { points: 'Pontos', fouls: 'Faltas' },
  handball:   { goals: 'Gols',    exclusions: 'Exclusões' },
  volleyball: {},   // sem stats individuais — pontuação por resultado de sets
};

export const T = {
  /* Marca */
  appName: 'Capitola',

  /* Navegação */
  nav: {
    dashboard: 'Painel',
    myTeam: 'Meu Time',
    matches: 'Partidas',
    history: 'Histórico',
    rankings: 'Ranking',
    admin: 'Admin',
    logout: 'Sair'
  },

  /* Genéricos */
  common: {
    save: 'Salvar',
    cancel: 'Cancelar',
    edit: 'Editar',
    delete: 'Excluir',
    create: 'Criar',
    loading: 'Carregando…',
    points: 'pontos',
    pts: 'pts',
    overall: 'Geral',
    captain: 'Capitão',
    setCaptain: 'Capitão',
    removeCaptain: '✓ Capitão',
    yes: 'Sim',
    no: 'Não',
    back: 'Voltar',
    confirm: 'Confirmar'
  },

  /* Auth */
  auth: {
    welcomeBack: 'Bem-vindo de volta',
    signInSubtitle: 'Acesse sua conta Capitola.',
    signIn: 'Entrar',
    signingIn: 'Entrando…',
    createAccount: 'Criar conta',
    creatingAccount: 'Criando conta…',
    registerSubtitle: 'Entre na liga e comece a jogar.',
    name: 'Nome de exibição',
    email: 'E-mail',
    password: 'Senha',
    noAccount: 'Não tem conta?',
    haveAccount: 'Já tem conta?',
    register: 'Cadastrar-se',
    minPassword: 'A senha precisa ter ao menos 6 caracteres.'
  },

  /* Dashboard */
  dashboard: {
    hello: 'Olá',
    subtitle: 'Sua liga em um piscar de olhos.',
    totalPoints: 'Pontos totais',
    buildTeamTitle: '🏆 Monte seu time',
    buildTeamDesc: 'Escolha 5 jogadores por modalidade. Máximo 2 do mesmo time. Defina um capitão para 2× pontos.',
    manageTeam: 'Gerenciar time',
    predictTitle: '🔮 Faça palpites',
    predictDesc: 'Acerte vencedor ou placar exato e ganhe pontos extras.',
    viewMatches: 'Ver partidas',
    rankingTitle: '📊 Suba no ranking',
    rankingDesc: 'Compita no geral ou por modalidade.',
    viewRanking: 'Ver ranking',
    upcoming: 'Próximas partidas'
  },

  /* Time fantasy */
  team: {
    title: 'Meu time',
    subtitle: 'Monte sua escalação para o evento.',
    selected: 'Selecionados',
    saveTeam: 'Salvar time',
    teamSaved: 'Time salvo!',
    pickExactly: 'Complete sua escalação antes de salvar.',
    maxPlayers: 'Você atingiu o limite de jogadores desta modalidade.',
    maxPerTeam: 'Máximo de jogadores do mesmo time atingido.',
    noPlayers: 'Ainda não há jogadores para esta modalidade neste evento.'
  },

  /* Partidas / palpites */
  matches: {
    title: 'Partidas e palpites',
    subtitle: 'Acerte o vencedor: +2 pontos. Acerte o placar exato: +4 pontos.',
    yourPrediction: 'Seu palpite:',
    enterScores: 'Informe os dois placares.',
    predictionSaved: 'Palpite salvo!',
    scheduled: 'Agendada',
    finished: 'Finalizada',
    live: 'Ao vivo',
    noMatches: 'Ainda não há partidas para esta modalidade.'
  },

  /* Histórico */
  history: {
    title: 'Histórico de partidas',
    subtitle: 'Resultados, estatísticas e pontuação fantasy gerada em cada partida.',
    finalScore: 'Placar final',
    stats: 'Estatísticas dos jogadores',
    fantasyPoints: 'Pontos fantasy gerados',
    yourPrediction: 'Seu palpite',
    yourPoints: 'Seus pontos',
    noFinished: 'Nenhuma partida finalizada ainda.'
  },

  /* Ranking */
  rankings: {
    title: 'Ranking',
    subtitle: 'Veja sua posição na liga.',
    overall: 'Geral',
    rank: '#',
    player: 'Jogador',
    points: 'Pontos',
    empty: 'Ainda não há pontuações.',
    you: 'Você'
  },

  /* Admin */
  admin: {
    title: 'Painel do Administrador',
    subtitle: 'Gerencie eventos, times, jogadores e resultados.',
    sectionMatches: 'Resultados de partidas',
    sectionTeams: 'Times',
    sectionPlayers: 'Jogadores',
    sectionEvents: 'Eventos',
    enterResult: 'Lançar resultado',
    editResult: 'Editar resultado',
    finalScoreLabel: 'Placar final:',
    playerStats: 'Estatísticas dos jogadores',
    saveAndRecompute: 'Salvar e recalcular',
    saving: 'Salvando…',
    saved: 'Resultado salvo e ranking recalculado.',
    notAdmin: 'Você não tem acesso de administrador. Defina role: "admin" no seu documento de usuário em users/{uid} no Firestore.',
    noPlayers: 'Sem jogadores cadastrados nesses times ainda.',
    /* Times */
    newTeam: 'Novo time',
    teamName: 'Nome do time',
    selectSport: 'Modalidade',
    selectEvent: 'Evento',
    teamCreated: 'Time criado!',
    teamUpdated: 'Time atualizado!',
    teamDeleted: 'Time excluído.',
    confirmDeleteTeam: 'Excluir este time? Os jogadores ficarão órfãos.',
    /* Jogadores */
    newPlayer: 'Novo jogador',
    playerName: 'Nome do jogador',
    selectTeam: 'Time',
    position: 'Posição',
    playerCreated: 'Jogador criado!',
    playerUpdated: 'Jogador atualizado!',
    playerDeleted: 'Jogador excluído.',
    confirmDeletePlayer: 'Excluir este jogador?',
    /* Eventos */
    newEvent: 'Novo evento',
    eventName: 'Nome do evento',
    eventActive: 'Evento ativo',
    eventCreated: 'Evento criado!',
    eventUpdated: 'Evento atualizado!'
  },

  /* Eventos */
  events: {
    selectTitle: 'Escolha um evento',
    selectSubtitle: 'Selecione o evento em que você vai jogar nesta sessão.',
    noEvents: 'Nenhum evento disponível. Aguarde o admin criar um.',
    change: 'Trocar evento',
    current: 'Evento atual'
  }
};
