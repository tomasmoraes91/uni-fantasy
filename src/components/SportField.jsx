/**
 * SportField — quadra SVG específica por modalidade.
 * Leve, inline, sem dependências externas.
 */

function FutsalField() {
  return (
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" className="sport-field-svg">
      {/* Gramado */}
      <rect width="320" height="200" fill="#1a5c2a" rx="4"/>
      {/* Linhas externas */}
      <rect x="6" y="6" width="308" height="188" fill="none" stroke="#fff" strokeWidth="2" rx="2"/>
      {/* Linha do meio */}
      <line x1="160" y1="6" x2="160" y2="194" stroke="#fff" strokeWidth="1.5"/>
      {/* Círculo central */}
      <circle cx="160" cy="100" r="30" fill="none" stroke="#fff" strokeWidth="1.5"/>
      <circle cx="160" cy="100" r="2" fill="#fff"/>
      {/* Área esquerda */}
      <rect x="6" y="60" width="50" height="80" fill="none" stroke="#fff" strokeWidth="1.5"/>
      {/* Pequena área esquerda */}
      <rect x="6" y="78" width="20" height="44" fill="none" stroke="#fff" strokeWidth="1"/>
      {/* Área direita */}
      <rect x="264" y="60" width="50" height="80" fill="none" stroke="#fff" strokeWidth="1.5"/>
      {/* Pequena área direita */}
      <rect x="294" y="78" width="20" height="44" fill="none" stroke="#fff" strokeWidth="1"/>
      {/* Goleiras */}
      <rect x="2" y="82" width="4" height="36" fill="none" stroke="#fff" strokeWidth="1.5"/>
      <rect x="314" y="82" width="4" height="36" fill="none" stroke="#fff" strokeWidth="1.5"/>
    </svg>
  );
}

function BasketField() {
  return (
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" className="sport-field-svg">
      {/* Piso */}
      <rect width="320" height="200" fill="#7c3d12" rx="4"/>
      {/* Linhas externas */}
      <rect x="6" y="6" width="308" height="188" fill="none" stroke="#fff" strokeWidth="2" rx="2"/>
      {/* Linha do meio */}
      <line x1="160" y1="6" x2="160" y2="194" stroke="#fff" strokeWidth="1.5"/>
      {/* Círculo central */}
      <circle cx="160" cy="100" r="28" fill="none" stroke="#fff" strokeWidth="1.5"/>
      {/* Área garrafão esquerda */}
      <rect x="6" y="58" width="70" height="84" fill="rgba(255,255,255,0.07)" stroke="#fff" strokeWidth="1.5"/>
      {/* Arco 3 pontos esquerda */}
      <path d="M 6 55 A 80 80 0 0 1 6 145" fill="none" stroke="#fff" strokeWidth="1.5"/>
      {/* Tabela esquerda */}
      <rect x="6" y="80" width="12" height="40" fill="none" stroke="#fff" strokeWidth="1.5"/>
      {/* Aro esquerdo */}
      <circle cx="48" cy="100" r="8" fill="none" stroke="#ff8c00" strokeWidth="2"/>
      {/* Área garrafão direita */}
      <rect x="244" y="58" width="70" height="84" fill="rgba(255,255,255,0.07)" stroke="#fff" strokeWidth="1.5"/>
      {/* Arco 3 pontos direita */}
      <path d="M 314 55 A 80 80 0 0 0 314 145" fill="none" stroke="#fff" strokeWidth="1.5"/>
      {/* Tabela direita */}
      <rect x="302" y="80" width="12" height="40" fill="none" stroke="#fff" strokeWidth="1.5"/>
      {/* Aro direito */}
      <circle cx="272" cy="100" r="8" fill="none" stroke="#ff8c00" strokeWidth="2"/>
    </svg>
  );
}

function VolleyField() {
  return (
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" className="sport-field-svg">
      {/* Quadra */}
      <rect width="320" height="200" fill="#1e3a7a" rx="4"/>
      {/* Área de jogo */}
      <rect x="6" y="6" width="308" height="188" fill="none" stroke="#fff" strokeWidth="2" rx="2"/>
      {/* Rede central */}
      <line x1="160" y1="6" x2="160" y2="194" stroke="#fff" strokeWidth="3"/>
      {/* Linhas de ataque */}
      <line x1="100" y1="6" x2="100" y2="194" stroke="#fff" strokeWidth="1" strokeDasharray="6,4"/>
      <line x1="220" y1="6" x2="220" y2="194" stroke="#fff" strokeWidth="1" strokeDasharray="6,4"/>
      {/* Antenas da rede */}
      <line x1="160" y1="6"  x2="160" y2="22"  stroke="#ff4444" strokeWidth="3"/>
      <line x1="160" y1="178" x2="160" y2="194" stroke="#ff4444" strokeWidth="3"/>
      {/* Zonas de serviço */}
      <line x1="6"   y1="100" x2="30"  y2="100" stroke="#fff" strokeWidth="1"/>
      <line x1="290" y1="100" x2="314" y2="100" stroke="#fff" strokeWidth="1"/>
    </svg>
  );
}

function HandballField() {
  return (
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" className="sport-field-svg">
      {/* Gramado */}
      <rect width="320" height="200" fill="#2d5a1e" rx="4"/>
      {/* Linhas externas */}
      <rect x="6" y="6" width="308" height="188" fill="none" stroke="#fff" strokeWidth="2" rx="2"/>
      {/* Linha do meio */}
      <line x1="160" y1="6" x2="160" y2="194" stroke="#fff" strokeWidth="1.5"/>
      {/* Ponto central */}
      <circle cx="160" cy="100" r="2" fill="#fff"/>
      {/* Área de 6m esquerda */}
      <path d="M 6 55 Q 80 55 80 100 Q 80 145 6 145" fill="rgba(255,255,255,0.1)" stroke="#fff" strokeWidth="1.5" fill="none"/>
      {/* Linha 9m esquerda (tracejada) */}
      <path d="M 6 35 Q 110 35 110 100 Q 110 165 6 165" fill="none" stroke="#fff" strokeWidth="1" strokeDasharray="8,5"/>
      {/* Goleira esquerda */}
      <rect x="2" y="78" width="10" height="44" fill="none" stroke="#fff" strokeWidth="2"/>
      {/* Área de 6m direita */}
      <path d="M 314 55 Q 240 55 240 100 Q 240 145 314 145" fill="none" stroke="#fff" strokeWidth="1.5"/>
      {/* Linha 9m direita (tracejada) */}
      <path d="M 314 35 Q 210 35 210 100 Q 210 165 314 165" fill="none" stroke="#fff" strokeWidth="1" strokeDasharray="8,5"/>
      {/* Goleira direita */}
      <rect x="308" y="78" width="10" height="44" fill="none" stroke="#fff" strokeWidth="2"/>
    </svg>
  );
}

function FutebolField() {
  return (
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" className="sport-field-svg">
      {/* Gramado */}
      <rect width="320" height="200" fill="#0a5c1e" rx="4"/>
      {/* Linhas externas */}
      <rect x="6" y="6" width="308" height="188" fill="none" stroke="#fff" strokeWidth="2" rx="2"/>
      {/* Linha do meio */}
      <line x1="160" y1="6" x2="160" y2="194" stroke="#fff" strokeWidth="1.5"/>
      {/* Círculo central */}
      <circle cx="160" cy="100" r="32" fill="none" stroke="#fff" strokeWidth="1.5"/>
      <circle cx="160" cy="100" r="2" fill="#fff"/>
      {/* Grande área esquerda */}
      <rect x="6" y="46" width="52" height="108" fill="none" stroke="#fff" strokeWidth="1.5"/>
      {/* Pequena área esquerda */}
      <rect x="6" y="70" width="20" height="60" fill="none" stroke="#fff" strokeWidth="1"/>
      {/* Arco grande área esquerda */}
      <path d="M 58 80 A 30 30 0 0 1 58 120" fill="none" stroke="#fff" strokeWidth="1.5"/>
      {/* Pênalti esquerdo */}
      <circle cx="46" cy="100" r="2" fill="#fff"/>
      {/* Goleira esquerda */}
      <rect x="2" y="84" width="4" height="32" fill="none" stroke="#fff" strokeWidth="1.5"/>
      {/* Grande área direita */}
      <rect x="262" y="46" width="52" height="108" fill="none" stroke="#fff" strokeWidth="1.5"/>
      {/* Pequena área direita */}
      <rect x="294" y="70" width="20" height="60" fill="none" stroke="#fff" strokeWidth="1"/>
      {/* Arco grande área direita */}
      <path d="M 262 80 A 30 30 0 0 0 262 120" fill="none" stroke="#fff" strokeWidth="1.5"/>
      {/* Pênalti direito */}
      <circle cx="274" cy="100" r="2" fill="#fff"/>
      {/* Goleira direita */}
      <rect x="314" y="84" width="4" height="32" fill="none" stroke="#fff" strokeWidth="1.5"/>
      {/* Cantos */}
      <path d="M 6 6 A 8 8 0 0 1 14 14" fill="none" stroke="#fff" strokeWidth="1"/>
      <path d="M 314 6 A 8 8 0 0 0 306 14" fill="none" stroke="#fff" strokeWidth="1"/>
      <path d="M 6 194 A 8 8 0 0 0 14 186" fill="none" stroke="#fff" strokeWidth="1"/>
      <path d="M 314 194 A 8 8 0 0 1 306 186" fill="none" stroke="#fff" strokeWidth="1"/>
    </svg>
  );
}

const FIELDS = { futebol: FutebolField, futsal: FutsalField, basketball: BasketField, volleyball: VolleyField, handball: HandballField };

export default function SportField({ sport }) {
  const Field = FIELDS[sport] || FutsalField;
  return (
    <div className="sport-field-wrapper">
      <Field />
    </div>
  );
}
