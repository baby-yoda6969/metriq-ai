import { apiUrl } from "./apiBase.js";

// Calls to our local backend proxy (server/index.js). Text/vision analysis
// uses Groq; 3D pack matching uses Gemini auth (AQ.* key) server-side.

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

export async function generate3DModel({ views, brandHint }) {
  const response = await fetch(apiUrl("/api/generate-3d"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ views, brandHint }),
  });

  let data;
  try {
    data = await response.json();
  } catch (e) {
    throw new Error("3D service returned an unreadable response (HTTP " + response.status + ").");
  }

  if (!response.ok) {
    throw new Error((data && data.error) || ("3D request failed (HTTP " + response.status + ")."));
  }

  return data;
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
