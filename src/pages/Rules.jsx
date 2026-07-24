import { useState } from 'react';
import { SPORT_LABELS } from '../utils/labels';
import { useEvent } from '../context/EventContext';

// Pontuação compartilhada futebol amador / futsal
const FOOTBALL_AMATEUR_SCORING = [
  { action: '⚽ Gol do jogador',       pts: '+8' },
  { action: '📈 Gol marcado pelo time', pts: '+1' },
  { action: '📉 Gol sofrido pelo time', pts: '−1' },
  { action: '🟨 Cartão amarelo',        pts: '−1' },
  { action: '🟥 Cartão vermelho',        pts: '−3' },
  { action: '👑 Capitão',               pts: '×2 tudo' },
];

const RULES = {
  basketball: {
    squad: '1 Armador + 1 Ala-Armador + 1 Ala (3 jogadores)',
    scoring: [
      { action: '🏀 Ponto marcado',         pts: '+1' },
      { action: '🚫 Falta',                 pts: '−1' },
      { action: '🏆 Diferença de pontos',   pts: '+ diferença (vitória)' },
      { action: '😞 Diferença de pontos',   pts: '− diferença (derrota)' },
      { action: '👑 Capitão',                pts: '×2 tudo' },
    ],
  },
  handball: {
    squad: '1 Goleiro + 6 Linha (7 jogadores)',
    scoring: [
      { action: '🤾 Gol',                pts: '+4' },
      { action: '⏱️ Advertência (2 min)', pts: '−3' },
      { action: '🏆 Saldo de gols',    pts: '+ saldo (vitória)' },
      { action: '😞 Saldo de gols',    pts: '− saldo (derrota)' },
      { action: '👑 Capitão',           pts: '×2 tudo' },
    ],
  },
  volleyball: {
    squad: '1 Levantador + 1 Oposto + 2 Ponteiros + 2 Centrais (6 jogadores)',
    scoring: [
      { action: '🏐 Vitória 2 × 0', pts: '+5' },
      { action: '🏐 Vitória 2 × 1', pts: '+3' },
      { action: '😞 Derrota 1 × 2', pts: '−3' },
      { action: '😞 Derrota 0 × 2', pts: '−5' },
      { action: '👑 Capitão',        pts: '×2 tudo' },
    ],
  },
};

const FUTEBOL_PRO_SCORING = [
  { action: '⚽ Gol',                          pts: '+8.0' },
  { action: '🎯 Assistência',                  pts: '+5.0' },
  { action: '🏃 Finalização na trave',         pts: '+3.0' },
  { action: '🧤 Finalização defendida',        pts: '+1.2' },
  { action: '💨 Finalização para fora',        pts: '+0.8' },
  { action: '🦵 Falta sofrida',               pts: '+0.5' },
  { action: '🎯 Pênalti sofrido',              pts: '+1.0' },
  { action: '❌ Pênalti perdido',              pts: '−4.0' },
  { action: '🚩 Impedimento',                  pts: '−0.1' },
  { action: '💪 Desarme',                      pts: '+1.5' },
  { action: '😞 Gol contra',                   pts: '−3.0' },
  { action: '🟨 Cartão amarelo',               pts: '−1.0' },
  { action: '🟥 Cartão vermelho',               pts: '−3.0' },
  { action: '🦶 Falta cometida',               pts: '−0.3' },
  { action: '🚫 Pênalti cometido',             pts: '−1.0' },
  { action: '🧤 Defesa de pênalti (GK)',       pts: '+7.0' },
  { action: '🏆 Jogo sem gols — Clean Sheet (GK)', pts: '+5.0' },
  { action: '🙌 Defesa (GK)',                  pts: '+1.3' },
  { action: '😔 Gol sofrido (GK)',              pts: '−1.0' },
];

// Pontuação de palpites por fase (mantém igual a scoring.js PREDICTION_POINTS_BY_PHASE)
const PREDICTION_PHASES = [
  { phase: '1ª Fase (rodadas 1, 2 e 3)', exact: 9,   winner: 4,  partialWinner: 5,   partialNoWinner: 1  },
  { phase: '16 avos de final',           exact: 27,  winner: 12, partialWinner: 15,  partialNoWinner: 3  },
  { phase: 'Oitavas de final',           exact: 36,  winner: 16, partialWinner: 20,  partialNoWinner: 4  },
  { phase: 'Quartas de final',           exact: 45,  winner: 20, partialWinner: 25,  partialNoWinner: 5  },
  { phase: 'Semifinal',                  exact: 90,  winner: 40, partialWinner: 50,  partialNoWinner: 10 },
  { phase: 'Disputa de 3º/4º',           exact: 18,  winner: 8,  partialWinner: 10,  partialNoWinner: 2  },
  { phase: 'Final',                      exact: 180, winner: 80, partialWinner: 100, partialNoWinner: 20 },
];

const EVENT_PREDICTION_RULES = [
  { action: '🥇 Campeão',    pts: '+50' },
  { action: '🥈 Vice-campeão', pts: '+30' },
  { action: '🥉 3º lugar',    pts: '+15' },
  { action: '4º lugar',       pts: '+10' },
  { action: '⚽ Artilheiro',  pts: '+20' },
];

export default function Rules() {
  const [tab, setTab] = useState('how');
  const { currentEvent } = useEvent();

  // Mostra só as modalidades do evento atual (sem evento → mostra todas)
  const mods  = currentEvent?.modalidades || [];
  const isPro = currentEvent?.type === 'profissional';
  const showSport = (s) => mods.length === 0 || mods.includes(s);
  const showFut   = showSport('futebol') || showSport('futsal');

  return (
    <>
      <h1>📘 Regras e Tutorial</h1>
      <p className="page-subtitle">Aprenda como jogar e como os pontos são calculados.</p>

      <div className="tabs mb-2">
        {[
          { key:'how',     label:'Como jogar' },
          { key:'leagues', label:'Ligas' },
          { key:'fantasy', label:'Pontuação do fantasy' },
          { key:'bolao',   label:'Pontuação do bolão' },
        ].map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'how' && (
        <>
          <div className="rules-section">
            <h2>🎯 Objetivo</h2>
            <p>Monte o melhor time de jogadores e faça palpites nas partidas para acumular pontos. O jogador com mais pontos ao final do evento vence.</p>
          </div>

          <div className="rules-section">
            <h2>📋 Passo a passo</h2>
            <div className="rules-steps">
              {[
                { n:'1', title:'Entre em um evento', desc:'Na tela inicial, selecione o evento em que deseja participar.' },
                { n:'2', title:'Monte seu time', desc:'Vá em "Meu Time" e escolha jogadores para cada modalidade. Cada esporte tem um número diferente de jogadores.' },
                { n:'3', title:'Defina um capitão', desc:'Clique em "Definir C" no jogador escolhido. O capitão recebe o dobro dos pontos fantasy.' },
                { n:'4', title:'Faça palpites', desc:'Em "Partidas", informe o placar que você acha que vai acontecer. Você pode palpitar até o início da partida.' },
                { n:'5', title:'Acompanhe o ranking', desc:'Conforme os resultados saem, seu ranking atualiza automaticamente.' },
              ].map((s) => (
                <div key={s.n} className="rules-step">
                  <div className="rules-step-num">{s.n}</div>
                  <div>
                    <div className="rules-step-title">{s.title}</div>
                    <div className="rules-step-desc">{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rules-section">
            <h2>⚠️ Regras gerais</h2>
            <ul className="rules-list">
              {/* Limite "flat" por time só faz sentido fora da Copa (que usa limite
                  por fase). Some quando o evento é só futebol. */}
              {(mods.length === 0 || mods.some((m) => m !== 'futebol')) && (
                <li>Máximo de 2 jogadores do mesmo time (exceto handebol e vôlei: máximo 3).</li>
              )}
              <li>Seu time só pode ser alterado antes das partidas começarem.</li>
              <li>Pontos são recalculados automaticamente após cada resultado ser lançado.</li>
              <li>O capitão recebe o dobro dos pontos fantasy. Escolha bem!</li>
            </ul>
          </div>
        </>
      )}

      {tab === 'leagues' && (
        <>
          <div className="rules-section">
            <h2>🏆 O que são as Ligas?</h2>
            <p>As ligas permitem criar grupos privados para competir com amigos, colegas ou qualquer grupo que você queira. O ranking da liga é independente do ranking geral do evento.</p>
          </div>

          <div className="rules-section">
            <h2>📋 Como funciona</h2>
            <div className="rules-steps">
              {[
                {
                  n: '1',
                  title: 'Criar a liga',
                  desc: 'Vá em "Ligas" no menu e clique em "+ Criar liga". Dê um nome para a sua liga.',
                },
                {
                  n: '2',
                  title: 'Compartilhar o link',
                  desc: 'Após criar, um link de convite é gerado automaticamente. Envie para quem você quer convidar.',
                },
                {
                  n: '3',
                  title: 'Convidado entra com o código',
                  desc: 'O convidado acessa "Ligas", clica em "Entrar com código" e digita o código recebido.',
                },
                {
                  n: '4',
                  title: 'Competir',
                  desc: 'Com todos dentro, o ranking da liga atualiza automaticamente conforme os resultados das partidas do evento.',
                },
              ].map((s) => (
                <div key={s.n} className="rules-step">
                  <div className="rules-step-num">{s.n}</div>
                  <div>
                    <div className="rules-step-title">{s.title}</div>
                    <div className="rules-step-desc">{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rules-section">
            <h2>⚠️ Regras das Ligas</h2>
            <ul className="rules-list">
              <li>Cada usuário pode <strong>criar apenas 1 liga</strong>.</li>
              <li>Você pode <strong>participar de várias ligas</strong> de outros usuários.</li>
              <li>O criador pode remover membros a qualquer momento.</li>
              <li>Uma liga está vinculada a um evento — participantes precisam estar no mesmo evento.</li>
            </ul>
          </div>
        </>
      )}

      {tab === 'fantasy' && (
        <>
          {/* Futebol de Campo / Futsal — seção combinada (amador) */}
          {showFut && !isPro && (
          <div className="rules-section">
            <h2>⚽ Futebol de Campo / Futsal <span className="muted" style={{ fontSize: '0.75rem', marginLeft: '0.5rem', fontWeight: 400 }}>Amador</span></h2>
            <p className="muted rules-squad">
              👥 Futebol: 1 GK · 2 LAT · 2 ZAG · 3 MCM · 3 ATA (11 jogadores) &nbsp;|&nbsp;
              Futsal: 1 GK · 1 FIX · 2 ALA · 1 PIV (5 jogadores)
            </p>
            <table className="rules-table">
              <thead><tr><th>Ação</th><th>Pontos</th></tr></thead>
              <tbody>
                {FOOTBALL_AMATEUR_SCORING.map((s) => (
                  <tr key={s.action}><td>{s.action}</td><td className="rules-pts">{s.pts}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          )}

          {/* Demais modalidades amadoras — só as presentes no evento */}
          {Object.entries(RULES).filter(([sport]) => showSport(sport)).map(([sport, r]) => (
            <div key={sport} className="rules-section">
              <h2>
                {SPORT_LABELS[sport] || sport}
                {sport === 'basketball' && ' 3×3'}
                <span className="muted" style={{ fontSize: '0.75rem', marginLeft: '0.5rem', fontWeight: 400 }}>Amador</span>
              </h2>
              <p className="muted rules-squad">👥 Escalação: {r.squad}</p>
              <table className="rules-table">
                <thead><tr><th>Ação</th><th>Pontos</th></tr></thead>
                <tbody>
                  {r.scoring.map((s) => (
                    <tr key={s.action}><td>{s.action}</td><td className="rules-pts">{s.pts}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {/* Futebol Profissional */}
          {showSport('futebol') && isPro && (
          <div className="rules-section">
            <h2>⚽ Futebol <span className="muted" style={{ fontSize: '0.75rem', marginLeft: '0.5rem', fontWeight: 400 }}>Profissional</span></h2>
            <p className="muted rules-squad">Aplicado em eventos do tipo "Profissional". Escalação: 11 jogadores.</p>
            <table className="rules-table">
              <thead><tr><th>Ação</th><th>Pontos</th></tr></thead>
              <tbody>
                {FUTEBOL_PRO_SCORING.map((s) => (
                  <tr key={s.action}><td>{s.action}</td><td className="rules-pts">{s.pts}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </>
      )}

      {tab === 'bolao' && (
        <>
          <div className="rules-section">
            <h2>🔮 Palpites de partidas</h2>
            <p className="muted" style={{ fontSize: '0.82rem', marginBottom: '0.5rem' }}>
              A pontuação cresce conforme a fase do campeonato. Em cada partida vale a melhor categoria atingida:
            </p>
            <ul className="rules-list" style={{ fontSize: '0.82rem', marginBottom: '0.75rem' }}>
              <li><strong>Placar exato</strong>: acertou os dois placares.</li>
              <li><strong>Placar parcial + vencedor</strong>: acertou o placar de um time E quem venceu (ou empate).</li>
              <li><strong>Vencedor</strong>: acertou só quem venceu (ou empate).</li>
              <li><strong>Placar parcial</strong>: acertou o placar de um time, mas errou o vencedor.</li>
            </ul>
            <div style={{ overflowX: 'auto' }}>
              <table className="rules-table">
                <thead>
                  <tr>
                    <th>Fase</th>
                    <th style={{ textAlign: 'right' }}>Exato</th>
                    <th style={{ textAlign: 'right' }}>Parcial+Venc.</th>
                    <th style={{ textAlign: 'right' }}>Vencedor</th>
                    <th style={{ textAlign: 'right' }}>Parcial</th>
                  </tr>
                </thead>
                <tbody>
                  {PREDICTION_PHASES.map((r) => (
                    <tr key={r.phase}>
                      <td>{r.phase}</td>
                      <td className="rules-pts">{r.exact}</td>
                      <td className="rules-pts">{r.partialWinner}</td>
                      <td className="rules-pts">{r.winner}</td>
                      <td className="rules-pts">{r.partialNoWinner}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted" style={{ fontSize: '0.78rem', marginTop: '0.5rem' }}>
              ⏰ O palpite de cada partida fecha 1 hora antes do início dela.
            </p>
          </div>

          <div className="rules-section">
            <h2>🏆 Palpites antecipados (campeonato)</h2>
            <p className="muted" style={{ fontSize: '0.82rem', marginBottom: '0.5rem' }}>
              Aposte antes do início do campeonato em quem vai longe. Bônus por acerto:
            </p>
            <table className="rules-table">
              <thead><tr><th>Aposta</th><th>Pontos</th></tr></thead>
              <tbody>
                {EVENT_PREDICTION_RULES.map((r) => (
                  <tr key={r.action}><td>{r.action}</td><td className="rules-pts">{r.pts}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
