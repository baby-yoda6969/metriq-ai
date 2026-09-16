import { DEMO_3D_PRODUCTS } from "../src/data/demoProducts.js";
import { parseJsonFromText } from "./groq.js";

export function gemini3dConfigured() {
  return Boolean(process.env.GEMINI_3D_API_KEY);
}

async function callGemini3D(body) {
  const GEMINI_3D_API_KEY = process.env.GEMINI_3D_API_KEY;
  const GEMINI_3D_MODEL = process.env.GEMINI_3D_MODEL || "gemini-2.5-flash";
  if (!GEMINI_3D_API_KEY) {
    const err = new Error("Server is missing GEMINI_3D_API_KEY. Add your AI Studio auth key to .env.");
    err.isConfigError = true;
    throw err;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_3D_MODEL}:generateContent`;
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_3D_API_KEY,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const err = new Error("Could not reach Gemini (3D): " + (e?.message || String(e)));
    err.isNetworkError = true;
    throw err;
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    return { ok: false, status: response.status, data: null };
  }

  return { ok: response.ok, status: response.status, data };
}

function pickProduct(matchKey, brandHint) {
  if (matchKey) {
    const hit = DEMO_3D_PRODUCTS.find((p) => p.match === matchKey);
    if (hit) return hit;
  }
  const hint = (brandHint || "").toLowerCase();
  if (hint) {
    return DEMO_3D_PRODUCTS.find((p) => hint.includes(p.match)) || null;
  }
  return null;
}

function textFromGemini(data) {
  const candidate = data?.candidates?.[0];
  const part = candidate?.content?.parts?.find((p) => typeof p.text === "string");
  return part?.text || null;
}

/**
 * Uses the Gemini auth (AQ.*) key to match front/back/side captures to a
 * verified reference .glb in our catalog — real vision on the captures,
 * not a blind brand-string lookup.
 */
export async function matchProductFromViews({ views, brandHint }) {
  const catalog = DEMO_3D_PRODUCTS.map((p) => ({ match: p.match, name: p.name }));

  const parts = [];
  for (const v of views || []) {
    if (!v?.base64) continue;
    parts.push({ inline_data: { mime_type: v.mediaType || "image/jpeg", data: v.base64 } });
    parts.push({ text: `Pack photo — ${v.label || "view"}.` });
  }
  parts.push({
    text: `You are matching these photos to one verified 3D reference product in our catalog.
Catalog (use "match" verbatim when confident):
${catalog.map((c) => `- match: "${c.match}" → ${c.name}`).join("\n")}

Case brand hint (secondary): "${brandHint || "unknown"}"

Respond with ONLY JSON (no markdown):
{"match":"<one catalog match key exactly, or null>","productName":"<readable name>","confidence":"high"|"low"}`,
  });

  const { ok, data } = await callGemini3D({
    contents: [{ role: "user", parts }],
    generationConfig: { maxOutputTokens: 512, thinkingConfig: { thinkingBudget: 0 } },
  });

  if (!ok) {
    const apiMsg = data?.error?.message || "Gemini 3D request failed.";
    const err = new Error(apiMsg);
    err.fallbackProduct = pickProduct(null, brandHint);
    throw err;
  }

  const raw = textFromGemini(data);
  if (!raw) {
    const err = new Error("Gemini 3D returned no readable text.");
    err.fallbackProduct = pickProduct(null, brandHint);
    throw err;
  }

  let parsed;
  try {
    parsed = parseJsonFromText(raw);
  } catch {
    const err = new Error("Could not parse Gemini 3D response.");
    err.fallbackProduct = pickProduct(null, brandHint);
    throw err;
  }

  const matchKey = parsed.confidence === "low" ? null : parsed.match;
  const product = pickProduct(matchKey, brandHint);
  if (!product) {
    const err = new Error("No verified 3D reference matched these photos.");
    err.fallbackProduct = null;
    throw err;
  }

  return {
    product,
    match: product.match,
    productName: product.name,
    confidence: parsed.confidence || "high",
    source: "gemini-3d",
  };
}
