import QRCode from "qrcode";

// Four modules of clear white space are required around every side of a QR.
export function sampleQr(sampleId) {
  if (typeof sampleId !== "string" || !sampleId.trim()) throw new Error("A sample ID is required.");
  const { modules } = QRCode.create(sampleId, { errorCorrectionLevel: "M" });
  const margin = 4;
  const extent = modules.size + margin * 2;
  let path = "";
  for (let y = 0; y < modules.size; y++) {
    for (let x = 0; x < modules.size; x++) {
      if (modules.get(y, x)) path += `M${x + margin} ${y + margin}h1v1h-1z`;
    }
  }
  return { extent, path };
}
