// Authored shuttlecock: cork head, feather skirt, rotated by the caller.
export function Shuttlecock({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 64 80"
      className={className}
      style={style}
    >
      <path
        d="M20 44 L4 6 Q32 -4 60 6 L44 44 Z"
        fill="oklch(99% 0.01 240)"
        stroke="oklch(28% 0.13 264)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M20 44 L14 4M28 44 L26 0M36 44 L38 0M44 44 L50 4"
        stroke="oklch(28% 0.13 264 / 0.45)"
        strokeWidth="1.6"
        fill="none"
      />
      <path d="M13 24 Q32 30 51 24" stroke="oklch(28% 0.13 264 / 0.45)" strokeWidth="1.6" fill="none" />
      <path
        d="M19 44 Q32 40 45 44 L45 56 Q32 78 19 56 Z"
        fill="oklch(99% 0.01 240)"
        stroke="oklch(28% 0.13 264)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <rect x="18" y="44" width="28" height="7" rx="3" fill="oklch(28% 0.13 264)" />
    </svg>
  );
}
