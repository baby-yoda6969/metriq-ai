import { hashDataUrl } from "./capture.js";

// Real pack photos used as one-tap demos when no label is on hand.
const SAMPLE_IMAGES = {
  clean: "/samples/parle-g-compliant.jpg",
  non_compliant: "/samples/kurkure-non-compliant.jpg",
  blurry: "/samples/parle-g-compliant.jpg",
};

export const SAMPLE_BUTTONS = [
  { type: "clean", label: "Compliant sample" },
  { type: "non_compliant", label: "Non-compliant sample" },
  { type: "blurry", label: "Blurry sample" },
];

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't load sample image: " + src));
    img.src = src;
  });
}

async function drawSampleLabel(type) {
  const img = await loadImage(SAMPLE_IMAGES[type] || SAMPLE_IMAGES.clean);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (type === "blurry") ctx.filter = "blur(6px)";
  ctx.drawImage(img, 0, 0);
  return canvas;
}

export async function processSample(type) {
  const canvas = await drawSampleLabel(type);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  const hashHex = await hashDataUrl(dataUrl);
  return { dataUrl, base64: dataUrl.split(",")[1], mediaType: "image/jpeg", hashHex };
}
