// Fixed print palette: independent of the website theme.
export const PRINT_COLORS = {
  bg: "#F7F6F2",
  panel: "#FFFFFF",
  panelAlt: "#EFEDE6",
  ink: "#181B22",
  inkSoft: "#5B5F68",
  navy: "#1F2E4A",
  navyDeep: "#131C2E",
  brass: "#AD7F33",
  brassSoft: "#E9DAB8",
  brassStrong: "#C79341", // brass CTA hover, was hardcoded inline before
  green: "#2C7A55",
  greenSoft: "#E3F0E9",
  red: "#B23A34",
  redSoft: "#F6E4E2",
  border: "#DEDACD",
  paper: "#F1EEE4", // off-white used on dark navy bands (hero text, watermark strokes)
};


function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// jsPDF consumes numeric RGB triples; DOCX consumes PRINT_COLORS hex values.
export const PDF_COLORS = {
  navy: hexToRgb(PRINT_COLORS.navy),
  navyDeep: hexToRgb(PRINT_COLORS.navyDeep),
  brass: hexToRgb(PRINT_COLORS.brass),
  ink: hexToRgb(PRINT_COLORS.ink),
  inkSoft: hexToRgb(PRINT_COLORS.inkSoft),
  green: hexToRgb(PRINT_COLORS.green),
  red: hexToRgb(PRINT_COLORS.red),
  border: hexToRgb(PRINT_COLORS.border),
};
