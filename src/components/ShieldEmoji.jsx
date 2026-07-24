/**
 * Renders a team/event emoji.
 * Flag emojis (🇧🇷, 🇦🇷, …) are converted to <img> from flagcdn.com
 * because Windows does not render regional-indicator flag sequences.
 * All other emojis are rendered as text with the emoji font stack.
 */

function flagEmojiToUrl(emoji) {
  if (!emoji) return null;
  const points = [...emoji].map((c) => c.codePointAt(0));
  if (
    points.length === 2 &&
    points[0] >= 0x1f1e6 && points[0] <= 0x1f1ff &&
    points[1] >= 0x1f1e6 && points[1] <= 0x1f1ff
  ) {
    const cc = points.map((cp) => String.fromCharCode(cp - 0x1f1e6 + 65)).join('').toLowerCase();
    return `https://flagcdn.com/w40/${cc}.png`;
  }
  return null;
}

export default function ShieldEmoji({ emoji, size = '1.4em', className = '', style = {} }) {
  if (!emoji) return null;
  const url = flagEmojiToUrl(emoji);
  if (url) {
    return (
      <img
        src={url}
        alt={emoji}
        className={`shield-emoji-flag ${className}`}
        style={{ width: size, height: 'auto', verticalAlign: 'middle', display: 'inline-block', flexShrink: 0, ...style }}
        loading="lazy"
      />
    );
  }
  return (
    <span
      className={`emoji ${className}`}
      style={{ fontSize: size, lineHeight: 1, flexShrink: 0, ...style }}
    >
      {emoji}
    </span>
  );
}
