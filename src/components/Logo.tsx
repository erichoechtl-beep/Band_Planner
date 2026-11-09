/** App-Zeichen: zwei verbundene Achtelnoten auf blauem Verlauf – wie das Icon auf dem Homescreen. */
export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 1024 1024" className={className} aria-hidden>
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1E40AF" />
          <stop offset="0.55" stopColor="#1D4ED8" />
          <stop offset="1" stopColor="#0B1220" />
        </linearGradient>
        <radialGradient id="logo-glow" cx="0.22" cy="0.12" r="0.75">
          <stop offset="0" stopColor="#93C5FD" stopOpacity="0.45" />
          <stop offset="1" stopColor="#93C5FD" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1024" height="1024" rx="230" fill="url(#logo-bg)" />
      <rect width="1024" height="1024" rx="230" fill="url(#logo-glow)" />
      <g fill="#FFFFFF">
        <ellipse cx="392" cy="706" rx="98" ry="70" transform="rotate(-22 392 706)" />
        <ellipse cx="664" cy="636" rx="98" ry="70" transform="rotate(-22 664 636)" />
        <rect x="456" y="296" width="34" height="400" />
        <rect x="728" y="226" width="34" height="400" />
        <polygon points="456,296 762,226 762,310 456,380" />
      </g>
    </svg>
  );
}
