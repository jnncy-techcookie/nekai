/* Gemini client (Google's Generative Language API, generateContent).
 * The key comes from GEMINI_API_KEY in backend/.env and never leaves the server.
 * GEMINI_MODEL and GEMINI_FALLBACK_MODEL can override the default models.
 */
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/";

// Google's "overloaded" / temporary server errors: worth another try
const BUSY = [500, 503, 504];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// messages: [{ role: "user" | "model", text }], oldest first, starting with a user turn
// config: extra generationConfig, e.g. { responseMimeType: "application/json", responseSchema }
async function askGemini(system, messages, config) {
  const key = process.env.GEMINI_API_KEY;

  if (!key) {
    const error = new Error("GEMINI_API_KEY is not set");
    error.status = 503;
    throw error;
  }

  // Try the main model twice, then a lighter fallback model twice
  const models = [
    process.env.GEMINI_MODEL || "gemini-flash-latest",
    process.env.GEMINI_FALLBACK_MODEL || "gemini-flash-lite-latest",
  ];
  let lastError;

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await generate(key, model, system, messages, config);
      } catch (error) {
        lastError = error;
        // Quota used up (429): each model has its own free-tier quota, so move on to the next one
        if (error.status === 429) break;
        if (!BUSY.includes(error.status)) throw error;
        console.warn(`Gemini ${model} is busy (${error.status}), retrying`);
        await wait(800 * (attempt + 1));
      }
    }
  }
  throw lastError;
}

// One generateContent call. Throws an Error with .status (Google's HTTP status, or 502 when
// the answer has no text, e.g. blocked by a safety filter) so askGemini can decide whether to retry.
async function generate(key, model, system, messages, config) {
  const response = await fetch(
    API_URL + encodeURIComponent(model) + ":generateContent",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({
          role: m.role,
          parts: [{ text: m.text }],
        })),
        generationConfig: { temperature: 0.8, maxOutputTokens: 2048, ...config },
      }),
      signal: AbortSignal.timeout(30000),
    },
  );

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(
      result?.error?.message || `Gemini returned ${response.status}`,
    );
    error.status = response.status;
    throw error;
  }

  // A reply can arrive in several parts: join them into one string
  const text = (result?.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || "")
    .join("")
    .trim();

  if (!text) {
    const error = new Error(
      "Gemini returned no text (finish reason: " +
        (result?.candidates?.[0]?.finishReason ||
          result?.promptFeedback?.blockReason ||
          "unknown") +
        ")",
    );
    error.status = 502;
    throw error;
  }

  return text;
}

module.exports = { askGemini };
