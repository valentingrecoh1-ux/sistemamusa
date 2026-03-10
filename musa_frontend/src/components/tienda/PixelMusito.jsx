/**
 * PixelMusito – Grid-based pixel art character sprite
 * Each character in a row maps to a palette color, rendered as merged SVG rects.
 * 14 px wide × 20 px tall base sprite, scaled via viewBox.
 *
 * Grid legend (14 chars per row):
 *   .  = transparent
 *   H/h/I = hat (dynamic per accessory)
 *   P/p   = hair (dynamic per outfit)
 *   T/t   = body (dynamic per outfit)
 *   S/s   = skin / skin shadow
 *   E/W   = eye / eye shine
 *   k/n   = cheek blush / nose
 *   M     = mouth
 *   C     = collar
 *   D     = pants
 *   R/r   = shoe / sole
 *   j     = jewel (corona)
 */

// ── Static palette ──────────────────────────────────────
const STATIC = {
  S: '#fbbf24', s: '#e5a800', n: '#d4a017', k: '#ff9966',
  E: '#1e1e1e', W: '#ffffff', M: '#92400e',
  C: '#e8e8e8', D: '#1e3a5f',
  R: '#dc2626', r: '#991b1b', j: '#ef4444',
};

// ── Grid parts (each row is exactly 14 chars) ──────────

const HATS = {
  default: ['...HHHHHH.....','..HHIHHHHH....','..HHHHHHHHh...','.HHHHHHHHHHh..'],
  boina:   ['..............','....HHHHHH....','...HIHHHHH....','..HHHHHHHHHh..'],
  chef:    ['...HHHHHHH....','....HIHHH.....','...HHHHHHH....','..HHHHHHHHHh..'],
  corona:  ['..H.HH.HH....','..HHHHHHHH....','..HjHHHHjH....','.HHHHHHHHHh...'],
};
const CHEF_TOP = ['.....HHHH.....', '....HIHHHH....'];

const FACE = ['.PpSSSSSSpP...', '.PSSSSSSSP....'];

const EYES = {
  open: ['.PSEWSSEWSP...', '.PSEESSEESP...'],
  shut: ['.PSSSSSSSP....', '.PSEESSEESP...'],
};

const CHEEK = '.PSkSnnSkSP...';

const MOUTHS = {
  normal: '..SSsMMsSS....',
  wide:   '..SsMMMMsS....',
  o:      '..SSSMMSSS....',
  none:   '..SSSSSSSS....',
};

const CHIN  = ['..SSSSSSSS....', '...SCCCCS.....'];
const TORSO = ['...TTTTTT.....', '..STTTTTTS....', '..STTTTTTS....', '...tTTTTt.....'];

const LEGS = {
  idle: ['...DDDDDD.....', '...DD..DD.....', '..RRR..RRR....', '..rrr..rrr....'],
  run1: ['...DDDDDD.....', '....DDDD......', '...RRRRRR.....', '...rrrrrr.....'],
  run2: ['...DDDDDD.....', '..DD....DD....', '.RRR....RRR...', '.rrr....rrr...'],
};

// ── Helpers ─────────────────────────────────────────────

function darken(hex, a = 0.2) {
  return '#' + [1, 3, 5].map(i =>
    Math.max(0, Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - a)))
      .toString(16).padStart(2, '0')
  ).join('');
}

function lighten(hex, a = 0.3) {
  return '#' + [1, 3, 5].map(i => {
    const v = parseInt(hex.slice(i, i + 2), 16);
    return Math.min(255, Math.round(v + (255 - v) * a))
      .toString(16).padStart(2, '0');
  }).join('');
}

function build(hat, eyes, mouth, legs) {
  return [...hat, ...FACE, ...eyes, CHEEK, mouth, ...CHIN, ...TORSO, ...legs];
}

/** Convert grid rows → <rect> elements with horizontal run-length merging */
function toRects(grid, pal, pfx, yOff = 0) {
  const out = [];
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === '.' || !pal[ch]) { x++; continue; }
      let w = 1;
      while (x + w < row.length && row[x + w] === ch) w++;
      out.push(
        <rect key={`${pfx}${x},${y}`} x={x} y={y + yOff} width={w} height={1} fill={pal[ch]} />
      );
      x += w;
    }
  }
  return out;
}

// ── Component ───────────────────────────────────────────

export default function PixelMusito({
  pose = 'idle', outfit = {}, facing = 'right', isRunning = false, size = 36,
}) {
  const hair = outfit.hair || '#7c3aed';
  const body = outfit.body || '#7c3aed';
  const acc  = outfit.accessory || null;

  // Build dynamic palette
  const hatBase = acc === 'boina' ? '#dc2626'
    : acc === 'chef' ? '#f5f5f5'
    : acc === 'corona' ? '#fbbf24'
    : hair;

  const pal = {
    ...STATIC,
    P: hair,    p: darken(hair),
    H: hatBase, h: darken(hatBase), I: lighten(hatBase),
    T: body,    t: darken(body),
  };

  // Select parts by state
  const hat   = HATS[acc] || HATS.default;
  const eyes  = pose === 'sleep' ? EYES.shut : EYES.open;
  const mouth = (pose === 'dance' || pose === 'celebrar') ? MOUTHS.wide
    : pose === 'dizzy' ? MOUTHS.o
    : pose === 'sleep' ? MOUTHS.none
    : MOUTHS.normal;

  // ViewBox adjusts for chef hat extra height
  const W = 14;
  const isChef = acc === 'chef';
  const viewH  = isChef ? 22 : 20;
  const viewY  = isChef ? -2 : 0;
  const h      = (size / W) * viewH;

  return (
    <svg
      width={size}
      height={h}
      viewBox={`0 ${viewY} ${W} ${viewH}`}
      style={{
        imageRendering: 'pixelated',
        transform: facing === 'left' ? 'scaleX(-1)' : undefined,
        overflow: 'visible',
      }}
    >
      {/* Chef hat puffy top (extra rows above y=0) */}
      {isChef && toRects(CHEF_TOP, pal, 'c', -2)}

      {/* Main sprite – idle or two alternating run frames */}
      {isRunning ? (
        <>
          <g className="runFrame1">
            {toRects(build(hat, eyes, mouth, LEGS.run1), pal, 'a')}
          </g>
          <g className="runFrame2">
            {toRects(build(hat, eyes, mouth, LEGS.run2), pal, 'b')}
          </g>
        </>
      ) : (
        toRects(build(hat, eyes, mouth, LEGS.idle), pal, 'i')
      )}

      {/* Glasses overlay for lentes accessory */}
      {acc === 'lentes' && (
        <g>
          <rect x="2.5" y="5.5" width="3" height="3" rx=".4"
            fill="none" stroke="#374151" strokeWidth=".5" />
          <rect x="6.5" y="5.5" width="3" height="3" rx=".4"
            fill="none" stroke="#374151" strokeWidth=".5" />
          <line x1="5.5" y1="7" x2="6.5" y2="7"
            stroke="#374151" strokeWidth=".4" />
        </g>
      )}
    </svg>
  );
}
