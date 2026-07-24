import TrophySVG from './TrophySVG';
import OlimfefLogo from './OlimfefLogo';
import ShieldEmoji from './ShieldEmoji';

export default function EventLogo({ event, size = 28, style }) {
  if (!event) return null;

  if (event.logoComponent === 'trophy') {
    return <TrophySVG size={size} style={style} />;
  }

  if (event.logoComponent === 'olimfef') {
    return <OlimfefLogo size={size} style={style} />;
  }

  if (event.logoEmoji) {
    return <ShieldEmoji emoji={event.logoEmoji} size={`${size}px`} style={style} />;
  }

  if (event.logoUrl) {
    return (
      <img
        src={event.logoUrl}
        alt={event.name}
        width={size}
        height={size}
        style={{ objectFit: 'contain', flexShrink: 0, ...style }}
      />
    );
  }

  return null;
}
