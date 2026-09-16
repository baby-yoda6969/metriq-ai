import { apiUrl, threeDApiUrl } from "./apiBase.js";

// Text/vision analysis uses Groq; six-face pack models post to the 3D API host
// (default http://10.22.81.94:3000) via six-face-box-v1.

export async function analyzeLabelImage({ base64, mediaType }, activeRuleVersion) {
  const response = await fetch(apiUrl("/api/analyze"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      base64,
      mediaType,
      ruleVersion: activeRuleVersion?.version,
    }),
  });

  let data;
  try {
    data = await response.json();
  } catch (e) {
    throw new Error("The analysis service returned an unreadable response (HTTP " + response.status + ").");
  }

  if (!response.ok) {
    const apiMsg = (data && data.error) || ("HTTP " + response.status);
    throw new Error("Analysis request failed: " + apiMsg);
  }

  const parsed = data;
  if (parsed.image_quality !== "retake_needed" && !Array.isArray(parsed.fields)) {
    throw new Error("The model's response was missing the expected fields list.");
  }

  return parsed;
}

export async function identifyObject({ base64, mediaType, candidates }) {
  try {
    const res = await fetch(apiUrl("/api/identify-object"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64, mediaType, candidates }),
    });
    const data = await res.json();
    return { match: typeof data.match === "string" ? data.match : null };
  } catch (err) {
    return { match: null };
  }
}

export async function extractRegulaSyncClauses({ base64, filename }) {
  const response = await fetch(apiUrl("/api/regulasync/extract"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64, mediaType: "application/pdf", filename }),
  });

  let data;
  try {
    data = await response.json();
  } catch (e) {
    throw new Error("RegulaSync returned an unreadable response (HTTP " + response.status + ").");
  }

  if (!response.ok) {
    throw new Error((data && data.error) || ("RegulaSync request failed (HTTP " + response.status + ")."));
  }

  return data;
}

export async function generate3DModel({
  views,
  brandHint,
  title,
  proportions,
  roundness,
  mode = "quick",
}) {
  const body = JSON.stringify({ views, brandHint, title, proportions, roundness, mode });
  const headers = { "Content-Type": "application/json" };

  // Prefer the dedicated 3D host (10.22.81.94:3000), then same-origin /api.
  const endpoints = [threeDApiUrl("/api/generate-3d"), apiUrl("/api/generate-3d")];
  const tried = new Set();
  let lastError = null;

  for (const url of endpoints) {
    if (!url || tried.has(url)) continue;
    tried.add(url);
    try {
      const response = await fetch(url, { method: "POST", headers, body });
      let data;
      try {
        data = await response.json();
      } catch (e) {
        lastError = new Error("3D service returned an unreadable response (HTTP " + response.status + ").");
        continue;
      }
      if (!response.ok) {
        lastError = new Error((data && data.error) || ("3D request failed (HTTP " + response.status + ")."));
        // 404/502 on the remote host → try local fallback.
        if (response.status === 404 || response.status === 502 || response.status === 401) continue;
        throw lastError;
      }
      if (data.glbDataUrl && !data.glb) data.glb = data.glbDataUrl;
      return data;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError || new Error("3D request failed.");
}

export async function verifyCorrection({ evidenceDataUrl, fieldName, correctedValue }) {
  try {
    const res = await fetch(apiUrl("/api/verify-correction"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        base64: evidenceDataUrl.split(",")[1],
        mediaType: "image/jpeg",
        fieldName,
        correctedValue,
      }),
    });
    const data = await res.json();
    return { plausible: data.plausible, note: data.note };
  } catch (err) {
    return { plausible: null, note: "Verification unavailable." };
  }
}
