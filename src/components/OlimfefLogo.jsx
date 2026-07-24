import { useEffect } from 'react';

const EXTRUSION = Array.from({ length: 30 }, (_, i) =>
  `${-(i + 1)}px ${i + 1}px 0 #020921`
).join(', ') + ', -30px 30px 15px rgba(0,0,0,0.8)';

// Base natural: 240px wide × 100px tall com font-size 64px
const BASE_W = 240;
const BASE_H = 100;

export default function OlimfefLogo({ size = 40, style }) {
  // Carrega a fonte Barlow Condensed uma única vez
  useEffect(() => {
    if (document.getElementById('barlow-font')) return;
    const link = document.createElement('link');
    link.id = 'barlow-font';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@1,900&display=swap';
    document.head.appendChild(link);
  }, []);

  const scale = size / BASE_H;

  return (
    <div
      style={{
        width: BASE_W * scale,
        height: BASE_H * scale,
        overflow: 'hidden',
        flexShrink: 0,
        ...style,
      }}
    >
      <div
        style={{
          width: BASE_W,
          height: BASE_H,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            transform: 'rotate(-7deg)',
            fontFamily: "'Barlow Condensed', sans-serif",
          }}
        >
          {/* Texto principal */}
          <div
            style={{
              fontWeight: 900,
              fontStyle: 'italic',
              textTransform: 'uppercase',
              color: '#ffffff',
              fontSize: '64px',
              lineHeight: 1,
              letterSpacing: '-0.02em',
              textShadow: EXTRUSION,
              userSelect: 'none',
            }}
          >
            OLIMFEF
          </div>

          {/* Banner do ano */}
          <div
            style={{
              backgroundColor: '#020921',
              padding: '0.05em 1.2em',
              transform: 'skewX(-20deg)',
              marginTop: '-10px',
              boxShadow: '-8px 12px 18px rgba(0,0,0,0.6)',
            }}
          >
            <span
              style={{
                display: 'block',
                color: '#ffffff',
                fontSize: '30px',
                fontWeight: 900,
                fontStyle: 'italic',
                transform: 'skewX(20deg)',
                letterSpacing: '0.05em',
                userSelect: 'none',
              }}
            >
              2026
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
