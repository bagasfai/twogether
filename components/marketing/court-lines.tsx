// Badminton doubles court, drawn to the real proportions (13.4 m x 6.1 m).
// Decorative ground for the marketing heroes: the page is the court.
export function CourtLines({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 134 61"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="0.7"
      strokeLinecap="square"
    >
      <rect x="0.35" y="0.35" width="133.3" height="60.3" />
      <path d="M0 4.6H134M0 56.4H134" />
      <path d="M67 0V61" strokeWidth="1.1" />
      <path d="M47.2 4.6V56.4M86.8 4.6V56.4" />
      <path d="M7.6 0V61M126.4 0V61" />
      <path d="M0 30.5H47.2M86.8 30.5H134" />
    </svg>
  );
}
