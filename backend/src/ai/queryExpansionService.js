// backend/src/ai/queryExpansionService.js
// Service to expand user queries using a multi‑provider LLM fallback.
// Includes caching, timeout handling, and robust variant generation.

const geminiProvider = require("./providers/geminiProvider");
const openrouterProvider = require("./providers/openrouterProvider");
const groqProvider = require("./providers/groqProvider");
const { classifyError } = require("./utils");
const cache = require("../cache/inMemoryCache");
const { logger } = require("../utils/logger");

// Provider order – Gemini first, then OpenRouter, then Groq.
const PROVIDERS = [geminiProvider, openrouterProvider, groqProvider];

// Soft expansion used when all providers fail.
function softExpand(query) {
  return `${query} books novels literature reading recommendations`;
}

// Prompt used for all providers – domain‑agnostic expansion.
function buildExpansionPrompt(query) {
  return `You are a semantic query expansion engine for a book recommendation system.
Your job is to transform a user query into a richer semantic search query.
Guidelines:
- Preserve the original intent exactly
- Expand with related genres, broader and narrower categories, themes, topics, synonyms, and audience level if mentioned
- Keep it general and domain‑agnostic (do NOT inject overly specific facts unless explicitly mentioned)
- Do NOT over‑expand into unrelated areas
- Output a single concise expanded query

Query: "${query}"

Expanded Query:`;
}

// Simple timeout wrapper for provider calls.
function withTimeout(promise, ms = Number(process.env.PROVIDER_TIMEOUT_MS) || 2000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms))
  ]);
}

// Stopwords for token cleaning.
const STOPWORDS = new Set(["the", "for", "and", "of", "in", "to", "a"]);

/**
 * cleanQuery – normalises whitespace and removes punctuation.
 */
function cleanQuery(q) {
  // Replace non-word/non-space characters (like hyphens) with spaces to preserve token boundaries
  return q.replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * generateEmbeddingVariants – returns three diverse variants for embedding.
 * Variants are deduplicated and trimmed.
 */
function generateEmbeddingVariants(expanded) {
  const variants = [
    expanded,
    `${expanded} books`,
    `${expanded} novels literature reading`
  ];
  // Deduplicate and trim whitespace.
  return [...new Set(variants.filter(v => typeof v === 'string').map(v => v.trim()))];
}

/**
 * expandQuery – attempts to expand the query using LLM providers with fallback.
 * Returns the expanded query string, or a soft‑expanded version if all providers fail.
 * @param {string} originalQuery
 * @returns {Promise<string>}
 */
async function expandQuery(originalQuery) {
  const cleaned = cleanQuery(originalQuery);
  const cacheKey = `expansion:${cleaned.toLowerCase().trim()}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    logger.info({ message: "Expansion cache hit", query: originalQuery, cacheKey });
    return { expandedQuery: cached, providerUsed: "cache" };
  }

  const prompt = buildExpansionPrompt(cleaned);
  const failures = [];

  for (const provider of PROVIDERS) {
    if (!provider.isConfigured()) continue;
    const start = Date.now();
    try {
      const systemPrompt = "You are a query expansion engine. Respond with a single plain-text expanded query version only. No JSON, no markdown, no explanations.";
      const raw = await withTimeout(provider.generateSummary(prompt, systemPrompt));
      const latency = Date.now() - start;
      const expanded = raw && typeof raw === "string" ? raw.trim() : null;
      // Guard against empty or too short expansions.
      if (!expanded || expanded.length < Number(process.env.MIN_EXPANSION_LENGTH) || expanded.length <= cleaned.length) {
        failures.push({ provider: provider.name, reason: "invalid/short expansion", latency });
        logger.warn({ message: "Invalid expansion", provider: provider.name, latency, query: originalQuery });
        continue;
      }
      // Length cap.
      let finalExpanded = expanded;
      if (finalExpanded.length > 200) {
        finalExpanded = finalExpanded.slice(0, 200);
      }
      logger.info({ message: "Query expanded", provider: provider.name, latency, query: originalQuery, expanded: finalExpanded });
      cache.set(cacheKey, finalExpanded, Number(process.env.EXPANSION_CACHE_TTL) || 3600);
      return { expandedQuery: finalExpanded, providerUsed: provider.name };
    } catch (err) {
      const latency = Date.now() - start;
      const reason = classifyError(err);
      failures.push({ provider: provider.name, reason, latency });
      logger.error({ message: "Expansion error", error: err.message, provider: provider.name, latency, query: originalQuery });
    }
  }

  // All providers failed – use soft expansion as a last resort.
  logger.warn({ message: "All providers failed, using soft expansion", query: originalQuery, failures });
  const soft = softExpand(cleaned);
  cache.set(cacheKey, soft, Number(process.env.EXPANSION_CACHE_TTL) || 3600);
  return { expandedQuery: soft, providerUsed: "soft-expansion" };
}

module.exports = { expandQuery, generateEmbeddingVariants, softExpand, cleanQuery };
