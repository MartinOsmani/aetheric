/**
 * TrueTouch throughline mark: a journey of touchpoints connecting to a
 * conversion, with the true-driver node lit in fuchsia. Cyan→fuchsia gradient
 * path echoes the cockpit's "last-touch vs. reality" palette.
 */
export function ThroughlineLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="tt-throughline" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#d946ef" />
        </linearGradient>
      </defs>
      {/* the throughline */}
      <polyline
        points="3,19 11,15 21,5 29,11"
        stroke="url(#tt-throughline)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* touchpoints */}
      <circle cx="3" cy="19" r="2" fill="#22d3ee" />
      <circle cx="11" cy="15" r="2" fill="#38bdf8" />
      <circle cx="29" cy="11" r="2" fill="#a855f7" />
      {/* the true driver — highlighted */}
      <circle cx="21" cy="5" r="4.6" fill="#d946ef" fillOpacity="0.22" />
      <circle cx="21" cy="5" r="2.8" fill="#d946ef" />
    </svg>
  );
}
