type P = { className?: string };
const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const Phone = (p: P) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 5 5L16 13l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
  </svg>
);

export const Video = (p: P) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <rect x="3" y="6" width="13" height="12" rx="2" />
    <path d="M16 10l5-3v10l-5-3z" />
  </svg>
);

export const Screen = (p: P) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4M12 7v4M9.5 9.5 12 7l2.5 2.5" />
  </svg>
);

export const Remote = (p: P) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <path d="M5 12a7 7 0 0 1 14 0M8.5 12a3.5 3.5 0 0 1 7 0" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <path d="M12 19v2M19 12h2M3 12h2M12 3v2" />
  </svg>
);

export const Mic = (p: P) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M6 11a6 6 0 0 0 12 0M12 17v4" />
  </svg>
);

export const Hang = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M12 9c-2.5 0-4.9.4-7 1.2-.7.3-1.2 1-1.2 1.8v2c0 .6.5 1 1 1l3-.2c.5 0 .9-.4 1-.9l.3-1.8c1.9-.6 3.9-.6 5.8 0l.3 1.8c.1.5.5.9 1 .9l3 .2c.5 0 1-.4 1-1v-2c0-.8-.5-1.5-1.2-1.8C16.9 9.4 14.5 9 12 9z" />
  </svg>
);
