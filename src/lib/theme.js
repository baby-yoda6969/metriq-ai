// Brand follows the official metriq ai lockup: black / white with soft ice-blue
// accents. Printed PDF reports keep the Legal Metrology navy/brass palette.

export const FONTS = {
  display: "'Manrope', 'Segoe UI', sans-serif",
  body: "'Manrope', 'Segoe UI', sans-serif",
  mono: "'IBM Plex Mono', 'SF Mono', monospace",
};

export const EASE = {
  out: "cubic-bezier(0.16, 1, 0.3, 1)",
  back: "cubic-bezier(0.34, 1.56, 0.64, 1)",
};

const AUTH = {
  authSalmon: "#708098",
  authSalmonDeep: "#5A6A80",
  authAccent: "#708098",
  authInk: "#101820",
  authMuted: "#8A94A0",
  authLine: "#D0D5DC",
  authBg: "#FFFFFF",
  authHeader: "#000000",
};

export const THEMES = {
  dark: {
    mode: "dark",
    bg: "#000000",
    panel: "#12151A",
    panelAlt: "#181C22",
    ink: "#F7F8FA",
    inkSoft: "#8B93A0",
    navy: "#D0E0F8",
    navyDeep: "#000000",
    brass: "#D0E0F8",
    brassSoft: "#151A24",
    brassStrong: "#E8F0FC",
    green: "#8FCB9B",
    greenSoft: "#1A2A1C",
    red: "#D98980",
    redSoft: "#2C1816",
    border: "#242A33",
    paper: "#F7F8FA",
    stage: "#000000",
    hairline: "rgba(247, 248, 250, 0.08)",
    ...AUTH,
  },
  light: {
    mode: "light",
    bg: "#F3F5F8",
    panel: "#FFFFFF",
    panelAlt: "#EBEEF3",
    ink: "#101820",
    inkSoft: "#6B7585",
    navy: "#48648C",
    navyDeep: "#101820",
    brass: "#48648C",
    brassSoft: "#E4EAF2",
    brassStrong: "#708098",
    green: "#2F7A4A",
    greenSoft: "#E3F2E8",
    red: "#B23A34",
    redSoft: "#F6E4E2",
    border: "#D7DCE4",
    paper: "#101820",
    stage: "#E8ECF2",
    hairline: "rgba(16, 24, 32, 0.08)",
    ...AUTH,
  },
};

/** @deprecated Prefer useTheme().colors — kept for modules that still import COLORS. */
export const COLORS = THEMES.dark;

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const PDF_COLORS = {
  navy: hexToRgb("#1F2E4A"),
  navyDeep: hexToRgb("#131C2E"),
  brass: hexToRgb("#AD7F33"),
  ink: hexToRgb("#181B22"),
  inkSoft: hexToRgb("#5B5F68"),
  green: hexToRgb("#2C7A55"),
  red: hexToRgb("#B23A34"),
  border: hexToRgb("#DEDACD"),
};

export const THEME_STORAGE_KEY = "metriq-theme";
