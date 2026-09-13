import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

const base = (p: P) => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "square" as const,
  strokeLinejoin: "miter" as const,
  "aria-hidden": true,
  ...p,
});

export const IMenu = (p: P) => (
  <svg {...base(p)}><path d="M4 6h16M4 12h16M4 18h16" /></svg>
);
export const IClose = (p: P) => (
  <svg {...base(p)}><path d="M6 6l12 12M18 6L6 18" /></svg>
);
export const IArrowRight = (p: P) => (
  <svg {...base(p)}><path d="M4 12h15M13 5l7 7-7 7" /></svg>
);
export const IArrowLeft = (p: P) => (
  <svg {...base(p)}><path d="M20 12H5M11 5l-7 7 7 7" /></svg>
);
export const IChevronRight = (p: P) => (
  <svg {...base(p)}><path d="M9 6l6 6-6 6" /></svg>
);
export const IChevronDown = (p: P) => (
  <svg {...base(p)}><path d="M6 9l6 6 6-6" /></svg>
);
export const ICheck = (p: P) => (
  <svg {...base(p)}><path d="M4 12.5l5 5L20 6.5" /></svg>
);
export const ISearch = (p: P) => (
  <svg {...base(p)}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-3.8-3.8" /></svg>
);
export const IHome = (p: P) => (
  <svg {...base(p)}><path d="M4 11l8-7 8 7M6 10v9h12v-9" /></svg>
);
export const IFilm = (p: P) => (
  <svg {...base(p)}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 9h16M4 15h16M9 9v6M15 9v6M9 4v5M9 15v5M15 4v5M15 15v5" /></svg>
);
export const ITv = (p: P) => (
  <svg {...base(p)}><rect x="3" y="5" width="18" height="13" rx="2" /><path d="M8 21h8M12 18v3" /></svg>
);
export const ISparkles = (p: P) => (
  <svg {...base(p)}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" /></svg>
);
export const ILibrary = (p: P) => (
  <svg {...base(p)}><path d="M4 7l8-4 8 4M5 7v11a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V7M9 20v-6a3 3 0 0 1 6 0v6" /></svg>
);
export const IHeart = (p: P) => (
  <svg {...base(p)} fill={p.fill ?? "none"}><path d="M12 20s-7-4.3-9-8.4C1.5 8.6 3.4 5.5 6.6 5.5c2 0 3.4 1.1 4.1 2.2l1.3 1.9 1.3-1.9c.7-1.1 2.1-2.2 4.1-2.2 3.2 0 5.1 3.1 3.6 6.1C19 15.7 12 20 12 20z" /></svg>
);
export const ICloudUpload = (p: P) => (
  <svg {...base(p)}><path d="M7 18a4 4 0 0 1-.7-7.9A6 6 0 0 1 18 9.2 3.5 3.5 0 0 1 17 18H7zM12 15V7M9.5 9.5L12 7l2.5 2.5" /></svg>
);
export const IGear = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="3.2" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" /></svg>
);
export const IPlay = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none"><path d="M8 5.5v13a1 1 0 0 0 1.54.84l10.3-6.5a1 1 0 0 0 0-1.68L9.54 4.66A1 1 0 0 0 8 5.5z" /></svg>
);
export const IPause = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none"><rect x="6" y="5" width="4" height="14" rx="1.2" /><rect x="14" y="5" width="4" height="14" rx="1.2" /></svg>
);
export const IPlus = (p: P) => (
  <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
);
export const IVolumeHigh = (p: P) => (
  <svg {...base(p)}><path d="M4 9v6h3l5 4V5L7 9H4z" fill="currentColor" stroke="none" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" /></svg>
);
export const IVolumeLow = (p: P) => (
  <svg {...base(p)}><path d="M4 9v6h3l5 4V5L7 9H4z" fill="currentColor" stroke="none" /><path d="M16 9.5a3.2 3.2 0 0 1 0 5" /></svg>
);
export const IVolumeMute = (p: P) => (
  <svg {...base(p)}><path d="M4 9v6h3l5 4V5L7 9H4z" fill="currentColor" stroke="none" /><path d="M17 9l5 6M22 9l-5 6" /></svg>
);
export const ISubtitles = (p: P) => (
  <svg {...base(p)}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 13h5M7 16h8M14 10h3M7 10h2" /></svg>
);
export const ISettings = (p: P) => (
  <svg {...base(p)}><path d="M5 7h14M5 12h14M5 17h14" /><circle cx="9" cy="7" r="1.6" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="11" cy="17" r="1.6" fill="currentColor" stroke="none" /></svg>
);
export const IExpand = (p: P) => (
  <svg {...base(p)}><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" /></svg>
);
export const ICompress = (p: P) => (
  <svg {...base(p)}><path d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5" /></svg>
);
export const ISkipBack = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none"><path d="M6 5v14" /><path d="M20 5.5v13a1 1 0 0 1-1.53.85L9.4 12.85a1 1 0 0 1 0-1.7l9.07-6.5A1 1 0 0 1 20 5.5z" /></svg>
);
export const ISkipFwd = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none"><path d="M18 5v14" /><path d="M4 5.5v13a1 1 0 0 0 1.53.85l9.07-6.5a1 1 0 0 0 0-1.7l-9.07-6.5A1 1 0 0 0 4 5.5z" /></svg>
);
export const IReplay = (p: P) => (
  <svg {...base(p)}><path d="M4 12a8 8 0 1 0 8-8" /><path d="M4 4v4h4" /></svg>
);
export const IAlert = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M12 8v5M12 16.5v.5" /></svg>
);
export const IInfo = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 7.5v.5" /></svg>
);
export const ILink = (p: P) => (
  <svg {...base(p)}><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.7 1.7" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3A4.5 4.5 0 0 0 11 19.4l1.7-1.7" /></svg>
);
export const IStar = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none"><path d="M12 3.6l2.5 5.05 5.6.82-4.05 3.95.96 5.58L12 16.9l-5.01 2.64.96-5.58L3.9 9.47l5.6-.82L12 3.6z" /></svg>
);
export const IClock = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" /></svg>
);
export const IImage = (p: P) => (
  <svg {...base(p)}><rect x="4" y="5" width="16" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M4 17l5-4 3.5 3 3.5-3L20 17" /></svg>
);
export const IExternal = (p: P) => (
  <svg {...base(p)}><path d="M14 5h5v5M19 5l-8 8" /><path d="M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-3" /></svg>
);
export const IUsers = (p: P) => (
  <svg {...base(p)}><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19c.6-3.2 2.9-5 5.5-5s4.9 1.8 5.5 5M16 5.7a3.2 3.2 0 0 1 0 5.6M18.5 14c1.3.9 2 2.3 2.3 4" /></svg>
);