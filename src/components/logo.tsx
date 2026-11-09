/**
 * Agent Control Center.
 *
 * A radar sweep inside a shield: the shield for insurance, the sweep for the
 * watching this thing does - leads arriving, renewals coming up, calls going
 * out. The blip sits off-centre, like something just found.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-label="Agent Control Center"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="acc-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1f3a8a" />
          <stop offset="0.55" stopColor="#0a6fe0" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
        <linearGradient id="acc-sweep" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#7df9ff" stopOpacity="0" />
          <stop offset="1" stopColor="#7df9ff" stopOpacity="0.85" />
        </linearGradient>
      </defs>

      <rect width="48" height="48" rx="12" fill="url(#acc-bg)" />

      {/* shield */}
      <path
        d="M24 9.5 36 14v9.8c0 7.2-4.9 12.3-12 14.7-7.1-2.4-12-7.5-12-14.7V14l12-4.5Z"
        fill="#ffffff"
        fillOpacity="0.1"
        stroke="#ffffff"
        strokeOpacity="0.55"
        strokeWidth="1.4"
      />

      {/* radar rings */}
      <circle cx="24" cy="24" r="9.4" fill="none" stroke="#9fe8ff" strokeOpacity="0.45" strokeWidth="1.1" />
      <circle cx="24" cy="24" r="5.4" fill="none" stroke="#9fe8ff" strokeOpacity="0.35" strokeWidth="1.1" />

      {/* sweep */}
      <path d="M24 24 L24 14.6 A9.4 9.4 0 0 1 32.1 19.3 Z" fill="url(#acc-sweep)" />

      {/* crosshair */}
      <path
        d="M24 13.2v2.6M24 32.2v2.6M13.2 24h2.6M32.2 24h2.6"
        stroke="#d8f6ff"
        strokeOpacity="0.7"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <circle cx="24" cy="24" r="1.9" fill="#ffffff" />

      {/* the blip */}
      <circle cx="30.2" cy="18.7" r="1.9" fill="#7df9ff" />
    </svg>
  );
}
