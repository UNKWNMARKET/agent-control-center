/**
 * Agent Control Center.
 *
 * A shield, for insurance, with one dot inside it — the thing being watched.
 * Two shapes and one colour, so it holds up at sixteen pixels.
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
      <rect width="48" height="48" rx="12" fill="var(--color-accent, #0071e3)" />
      <path
        d="M24 10.5 35 14.6v9c0 6.7-4.5 11.4-11 13.9-6.5-2.5-11-7.2-11-13.9v-9l11-4.1Z"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="23.5" r="3.4" fill="#ffffff" />
    </svg>
  );
}
