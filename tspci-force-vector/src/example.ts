// The example drawing (data-background empty): a lamp hanging from the ceiling, 560 × 400 pixels, 14 × 10 cm at
// 40 pixels per cm. The centre of gravity of the lamp, point P, is at (7, 4.75) cm = (280, 190) px; the PCI draws P.

export const EXAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 400" width="560" height="400">
  <defs>
    <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f8fafc"/><stop offset="1" stop-color="#eef2f7"/>
    </linearGradient>
    <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#0f766e"/><stop offset="0.5" stop-color="#14b8a6"/><stop offset="1" stop-color="#0f766e"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0" r="1">
      <stop offset="0" stop-color="#fef3c7" stop-opacity="0.9"/><stop offset="1" stop-color="#fef3c7" stop-opacity="0"/>
    </radialGradient>
    <pattern id="hatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="12" stroke="#94a3b8" stroke-width="2"/>
    </pattern>
  </defs>
  <rect width="560" height="400" fill="url(#wall)"/>
  <path d="M190 225 L370 225 L470 400 L90 400 Z" fill="url(#glow)"/>
  <rect x="0" y="0" width="560" height="26" fill="url(#hatch)"/>
  <rect x="0" y="26" width="560" height="4" fill="#64748b"/>
  <rect x="262" y="30" width="36" height="8" rx="2" fill="#475569"/>
  <line x1="280" y1="38" x2="280" y2="152" stroke="#334155" stroke-width="3"/>
  <rect x="272" y="148" width="16" height="12" rx="2" fill="#475569"/>
  <path d="M258 160 L302 160 L340 222 L220 222 Z" fill="url(#shade)" stroke="#115e59" stroke-width="2" stroke-linejoin="round"/>
  <path d="M220 222 L340 222" stroke="#99f6e4" stroke-width="3" stroke-linecap="round"/>
  <ellipse cx="280" cy="226" rx="16" ry="10" fill="#fde68a" stroke="#f59e0b" stroke-width="1.5"/>
</svg>`;
