// The pictures of the sound source and the listener, drawn here as SVG (viewBox 0 0 64 64, facing right). The 2D view
// puts them in the page; the 3D view draws them on a sprite. No imports.

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="256" height="256">${body}</svg>`;

export const SOURCE_SVG: Record<string, string> = {
  speaker: svg(`
    <rect x="14" y="6" width="34" height="52" rx="5" fill="#334155"/>
    <rect x="17" y="9" width="28" height="46" rx="3" fill="#475569"/>
    <circle cx="31" cy="20" r="6" fill="#1e293b"/><circle cx="31" cy="20" r="3.2" fill="#94a3b8"/>
    <circle cx="31" cy="40" r="11" fill="#1e293b"/><circle cx="31" cy="40" r="7.5" fill="#64748b"/>
    <circle cx="31" cy="40" r="3.5" fill="#cbd5e1"/>
    <rect x="18" y="56" width="6" height="4" rx="1" fill="#1e293b"/><rect x="38" y="56" width="6" height="4" rx="1" fill="#1e293b"/>`),
  walrus: svg(`
    <path d="M6 54c0-14 6-26 20-30 8-2 16 0 22 6 6 5 8 12 8 24z" fill="#8b5e3c"/>
    <path d="M10 54c2-4 6-6 10-5l-2 5z M50 54c-2-4-1-7 3-8l3 8z" fill="#6b4226"/>
    <circle cx="40" cy="28" r="13" fill="#a0704b"/>
    <circle cx="36" cy="22" r="2" fill="#1f1308"/><circle cx="46" cy="22" r="2" fill="#1f1308"/>
    <ellipse cx="41" cy="32" rx="9" ry="6" fill="#c89a72"/>
    <circle cx="36.5" cy="31" r="1" fill="#6b4226"/><circle cx="41" cy="30" r="1" fill="#6b4226"/><circle cx="45.5" cy="31" r="1" fill="#6b4226"/>
    <path d="M36 36l-1.5 14 3.5-1 1-13z M46 36l1.5 14-3.5-1-1-13z" fill="#fffbeb" stroke="#d6c7a1" stroke-width=".6"/>`),
  whale: svg(`
    <path d="M4 38c0-12 12-20 28-20 14 0 24 8 26 18 1 6-3 12-12 14-12 3-26 2-34-2-5-2-8-5-8-10z" fill="#2563eb"/>
    <path d="M10 44c8 4 22 5 34 2 6-1 10-4 12-8-2 8-10 12-20 13-10 1-20-1-26-7z" fill="#bfdbfe"/>
    <path d="M6 36L0 26l9 4z M6 36L0 44l9-4z" fill="#1d4ed8"/>
    <circle cx="46" cy="32" r="2" fill="#0f172a"/>
    <path d="M40 16c0-4-2-8-6-10M40 16c0-4 2-8 6-10M40 16v-8" fill="none" stroke="#7dd3fc" stroke-width="2" stroke-linecap="round"/>`),
  bird: svg(`
    <path d="M14 30c0-10 8-16 18-16s16 8 16 16c0 12-10 20-20 20-8 0-14-8-14-20z" fill="#f59e0b"/>
    <path d="M18 34c4 8 14 10 22 4-4 8-16 10-22-4z" fill="#fde68a"/>
    <path d="M14 30c-6 2-10 8-10 14 6-2 10-6 12-10z" fill="#d97706"/>
    <circle cx="38" cy="24" r="2.4" fill="#1c1917"/>
    <path d="M46 26l10-2-9 6z" fill="#ea580c"/>
    <path d="M26 50l-2 8M32 50l2 8" stroke="#78350f" stroke-width="2" stroke-linecap="round"/>
    <path d="M54 12v8.5a2.5 2.5 0 1 1-1.5-2.3V12z" fill="#0f766e"/>`),
  dog: svg(`
    <path d="M12 58c0-12 6-20 18-20s18 8 18 20z" fill="#b45309"/>
    <circle cx="32" cy="28" r="16" fill="#d97706"/>
    <path d="M17 16c-6 2-8 12-5 20 4 0 7-6 8-12z M47 16c6 2 8 12 5 20-4 0-7-6-8-12z" fill="#78350f"/>
    <ellipse cx="32" cy="35" rx="9" ry="7" fill="#fde68a"/>
    <circle cx="26" cy="25" r="2.2" fill="#1c1917"/><circle cx="38" cy="25" r="2.2" fill="#1c1917"/>
    <ellipse cx="32" cy="31" rx="3.2" ry="2.4" fill="#1c1917"/>
    <path d="M28 38q4 5 8 0" fill="#be123c"/>`),
  siren: svg(`
    <rect x="29" y="30" width="6" height="30" fill="#64748b"/>
    <rect x="22" y="58" width="20" height="4" rx="1" fill="#475569"/>
    <path d="M18 14h12v16H18z" fill="#334155"/>
    <path d="M30 12l22-8v36l-22-8z" fill="#ef4444"/>
    <path d="M30 12l22-8v8l-22 6z" fill="#f87171"/>
    <ellipse cx="52" cy="22" rx="3" ry="18" fill="#b91c1c"/>`),
};

/** The listener: a head turned towards the source, with the ear marked. */
export const LISTENER_SVG = svg(`
  <path d="M14 62c0-12 8-20 18-20s18 8 18 20z" fill="#0d9488"/>
  <circle cx="32" cy="24" r="15" fill="#fcd9b6"/>
  <path d="M17 22c0-10 7-16 15-16s15 6 15 14c-6-4-12-5-18-4-5 1-9 3-12 6z" fill="#3f3f46"/>
  <ellipse cx="22" cy="26" rx="3.6" ry="5" fill="#f4b88a"/>
  <path d="M21 23.5q2.4 2.5 0 5" fill="none" stroke="#c2410c" stroke-width="1.2"/>
  <circle cx="34" cy="25" r="1.6" fill="#1c1917"/>`);

export const svgDataUrl = (markup: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
