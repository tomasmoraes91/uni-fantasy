/**
 * CapitolaLogo — SVG fiel ao design oficial.
 * Linhas duplas brancas alinhadas ao topo e base visual do "C" verde.
 * viewBox 440×108 → escala livre via prop `height`.
 */
export default function CapitolaLogo({ onClick, height = 36 }) {
  return (
    <svg
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      aria-label="Capitola"
      viewBox="0 0 440 108"
      height={height}
      style={{ cursor: onClick ? 'pointer' : 'default', display: 'block' }}
    >
      {/* Fundo preto */}
      <rect width="440" height="108" fill="#000" />

      {/* ── Linhas duplas — esquerda ──
           Alinhadas ao topo (y=16,23) e base (y=92,99) do "C" */}
      <line x1="0" y1="16" x2="44" y2="16" stroke="#fff" strokeWidth="3" />
      <line x1="0" y1="23" x2="44" y2="23" stroke="#fff" strokeWidth="3" />
      <line x1="0" y1="92" x2="44" y2="92" stroke="#fff" strokeWidth="3" />
      <line x1="0" y1="99" x2="44" y2="99" stroke="#fff" strokeWidth="3" />

      {/* ── Letra C — verde neon, Arial Black ──
           baseline y=98, fontSize=100 → cap-top ≈ y=26 */}
      <text
        x="46" y="99"
        fontFamily="'Arial Black', 'Impact', Arial, sans-serif"
        fontWeight="900"
        fontSize="120"
        fill="#0ac35b"
      >C</text>

      {/* ── Linhas duplas — direita ── */}
      <line x1="132" y1="16" x2="440" y2="16" stroke="#fff" strokeWidth="3" />
      <line x1="132" y1="23" x2="440" y2="23" stroke="#fff" strokeWidth="3" />
      <line x1="132" y1="92" x2="440" y2="92" stroke="#fff" strokeWidth="3" />
      <line x1="132" y1="99" x2="440" y2="99" stroke="#fff" strokeWidth="3" />

      {/* ── "apitola" — centrado verticalmente entre as linhas ──
           centro das linhas internas: (23+92)/2 = 57.5
           baseline = 57.5 + cap-height/2 = 57.5 + 18.5 = 76 */}
      <text
        x="138" y="76"
        fontFamily="'Arial Black', 'Impact', Arial, sans-serif"
        fontWeight="900"
        fontSize="51"
        fill="#fff"
        letterSpacing="1"
      >apitola</text>
    </svg>
  );
}
