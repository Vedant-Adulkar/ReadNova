// backend/src/ai/providers/geminiProvider.js
// Gemini provider for the AI summary fallback chain.
// Uses the @google/generative-ai SDK with timeout + error classification.

const { GoogleGenerativeAI } = require("@google/generative-ai");

const NAME = "gemini";
const TIMEOUT_MS = 12000; // 12s — structured JSON takes longer

// ── Lazy client ──────────────────────────────────────────────────────────────
let genAI = null;
const getClient = () => {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
};

/**
 * isConfigured — checks if this provider has the required env vars.
 */
const isConfigured = () => !!process.env.GEMINI_API_KEY;

/**
 * generateSummary — sends the prompt to Gemini and returns raw text.
 * Throws on any failure (timeout, quota, 5xx, empty response).
 *
 * @param {string} prompt
 * @returns {Promise<string>}  Raw text response
 */
const generateSummary = async (prompt, systemPrompt) => {
  const genModel = getClient().getGenerativeModel({ 
    model: "gemini-2.0-flash",
    systemInstruction: systemPrompt || undefined,
  });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("TIMEOUT")), TIMEOUT_MS)
  );

  const result = await Promise.race([
    genModel.generateContent(prompt),
    timeoutPromise,
  ]);

  const text = result.response.text();
  if (!text || !text.trim()) {
    throw new Error("Empty response from Gemini");
  }

  return text;
};

module.exports = { name: NAME, isConfigured, generateSummary };
