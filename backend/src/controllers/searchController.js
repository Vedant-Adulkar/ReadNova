// backend/src/controllers/searchController.js
// ─────────────────────────────────────────────────────────────────────────────
// Production-grade semantic search controller.
//
// Pipeline:
//   1. Clean + expand query (LLM-powered)
//   2. Intent detection (fiction/non-fiction, genre anchoring)
//   3. Candidate pre-filtering (genre-based)
//   4. Parallel: local semantic search + Google Books fetch
//   5. Score normalization across both sources
//   6. Merge + deduplicate (title+author)
//   7. Dynamic relative threshold filtering
//   8. Return with source labels
//
// Route: GET /api/books/semantic-search?q=...&topN=10&genre=...&difficulty=...
// ─────────────────────────────────────────────────────────────────────────────

const asyncHandler = require("../utils/asyncHandler");
const Book = require("../models/Book");
const { embedText } = require("../services/embeddingService");
const { semanticSearch, applyHybridKeywordBoost } = require("../recommendation/semanticSearch");
const { searchGoogleBooks } = require("../services/googleBooksService");

// ── Fields to fetch for search ──────────────────────────────────────────────
const BOOK_FIELDS_FOR_SEARCH =
  "title author genres description difficultyLevel contentRating embedding averageRating coverImage ratingsCount aiSummary googleBooksId";

// ── Intent Detection ────────────────────────────────────────────────────────

const FICTION_SIGNALS = new Set([
  'sci-fi', 'scifi', 'science fiction', 'fiction', 'fantasy', 'thriller',
  'mystery', 'horror', 'romance', 'adventure', 'detective', 'novel', 'novels',
  'story', 'stories', 'narrative', 'plot', 'protagonist', 'coming-of-age',
  'dystopian', 'dystopia', 'space opera', 'cyberpunk', 'steampunk',
  'worldbuilding', 'world-building', 'epic', 'saga',
  'dragon', 'dragons', 'magic', 'magical', 'wizard', 'sword', 'quest',
  'space', 'galaxy', 'starship', 'alien', 'aliens', 'vampire', 'werewolf',
  'zombie', 'demon', 'kingdom', 'empire', 'battle', 'heist',
  'murder', 'spy', 'assassin', 'pirate', 'knight', 'haunted', 'ghost',
  'monster', 'intrigue',
]);

// Maps query keywords → MongoDB genre filter values
const GENRE_ANCHOR_MAP = {
  'fantasy': ['Fantasy', 'Fiction'],
  'sci-fi': ['Science Fiction', 'Fiction'],
  'scifi': ['Science Fiction', 'Fiction'],
  'science fiction': ['Science Fiction', 'Fiction'],
  'space': ['Science Fiction', 'Fiction'],
  'horror': ['Horror', 'Fiction'],
  'mystery': ['Mystery', 'Fiction'],
  'thriller': ['Thriller', 'Fiction', 'Suspense'],
  'romance': ['Romance', 'Fiction'],
  'adventure': ['Adventure', 'Fiction'],
  'detective': ['Mystery', 'Fiction', 'Crime'],
  'coming-of-age': ['Fiction', 'Young Adult', 'Juvenile Fiction'],
};

/**
 * detectSearchIntent — analyzes query for fiction intent and genre anchors.
 * @param {string} query
 * @returns {{ fictionIntent: boolean, anchorGenres: string[] }}
 */
function detectSearchIntent(query) {
  const q = query.toLowerCase();
  let fictionIntent = false;
  const anchorGenres = new Set();

  // Check fiction signals
  for (const sig of FICTION_SIGNALS) {
    if (q.includes(sig)) {
      fictionIntent = true;
      // Check if this signal maps to specific genres
      if (GENRE_ANCHOR_MAP[sig]) {
        GENRE_ANCHOR_MAP[sig].forEach(g => anchorGenres.add(g));
      }
    }
  }

  return {
    fictionIntent,
    anchorGenres: [...anchorGenres],
  };
}

// ── Score Normalization ─────────────────────────────────────────────────────

/**
 * normalize — maps a value from [inMin, inMax] to [0, 1].
 */
function normalize(value, inMin, inMax) {
  if (inMax === inMin) return 0.5;
  return Math.max(0, Math.min(1, (value - inMin) / (inMax - inMin)));
}

// ── Google Books Query Builder ──────────────────────────────────────────────

function buildGoogleQuery(rawQuery, genre, difficulty, fictionIntent) {
  let gq = rawQuery
    .replace(/\b(about|with|a|an|the|books|novels|stories|show me|find me|looking for|i want|give me|some)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  // If fiction is intended, hint Google Books
  if (fictionIntent && !gq.toLowerCase().includes("fiction")) {
    gq += " fiction novels";
  }
  if (genre) gq += ` subject:${genre}`;
  if (difficulty === "Beginner") gq += " introductory easy";
  else if (difficulty === "Advanced") gq += " advanced comprehensive";

  return gq;
}

// ── Deduplication ───────────────────────────────────────────────────────────

/**
 * dedupeResults — deduplicates by normalized title+author key.
 * Keeps the result with the higher score.
 */
function dedupeResults(results) {
  const seen = new Map();
  for (const r of results) {
    const key = `${(r.book.title || "").toLowerCase().trim()}::${(r.book.author || "").toLowerCase().trim()}`;
    const existing = seen.get(key);
    if (!existing || r.score > existing.score) {
      seen.set(key, r);
    }
  }
  return [...seen.values()];
}

// ── Main Search Handler ─────────────────────────────────────────────────────

exports.semanticSearchBooks = asyncHandler(async (req, res) => {
  const { q = "", topN = 10, genre, difficulty } = req.query;
  const limit = Math.min(parseInt(topN, 10) || 10, 50);

  if (!q.trim()) {
    return res.status(400).json({
      success: false,
      message: "Query parameter 'q' is required for semantic search.",
    });
  }

  const timings = {};
  const t0 = performance.now();

  // ── Lazy imports (avoid circular deps) ──────────────────────────────────
  const { expandQuery, generateEmbeddingVariants, cleanQuery } = require('../ai/queryExpansionService');
  const { hybridSearch } = require('../recommendation/hybridSearch');
  const cache = require('../cache/inMemoryCache');
  const createLimiter = require('../utils/concurrency');
  const concurrencyLevel = Number(process.env.CONCURRENCY_LIMIT) || 3;
  const limitPool = createLimiter(concurrencyLevel);

  // ── Step 1: Clean + Expand Query ────────────────────────────────────────
  const cleanedQ = cleanQuery(q);
  const { expandedQuery, providerUsed } = await expandQuery(cleanedQ);
  const t1 = performance.now();
  timings.expansion = Math.round(t1 - t0);
  console.log(`🔍 Query expanded via [${providerUsed}]: "${cleanedQ}" → "${expandedQuery}"`);

  // ── Step 2: Intent Detection ────────────────────────────────────────────
  const { fictionIntent, anchorGenres } = detectSearchIntent(q);
  if (fictionIntent) {
    console.log(`📚 Fiction intent detected. Anchor genres: [${anchorGenres.join(", ")}]`);
  }

  // ── Step 3: Generate Embeddings ─────────────────────────────────────────
  const variants = generateEmbeddingVariants(expandedQuery);
  const embeddings = await Promise.all(
    variants.map(v =>
      limitPool(async () => {
        const key = `embed:${v.toLowerCase().trim()}`;
        let emb = cache.get(key);
        if (!emb) {
          emb = await embedText(v, 'RETRIEVAL_QUERY');
          if (emb && emb.length > 0) {
            cache.set(key, emb, Number(process.env.EMBEDDING_CACHE_TTL) || 86400);
          }
        }
        return emb;
      })
    )
  ).then(arr => arr.filter(e => e && e.length > 0));

  const t2 = performance.now();
  timings.embedding = Math.round(t2 - t1);

  // ── Step 4: PARALLEL — Local Semantic Search + Google Books ─────────────

  // 4a. Build local DB filter
  const dbFilter = {};
  if (genre) {
    dbFilter.genres = { $in: [genre] };
  }
  if (difficulty) dbFilter.difficultyLevel = difficulty;

  // Import isFiction for hard filtering
  const { isFiction } = require('../services/embeddingService');

  const localSearchPromise = (async () => {
    if (embeddings.length === 0) return [];

    let candidates = await Book.find(dbFilter).select(BOOK_FIELDS_FOR_SEARCH).lean();

    // ── HARD FICTION FILTER ──────────────────────────────────────────────
    // When fiction intent is detected, remove ALL non-fiction from candidates
    // BEFORE vector search. This is the single most impactful change —
    // eliminates journals, textbooks, reference books, Pokémon guides, etc.
    if (fictionIntent && !genre) {
      const fictionOnly = candidates.filter(b => isFiction(b));
      console.log(`📚 Fiction filter: ${candidates.length} → ${fictionOnly.length} candidates`);
      // Only apply if we still have enough candidates
      if (fictionOnly.length >= 5) {
        candidates = fictionOnly;
      } else {
        console.log(`⚠️ Too few fiction books (${fictionOnly.length}). Using full corpus with fiction-first ordering.`);
        // Put fiction books first, non-fiction last
        const nonFiction = candidates.filter(b => !isFiction(b));
        candidates = [...fictionOnly, ...nonFiction];
      }
    }

    if (candidates.length === 0) return [];
    return hybridSearch(embeddings, candidates, q.trim(), limit * 3); // over-fetch for merging
  })();

  // 4b. Google Books search in parallel
  const googleQuery = buildGoogleQuery(q, genre, difficulty, fictionIntent);
  const googleSearchPromise = searchGoogleBooks(googleQuery, { limit: limit * 2 })
    .catch(err => {
      console.error("Google Books fetch failed:", err.message);
      return { books: [], total: 0 };
    });

  // Wait for both
  const [localResults, googleData] = await Promise.all([localSearchPromise, googleSearchPromise]);
  const googleBooks = googleData.books || [];

  const t3 = performance.now();
  timings.search = Math.round(t3 - t2);


  // NOTE: Google Books results are NOT persisted here. Books are only saved to
  // MongoDB on explicit user intent (review, bookshelf, generate summary).

  // ── Step 5: Normalize Scores ────────────────────────────────────────────

  // 5a. Normalize local semantic scores
  // Observed range for Gemini embeddings after hybrid boost: ~0.20 to ~0.80
  const normalizedLocal = localResults.map(({ book, score }) => {
    const { embedding, ...bookData } = book;
    return {
      book: { ...bookData, source: "semantic" },
      score: normalize(score, 0.20, 0.80),
      rawScore: score,
    };
  });

  // 5b. Normalize Google Books results
  // Google doesn't give a relevance score, so we assign a decaying heuristic
  // based on position (Google returns results in relevance order)
  const normalizedGoogle = googleBooks.map((book, index) => {
    const positionScore = 1.0 - (index / (googleBooks.length || 1)) * 0.4; // 1.0 → 0.6
    return {
      book: {
        _id: book._id,
        title: book.title,
        author: book.author,
        genres: book.genres,
        description: book.description,
        difficultyLevel: book.difficultyLevel,
        averageRating: book.averageRating,
        ratingsCount: book.ratingsCount,
        coverImage: book.coverImage,
        previewLink: book.previewLink,
        googleBooksId: book.googleBooksId,
        source: "google_books",
      },
      score: positionScore * 0.85, // slightly lower base so strong semantic matches win
      rawScore: null,
    };
  });

  // ── Step 6: Merge + Deduplicate ─────────────────────────────────────────
  const combined = [...normalizedLocal, ...normalizedGoogle];
  const deduped = dedupeResults(combined);

  // ── Step 7: Dynamic Relative Threshold ──────────────────────────────────
  // Keep results within 75% of the top score (adapts to query difficulty)
  const maxScore = deduped[0]?.score ?? 0;
  const relativeThreshold = maxScore * 0.60; // keep top 60% quality band
  const filtered = deduped
    .sort((a, b) => b.score - a.score)
    .filter(r => r.score >= relativeThreshold)
    .slice(0, limit);

  const t4 = performance.now();
  timings.merge = Math.round(t4 - t3);
  timings.total = Math.round(t4 - t0);

  // ── Step 8: Determine search type label ─────────────────────────────────
  const hasSemantic = filtered.some(r => r.book.source === "semantic");
  const hasGoogle = filtered.some(r => r.book.source === "google_books");
  let searchType = "blended";
  if (hasSemantic && !hasGoogle) searchType = "semantic";
  else if (hasGoogle && !hasSemantic) searchType = "google_books";

  console.log(`📊 Final: ${filtered.length} results (${searchType}), topScore=${maxScore.toFixed(3)}, threshold=${relativeThreshold.toFixed(3)}, timings=${JSON.stringify(timings)}`);

  // ── Response ────────────────────────────────────────────────────────────
  return res.json({
    success: true,
    count: filtered.length,
    query: q.trim(),
    searchType,
    providerUsed,
    timings,
    results: filtered.map(({ book, score }) => ({
      book,
      similarityScore: parseFloat(score.toFixed(4)),
      similarityPercent: Math.min(100, Math.round(Math.max(0, score) * 100)),
    })),
  });
});
