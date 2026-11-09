export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="14" fill="#161D2B" />
      <rect x="11" y="28" width="7" height="20" rx="3.5" fill="#22C55E" />
      <rect x="23" y="16" width="7" height="32" rx="3.5" fill="#06B6D4" />
      <rect x="35" y="22" width="7" height="26" rx="3.5" fill="#22C55E" />
      <rect x="47" y="12" width="7" height="36" rx="3.5" fill="#06B6D4" />
    </svg>
  );
}
