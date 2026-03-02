// backend/src/ai/geminiService.js
// Production-safe Gemini API integration with:
//  - 5-second call timeout using Promise.race()
//  - Circuit-breaker pattern (CLOSED → OPEN after 5 failures → HALF_OPEN after 5 min)
//  - Graceful fallback for every function (server never goes down due to AI failure)

const { GoogleGenerativeAI } = require("@google/generative-ai");

// ────────────────────────────────────────────────────────────────────────────
// Initialise client lazily so missing key doesn't crash import
// ────────────────────────────────────────────────────────────────────────────
let genAI = null;
const getClient = () => {
  if (!genAI) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set in environment variables");
    }
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
};

// ────────────────────────────────────────────────────────────────────────────
// Configuration
// ────────────────────────────────────────────────────────────────────────────
const TIMEOUT_MS = 5000;           // Max ms to wait for a Gemini response
const FAILURE_THRESHOLD = 5;      // Consecutive failures before opening circuit
const RECOVERY_TIME_MS = 5 * 60 * 1000; // 5 minutes in OPEN state before retry

// ────────────────────────────────────────────────────────────────────────────
// Circuit-Breaker State (module-level singleton)
// ────────────────────────────────────────────────────────────────────────────
const breaker = {
  state: "CLOSED",       // CLOSED | OPEN | HALF_OPEN
  failures: 0,
  lastFailureTime: null,
};

/**
 * Check whether the circuit is available for a call.
 * Transitions OPEN → HALF_OPEN after the recovery window.
 */
const isBreakerOpen = () => {
  if (breaker.state === "OPEN") {
    const elapsed = Date.now() - breaker.lastFailureTime;
    if (elapsed >= RECOVERY_TIME_MS) {
      breaker.state = "HALF_OPEN";
      console.log("🔄 Circuit breaker: HALF_OPEN — attempting recovery call.");
      return false; // Allow one test call through
    }
    return true; // Still open, block the call
  }
  return false;
};

/** Call this on a successful Gemini response. */
const recordSuccess = () => {
  breaker.failures = 0;
  if (breaker.state !== "CLOSED") {
    breaker.state = "CLOSED";
    console.log("✅ Circuit breaker: CLOSED — Gemini recovered.");
  }
};

/** Call this on any Gemini failure. */
const recordFailure = () => {
  breaker.failures += 1;
  breaker.lastFailureTime = Date.now();
  if (breaker.failures >= FAILURE_THRESHOLD) {
    breaker.state = "OPEN";
    console.error(
      `🚨 Circuit breaker: OPEN after ${breaker.failures} consecutive failures. ` +
      `Gemini calls suspended for ${RECOVERY_TIME_MS / 60000} min.`
    );
  }
};

// ────────────────────────────────────────────────────────────────────────────
// Core safe wrapper
// ────────────────────────────────────────────────────────────────────────────
/**
 * safeGeminiCall — wraps any Gemini generateContent call with:
 *  1. Circuit-breaker check
 *  2. 5-second hard timeout via Promise.race()
 *  3. Quota / rate-limit detection (HTTP 429)
 *  4. Generic error catch-all
 *
 * Returns the raw response text string, or null on any failure.
 *
 * @param {string} prompt
 * @returns {Promise<string|null>}
 */
const safeGeminiCall = async (prompt) => {
  // ── 1. Circuit-breaker guard ───────────────────────────
  if (isBreakerOpen()) {
    console.warn("⚡ Circuit open — skipping Gemini call, using fallback.");
    return null;
  }

  try {
    const model = getClient().getGenerativeModel({ model: "gemini-1.5-flash" });

    // ── 2. Timeout race ──────────────────────────────────
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("GEMINI_TIMEOUT")), TIMEOUT_MS)
    );

    const result = await Promise.race([
      model.generateContent(prompt),
      timeoutPromise,
    ]);

    const text = result.response.text();
    recordSuccess();
    return text;
  } catch (error) {
    // ── Timeout ──────────────────────────────────────────
    if (error.message === "GEMINI_TIMEOUT") {
      console.warn("⏱  Gemini request timed out after 5s.");
      recordFailure();
      return null;
    }

    // ── Quota / rate limit (HTTP 429) ────────────────────
    if (
      error.message?.includes("429") ||
      error.message?.toLowerCase().includes("quota") ||
      error.message?.toLowerCase().includes("rate limit")
    ) {
      console.error("🚦 Gemini quota exhausted or rate-limited.");
      recordFailure();
      return null;
    }

    // ── Service Unavailable (HTTP 503 / 500) ──────────────
    if (
      error.message?.includes("503") ||
      error.message?.includes("500") ||
      error.message?.toLowerCase().includes("unavailable") ||
      error.message?.toLowerCase().includes("capacity")
    ) {
      console.error("☁️  Gemini service unavailable or at capacity.");
      recordFailure();
      return null;
    }

    // ── Generic error ────────────────────────────────────
    console.error("❌ Gemini error:", error.message);
    recordFailure();
    return null;
  }
};

// ────────────────────────────────────────────────────────────────────────────
// Exported AI functions
// ────────────────────────────────────────────────────────────────────────────

/**
 * parseConversationalQuery
 * Converts a natural-language search string into structured book filters.
 *
 * @param {string} text  e.g. "Short beginner mystery books set in Paris"
 * @returns {{ genres: string[], difficulty: string|null, keywords: string[], maxPages: number|null }}
 */
exports.parseConversationalQuery = async (text) => {
  const DEFAULT = { genres: [], difficulty: null, keywords: [], maxPages: null };

  const prompt = `
You are a book-filter extraction engine. Given this user query:
"${text}"

Extract and return ONLY a valid JSON object with these keys:
{
  "genres": ["array of genres mentioned or implied"],
  "difficulty": "Beginner | Intermediate | Advanced | null",
  "keywords": ["important topic keywords"],
  "maxPages": <integer or null>
}

Return ONLY the JSON. No explanation. No markdown fences.
`;

  const response = await safeGeminiCall(prompt);
  if (!response) return DEFAULT;

  try {
    // Strip any accidental markdown fences before parsing
    const clean = response.replace(/```(?:json)?/gi, "").trim();
    return JSON.parse(clean);
  } catch {
    console.warn("⚠  Could not parse Gemini JSON for query filter.");
    return DEFAULT;
  }
};

/**
 * generateExplanation
 * Produces a 2–3 sentence personalised explanation for why a book is recommended.
 *
 * @param {object} userProfile  e.g. { preferenceEmbedding, personalityProfile, bookshelf }
 * @param {object} bookMeta     e.g. { title, author, genres, difficultyLevel, description }
 * @returns {string}
 */
exports.generateExplanation = async (userProfile, bookMeta) => {
  const FALLBACK = "This book closely matches your reading interests and preferences.";

  const prompt = `
You are a personalised book recommendation assistant.

User profile:
- Personality: ${userProfile.personalityProfile || "not specified"}
- Completed genres: ${JSON.stringify(userProfile.completedGenres || [])}

Book:
- Title: ${bookMeta.title}
- Author: ${bookMeta.author}
- Genres: ${(bookMeta.genres || []).join(", ")}
- Difficulty: ${bookMeta.difficultyLevel}
- Description: ${(bookMeta.description || "").slice(0, 400)}

Write 2–3 sentences explaining why this book suits this reader.
Be specific and warm. Plain text only.
`;

  const response = await safeGeminiCall(prompt);
  return response || FALLBACK;
};

/**
 * summarizeReviews
 * Summarises the community sentiment from an array of review objects.
 *
 * @param {Array<{ rating: number, reviewText: string }>} reviews
 * @returns {string}
 */
exports.summarizeReviews = async (reviews) => {
  const FALLBACK = "Readers generally found this book engaging and well-written.";

  if (!reviews || reviews.length === 0) {
    return "No reviews yet — be the first to share your thoughts!";
  }

  // Send at most 30 reviews to stay within token limits
  const sample = reviews.slice(0, 30);
  const reviewsText = sample
    .map((r) => `[${r.rating}/5] ${r.reviewText}`)
    .join("\n");

  const prompt = `
You are a book review summariser. Below are reader reviews:

${reviewsText}

Write a 3–4 sentence community sentiment summary. Mention the average mood,
common praise, and any recurring criticisms. Plain text only.
`;

  const response = await safeGeminiCall(prompt);
  return response || FALLBACK;
};

/**
 * generateBookSummary
 * Produces a simplified, accessible summary of a book from its metadata.
 *
 * @param {{ title: string, author: string, description: string, genres: string[], difficultyLevel: string }} bookMeta
 * @returns {string}
 */
exports.generateBookSummary = async (bookMeta) => {
  // Fallback: truncate the raw description
  const FALLBACK = (bookMeta.description || "").slice(0, 300) ||
    `${bookMeta.title} by ${bookMeta.author}`;

  const prompt = `
Simplify the following book description into 2–3 easy-to-read sentences
suitable for a general audience. Avoid jargon.

Book: "${bookMeta.title}" by ${bookMeta.author}
Genres: ${(bookMeta.genres || []).join(", ")}
Description: ${(bookMeta.description || "").slice(0, 1000)}

Plain text only.
`;

  const response = await safeGeminiCall(prompt);
  return response || FALLBACK;
};

/**
 * getBreakerStatus — exposes circuit-breaker state for health-check endpoints.
 * @returns {{ state: string, failures: number, lastFailureTime: number|null }}
 */
exports.getBreakerStatus = () => ({ ...breaker });
