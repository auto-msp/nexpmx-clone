import type { SVGProps } from "react";

const P: Record<string, string> = {
  plus: "M12 5v14M5 12h14",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  x: "M6 6l12 12M18 6L6 18",
  check: "M5 12.5l4.5 4.5L19 7.5",
  calendar: "M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8 2.5v3M16 2.5v3",
  bell: "M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6M10.3 19a2 2 0 0 0 3.4 0",
  sparkle: "M12 3l2.2 5.3L19.5 10.5 14.2 12.7 12 18l-2.2-5.3L4.5 10.5l5.3-2.2zM19 3v3M20.5 4.5h-3",
  moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  chevronRight: "M9 6l6 6-6 6",
  chevronLeft: "M15 6l-6 6 6 6",
  chevronDown: "M6 9l6 6 6-6",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  upload: "M12 16V4M7 9l5-5 5 5M4 20h16",
  download: "M12 4v12M7 11l5 5 5-5M4 20h16",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  users: "M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM16 3.5a4 4 0 0 1 0 7M21 21v-2a4 4 0 0 0-3-3.85",
  mail: "M3 6h18v12H3zM3 7l9 6 9-6",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  file: "M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6",
  wallet: "M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h14V9H5a2 2 0 0 1-2-2zM16 14.5h.01",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  target: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z",
  tasks: "M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2",
  send: "M21 3L10 14M21 3l-7 18-4-7-7-4z",
  help: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01",
  alert: "M12 3l10 18H2zM12 10v4M12 17h.01",
  play: "M7 4l13 8-13 8z",
  pause: "M8 5v14M16 5v14",
  copy: "M9 9h11v11H9zM5 15V4h11",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  filter: "M3 5h18l-7 8v6l-4-2v-4z",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
  panel: "M4 4h16v16H4zM9 4v16",
  pin: "M12 17v5M8 3h8l-1 6 3 3H6l3-3z",
  building: "M5 21V4h9v17M14 9h5v12M8 8h3M8 12h3M8 16h3M3 21h18",
  rupee: "M7 5h10M7 9h10M7 5c5 0 7 2 7 4s-2 4-7 4l6 6",
  bold: "M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z",
  italic: "M10 4h8M6 20h8M14 4L10 20",
  underline: "M7 4v7a5 5 0 0 0 10 0V4M5 20h14",
  listBullets: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  listNumbers: "M10 6h10M10 12h10M10 18h10M4 5l1.5-1V9M4 14.5h2L4 17.5h2",
  heading: "M5 5v14M19 5v14M5 12h14",
  quote: "M6 17h4v-6H6a3 3 0 0 1 3-3M14 17h4v-6h-4a3 3 0 0 1 3-3",
  drag: "M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  brain: "M12 5a3 3 0 0 0-5.5 1.5A3.5 3.5 0 0 0 5 13a3.5 3.5 0 0 0 4 4.5A3 3 0 0 0 12 19zM12 5a3 3 0 0 1 5.5 1.5A3.5 3.5 0 0 1 19 13a3.5 3.5 0 0 1-4 4.5A3 3 0 0 1 12 19zM12 5v14",
  zap: "M13 2L4 14h7l-1 8 9-12h-7z",
};

export type IconName = keyof typeof P;

export function Icon({ name, className, ...rest }: { name: IconName | string; className?: string } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className ?? "h-4 w-4"}
      {...rest}
    >
      <path d={P[name] ?? P.more} />
    </svg>
  );
}
