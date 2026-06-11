// Minimal inline icon set — stroke icons, currentColor.
const P = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="2" /><rect x="14" y="3" width="7" height="5" rx="2" /><rect x="14" y="12" width="7" height="9" rx="2" /><rect x="3" y="16" width="7" height="5" rx="2" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" /><path d="M16 5.2a3 3 0 0 1 0 5.6" /><path d="M17 14.5a5 5 0 0 1 3.5 5" /></>,
  userPlus: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" /><path d="M18 7v6M15 10h6" /></>,
  doc: <><path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M14 3v4h4" /><path d="M9 12h6M9 16h6" /></>,
  wallet: <><rect x="3" y="6" width="18" height="14" rx="3" /><path d="M3 10h18" /><circle cx="17" cy="14" r="1.4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></>,
  edit: <><path d="M16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1 1-4Z" /></>,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="M5 12.5 10 17l9-10" />,
  chevronL: <path d="M15 5l-7 7 7 7" />,
  chevronR: <path d="M9 5l7 7-7 7" />,
  phone: <path d="M5 4h3l1.5 4-2 1.5a12 12 0 0 0 5 5l1.5-2 4 1.5V21a1 1 0 0 1-1 1A17 17 0 0 1 4 5a1 1 0 0 1 1-1Z" />,
  whatsapp: <><path d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.2A9 9 0 1 0 12 3Z" /><path d="M8.5 8.5c0 4 3 7 6.5 7 .8 0 1.2-.6 1.2-1.2 0-.3-1.8-1.3-2.1-1.3s-.6.8-1 .8-2.4-1.3-2.4-2.2c0-.3.7-.6.7-1s-1-2-1.3-2-1.6.4-1.6 1.1Z" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5Z" />,
  trendUp: <><path d="M3 17l6-6 4 4 7-8" /><path d="M21 7h-4M21 7v4" /></>,
  trendDown: <><path d="M3 7l6 6 4-4 7 8" /><path d="M21 17h-4M21 17v-4" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  send: <path d="M21 3 3 10.5 10 13l2.5 7L21 3Z" />,
  download: <><path d="M12 3v12M7 11l5 4 5-4" /><path d="M5 19h14" /></>,
  print: <><path d="M7 8V3h10v5" /><rect x="4" y="8" width="16" height="8" rx="2" /><path d="M7 14h10v6H7z" /></>,
  link: <><path d="M10 13a4 4 0 0 0 5.6 0l2.4-2.4a4 4 0 0 0-5.6-5.6L11 6.4" /><path d="M14 11a4 4 0 0 0-5.6 0L6 13.4a4 4 0 0 0 5.6 5.6L13 17.6" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  dots: <><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></>,
  filter: <path d="M4 5h16l-6 8v5l-4 2v-7L4 5Z" />,
  spark: <path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6L12 3Z" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 9h18M8 3v4M16 3v4" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M3 13h18" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14-4.5L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14 4.5L20 16" /><path d="M20 20v-4h-4" /></>,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" /></>,
  logout: <><path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" /><path d="M9 16l-4-4 4-4" /><path d="M5 12h11" /></>,
  cloud: <><path d="M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 9.5a3.5 3.5 0 0 1 0 7Z" /><path d="M12 21v-7M9 16.5 12 14l3 2.5" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2.2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.6" /><path d="M21 15l-5-5L5 21" /></>,
  wand: <><path d="M15 4V2M15 10V8M19 6h2M11 6h2" /><path d="M5 21 17 9l-2-2L3 19l2 2Z" /></>,
  robot: <><rect x="4" y="8" width="16" height="11" rx="3" /><circle cx="9.5" cy="13.5" r="1.2" /><circle cx="14.5" cy="13.5" r="1.2" /><path d="M12 8V5" /><circle cx="12" cy="3.6" r="1.1" /><path d="M2 12v3M22 12v3" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3M9 21h6" /></>,
  volume: <><path d="M4 9v6h4l5 4V5L8 9H4Z" /><path d="M16 9.5a3.5 3.5 0 0 1 0 5" /><path d="M18.5 7a6.5 6.5 0 0 1 0 10" /></>,
  volumeOff: <><path d="M4 9v6h4l5 4V5L8 9H4Z" /><path d="M22 9.5l-5 5M17 9.5l5 5" /></>,
  stopSq: <rect x="6" y="6" width="12" height="12" rx="2.5" />,
};

export default function Icon({ name, size = 20, strokeWidth = 1.8, className, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {P[name] || null}
    </svg>
  );
}
