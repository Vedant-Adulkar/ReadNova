// backend/src/ai/providers/groqProvider.js
// Groq provider for the AI summary fallback chain.
// Uses the OpenAI-compatible REST API via native fetch (Node 18+).
//
// Groq provides extremely fast inference on Llama/Mixtral models.
// Override model with GROQ_MODEL env var if needed.

const NAME = "groq";
const TIMEOUT_MS = 10000; // 10s — Groq is fast
const DEFAULT_MODEL = "llama-3.1-8b-instant";

/**
 * isConfigured — checks if this provider has the required env vars.
 */
const isConfigured = () => !!process.env.GROQ_API_KEY;

/**
 * generateSummary — sends the prompt to Groq and returns raw text.
 * Throws on any failure (timeout, quota, 5xx, empty response).
 *
 * @param {string} prompt
 * @returns {Promise<string>}  Raw text response
 */
const generateSummary = async (prompt, systemPrompt) => {
  const model = process.env.GROQ_MODEL || DEFAULT_MODEL;

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
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
    throw new Error("Empty response from Groq");
  }

  return text;
};

module.exports = { name: NAME, isConfigured, generateSummary };
