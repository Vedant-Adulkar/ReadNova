// backend/src/ai/providers/openrouterProvider.js
// OpenRouter provider for the AI summary fallback chain.
// Uses the OpenAI-compatible REST API via native fetch (Node 18+).
//
// OpenRouter supports 200+ models — we use a fast, cheap one by default.
// Override with OPENROUTER_MODEL env var if needed.

const NAME = "openrouter";
const TIMEOUT_MS = 15000; // 15s — OpenRouter routes to various backends
const DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

/**
 * isConfigured — checks if this provider has the required env vars.
 */
const isConfigured = () => !!process.env.OPENROUTER_API_KEY;

/**
 * generateSummary — sends the prompt to OpenRouter and returns raw text.
 * Throws on any failure (timeout, quota, 5xx, empty response).
 *
 * @param {string} prompt
 * @returns {Promise<string>}  Raw text response
 */
const generateSummary = async (prompt, systemPrompt) => {
  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL || "https://readnova.app",
      "X-Title": "ReadNova Book Recommendation",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      max_tokens: 2000,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  // ── Error classification ────────────────────────────────────────────────
  if (response.status === 429) {
    throw new Error("429 rate limited");
  }
  if (response.status >= 500) {
    throw new Error(`${response.status} server error`);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;

  if (!text || !text.trim()) {
    throw new Error("Empty response from OpenRouter");
  }

  return text;
};

module.exports = { name: NAME, isConfigured, generateSummary };
