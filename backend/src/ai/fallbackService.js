// backend/src/ai/fallbackService.js
// ─────────────────────────────────────────────────────────────────────────────
// Central AI Summary Orchestrator — Multi-Provider Sequential Fallback
//
// Execution Flow:  Gemini → OpenRouter → Groq → fail
//
// Architecture:
//   - Each provider module exports: { name, isConfigured, generateSummary }
//   - This service builds the prompt, calls providers sequentially,
//     normalises the JSON output, and returns the first successful result.
//   - No parallel calls, no retries per provider (max 1 attempt each).
//
// Failure Conditions (any of these triggers next provider):
//   - HTTP 429 (rate limit)
//   - Timeout
//   - 5xx server errors
//   - Invalid/empty response
//   - JSON parse failure
//
// Logs: provider used, failures, latency per call
// ─────────────────────────────────────────────────────────────────────────────

const geminiProvider = require("./providers/geminiProvider");
const openrouterProvider = require("./providers/openrouterProvider");
const groqProvider = require("./providers/groqProvider");

// ── Provider chain (order matters — sequential fallback) ─────────────────────
// Groq first: fastest inference, generous free tier for bulk work
// OpenRouter second: broad model availability
// Gemini last: often rate-limited under sustained batch load
const PROVIDERS = [groqProvider, openrouterProvider, geminiProvider];

// ── Current prompt version (bump when prompt changes) ────────────────────────
const SUMMARY_PROMPT_VERSION = "v2";

// ── Required fields in the normalised output ─────────────────────────────────
const REQUIRED_FIELDS = ["short", "detailed", "themes", "tone", "audience", "keywords"];

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * buildSummaryPrompt — creates the AI summary prompt for a book.
 * The same prompt is sent to every provider for consistency.
 *
 * @param {object} bookMeta
 * @returns {string}
 */
const buildSummaryPrompt = (bookMeta) => {
  return `You are an expert literary analyst building an AI-powered book recommendation system.

Given the following book information:
- Title: ${bookMeta.title}
- Authors: ${bookMeta.author}
- Description: ${(bookMeta.description || "").slice(0, 1200)}
- Categories/Genres: ${(bookMeta.genres || []).join(", ")}
- Difficulty Level: ${bookMeta.difficultyLevel || "Intermediate"}

Generate a semantically rich and structured summary optimised for an AI recommendation system.

Focus on:
- Core ideas and concepts
- Emotional tone and narrative style
- Key themes and topics
- Reader experience and difficulty level
- Target audience

Rules:
- Keep it factual and engaging
- Do NOT hallucinate unknown facts
- Use simple, clear language
- Ensure the output improves semantic similarity search

Return ONLY a valid JSON object with EXACTLY these keys — no markdown, no explanation, no code fences:
{
  "short": "100–150 word summary capturing core themes and ideas",
  "detailed": "300–400 word deeper analysis of narrative, style, and reader experience",
  "themes": ["theme1", "theme2", "theme3", "theme4", "theme5"],
  "tone": "single descriptor e.g. dark, humorous, academic, inspirational",
  "audience": "who should read this — be specific about reader type",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5", "keyword6", "keyword7", "keyword8"]
}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// JSON Parsing & Normalisation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * stripMarkdown — removes markdown code fences and surrounding whitespace.
 */
const stripMarkdown = (raw) => {
  if (!raw) return "";
  return raw
    .replace(/```(?:json)?\s*/gi, "")
    .replace(/```/g, "")
    .trim();
};

/**
 * normaliseOutput — parses raw text into the expected schema.
 * Handles both snake_case and camelCase field names from different providers.
 * Returns null if required fields are missing.
 *
 * @param {string} raw
 * @returns {object|null}  { short, detailed, themes, tone, audience, keywords }
 */
const normaliseOutput = (raw) => {
  const clean = stripMarkdown(raw);
  if (!clean) return null;

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch {
    // Try to extract JSON from surrounding text (some models add explanation)
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }

  // ── Normalise field names (snake_case → camelCase) ──────────────────────
  const normalised = {
    short:    parsed.short    || parsed.short_summary    || "",
    detailed: parsed.detailed || parsed.detailed_summary || "",
    themes:   parsed.themes   || [],
    tone:     parsed.tone     || "",
    audience: parsed.audience || parsed.target_audience  || "",
    keywords: parsed.keywords || [],
  };

  // ── Ensure arrays are arrays ────────────────────────────────────────────
  if (typeof normalised.themes === "string") {
    normalised.themes = normalised.themes.split(",").map((t) => t.trim()).filter(Boolean);
  }
  if (typeof normalised.keywords === "string") {
    normalised.keywords = normalised.keywords.split(",").map((k) => k.trim()).filter(Boolean);
  }

  // ── Validate required fields ────────────────────────────────────────────
  if (!normalised.short || !normalised.detailed) return null;

  return normalised;
};

// ─────────────────────────────────────────────────────────────────────────────
// Core Orchestrator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * generateBookSummary — multi-provider fallback for AI summary generation.
 *
 * Sequential: Gemini → OpenRouter → Groq → null
 * No retries per provider. First valid structured JSON wins.
 *
 * @param {object} bookMeta  { title, author, description, genres, difficultyLevel }
 * @returns {Promise<{ short, detailed, themes, tone, audience, keywords }|null>}
 */
const generateBookSummary = async (bookMeta) => {
  const prompt = buildSummaryPrompt(bookMeta);
  const failures = [];

  for (const provider of PROVIDERS) {
    // Skip providers without API keys
    if (!provider.isConfigured()) {
      continue;
    }

    const start = Date.now();
    try {
      const systemPrompt = "You are an expert literary analyst. Always respond with valid JSON only, no markdown fences or explanations.";
      const raw = await provider.generateSummary(prompt, systemPrompt);
      const latency = Date.now() - start;
      const result = normaliseOutput(raw);

      if (result) {
        console.log(
          `✅ [fallback] Summary via ${provider.name} (${latency}ms) for "${bookMeta.title}"`
        );
        // Log any previous failures for visibility
        if (failures.length > 0) {
          console.log(
            `   ↳ Previous failures: ${failures.map((f) => `${f.provider} (${f.reason})`).join(", ")}`
          );
        }
        return result;
      }

      // Valid response but failed JSON parse / normalisation
      const reason = "invalid JSON response";
      failures.push({ provider: provider.name, reason, latency });
      console.warn(
        `⚠️  [fallback] ${provider.name}: ${reason} (${latency}ms) — trying next provider`
      );
    } catch (err) {
      const latency = Date.now() - start;
      const reason = classifyError(err);
      failures.push({ provider: provider.name, reason, latency });
      console.warn(
        `⚠️  [fallback] ${provider.name}: ${reason} (${latency}ms) — trying next provider`
      );
    }
  }

  // All providers failed
  console.error(
    `❌ [fallback] All providers failed for "${bookMeta.title}": ` +
    failures.map((f) => `${f.provider}(${f.reason})`).join(" → ")
  );
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Error Classification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * classifyError — returns a human-readable reason for the failure.
 */
const { classifyError } = require("./utils");

// ─────────────────────────────────────────────────────────────────────────────
// Health Check
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getProviderStatus — returns configuration status of all providers.
 * Useful for admin health-check endpoints.
 */
const getProviderStatus = () =>
  PROVIDERS.map((p) => ({
    name: p.name,
    configured: p.isConfigured(),
  }));

// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  generateBookSummary,
  getProviderStatus,
  SUMMARY_PROMPT_VERSION,
  // Exposed for testing
  normaliseOutput,
  buildSummaryPrompt,
};
