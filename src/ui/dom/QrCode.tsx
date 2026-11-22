// A QR code drawn for scanning first, from the owner's Vorp design (the-wallpaper-project
// src/vorp/Pair.tsx, QrCode): dark ink modules on a paper plate, a quiet zone of 2.5 modules,
// error correction H (enough to carry the blob in its clear centre, about 22% of the width).
// Modules are squares at 0.88 of a module; the three finder eyes are rounded rings with a deep
// violet centre, still dark enough for any camera. Encoded by uqr (MIT).

import { useMemo } from 'react';
import { encode } from 'uqr';

import { Blobatar } from '../effects/vendor/blobatar/react';
import { BLOB_GLASS, BLOB_LOOK, BLOB_NAME, MOODS } from './blob';

const INK = '#0d0f11';
const PAPER = '#f5f3ee';
const EYE = '#3b2a8c';

export function QrCode({ text, size, label }: { text: string; size: number; label: string }) {
  const qr = useMemo(() => encode(text, { ecc: 'H', border: 0 }), [text]);
  const n = qr.size;
  const finder = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  // Leave the middle clear for the blob: about 22% of the width (well inside what level H recovers).
  const hole = Math.round(n * 0.22) | 1;
  const lo = (n - hole) / 2;
  const hi = lo + hole;
  const inHole = (r: number, c: number) => r >= lo - 0.5 && r < hi + 0.5 && c >= lo - 0.5 && c < hi + 0.5;
  const dots: string[] = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) if (qr.data[r][c] && !finder(r, c) && !inHole(r, c)) dots.push(`M${c + 0.06} ${r + 0.06}h.88v.88h-.88z`);
  const eye = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x + 0.5} y={y + 0.5} width={6} height={6} rx={1.9} fill="none" stroke={INK} strokeWidth={1} />
      <rect x={x + 2} y={y + 2} width={3} height={3} rx={0.9} fill={EYE} />
    </g>
  );
  const blob = (hole / (n + 5)) * size;
  return (
    <div className="vp-qr" style={{ width: size, height: size }}>
      <svg viewBox={`-2.5 -2.5 ${n + 5} ${n + 5}`} width={size} height={size} role="img" aria-label={label}>
        <rect x={-2.5} y={-2.5} width={n + 5} height={n + 5} rx={4} fill={PAPER} />
        <path d={dots.join('')} fill={INK} shapeRendering="crispEdges" />
        {eye(0, 0)}
        {eye(n - 7, 0)}
        {eye(0, n - 7)}
      </svg>
      <span className="vp-qr-blob vp-glass-blob" data-tint="rest" style={{ width: blob, height: blob }}>
        <Blobatar name={BLOB_NAME} {...BLOB_LOOK} defs={BLOB_GLASS} animate="always" expression={MOODS.happy} size={Math.round(blob * 0.86)} />
      </span>
    </div>
  );
}
