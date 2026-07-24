/**
 * Resultados das súmulas OLIMFEF (importados pelo botão no Admin).
 * Casa a partida por (sport, gender, home, away) e o jogador pelo NOME do elenco.
 * Vôlei: homeScore/awayScore = SETS, sem stats por jogador.
 * Handebol: goals + exclusions (advertência 2min). Futsal: goals.
 */
export const OLIMFEF_RESULTS = [
  // ── Handebol Masculino ──
  {
    sport: 'handball', gender: 'masculino', home: 'Brasil', away: 'França',
    homeScore: 9, awayScore: 14,
    homeStats: [
      { name: 'GUILHERME SOUZA ROCHA', goals: 4 },
      { name: 'THÉO FERRARI ROMUALDO', goals: 1 },
      { name: 'EDUARDO CUNHA', goals: 1 },
      { name: 'PAULO SÉRGIO MARTINS', goals: 2 },
      { name: 'GABRIEL APARECIDO BARBOSA DA SILVA', goals: 1, exclusions: 2 },
    ],
    awayStats: [
      { name: 'JOSÉ DA SILVA TURBANO DE SÁ', goals: 1 },
      { name: 'TÚLIO OLIVEIRA CAETANO RIBEIRO', goals: 1 },
      { name: 'GABRIEL CÉSAR DAVID DA SILVA', goals: 5 },
      { name: 'LEONARDO GONÇALVES DOS SANTOS', goals: 4 },
      { name: 'GUSTAVO ALVES DOS SANTOS', goals: 3 },
    ],
  },
  {
    sport: 'handball', gender: 'masculino', home: 'Portugal', away: 'Holanda',
    homeScore: 10, awayScore: 21,
    homeStats: [
      { name: 'GABRIEL MARTINS ALBUQUERQUE', goals: 1 },
      { name: 'VICTOR HUGO PEREIRA DA SILVA NASCIMENTO', goals: 1 },
      { name: 'LUCAS PEREIRA DA SILVA RIBEIRO', goals: 6 },
      { name: 'KAWAN GOMES DE FREITAS', goals: 2 },
      { name: 'SAMUEL GARCIA RIBEIRO', exclusions: 1 },
    ],
    awayStats: [
      { name: 'MICHELL FERREIRA COELHO', goals: 9 },
      { name: 'PEDRO HENRIQUE DE MELO SILVA', goals: 1, exclusions: 1 },
      { name: 'LEONARDO LEAL CANDIDO', goals: 2 },
      { name: 'LUCAS FLAUZINO PEREIRA', goals: 1 },
      { name: 'JOSÉ EDUARDO QUEIROZ BATISTA', goals: 2 },
      { name: 'IGOR MANOEL SOUZA TOMAS', goals: 6 },
      { name: 'LUIS FELIPE CAMPOS PINTO', exclusions: 1 },
    ],
  },
  {
    sport: 'handball', gender: 'masculino', home: 'Brasil', away: 'Portugal',
    homeScore: 9, awayScore: 2,
    homeStats: [
      { name: 'PAULO SÉRGIO MARTINS', goals: 1 },
      { name: 'GUILHERME SOUZA ROCHA', goals: 3 },
      { name: 'EDUARDO CUNHA', goals: 1, exclusions: 1 },
      { name: 'GABRIEL APARECIDO BARBOSA DA SILVA', goals: 4 },
    ],
    awayStats: [
      { name: 'VICTOR HUGO PEREIRA DA SILVA NASCIMENTO', goals: 1, exclusions: 1 },
      { name: 'WESLEY DE SOUSA SILVA', goals: 1 },
      { name: 'WEINER FERREIRA DE OLIVEIRA', exclusions: 1 },
      { name: 'KAWAN GOMES DE FREITAS', exclusions: 1 },
    ],
  },
  // ── Handebol Feminino ──
  {
    sport: 'handball', gender: 'feminino', home: 'Portugal', away: 'Holanda',
    homeScore: 7, awayScore: 2,
    homeStats: [
      { name: 'MARIA JÚLIA BARBOSA FARIA', goals: 3 },
      { name: 'LETÍCIA DOS SANTOS PEREIRA', goals: 1 },
      { name: 'ANGÉLICA VITÓRIA ROCHA SILVA', goals: 3 },
    ],
    awayStats: [
      { name: 'ANANDA LEMOS OLIVEIRA', goals: 1 },
      { name: 'VITÓRIA CRISTINA RODRIGUES DO NASCIMENTO', goals: 1 },
      { name: 'NAIANA VITÓRIA ALVES DE MORAIS', exclusions: 1 },
    ],
  },
  // ── Futsal Masculino ──
  {
    sport: 'futsal', gender: 'masculino', home: 'Portugal', away: 'França',
    homeScore: 5, awayScore: 4,
    homeStats: [
      { name: 'WEINER FERREIRA DE OLIVEIRA', goals: 1 },
      { name: 'JHONY MAYK SANTOS DE ALMEIDA', goals: 2 },
      { name: 'KAWAN GOMES DE FREITAS', goals: 2 },
    ],
    awayStats: [
      { name: 'OSÓRIO TOMAZ DA SILVA NETO', goals: 1 },
      { name: 'ISMAEL PAULO FRANCO', goals: 2 },
      { name: 'GUILHERME SOARES MARTINS', goals: 1 },
    ],
  },
  // ── Futsal Feminino ──
  {
    sport: 'futsal', gender: 'feminino', home: 'Portugal', away: 'França',
    homeScore: 2, awayScore: 11,
    homeStats: [
      { name: 'MARIA JÚLIA BARBOSA FARIA', goals: 2 },
    ],
    awayStats: [
      { name: 'JENIFFER RODRIGUES FERREIRA', goals: 3 },
      { name: 'ANY CAROLINE FIGUEIREDO OLIVEIRA', goals: 8 },
    ],
  },
  {
    sport: 'futsal', gender: 'masculino', home: 'Brasil', away: 'Holanda',
    homeScore: 1, awayScore: 3,
    homeStats: [
      { name: 'GUILHERME SOUZA ROCHA', goals: 1 },
    ],
    awayStats: [
      { name: 'PEDRO HENRIQUE DE MELO SILVA', goals: 2 },
      { name: 'LEONARDO LEAL CANDIDO', goals: 1 },
    ],
  },
  // ── Vôlei (só sets, sem stats por jogador) ──
  { sport: 'volleyball', gender: 'masculino', home: 'Brasil',   away: 'França',  homeScore: 0, awayScore: 2 },
  { sport: 'volleyball', gender: 'feminino',  home: 'Brasil',   away: 'França',  homeScore: 0, awayScore: 2 },
  { sport: 'volleyball', gender: 'masculino', home: 'Portugal', away: 'Holanda', homeScore: 1, awayScore: 2 },
];
