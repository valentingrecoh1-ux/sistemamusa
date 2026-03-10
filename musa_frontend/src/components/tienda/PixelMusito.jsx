/**
 * PixelMusito - SVG pixel art character sprite
 * Renders a retro RPG-style character using SVG rects
 * Each "pixel" is a rect in a 16x20 viewBox, scaled up with crisp edges
 */

const SKIN = '#fbbf24';
const SKIN_DARK = '#e5a800';
const EYE = '#1e1e1e';
const SHINE = '#ffffff';
const MOUTH = '#92400e';
const COLLAR = '#f0f0f0';
const PANTS = '#1e3a5f';
const SHOE = '#dc2626';
const SOLE = '#991b1b';

// Rect helper: [x, y, w, h]
function R(x, y, w, h, fill) {
  return <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} fill={fill} />;
}

function IdleLegs() {
  return (
    <g>
      {R(5, 14, 2, 3, PANTS)}{R(9, 14, 2, 3, PANTS)}
      {R(4, 17, 3, 1, SHOE)}{R(9, 17, 3, 1, SHOE)}
      {R(4, 18, 3, 1, SOLE)}{R(9, 18, 1, 1, SOLE)}{R(9, 18, 3, 1, SOLE)}
    </g>
  );
}

function RunFrame1() {
  return (
    <g>
      {/* Left leg forward, right leg back */}
      {R(4, 14, 2, 2, PANTS)}{R(3, 16, 2, 1, PANTS)}
      {R(9, 14, 2, 2, PANTS)}{R(10, 16, 2, 1, PANTS)}
      {R(2, 17, 3, 1, SHOE)}{R(10, 17, 3, 1, SHOE)}
      {R(2, 18, 3, 1, SOLE)}{R(10, 18, 3, 1, SOLE)}
    </g>
  );
}

function RunFrame2() {
  return (
    <g>
      {/* Right leg forward, left leg back */}
      {R(5, 14, 2, 2, PANTS)}{R(6, 16, 2, 1, PANTS)}
      {R(9, 14, 2, 2, PANTS)}{R(8, 16, 2, 1, PANTS)}
      {R(6, 17, 3, 1, SHOE)}{R(7, 17, 3, 1, SHOE)}
      {R(6, 18, 3, 1, SOLE)}{R(7, 18, 3, 1, SOLE)}
    </g>
  );
}

function Eyes({ pose }) {
  if (pose === 'sleep') {
    // Closed eyes (horizontal lines)
    return (
      <g>
        {R(5, 5, 2, 1, EYE)}{R(9, 5, 2, 1, EYE)}
      </g>
    );
  }
  if (pose === 'dizzy') {
    // X eyes
    return (
      <g>
        {R(5, 4, 1, 1, EYE)}{R(6, 5, 1, 1, EYE)}{R(5, 5, 1, 1, EYE)}{R(6, 4, 1, 1, EYE)}
        {R(9, 4, 1, 1, EYE)}{R(10, 5, 1, 1, EYE)}{R(9, 5, 1, 1, EYE)}{R(10, 4, 1, 1, EYE)}
      </g>
    );
  }
  // Normal eyes with shine
  return (
    <g>
      {R(5, 4, 2, 2, EYE)}{R(9, 4, 2, 2, EYE)}
      {R(6, 4, 1, 1, SHINE)}{R(10, 4, 1, 1, SHINE)}
    </g>
  );
}

function MouthShape({ pose }) {
  if (pose === 'dance' || pose === 'celebrar') {
    // Big smile
    return <>{R(6, 7, 4, 1, MOUTH)}{R(5, 7, 1, 1, SKIN_DARK)}{R(10, 7, 1, 1, SKIN_DARK)}</>;
  }
  if (pose === 'dizzy') {
    // O mouth
    return R(7, 7, 2, 1, MOUTH);
  }
  if (pose === 'sleep') {
    return null; // no visible mouth
  }
  // Normal mouth
  return R(6, 7, 4, 1, MOUTH);
}

function Accessory({ accessory, hairColor }) {
  if (accessory === 'boina') {
    return (
      <g>
        {R(4, 0, 8, 1, '#dc2626')}
        {R(3, 1, 10, 2, '#dc2626')}
        {R(5, 0, 2, 1, '#ef4444')} {/* highlight */}
      </g>
    );
  }
  if (accessory === 'lentes') {
    return (
      <g>
        {/* Glasses over eyes */}
        {R(4, 4, 3, 2, 'none')}
        <rect x="4" y="3.5" width="3" height="3" rx="0.5" fill="none" stroke="#374151" strokeWidth="0.8" />
        <rect x="9" y="3.5" width="3" height="3" rx="0.5" fill="none" stroke="#374151" strokeWidth="0.8" />
        <line x1="7" y1="4.5" x2="9" y2="4.5" stroke="#374151" strokeWidth="0.6" />
      </g>
    );
  }
  if (accessory === 'chef') {
    return (
      <g>
        {R(4, 0, 8, 1, '#f5f5f5')}
        {R(3, 1, 10, 1, '#f5f5f5')}
        {R(4, 0, 2, 1, '#e5e5e5')} {/* fold */}
        {R(3, 2, 10, 1, '#f5f5f5')}
        {R(5, -1, 6, 1, '#f5f5f5')} {/* poofy top */}
        {R(6, -2, 4, 1, '#f5f5f5')}
      </g>
    );
  }
  if (accessory === 'corona') {
    return (
      <g>
        {R(4, 1, 8, 2, '#fbbf24')}
        {R(4, 0, 2, 1, '#fbbf24')}{R(7, 0, 2, 1, '#fbbf24')}{R(10, 0, 2, 1, '#fbbf24')}
        {R(5, -1, 1, 1, '#fbbf24')}{R(8, -1, 1, 1, '#fbbf24')}{R(11, -1, 1, 1, '#fbbf24')}
        {R(6, 1, 1, 1, '#f59e0b')} {/* gem */}
        {R(9, 1, 1, 1, '#ef4444')} {/* gem */}
      </g>
    );
  }
  // Default hat
  return (
    <g>
      {R(5, 0, 6, 1, hairColor)}
      {R(4, 1, 8, 1, hairColor)}
      {R(4, 2, 9, 1, hairColor)} {/* brim extends right */}
    </g>
  );
}

export default function PixelMusito({ pose = 'idle', outfit = {}, facing = 'right', isRunning = false, size = 36 }) {
  const hairColor = outfit.hair || '#7c3aed';
  const bodyColor = outfit.body || '#7c3aed';
  const bodyDark = outfit.body ? `color-mix(in srgb, ${outfit.body} 80%, black)` : '#5b21b6';
  const accessory = outfit.accessory || null;

  const pixelH = 20; // increased if chef hat
  const viewH = accessory === 'chef' ? 22 : 20;
  const viewY = accessory === 'chef' ? -2 : 0;
  const height = (size / 16) * viewH;

  const scaleX = facing === 'left' ? -1 : 1;

  return (
    <svg
      width={size}
      height={height}
      viewBox={`0 ${viewY} 16 ${viewH}`}
      style={{
        imageRendering: 'pixelated',
        transform: `scaleX(${scaleX})`,
        overflow: 'visible',
      }}
    >
      {/* Hat / Accessory */}
      <Accessory accessory={accessory} hairColor={hairColor} />

      {/* Hair sides */}
      {R(3, 3, 2, 4, hairColor)}{R(11, 3, 2, 4, hairColor)}
      {/* Hair top peek under hat */}
      {R(4, 3, 1, 1, hairColor)}{R(11, 3, 1, 1, hairColor)}

      {/* Head / Face */}
      {R(4, 3, 8, 5, SKIN)}

      {/* Eyes */}
      <Eyes pose={pose} />

      {/* Nose */}
      {R(7, 6, 2, 1, SKIN_DARK)}

      {/* Mouth */}
      <MouthShape pose={pose} />

      {/* Collar */}
      {R(6, 8, 4, 1, COLLAR)}

      {/* Torso */}
      {R(5, 9, 6, 4, bodyColor)}

      {/* Arms */}
      <g className="arms">
        {R(3, 9, 2, 3, bodyColor)}
        {R(11, 9, 2, 3, bodyColor)}
        {/* Hands */}
        {R(3, 12, 2, 1, SKIN)}
        {R(11, 12, 2, 1, SKIN)}
      </g>

      {/* Pants top */}
      {R(5, 13, 6, 1, PANTS)}

      {/* Legs + Shoes - different based on running */}
      {isRunning ? (
        <>
          <g className="runFrame1"><RunFrame1 /></g>
          <g className="runFrame2"><RunFrame2 /></g>
        </>
      ) : (
        <IdleLegs />
      )}
    </svg>
  );
}
