// UnMute icon set: inline 24 px stroke SVGs (1.75 line, round caps). Decorative by default —
// the control that holds an icon carries the accessible name. No emoji anywhere in the UI.
const PATHS = {
  today: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
  route: <><circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H16a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h7.5"/></>,
  review: <><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 21v-5h5"/></>,
  me: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  mic: <><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></>,
  play: <path d="M7 4l13 8-13 8z"/>,
  flame: <path d="M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-6 5-6 9-1-1-2-2-2-4-1 2-2 4-2 7 0 4 4 7 8 7z"/>,
  speaker: <><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></>,
  sparkle: <><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z"/></>,
  chat: <path d="M21 12a8 8 0 0 1-11.8 7L4 20l1.1-4.4A8 8 0 1 1 21 12z"/>,
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5"/>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></>,
  close: <path d="M6 6l12 12M18 6L6 18"/>,
  check: <path d="M5 12l5 5 9-10"/>,
  chevron: <path d="M9 6l6 6-6 6"/>,
  back: <path d="M15 6l-6 6 6 6"/>,
  progress: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>,
  book: <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M9 7h6"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/></>
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({name, size = 24, className}: {name: IconName; size?: number; className?: string}){
  return (
    <svg
      className={className ? 'icon ' + className : 'icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
