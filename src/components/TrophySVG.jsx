const stipples = [
  [102, 135, 0.8], [108, 142, 1.2], [112, 138, 0.8], [98, 150, 1.0],
  [105, 155, 1.5], [115, 152, 1.0], [110, 165, 1.2], [102, 170, 0.8],
  [108, 175, 1.5], [98, 185, 1.0], [112, 188, 1.0], [105, 195, 1.2],
  [100, 205, 1.5], [110, 210, 1.0], [106, 220, 1.2], [112, 225, 0.8],
  [102, 235, 1.0], [108, 240, 1.5], [115, 245, 1.0], [95, 240, 0.8],
  [118, 160, 0.9], [116, 178, 1.1], [100, 192, 0.8], [109, 130, 0.9],
  [104, 126, 1.1], [115, 142, 0.7],
];

export default function TrophySVG({ size = 40, style }) {
  const height = size * (350 / 200);
  return (
    <svg
      viewBox="0 0 200 350"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={height}
      style={style}
      aria-hidden="true"
    >
      <defs>
        <clipPath id="globe-clip">
          <circle cx="100" cy="70" r="48" />
        </clipPath>
      </defs>

      {/* Globo */}
      <g id="globe">
        <circle cx="100" cy="70" r="48" fill="#FBE28F" />
        <circle cx="90" cy="55" r="38" fill="#FDF1B8" clipPath="url(#globe-clip)" />
        <circle cx="100" cy="70" r="48" fill="none" stroke="#E4B560" strokeWidth="3.5" />
      </g>

      {/* Corpo */}
      <g id="body">
        <path
          d="M 70 250 Q 50 170 35 75 L 55 105 C 70 130, 90 120, 105 105 L 125 100 L 145 55 Q 140 150, 130 250 Z"
          fill="#EFC372"
        />
        <path
          d="M 130 250 L 95 250 C 105 180, 115 120, 125 100 Q 140 150, 130 250 Z"
          fill="#C69B53"
        />
        <g fill="#BA8E42">
          {stipples.map(([cx, cy, r], i) => (
            <circle key={i} cx={cx} cy={cy} r={r} />
          ))}
        </g>
        <path
          d="M 70 250 Q 50 170 35 75 L 55 105 C 70 130, 90 120, 105 105 L 125 100 L 145 55 Q 140 150, 130 250 Z"
          fill="none"
          stroke="#BA8E42"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        <path
          d="M 55 105 Q 75 180, 95 250"
          fill="none"
          stroke="#BA8E42"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <ellipse
          cx="112" cy="95"
          rx="10" ry="15"
          fill="#EFC372"
          stroke="#BA8E42"
          strokeWidth="3.5"
        />
      </g>

      {/* Base */}
      <g id="base">
        <polygon
          points="70,250 130,250 140,285 60,285"
          fill="#91CBA0"
          stroke="#54936B"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        <polygon
          points="60,285 140,285 150,315 50,315"
          fill="#91CBA0"
          stroke="#54936B"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        <line x1="80" y1="300" x2="95" y2="300" stroke="#54936B" strokeWidth="3.5" strokeLinecap="round" />
        <line x1="105" y1="300" x2="120" y2="300" stroke="#54936B" strokeWidth="3.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}
