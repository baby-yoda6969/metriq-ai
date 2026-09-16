// Calls to our local backend proxy (server/index.js). Text/vision analysis
// uses Groq; 3D pack matching uses Gemini auth (AQ.* key) server-side.

// Only sends the rule VERSION ID, never the rule text itself: the server
// looks the text up in its own store (see server/index.js's ruleStore) so
// this endpoint can't be used to inject arbitrary "rule" content into the
// analysis prompt.
export async function analyzeLabelImage({ base64, mediaType }, activeRuleVersion) {
  const response = await fetch("/api/analyze", {
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

// One frame captured mid-rotation during the "scan a 3D object" flow (see
// ObjectScanCapture): asks Groq vision which of the named candidate products (if
// any) the photo shows. This is a real per-frame vision call, not a
// hardcoded guess — the caller still owns deciding what to do with an
// uncertain/no match. Never throws: a failure just comes back as no match,
// since the caller's own retry flow is the right response either way.
export async function identifyObject({ base64, mediaType, candidates }) {
  try {
    const res = await fetch("/api/identify-object", {
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

// Asks Groq vision a narrow question: does this evidence photo plausibly support
// the claimed corrected value, before a correction is saved. The inspector
// still has final authority: an implausible result doesn't block saving, it
// attaches to the correction record so a supervisor reviewing the case
// later sees it, instead of the correction silently passing as fully
// trusted just because a photo exists. Never throws: on any failure it
// resolves to `{ plausible: null, note: "Verification unavailable." }` so
// the caller can always attach *something* to the correction record.
// RegulaSync: sends an uploaded PDF of a new/amended regulation to the
// backend for extraction. Returns normalized "Rule <ref>: <body>" lines
// ready to append to a rule-version draft with addClauseLine — the caller
// still owns actually adding them to the draft and sending it through
// submit-for-review / approve-and-publish, RegulaSync itself never
// publishes anything.
export async function extractRegulaSyncClauses({ base64, filename }) {
  const response = await fetch("/api/regulasync/extract", {
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

/** Front/back/side captures → Gemini 3D match → verified .glb + declarations. */
export async function generate3DModel({ views, brandHint }) {
  const response = await fetch("/api/generate-3d", {
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
    const res = await fetch("/api/verify-correction", {
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
