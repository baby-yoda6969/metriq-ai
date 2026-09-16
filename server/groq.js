const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export function groqConfigured() {
  return Boolean(process.env.GROQ_API_KEY);
}

export function parseJsonFromText(raw) {
  const match = raw.match(/\{[\s\S]*\}/);
  const clean = match ? match[0] : raw.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

/**
 * OpenAI-compatible chat completion on Groq (text + optional vision images).
 */
export async function callGroq({ system, userText, images = [], maxOutputTokens = 4096 }) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  const GROQ_MODEL = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";
  const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || "qwen/qwen3.8-27b";
  if (!GROQ_API_KEY) {
    const err = new Error("Server is missing GROQ_API_KEY. Add it to .env and restart the backend.");
    err.isConfigError = true;
    throw err;
  }

  const model = images.length > 0 ? GROQ_VISION_MODEL : GROQ_MODEL;
  const userContent = [];

  if (userText) userContent.push({ type: "text", text: userText });
  for (const img of images) {
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${img.mediaType};base64,${img.base64}` },
    });
  }

  let response;
  try {
    response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          ...(system ? [{ role: "system", content: system }] : []),
          {
            role: "user",
            content: userContent.length === 1 && userContent[0].type === "text"
              ? userText
              : userContent,
          },
        ],
        max_tokens: maxOutputTokens,
        temperature: 0.15,
      }),
    });
  } catch (e) {
    const err = new Error("Could not reach Groq: " + (e?.message || String(e)));
    err.isNetworkError = true;
    throw err;
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    return { ok: false, status: response.status, text: null, error: "Unreadable Groq response." };
  }

  if (!response.ok) {
    const apiMsg = data?.error?.message || `HTTP ${response.status}`;
    return { ok: false, status: response.status, text: null, error: apiMsg };
  }

  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    return { ok: false, status: 502, text: null, error: "Groq returned no text." };
  }

  return { ok: true, status: 200, text };
}
