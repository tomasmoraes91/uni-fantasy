import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEvent } from '../context/EventContext';
import { useNotificationContext } from '../context/NotificationContext';
import { useToast } from '../context/ToastContext';
import SportTabs, { SPORTS } from '../components/SportTabs';
import { getPlayersBySport, getTeamsBySport, getPlayersByGender, getTeamsByEvent, getUserTeam, saveUserTeam, filterValidPlayerIds, getMarketConfig, isMarketOpen, getMatchesByEvent } from '../services/firestore';
import { calcFantasyPoints } from '../utils/scoring';
import { T, POSITION_LABELS, SPORT_LABELS } from '../utils/labels';
import { SQUAD_CONFIG, validateSquad, getSquadLabel, PHASE_MAX_PER_TEAM, PHASE_BENCH_MAX_PER_TEAM, PHASE_LABELS, isPredictionOnly, OLIMFEF_LINEUP, isMixedModality, olimfefSlots } from '../utils/sportRules';
import SportField from '../components/SportField';
import ShieldEmoji from '../components/ShieldEmoji';

/* ── Formações táticas (futebol de campo) ─────────────────────── */
const FORMATIONS_FUTEBOL = {
  '4-3-3': {
    label: '4-3-3', desc: 'Ofensivo',
    positions: ['GK', 'LAT', 'ZAG', 'ZAG', 'LAT', 'MCM', 'MCM', 'MCM', 'ATA', 'ATA', 'ATA'],
    fieldPos: [
      { x:  8, y: 50 },
      { x: 25, y: 15 },
      { x: 25, y: 35 },
      { x: 25, y: 65 },
      { x: 25, y: 85 },
      { x: 48, y: 35 },
      { x: 48, y: 65 },
      { x: 64, y: 50 },
      { x: 80, y: 22 },
      { x: 80, y: 50 },
      { x: 80, y: 78 },
    ],
  },
  '4-4-2': {
    label: '4-4-2', desc: 'Equilibrado',
    positions: ['GK', 'LAT', 'ZAG', 'ZAG', 'LAT', 'MCM', 'MCM', 'MCM', 'MCM', 'ATA', 'ATA'],
    fieldPos: [
      { x:  8, y: 50 },
      { x: 25, y: 15 },
      { x: 25, y: 37 },
      { x: 25, y: 63 },
      { x: 25, y: 85 },
      { x: 50, y: 17 },
      { x: 50, y: 39 },
      { x: 50, y: 61 },
      { x: 50, y: 83 },
      { x: 78, y: 35 },
      { x: 78, y: 65 },
    ],
  },
  '4-5-1': {
    label: '4-5-1', desc: 'Defensivo',
    positions: ['GK', 'LAT', 'ZAG', 'ZAG', 'LAT', 'MCM', 'MCM', 'MCM', 'MCM', 'MCM', 'ATA'],
    fieldPos: [
      { x:  8, y: 50 },
      { x: 25, y: 15 },
      { x: 25, y: 37 },
      { x: 25, y: 63 },
      { x: 25, y: 85 },
      { x: 45, y: 37 },
      { x: 45, y: 63 },
      { x: 63, y: 20 },
      { x: 63, y: 50 },
      { x: 63, y: 80 },
      { x: 82, y: 50 },
    ],
  },
  '3-5-2': {
    label: '3-5-2', desc: 'Aberto',
    positions: ['GK', 'ZAG', 'ZAG', 'ZAG', 'MCM', 'MCM', 'MCM', 'MCM', 'MCM', 'ATA', 'ATA'],
    fieldPos: [
      { x:  8, y: 50 },
      { x: 24, y: 28 },
      { x: 24, y: 50 },
      { x: 24, y: 72 },
      { x: 50, y: 15 },
      { x: 50, y: 34 },
      { x: 50, y: 50 },
      { x: 50, y: 66 },
      { x: 50, y: 85 },
      { x: 78, y: 37 },
      { x: 78, y: 63 },
    ],
  },
  '3-4-3': {
    label: '3-4-3', desc: 'Ultra-ofensivo',
    positions: ['GK', 'ZAG', 'ZAG', 'ZAG', 'MCM', 'MCM', 'MCM', 'MCM', 'ATA', 'ATA', 'ATA'],
    fieldPos: [
      { x:  8, y: 50 },
      { x: 25, y: 25 },
      { x: 25, y: 50 },
      { x: 25, y: 75 },
      { x: 50, y: 17 },
      { x: 50, y: 40 },
      { x: 50, y: 60 },
      { x: 50, y: 83 },
      { x: 78, y: 22 },
      { x: 78, y: 50 },
      { x: 78, y: 78 },
    ],
  },
  '5-3-2': {
    label: '5-3-2', desc: 'Ultra-defensivo',
    positions: ['GK', 'LAT', 'ZAG', 'ZAG', 'ZAG', 'LAT', 'MCM', 'MCM', 'MCM', 'ATA', 'ATA'],
    fieldPos: [
      { x:  8, y: 50 },
      { x: 26, y: 15 },
      { x: 26, y: 32 },
      { x: 26, y: 50 },
      { x: 26, y: 68 },
      { x: 26, y: 85 },
      { x: 53, y: 25 },
      { x: 53, y: 50 },
      { x: 53, y: 75 },
      { x: 78, y: 35 },
      { x: 78, y: 65 },
    ],
  },
};

/* ── Posições de campo para modalidades fixas ─────────────────── */
const FIELD_POSITIONS_FIXED = {
  futsal: [
    { x: 14, y: 50 }, // GK
    { x: 35, y: 50 }, // FIX
    { x: 54, y: 24 }, // ALA
    { x: 54, y: 76 }, // ALA
    { x: 72, y: 50 }, // PIV
  ],
  basketball: [
    { x: 30, y: 50 }, // PG
    { x: 56, y: 27 }, // SG
    { x: 56, y: 73 }, // SF
  ],
  volleyball: [
    { x: 62, y: 78 }, // SET
    { x: 85, y: 22 }, // OPP
    { x: 62, y: 22 }, // OH1
    { x: 85, y: 78 }, // OH2
    { x: 62, y: 50 }, // MB1
    { x: 85, y: 50 }, // MB2
  ],
  handball: [
    { x:  8, y: 50 }, // GK
    { x: 30, y: 25 }, // LD
    { x: 38, y: 50 }, // LC
    { x: 46, y: 64 }, // LP
    { x: 30, y: 75 }, // LE
    { x: 56, y: 20 }, // LL
    { x: 56, y: 80 }, // PIV
  ],
};

/* ── Compatibilidade de posições para o mercado ────────────────── */
// slotPosition → quais player.position são aceitos nesse slot
const POSITION_COMPAT = {
  GK:  ['GK'],
  FIX: ['FIX'],
  ALA: ['ALA'],
  PIV: ['PIV'],
  ZAG: ['ZAG'],
  LAT: ['LAT'],
  MCM: ['MCM', 'VOL', 'MEI'],
  ATA: ['ATA'],
  PG:  ['PG'],
  SG:  ['SG'],
  SF:  ['SF'],
  SET: ['SET'],
  OPP: ['OPP'],
  OH1: ['OH1', 'OH2', 'OPP'],
  OH2: ['OH2', 'OH1', 'OPP'],
  MB1: ['MB1', 'MB2'],
  MB2: ['MB2', 'MB1'],
  LD:  ['LD', 'LC', 'LE'],
  LC:  ['LC', 'LD', 'LE'],
  LP:  ['LP', 'PIV'],
  LE:  ['LE', 'LC', 'LD'],
  LL:  ['LL'],
  // OLIMFEF: o "slot" é o gênero exigido; o jogador casa pelo seu gênero
  masculino: ['masculino'],
  feminino:  ['feminino'],
};

function compatiblePositions(slotPos) {
  // Chaves de reserva OLIMFEF podem vir como `genero#1`/`genero#2` → usa o gênero
  const base = typeof slotPos === 'string' && slotPos.includes('#') ? slotPos.split('#')[0] : slotPos;
  return POSITION_COMPAT[base] || [base];
}

/* ── Monta selected slot-aware a partir de playerIds salvos ─── */
function buildSlotArray(savedIds, positions, players) {
  const slots = Array(positions.length).fill(null);
  savedIds.forEach((pid) => {
    const player = players.find((p) => p.id === pid);
    if (!player) return;
    const idx = positions.findIndex((pos, i) => slots[i] === null && compatiblePositions(pos).includes(player.position));
    if (idx >= 0) { slots[idx] = pid; return; }
    const fallback = slots.findIndex((s) => s === null);
    if (fallback >= 0) slots[fallback] = pid;
  });
  return slots;
}

export default function FantasyTeam() {
  const navigate      = useNavigate();
  const { user }      = useAuth();
  const { eventId, currentEvent } = useEvent();
  const { confirm }   = useToast();
  const { refresh: refreshNotifs } = useNotificationContext();

  const genderMode = !!currentEvent?.genderMode; // OLIMFEF: escala por modalidade × gênero
  // Modalidades só-campeonato (Vôlei de Praia) não entram no fantasy
  const availableSports = (currentEvent?.modalidades || SPORTS).filter((s) => !isPredictionOnly(s));
  const [sport, setSport]         = useState(availableSports[0] || 'futsal'); // = modalidade
  const [lineupGender, setLineupGender] = useState('masculino'); // só per-gender (vôlei/futsal/handebol)
  const olimMixed = genderMode && isMixedModality(sport); // basquete 3x3 / vôlei de praia
  // Chave de armazenamento: mista → modalidade__misto (= gênero da partida mista);
  // per-gênero → modalidade__genero. PRECISA casar com o `gender` das partidas.
  const teamKey = genderMode ? `${sport}__${olimMixed ? 'misto' : lineupGender}` : sport;
  const [formation, setFormation] = useState('4-3-3');      // só para futebol
  const [players, setPlayers]     = useState([]);
  const [teams, setTeams]         = useState([]);
  const [selected, setSelected]   = useState([]);           // (string|null)[]
  const [captainId, setCaptainId] = useState(null);
  const [msg, setMsg]             = useState({ type: '', text: '' });
  const [loading, setLoading]     = useState(true);
  const [market,  setMarket]      = useState(null);
  const [showCaptainModal, setShowCaptainModal] = useState(false);

  // Banco de reservas: { GK: playerId, ZAG: playerId, ... }
  const [bench, setBench] = useState({});
  const [inlineAlert, setInlineAlert] = useState(null); // { playerId, text }
  const [showRules, setShowRules] = useState(false);

  // Mercado: slot aberto
  const [marketSlot, setMarketSlot]         = useState(null);  // {index, position}
  const [benchMarketPos, setBenchMarketPos] = useState(null);  // posição do slot de banco
  const [marketSearch, setMarketSearch]     = useState('');
  const [marketSort, setMarketSort]         = useState('alpha'); // 'alpha' | 'team'
  const [marketTeamFilter, setMarketTeamFilter] = useState(null);
  const [teamDropOpen, setTeamDropOpen]     = useState(false);
  const [expandedTeams, setExpandedTeams]   = useState(new Set());

  // Modo de visualização: escalação ou resultados
  const [viewMode, setViewMode]       = useState('escalacao'); // 'escalacao' | 'resultados'
  const [resultMatches, setResultMatches] = useState([]);
  const [resultMatchesLoaded, setResultMatchesLoaded] = useState(false);
  const [resultsFilter, setResultsFilter] = useState('ultima'); // 'ultima' | 'tudo'

  // Formação ativa (posições e field positions)
  const formationData = (!genderMode && sport === 'futebol') ? (FORMATIONS_FUTEBOL[formation] || FORMATIONS_FUTEBOL['4-3-3']) : null;
  // No genderMode (OLIMFEF) a "config" vem do OLIMFEF_LINEUP: slots = gêneros exigidos.
  const cfg = genderMode
    ? {
        positions: olimfefSlots(sport, lineupGender),
        maxPerTeam: Infinity,
        positionLabels: { masculino: '♂ Masculino', feminino: '♀ Feminino' },
        fieldColor: 'linear-gradient(180deg,#1e3a8a 0%,#1d4ed8 100%)',
        sportLabel: OLIMFEF_LINEUP[sport]?.label || sport,
        icon: '🏅',
      }
    : (SQUAD_CONFIG[sport] || SQUAD_CONFIG.futsal);
  const slots  = formationData ? formationData.positions : cfg.positions;
  const MAX    = slots.length;
  const currentPhase = currentEvent?.currentPhase;
  const MAX_TEAM = genderMode ? Infinity
    : (currentPhase !== undefined && PHASE_MAX_PER_TEAM[currentPhase] !== undefined
        ? PHASE_MAX_PER_TEAM[currentPhase]
        : cfg.maxPerTeam);
  const fieldPositions = formationData ? formationData.fieldPos : (FIELD_POSITIONS_FIXED[sport] || []);
  // Uma posição reserva por posição única da formação (só futebol)
  // Reservas: futebol (por posição) · OLIMFEF misto (1 por gênero) · OLIMFEF
  // per-gênero (2 reservas → chaves genero#1/genero#2).
  const benchPositions = useMemo(() => {
    if (sport === 'futebol') return [...new Set(slots)];
    if (genderMode) return olimMixed ? [...new Set(slots)] : [`${lineupGender}#1`, `${lineupGender}#2`];
    return [];
  }, [slots, sport, genderMode, olimMixed, lineupGender]);
  // Limite de reservas por seleção — segue a fase (PHASE_BENCH_MAX_PER_TEAM),
  // para o banco continuar preenchível nas fases finais. Sem fase definida,
  // vale a regra Copa original (1 por seleção).
  const benchMaxPerTeam = genderMode ? Infinity
    : (currentPhase !== undefined && PHASE_BENCH_MAX_PER_TEAM[currentPhase] !== undefined
        ? PHASE_BENCH_MAX_PER_TEAM[currentPhase]
        : 1);

  useEffect(() => {
    (async () => {
      setLoading(true); setMsg({ type: '', text: '' });
      try {
        const [rawPls, tms, saved, mkt] = await Promise.all([
          genderMode ? getPlayersByGender(eventId, olimMixed ? 'misto' : lineupGender) : getPlayersBySport(sport, eventId),
          genderMode ? getTeamsByEvent(eventId)                  : getTeamsBySport(sport),
          getUserTeam(user.uid, teamKey, eventId),
          getMarketConfig(eventId),
        ]);
        // Times bloqueados p/ escalação (eliminados / jogando agora): fora do mercado.
        const blockedTeams = new Set((tms || []).filter((t) => t.noLineup).map((t) => t.id));
        // No genderMode o "slot" é o gênero → usa o gênero do jogador como posição
        const pls = (genderMode ? rawPls.map((p) => ({ ...p, position: p.gender })) : rawPls)
          .filter((p) => !blockedTeams.has(p.teamId));
        setMarket(mkt);
        setPlayers(pls); setTeams((tms || []).filter((t) => !blockedTeams.has(t.id)));

        const rawIds = saved?.playerIds || [];
        const { cleaned, validIds, removedCount } = filterValidPlayerIds(rawIds, pls);

        // Restaura a formação salva (futebol) antes de montar os slots
        const savedFormation = (sport === 'futebol' && saved?.formation && FORMATIONS_FUTEBOL[saved.formation])
          ? saved.formation
          : formation;
        if (sport === 'futebol') setFormation(savedFormation);

        if (cleaned && rawIds.length > 0) {
          // best-effort: a trava de mercado pode negar a escrita (mercado fechado);
          // ainda assim mostramos o time limpo — persiste na próxima abertura.
          try {
            await saveUserTeam(user.uid, teamKey, validIds, saved?.captainId || null, eventId,
              saved?.playerPositions || [], saved?.bench || {}, sport === 'futebol' ? savedFormation : null);
            setMsg({ type: 'error', text: `${removedCount} jogador(es) removido(s) (time eliminado/bloqueado ou inexistente).` });
          } catch { /* persiste depois */ }
        }

        const validCaptain = validIds.includes(saved?.captainId) ? saved.captainId : null;
        const currentSlots = sport === 'futebol'
          ? (FORMATIONS_FUTEBOL[savedFormation]?.positions || slots)
          : cfg.positions;
        setSelected(buildSlotArray(validIds, currentSlots, pls));
        setCaptainId(validCaptain);
        setBench(saved?.bench || {});
      } catch (err) {
        console.error('[FantasyTeam] erro ao carregar:', err);
        setMsg({ type: 'error', text: 'Erro ao carregar o time. Tente recarregar a página.' });
      } finally {
        setLoading(false);
      }
    })();
  }, [sport, lineupGender, user, eventId]);

  // Quando formação muda (futebol), reconstrói slots mantendo jogadores compatíveis
  const handleFormationChange = async (newFormation) => {
    if (selected.some(Boolean) && !(await confirm('Trocar formação vai reorganizar sua escalação. Continuar?'))) return;
    const newSlots = FORMATIONS_FUTEBOL[newFormation]?.positions || slots;
    const currentIds = selected.filter(Boolean);
    setFormation(newFormation);
    setSelected(buildSlotArray(currentIds, newSlots, players));
  };

  const teamMap    = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t.name])), [teams]);
  const teamByIdMap = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams]);

  const positionOrderMap = useMemo(() => {
    const positions = SQUAD_CONFIG[sport]?.positions || [];
    const unique = [...new Set(positions)];
    return Object.fromEntries(unique.map((p, i) => [p, i]));
  }, [sport]);

  const countsByTeam = useMemo(() => {
    const c = {};
    selected.filter(Boolean).forEach((pid) => {
      const p = players.find((x) => x.id === pid);
      if (p) c[p.teamId] = (c[p.teamId] || 0) + 1;
    });
    return c;
  }, [selected, players]);

  const selectedCount = selected.filter(Boolean).length;
  const selectedSet   = new Set(selected.filter(Boolean));

  // Carrega partidas finalizadas quando modo Resultados é ativado
  useEffect(() => {
    if (viewMode !== 'resultados' || resultMatchesLoaded || !eventId) return;
    getMatchesByEvent(eventId).then((ms) => {
      setResultMatches(ms.filter((m) => m.status === 'finished'));
      setResultMatchesLoaded(true);
    });
  }, [viewMode, resultMatchesLoaded, eventId]);

  // Rodadas únicas das partidas finalizadas (para resultados)
  const resultRodadas = useMemo(() => {
    const seen = new Set();
    const list = [];
    resultMatches.forEach((m) => {
      const key = m.phase || m.rodada;
      if (key && !seen.has(key)) { seen.add(key); list.push(key); }
    });
    return list;
  }, [resultMatches]);

  // Última rodada finalizada
  const latestResultRodada = useMemo(() => {
    if (!resultMatches.length) return null;
    const sorted = [...resultMatches].sort((a, b) => (b.date || 0) - (a.date || 0));
    return sorted[0].phase || sorted[0].rodada || null;
  }, [resultMatches]);

  // Partidas filtradas para os resultados
  const filteredResultMatches = useMemo(() => {
    if (resultsFilter === 'ultima' && latestResultRodada)
      return resultMatches.filter((m) => (m.phase || m.rodada) === latestResultRodada);
    return resultMatches;
  }, [resultMatches, resultsFilter, latestResultRodada]);

  // Pontos dos jogadores nas partidas filtradas
  const playerPoints = useMemo(() => {
    const acc = {};
    filteredResultMatches.forEach((m) => {
      (m.playerStats || []).forEach((stat) => {
        const raw  = calcFantasyPoints(stat, m);
        const isCap = captainId === stat.playerId;
        const pts  = isCap ? raw * 2 : raw;
        acc[stat.playerId] = (acc[stat.playerId] || 0) + pts;
      });
    });
    return acc; // { playerId: pts }
  }, [filteredResultMatches, captainId]);

  // Remove jogador do banco quando ele entra como titular
  const clearFromBench = (playerId) => {
    setBench((b) => {
      const nb = { ...b };
      Object.keys(nb).forEach((p) => { if (nb[p] === playerId) nb[p] = null; });
      return nb;
    });
  };

  // Reservas da mesma seleção já no banco (excluindo o próprio jogador) —
  // usado para o limite da fase valer sobre o total titulares + banco.
  const benchSameTeamCount = (player) => Object.values(bench).filter(Boolean)
    .filter((pid) => pid !== player.id && players.find((x) => x.id === pid)?.teamId === player.teamId).length;

  // Adiciona jogador a um slot específico (do mercado)
  const addToSlot = (slotIndex, player) => {
    if ((countsByTeam[player.teamId] || 0) + benchSameTeamCount(player) >= MAX_TEAM && !selectedSet.has(player.id)) {
      setMsg({ type: 'error', text: T.team.maxPerTeam }); return;
    }
    const newSel = [...selected];
    newSel[slotIndex] = player.id;
    setSelected(newSel);
    if (captainId === player.id) setCaptainId(null);
    clearFromBench(player.id);
    setMarketSlot(null);
    setMarketSearch('');
    setMarketTeamFilter(null);
    setMsg({ type: '', text: '' });
  };

  // Remove jogador de um slot (clique no slot preenchido)
  const removeFromSlot = (slotIndex) => {
    if (market && !isMarketOpen(market)) { setMsg({ type: 'error', text: '🔒 Mercado fechado — alterações bloqueadas.' }); return; }
    const pid = selected[slotIndex];
    if (!pid) return;
    const newSel = [...selected];
    newSel[slotIndex] = null;
    setSelected(newSel);
    if (captainId === pid) setCaptainId(null);
    setMsg({ type: '', text: '' });
  };

  // Toggle via lista abaixo do campo (appende ao primeiro slot compatível vazio)
  const togglePlayer = (player) => {
    setMsg({ type: '', text: '' });
    setInlineAlert(null);
    if (selectedSet.has(player.id)) {
      if (market && !isMarketOpen(market)) { setInlineAlert({ playerId: player.id, text: '🔒 Mercado fechado — alterações bloqueadas.' }); return; }
      const idx = selected.indexOf(player.id);
      const newSel = [...selected]; newSel[idx] = null;
      setSelected(newSel);
      if (captainId === player.id) setCaptainId(null);
      return;
    }
    // Adição bloqueada com mercado fechado
    if (market && !isMarketOpen(market)) {
      setInlineAlert({ playerId: player.id, text: '🔒 Mercado fechado — aguarde a abertura para escalar.' });
      return;
    }
    if (selectedCount >= MAX) { setInlineAlert({ playerId: player.id, text: T.team.maxPlayers }); return; }
    if ((countsByTeam[player.teamId] || 0) + benchSameTeamCount(player) >= MAX_TEAM) {
      setInlineAlert({ playerId: player.id, text: T.team.maxPerTeam }); return;
    }
    // Encontra primeiro slot vazio compatível (no genderMode o slot é o gênero)
    const compat = compatiblePositions;
    const targetIdx = slots.findIndex((pos, i) => selected[i] === null && compat(pos).includes(player.position));
    const fallbackIdx = selected.indexOf(null);
    const idx = targetIdx >= 0 ? targetIdx : fallbackIdx;
    if (idx < 0) { setInlineAlert({ playerId: player.id, text: T.team.maxPlayers }); return; }
    const newSel = [...selected]; newSel[idx] = player.id;
    setSelected(newSel);
    clearFromBench(player.id);
  };

  const doSave = async () => {
    try {
      const playerIds = [], playerPositions = [];
      selected.forEach((pid, i) => {
        if (pid) { playerIds.push(pid); playerPositions.push(slots[i]); }
      });
      const benchToSave = (sport === 'futebol' || genderMode)
        ? Object.fromEntries(benchPositions.map((pos) => [pos, bench[pos] || null]).filter(([, v]) => v))
        : {};
      await saveUserTeam(user.uid, teamKey, playerIds, captainId, eventId, playerPositions, benchToSave,
        sport === 'futebol' ? formation : null);
      setMsg({ type: 'success', text: T.team.teamSaved });
      refreshNotifs();
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
  };

  const handleSave = async () => {
    const playerIds = selected.filter(Boolean);
    // No genderMode valida pela cota de slots (a posição já garante o gênero certo)
    const { valid, error } = genderMode
      ? (playerIds.length === MAX
          ? { valid: true, error: null }
          : { valid: false, error: `Complete a escalação: ${MAX} jogadores (${cfg.sportLabel}).` })
      : validateSquad(sport, playerIds);
    if (!valid) { setMsg({ type: 'error', text: error }); return; }
    if (!captainId) { setShowCaptainModal(true); return; }
    await doSave();
  };

  const handleClear = async () => {
    if (market && !isMarketOpen(market)) return;
    if (!(await confirm('Limpar toda a escalação desta modalidade?'))) return;
    try {
      await saveUserTeam(user.uid, teamKey, [], null, eventId, [], {}, sport === 'futebol' ? formation : null);
      setSelected(Array(MAX).fill(null));
      setCaptainId(null);
      setBench({});
      setMsg({ type: 'success', text: 'Escalação limpa.' });
      refreshNotifs();
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
  };

  const playersByTeam = useMemo(() => {
    const g = {};
    teams.forEach((t) => { g[t.id] = []; });
    players.forEach((p) => { if (g[p.teamId]) g[p.teamId].push(p); });
    Object.values(g).forEach((list) => {
      list.sort((a, b) => {
        const ao = positionOrderMap[a.position] ?? 99;
        const bo = positionOrderMap[b.position] ?? 99;
        if (ao !== bo) return ao - bo;
        return a.name.localeCompare(b.name);
      });
    });
    return g;
  }, [players, teams, positionOrderMap]);

  const groupedTeams = useMemo(() => {
    // Only show teams that have at least one player (removes duplicates without players)
    const active = teams.filter((t) => players.some((p) => p.teamId === t.id));
    const genderValues = [...new Set(active.map((t) => t.gender || ''))];
    const hasGenders = genderValues.some(Boolean) && genderValues.length > 1;
    const sortAlpha = (arr) => [...arr].sort((a, b) => a.name.localeCompare(b.name));
    if (!hasGenders) return [{ label: null, teams: sortAlpha(active) }];
    const order = ['masculino', 'feminino', 'misto', ''];
    const grouped = {};
    order.forEach((g) => { grouped[g] = []; });
    active.forEach((t) => { const g = t.gender || ''; grouped[g].push(t); });
    const LABELS = { masculino: '♂ Masculino', feminino: '♀ Feminino', misto: '⚡ Misto', '': 'Outros' };
    return order.filter((g) => grouped[g].length > 0).map((g) => ({ label: LABELS[g], teams: sortAlpha(grouped[g]) }));
  }, [teams, players]);

  // Times disponíveis para filtro no mercado
  const marketTeamOptions = useMemo(() => {
    const pos = benchMarketPos || marketSlot?.position;
    if (!pos) return [];
    const compat = compatiblePositions(pos);
    const teamIds = new Set(players.filter((p) => compat.includes(p.position)).map((p) => p.teamId));
    const benchTeamCounts = {};
    if (!genderMode) {
      Object.entries(bench)
        .filter(([k, pid]) => pid && k !== benchMarketPos)
        .forEach(([, pid]) => {
          const tid = players.find((x) => x.id === pid)?.teamId;
          if (tid) benchTeamCounts[tid] = (benchTeamCounts[tid] || 0) + 1;
        });
    }
    return teams.filter((t) => {
      if (!teamIds.has(t.id)) return false;
      // Limite da fase vale para o TOTAL titulares + banco da seleção
      if (MAX_TEAM !== Infinity && (countsByTeam[t.id] || 0) + (benchTeamCounts[t.id] || 0) >= MAX_TEAM) return false;
      if (benchMarketPos && (benchTeamCounts[t.id] || 0) >= benchMaxPerTeam) return false;
      return true;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [benchMarketPos, marketSlot, players, teams, countsByTeam, MAX_TEAM, bench, genderMode, benchMaxPerTeam]);

  // Jogadores disponíveis no mercado (slot titular ou reserva)
  const marketPlayers = useMemo(() => {
    const pos = benchMarketPos || marketSlot?.position;
    if (!pos) return [];
    const compat = compatiblePositions(pos);
    const q = marketSearch.toLowerCase();
    const benchSet = new Set(Object.values(bench).filter(Boolean));
    // Reservas já escaladas por seleção (fora o slot atual). O limite é
    // benchMaxPerTeam (proporcional às seleções restantes). No genderMode o
    // banco é por gênero (sem trava).
    const benchTeamCounts = {};
    Object.entries(bench)
      .filter(([k, pid]) => pid && k !== benchMarketPos)
      .forEach(([, pid]) => {
        const tid = players.find((x) => x.id === pid)?.teamId;
        if (tid) benchTeamCounts[tid] = (benchTeamCounts[tid] || 0) + 1;
      });

    const filtered = players.filter((p) => {
      if (!compat.includes(p.position)) return false;
      // Oculta jogadores de seleções que atingiram o limite da fase, contando
      // o TOTAL titulares + banco (desconta o próprio jogador se já ocupa vaga)
      if (MAX_TEAM !== Infinity && !selectedSet.has(p.id)) {
        const benchOwn = benchSet.has(p.id) ? 1 : 0;
        if ((countsByTeam[p.teamId] || 0) + (benchTeamCounts[p.teamId] || 0) - benchOwn >= MAX_TEAM) return false;
      }
      if (q) {
        const matchesPlayer = p.name.toLowerCase().includes(q);
        const matchesTeam   = (teamMap[p.teamId] || '').toLowerCase().includes(q);
        if (!matchesPlayer && !matchesTeam) return false;
      }
      if (marketTeamFilter && p.teamId !== marketTeamFilter) return false;
      if (benchMarketPos) {
        if (selectedSet.has(p.id)) return false;                                 // já é titular → bloqueado
        if (benchSet.has(p.id) && bench[benchMarketPos] !== p.id) return false;  // já está no banco
        if (!genderMode && (benchTeamCounts[p.teamId] || 0) >= benchMaxPerTeam) return false; // limite de reservas por seleção
      } else {
        if (selectedSet.has(p.id) && selected[marketSlot.index] !== p.id) return false;
      }
      return true;
    });

    if (marketSort === 'team') {
      filtered.sort((a, b) => {
        const at = teamMap[a.teamId] || '';
        const bt = teamMap[b.teamId] || '';
        if (at !== bt) return at.localeCompare(bt);
        return a.name.localeCompare(b.name);
      });
    } else {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    }

    return filtered;
  }, [marketSlot, benchMarketPos, players, selectedSet, selected, marketSearch, bench, marketTeamFilter, marketSort, teamMap, genderMode, benchMaxPerTeam]);

  return (
    <>
      {/* ── Modal: aviso de capitão ─────────────────────────── */}
      {showCaptainModal && (
        <div className="modal-overlay" onClick={() => setShowCaptainModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👑</div>
            <h3 style={{ marginBottom: '0.5rem' }}>Capitão não definido!</h3>
            <p className="muted" style={{ marginBottom: '1rem' }}>
              O capitão recebe <strong>2× a pontuação</strong> em cada rodada.
              Quer salvar sem capitão mesmo assim?
            </p>
            <div className="flex" style={{ gap: '0.75rem', justifyContent: 'center' }}>
              <button className="btn-secondary" onClick={() => setShowCaptainModal(false)}>Definir capitão</button>
              <button onClick={async () => { setShowCaptainModal(false); await doSave(); }}>Salvar mesmo assim</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: mercado de jogadores ─────────────────────── */}
      {(marketSlot || benchMarketPos) && (
        <div className="modal-overlay" onClick={() => { setMarketSlot(null); setBenchMarketPos(null); setMarketSearch(''); setMarketTeamFilter(null); }}>
          <div className="modal-box" style={{ maxWidth: 440, maxHeight: '80vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 style={{ margin: 0 }}>
                {benchMarketPos
                  ? `🪑 Reserva — ${cfg.positionLabels[benchMarketPos] || cfg.positionLabels[String(benchMarketPos).split('#')[0]] || POSITION_LABELS[benchMarketPos] || String(benchMarketPos).split('#')[0]}`
                  : `Mercado — ${cfg.positionLabels[marketSlot.position] || POSITION_LABELS[marketSlot.position] || marketSlot.position}`}
              </h3>
              <button className="btn-secondary" style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem' }}
                onClick={() => { setMarketSlot(null); setBenchMarketPos(null); setMarketSearch(''); setMarketTeamFilter(null); }}>✕</button>
            </div>
            {currentPhase && PHASE_LABELS[currentPhase] && (
              <div style={{ fontSize: '0.75rem', background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 6, padding: '0.3rem 0.6rem', marginBottom: '0.6rem', color: '#eab308' }}>
                {PHASE_LABELS[currentPhase]} — máx.{' '}
                {MAX_TEAM === Infinity ? 'sem limite' : `${MAX_TEAM} jogador${MAX_TEAM !== 1 ? 'es' : ''}`} por seleção
              </div>
            )}
            <input
              placeholder="Buscar jogador ou país…"
              value={marketSearch}
              onChange={(e) => setMarketSearch(e.target.value)}
              style={{ marginBottom: '0.5rem', width: '100%' }}
              autoFocus
            />
            {/* Filtros em caixinha */}
            <div style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--border)',
              borderRadius: '0.5rem',
              padding: '0.5rem 0.6rem',
              marginBottom: '0.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
            }}>
              {/* Ordenação */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Ordem:</span>
                {[
                  { key: 'alpha', label: 'A→Z' },
                  { key: 'team',  label: 'Por time' },
                ].map(({ key, label }) => (
                  <button key={key}
                    className={`event-type-chip ${marketSort === key ? 'active' : ''}`}
                    style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem' }}
                    onClick={() => setMarketSort(key)}>
                    {label}
                  </button>
                ))}
              </div>
              {/* Filtro por país/time — dropdown customizado com bandeiras */}
              {marketTeamOptions.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>País:</span>
                  <div style={{ flex: 1, position: 'relative' }}>
                    {teamDropOpen && (
                      <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setTeamDropOpen(false)} />
                    )}
                    <button
                      onClick={() => setTeamDropOpen((o) => !o)}
                      style={{
                        width: '100%', fontSize: '0.78rem', padding: '0.2rem 0.5rem',
                        borderRadius: '0.35rem', border: '1px solid var(--border)',
                        background: 'var(--surface)', color: 'var(--text)',
                        display: 'flex', alignItems: 'center', gap: '0.35rem', justifyContent: 'space-between',
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        {marketTeamFilter
                          ? (() => {
                              const sel = marketTeamOptions.find((t) => t.id === marketTeamFilter);
                              return sel ? (
                                <>{sel.shieldEmoji && <ShieldEmoji emoji={sel.shieldEmoji} size="1rem" />}{sel.name}</>
                              ) : 'Todos';
                            })()
                          : 'Todos'}
                      </span>
                      <span style={{ opacity: 0.5, fontSize: '0.6rem' }}>{teamDropOpen ? '▲' : '▼'}</span>
                    </button>
                    {teamDropOpen && (
                      <div style={{
                        position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, zIndex: 100,
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: '0.35rem', maxHeight: '11rem', overflowY: 'auto',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
                      }}>
                        <button
                          onClick={() => { setMarketTeamFilter(null); setTeamDropOpen(false); }}
                          style={{
                            width: '100%', padding: '0.3rem 0.5rem', textAlign: 'left',
                            fontSize: '0.78rem', background: !marketTeamFilter ? 'rgba(34,197,94,0.12)' : 'transparent',
                            color: 'var(--text)', border: 'none', cursor: 'pointer', borderRadius: 0,
                          }}
                        >
                          Todos
                        </button>
                        {marketTeamOptions.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => { setMarketTeamFilter(t.id); setTeamDropOpen(false); }}
                            style={{
                              width: '100%', padding: '0.3rem 0.5rem', textAlign: 'left',
                              fontSize: '0.78rem',
                              background: marketTeamFilter === t.id ? 'rgba(34,197,94,0.12)' : 'transparent',
                              color: 'var(--text)', border: 'none', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: '0.4rem', borderRadius: 0,
                            }}
                          >
                            {t.shieldEmoji && <ShieldEmoji emoji={t.shieldEmoji} size="1rem" />}
                            {t.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            {marketPlayers.length === 0 ? (
              <p className="muted" style={{ textAlign: 'center', padding: '1rem 0' }}>
                Nenhum jogador disponível para esta posição.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {marketPlayers.map((p) => {
                  const teamName = teamMap[p.teamId] || '?';
                  const teamObj  = teams.find((t) => t.id === p.teamId);
                  const atLimit  = false; // teams at limit are now hidden from marketPlayers
                  const isCurrentSlot = benchMarketPos
                    ? bench[benchMarketPos] === p.id
                    : selected[marketSlot.index] === p.id;
                  const posLabel = cfg.positionLabels[p.position] || POSITION_LABELS[p.position] || p.position;
                  return (
                    <button
                      key={p.id}
                      disabled={atLimit}
                      onClick={() => {
                        if (benchMarketPos) {
                          // Trava (defensiva): reserva não pode ser titular e o
                          // banco respeita o limite de reservas por seleção.
                          if (selectedSet.has(p.id)) {
                            setMsg({ type: 'error', text: 'Esse jogador já é titular.' }); return;
                          }
                          const sameTeamCount = !genderMode ? Object.entries(bench).filter(([k, pid]) =>
                            pid && k !== benchMarketPos && players.find((x) => x.id === pid)?.teamId === p.teamId).length : 0;
                          if (sameTeamCount >= benchMaxPerTeam) {
                            setMsg({ type: 'error', text: `Máximo de ${benchMaxPerTeam} reserva(s) da mesma seleção no banco.` }); return;
                          }
                          if (MAX_TEAM !== Infinity && (countsByTeam[p.teamId] || 0) + sameTeamCount >= MAX_TEAM) {
                            setMsg({ type: 'error', text: `Limite da fase: máximo de ${MAX_TEAM} jogadores da mesma seleção somando titulares e banco.` }); return;
                          }
                          setBench((b) => ({ ...b, [benchMarketPos]: p.id }));
                          setBenchMarketPos(null);
                          setMarketSearch('');
                          setMarketTeamFilter(null);
                        } else {
                          addToSlot(marketSlot.index, p);
                        }
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.6rem',
                        padding: '0.55rem 0.75rem', borderRadius: '0.5rem', textAlign: 'left',
                        background: isCurrentSlot ? 'rgba(34,197,94,0.12)' : 'var(--surface)',
                        border: `1px solid ${isCurrentSlot ? 'var(--primary)' : 'var(--border)'}`,
                        cursor: atLimit ? 'not-allowed' : 'pointer', opacity: atLimit ? 0.5 : 1,
                        width: '100%',
                      }}
                    >
                      {teamObj?.shieldEmoji
                        ? <ShieldEmoji emoji={teamObj.shieldEmoji} size="1.3rem" />
                        : teamObj?.shieldUrl && <img src={teamObj.shieldUrl} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)' }}>{p.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{posLabel} · {teamName}</div>
                      </div>
                      {isCurrentSlot && <span style={{ color: 'var(--primary)', fontWeight: 700 }}>✓</span>}
                      {atLimit && <span className="muted" style={{ fontSize: '0.75rem' }}>limite</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <h1>{T.team.title}</h1>
      <p className="page-subtitle">{getSquadLabel(sport, slots)}</p>

      {/* Seletor de modo */}
      <div className="tabs" style={{ marginBottom: '0.75rem' }}>
        <button className={`tab ${viewMode === 'escalacao' ? 'active' : ''}`} onClick={() => setViewMode('escalacao')}>Escalação</button>
        <button className={`tab ${viewMode === 'resultados' ? 'active' : ''}`} onClick={() => setViewMode('resultados')}>Resultados</button>
      </div>

      {viewMode === 'escalacao' && (<>

      {/* Mercado fechado */}
      {market && !isMarketOpen(market) && (
        <div className="market-closed-banner">
          🔒 Mercado fechado — escalações bloqueadas. Aguarde a abertura do próximo mercado.
        </div>
      )}
      {/* Mercado aberto — aviso de fechamento automático */}
      {market && isMarketOpen(market) && market.closeAt && (
        <div className="captain-reminder-banner" style={{ borderColor:'rgba(34,197,94,0.4)', background:'rgba(34,197,94,0.08)' }}>
          ⏰ Mercado aberto · Fecha automaticamente em{' '}
          <strong>
            {new Date(market.closeAt).toLocaleString('pt-BR', { timeZone:'America/Sao_Paulo', weekday:'short', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
          </strong>
          {' '}(1h antes do 1º jogo da próxima rodada)
        </div>
      )}

      <SportTabs active={sport} onChange={(s) => { setSport(s); setMarketSlot(null); setBenchMarketPos(null); setMarketSearch(''); setMarketTeamFilter(null); }} available={availableSports} />

      {/* OLIMFEF: competições masc/fem separadas (vôlei, futsal, handebol).
          Basquete 3x3 e Vôlei de Praia são mistos (cota fixa) — sem seletor. */}
      {genderMode && !olimMixed && (
        <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap', margin:'0.4rem 0 0.2rem' }}>
          {[
            { v:'masculino', label:'♂ Masculino' },
            { v:'feminino',  label:'♀ Feminino' },
          ].map(({ v, label }) => (
            <button key={v} type="button"
              className={`event-type-chip ${lineupGender === v ? 'active' : ''}`}
              onClick={() => { setLineupGender(v); setMarketSlot(null); setBenchMarketPos(null); setMarketSearch(''); setMarketTeamFilter(null); }}>
              {label}
            </button>
          ))}
        </div>
      )}
      {genderMode && olimMixed && (
        <p className="muted" style={{ fontSize:'0.78rem', margin:'0.3rem 0' }}>
          Escalação mista: {sport === 'basketball' ? '2 homens + 1 mulher' : '2 homens + 2 mulheres'} (cota fixa por gênero).
        </p>
      )}

      {/* Seletor de formação (futebol) */}
      {sport === 'futebol' && (
        <div className="formation-selector">
          <div className="formation-selector-inner card">
            <div className="formation-selector-label">Formação tática</div>
            <div className="formation-selector-chips">
              {Object.entries(FORMATIONS_FUTEBOL).map(([key, f]) => (
                <button
                  key={key}
                  className={`event-type-chip ${formation === key ? 'active' : ''}`}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2 }}
                  onClick={() => handleFormationChange(key)}
                  title={f.desc}
                >
                  <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{key}</span>
                  <span className="formation-desc">{f.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Regras de escalação — Copa do Mundo (futebol) */}
      {sport === 'futebol' && (
        <div className="card" style={{ marginBottom: '0.75rem', padding: '0.6rem 1rem' }}>
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setShowRules((v) => !v)}
          >
            <strong style={{ fontSize: '0.83rem' }}>📋 Regras — Limite de jogadores por seleção</strong>
            <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{showRules ? '▲ ocultar' : '▼ ver regras'}</span>
          </div>
          {showRules && (
            <div style={{ marginTop: '0.65rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', color: 'var(--muted)', fontWeight: 600, paddingBottom: '0.35rem', borderBottom: '1px solid var(--border)' }}>Fase</th>
                    <th style={{ textAlign: 'center', color: 'var(--muted)', fontWeight: 600, paddingBottom: '0.35rem', borderBottom: '1px solid var(--border)' }}>Máx. por seleção</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(PHASE_LABELS).map(([key, label]) => {
                    const max = PHASE_MAX_PER_TEAM[key];
                    const isCurrent = currentPhase === key;
                    return (
                      <tr key={key} style={{ background: isCurrent ? 'rgba(34,197,94,0.07)' : 'transparent' }}>
                        <td style={{ padding: '0.28rem 0.4rem', borderRadius: '4px 0 0 4px' }}>
                          {isCurrent
                            ? <span style={{ color: 'var(--primary)', fontWeight: 700 }}>▶ {label}</span>
                            : <span style={{ color: 'var(--muted)' }}>{label}</span>}
                        </td>
                        <td style={{ textAlign: 'center', padding: '0.28rem 0.4rem', fontWeight: isCurrent ? 800 : 500, color: isCurrent ? 'var(--primary)' : 'inherit' }}>
                          {max === Infinity ? 'Sem limite' : `${max} jogador${max !== 1 ? 'es' : ''}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!currentPhase && (
                <p className="muted" style={{ marginTop: '0.45rem', fontSize: '0.74rem' }}>
                  Nenhuma fase definida — limite padrão aplicado.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Campo visual */}
      <div className="field-container">
        <SportField sport={sport} />
        <div className="field-overlay">
          <div className="field-slots">
            {slots.map((pos, i) => {
              const pid      = selected[i];
              const p        = pid ? players.find((x) => x.id === pid) : null;
              const isCap    = p && captainId === p.id;
              const posLabel = cfg.positionLabels[pos] || POSITION_LABELS[pos] || pos;
              const fieldPos = fieldPositions[i] || { x: 20 + i * 8, y: 50 };
              const isEmpty  = !p;
              return (
                <div
                  key={i}
                  className={`field-slot ${p ? 'filled' : ''} ${isCap ? 'captain' : ''} ${isEmpty && !(market && !isMarketOpen(market)) ? 'empty-clickable' : ''}`}
                  style={{ left: `${fieldPos.x}%`, top: `${fieldPos.y}%` }}
                  onClick={() => {
                    if (isEmpty && !(market && !isMarketOpen(market))) {
                      setMarketSearch('');
                      setMarketSlot({ index: i, position: pos });
                    } else if (!isEmpty) {
                      removeFromSlot(i);
                    }
                  }}
                  title={isEmpty ? `Clique para abrir o mercado (${posLabel})` : `Clique para remover ${p.name}`}
                >
                  {p ? (
                    <>
                      {teamByIdMap[p.teamId]?.shieldEmoji && (
                        <ShieldEmoji emoji={teamByIdMap[p.teamId].shieldEmoji} size="0.9rem" style={{ marginBottom: '0.05rem', lineHeight: 1 }} />
                      )}
                      <div className="slot-name">{(p.name || '').trim().split(' ').filter(Boolean).slice(0, 2).join(' ')}</div>
                      {isCap && <div className="slot-captain">C</div>}
                    </>
                  ) : (
                    <div className="slot-pos">{posLabel}<br /><span style={{ fontSize: '0.55rem', opacity: 0.7 }}>+</span></div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Banco de reservas (futebol por posição · OLIMFEF por gênero) */}
      {(sport === 'futebol' || genderMode) && benchPositions.length > 0 && (
        <div className="card" style={{ marginBottom: '0.75rem', padding: '0.65rem 1rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 600, textAlign: 'center', marginBottom: '0.5rem' }}>
            🪑 Banco de Reservas
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            {benchPositions.map((pos) => {
              const benchPid    = bench[pos];
              const benchPlayer = benchPid ? players.find((p) => p.id === benchPid) : null;
              const posBase     = typeof pos === 'string' && pos.includes('#') ? pos.split('#')[0] : pos;
              const posLabel    = cfg.positionLabels[pos] || cfg.positionLabels[posBase] || POSITION_LABELS[pos] || posBase;
              const marketClosed = market && !isMarketOpen(market);
              return (
                <div
                  key={pos}
                  className={`bench-slot ${benchPlayer ? 'filled' : ''}`}
                  onClick={() => {
                    if (benchPlayer) {
                      if (marketClosed) { setMsg({ type: 'error', text: '🔒 Mercado fechado — alterações bloqueadas.' }); return; }
                      setBench((b) => ({ ...b, [pos]: null }));
                    } else if (!marketClosed) {
                      setBenchMarketPos(pos);
                      setMarketSearch('');
                    }
                  }}
                  title={benchPlayer
                    ? (marketClosed ? '🔒 Mercado fechado' : `${benchPlayer.name} — clique para remover`)
                    : marketClosed ? 'Mercado fechado' : `Clique para escolher reserva (${posLabel})`}
                >
                  {benchPlayer ? (
                    <>
                      {teamByIdMap[benchPlayer.teamId]?.shieldEmoji && (
                        <ShieldEmoji emoji={teamByIdMap[benchPlayer.teamId].shieldEmoji} size="0.9rem" style={{ lineHeight: 1 }} />
                      )}
                      <div className="slot-name">{benchPlayer.name.split(' ').slice(0, 2).join(' ')}</div>
                      <div className="slot-pos">{posLabel}</div>
                    </>
                  ) : (
                    <div className="slot-pos">{posLabel}<br /><span style={{ opacity: 0.5, fontSize: '0.6rem' }}>+</span></div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Aviso: time completo sem capitão */}
      {selectedCount === MAX && !captainId && (
        <div className="captain-reminder-banner">
          👑 Defina um <strong>capitão</strong> para dobrar sua pontuação!
        </div>
      )}

      {/* Barra de progresso */}
      <div className="squad-progress">
        <div className="squad-progress-bar">
          <div className="squad-progress-fill" style={{ width: `${(selectedCount / MAX) * 100}%` }} />
        </div>
        <span className="squad-progress-label">
          {selectedCount} / {MAX} jogadores{selectedCount === MAX ? ' ✓' : ''}
        </span>
      </div>

      <div className="card mb-2">
        <div className="flex-between mb-1">
          <div>
            <strong>{T.team.selected}: {selectedCount} / {MAX}</strong>
          </div>
          <div className="flex" style={{ gap: '0.5rem' }}>
            {selectedCount > 0 && !(market && !isMarketOpen(market)) && (
              <button className="btn-secondary btn-sm" onClick={handleClear}>🗑️ Limpar</button>
            )}
            <button onClick={handleSave} disabled={loading || selectedCount !== MAX || (market && !isMarketOpen(market))}>
              {market && !isMarketOpen(market) ? '🔒 Mercado fechado' : T.team.saveTeam}
            </button>
          </div>
        </div>
        {selectedCount > 0 && (() => {
          const draftedPlayers = [
            ...selected.filter(Boolean),
            ...Object.values(bench).filter(Boolean),
          ].map((id) => players.find((p) => p.id === id)).filter(Boolean);
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem' }}>
              <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap', opacity: 0.8 }}>👑 Capitão:</span>
              <select
                value={captainId || ''}
                onChange={(e) => setCaptainId(e.target.value || null)}
                style={{ flex: 1, fontSize: '0.85rem', padding: '0.25rem 0.4rem', borderRadius: 6, background: 'var(--surface)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer' }}
              >
                <option value="">— Nenhum —</option>
                {draftedPlayers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          );
        })()}
        {msg.text && <div className={msg.type} style={{ marginTop: '0.4rem' }}>{msg.text}</div>}
      </div>

      {loading ? (
        <p className="muted">{T.common.loading}</p>
      ) : players.length === 0 ? (
        <div className="card"><p className="muted">{T.team.noPlayers}</p></div>
      ) : (
        groupedTeams.map(({ label, teams: groupTeams }) => (
          <div key={label || 'all'}>
            {label && <div className="gender-section-header">{label}</div>}
            {groupTeams.map((t) => {
              const isExpanded = expandedTeams.has(t.id);
              const toggleTeam = () => setExpandedTeams((prev) => {
                const next = new Set(prev);
                if (next.has(t.id)) next.delete(t.id); else next.add(t.id);
                return next;
              });
              return (
              <div key={t.id} className="mb-2">
                <h3
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', userSelect: 'none' }}
                  onClick={toggleTeam}
                >
                  <ShieldEmoji emoji={t.shieldEmoji} size="1.3rem" />
                  {t.name}
                  <span style={{ marginLeft: 'auto', fontSize: '0.75rem', opacity: 0.5 }}>{isExpanded ? '▲' : '▼'}</span>
                </h3>
                {isExpanded && (playersByTeam[t.id] || []).map((p) => {
                  const isSelected = selectedSet.has(p.id);
                  const isCaptain  = captainId === p.id;
                  const posLabel   = genderMode
                    ? (p.gender === 'masculino' ? '♂ Masculino' : p.gender === 'feminino' ? '♀ Feminino' : '')
                    : (cfg.positionLabels[p.position] || POSITION_LABELS[p.position] || p.position);
                  return (
                    <div key={p.id}>
                    <div
                      className={`player-card ${isSelected ? 'selected' : ''} ${isCaptain ? 'captain' : ''}`}
                      onClick={() => togglePlayer(p)}
                    >
                      <div className="player-info" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.6rem' }}>
                        <div className="player-avatar-sport" data-sport={sport} data-pos={p.position}
                          style={genderMode ? { background: p.gender === 'masculino' ? '#bbf7d0' : '#e9d5ff', color: '#1f2937' } : undefined}>
                          {genderMode ? (p.gender === 'masculino' ? '♂' : '♀') : (p.position?.slice(0, 2).toUpperCase() || '?')}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.05rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {t.shieldEmoji
                              ? <ShieldEmoji emoji={t.shieldEmoji} size="1.1rem" />
                              : t.shieldUrl && <img src={t.shieldUrl} alt={t.name} className="player-team-shield" />}
                            <span className="player-name">
                              {p.name}
                              {isCaptain && <span className="captain-badge" style={{ marginLeft: 6 }}>C</span>}
                            </span>
                          </div>
                          <span className="player-meta">
                            {posLabel} · {teamByIdMap[p.teamId]?.shieldEmoji ? `${teamByIdMap[p.teamId].shieldEmoji} ` : ''}{teamMap[p.teamId] || '?'}
                          </span>
                        </div>
                      </div>
                      {(isSelected || inlineAlert?.playerId === p.id) && (
                        <div className="player-actions">
                          {isSelected && (
                            <button
                              type="button"
                              className={`btn-secondary player-action-btn ${isCaptain ? 'player-action-captain' : ''}`}
                              onClick={(e) => { e.stopPropagation(); setCaptainId(isCaptain ? null : p.id); }}
                            >
                              {isCaptain ? T.common.removeCaptain : T.common.setCaptain}
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn-secondary player-action-btn"
                            onClick={(e) => { e.stopPropagation(); navigate(`/jogador/${p.id}`); }}
                          >
                            Estatísticas
                          </button>
                        </div>
                      )}
                    </div>
                    {inlineAlert?.playerId === p.id && (
                      <div className="error" style={{ fontSize: '0.78rem', padding: '0.2rem 0.75rem', marginTop: '0.1rem', borderRadius: 6 }}>
                        {inlineAlert.text}
                      </div>
                    )}
                    </div>
                  );
                })}
              </div>
              );
            })}
          </div>
        ))
      )}
      </>)}

      {/* ── Modo Resultados ─────────────────────────────────── */}
      {viewMode === 'resultados' && (
        <div>
          {/* Filtro de período */}
          <div style={{ display:'flex', gap:'0.4rem', marginBottom:'0.75rem', flexWrap:'wrap', alignItems:'center' }}>
            <span className="muted" style={{ fontSize:'0.8rem' }}>Período:</span>
            {[{ k:'ultima', l:'Última rodada' }, { k:'tudo', l:'Todo o campeonato' }].map(({ k, l }) => (
              <button key={k} type="button" onClick={() => setResultsFilter(k)}
                style={{ fontSize:'0.8rem', padding:'0.25rem 0.65rem', borderRadius:20, cursor:'pointer',
                  background: resultsFilter === k ? 'var(--primary)' : 'var(--surface-2)',
                  color: resultsFilter === k ? '#000' : 'var(--text)',
                  border:`1px solid ${resultsFilter === k ? 'var(--primary)' : 'var(--border)'}`,
                  fontWeight: resultsFilter === k ? 700 : 400 }}>
                {l}
              </button>
            ))}
            {latestResultRodada && resultsFilter === 'ultima' && (
              <span className="muted" style={{ fontSize:'0.75rem' }}>({latestResultRodada})</span>
            )}
          </div>

          {!resultMatchesLoaded ? (
            <p className="muted">Carregando resultados…</p>
          ) : filteredResultMatches.length === 0 ? (
            <div className="card"><p className="muted">Nenhuma partida finalizada{resultsFilter === 'ultima' ? ' na última rodada' : ''}.</p></div>
          ) : selected.filter(Boolean).length === 0 ? (
            <div className="card"><p className="muted">Você ainda não tem jogadores escalados.</p></div>
          ) : (
            <div className="card" style={{ padding: '0.75rem 1rem' }}>
              <h3 style={{ fontSize:'0.88rem', marginBottom:'0.6rem' }}>
                {resultsFilter === 'ultima' ? `Escalação — ${latestResultRodada || 'Última rodada'}` : 'Escalação — Todo o campeonato'}
              </h3>
              <div style={{ display:'flex', flexDirection:'column', gap:'0.35rem' }}>
                {selected.filter(Boolean).map((pid) => {
                  const p   = players.find((x) => x.id === pid);
                  if (!p) return null;
                  const team = teamByIdMap[p.teamId];
                  const pts  = playerPoints[pid] ?? null;
                  const isCap = captainId === pid;
                  const posLabel = POSITION_LABELS[p.position] || p.position;
                  return (
                    <div key={pid} style={{ display:'flex', alignItems:'center', gap:'0.5rem',
                      background:'var(--bg)', borderRadius:8, padding:'0.4rem 0.6rem',
                      border: isCap ? '1px solid var(--primary)' : '1px solid transparent' }}>
                      {team?.shieldEmoji && <ShieldEmoji emoji={team.shieldEmoji} size="1.1rem" />}
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:600, fontSize:'0.85rem', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                          {isCap && <span style={{ color:'var(--primary)', marginRight:'0.2rem' }}>C</span>}
                          {p.name}
                        </div>
                        <div className="muted" style={{ fontSize:'0.7rem' }}>{posLabel}</div>
                      </div>
                      <div style={{ fontWeight:700, fontSize:'0.9rem',
                        color: pts === null ? 'var(--muted)' : pts > 0 ? 'var(--primary)' : pts < 0 ? '#ef4444' : 'var(--muted)' }}>
                        {pts === null ? '—' : `${pts > 0 ? '+' : ''}${Math.round(pts * 10) / 10} pts`}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Total */}
              {(() => {
                const total = selected.filter(Boolean).reduce((acc, pid) => acc + (playerPoints[pid] || 0), 0);
                return (
                  <div style={{ display:'flex', justifyContent:'flex-end', paddingTop:'0.5rem',
                    borderTop:'1px solid var(--border)', marginTop:'0.4rem' }}>
                    <span style={{ fontWeight:800, fontSize:'0.9rem' }}>
                      Total: <span style={{ color:'var(--primary)' }}>{Math.round(total * 10) / 10} pts</span>
                    </span>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </>
  );
}
