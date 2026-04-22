// backend/src/recommendation/semanticSearch.js
// Pure semantic search using cosine similarity between a query embedding
// and each book's pre-computed embedding vector.
//
// Assumes book.embedding fields have already been populated by
// embeddingService.embedBooksInBatches().

const cosineSimilarity = require("../utils/cosineSimilarity");

/**
 * semanticSearch — ranks books by cosine similarity using a DYNAMIC threshold.
 *
 * Instead of a fixed cutoff, we compute the top score first, then only keep
 * results within a band of the top score (min floor of 0.42). This means the
 * threshold adapts to each query's natural score distribution.
 *
 * @param {number[]} queryEmbedding
 * @param {object[]} books
 * @param {number}   [topN=10]
 * @returns {Array<{ book: object, score: number }>}
 */
const semanticSearch = (queryEmbedding, books, topN = 10) => {
  if (!queryEmbedding || queryEmbedding.length === 0) {
    return [];
  }

  const scored = books.map((book) => {
    const bookEmbedding = book.embedding || [];
    const score =
      bookEmbedding.length > 0
        ? cosineSimilarity(queryEmbedding, bookEmbedding)
        : 0;
    return { book, score };
  });

  const sorted = scored.sort((a, b) => b.score - a.score);
  const topScore = sorted[0]?.score ?? 0;
  const dynamicThreshold = Math.max(0.42, topScore - 0.08);
  console.log(`🎯 Semantic: topScore=${topScore.toFixed(3)}, threshold=${dynamicThreshold.toFixed(3)}, candidates=${sorted.filter(r => r.score >= dynamicThreshold).length}`);

  return sorted
    .filter((r) => r.score >= dynamicThreshold)
    .slice(0, topN);
};

/**
 * hasEmbeddings — quick check: do any books in the collection have embeddings?
 * @param {object[]} books
 * @returns {boolean}
 */
const hasEmbeddings = (books) =>
  books.some((b) => Array.isArray(b.embedding) && b.embedding.length > 0);

// ── Genre-aware re-ranking helpers ──────────────────────────────────────────

// Query terms that signal the user wants fictional/narrative content
// BROAD list — includes thematic terms like "space", "dragon", "magic" etc.
const FICTION_QUERY_SIGNALS = [
  // Genre names
  'sci-fi', 'scifi', 'sci fi', 'science fiction', 'fiction', 'fantasy',
  'thriller', 'mystery', 'horror', 'romance', 'adventure', 'detective',
  // Narrative terms
  'novel', 'novels', 'story', 'stories', 'narrative', 'plot',
  'characters', 'protagonist', 'coming-of-age', 'saga',
  // Subgenre / thematic signals
  'dystopian', 'dystopia', 'space opera', 'cyberpunk', 'steampunk',
  'world-building', 'worldbuilding', 'epic',
  // Thematic content words that almost always mean fiction
  'dragon', 'dragons', 'magic', 'magical', 'wizard', 'sword', 'quest',
  'space', 'galaxy', 'starship', 'alien', 'aliens', 'vampire', 'werewolf',
  'zombie', 'demon', 'kingdom', 'empire', 'war', 'battle', 'heist',
  'detective', 'murder', 'spy', 'assassin', 'pirate', 'knight',
  'intrigue', 'haunted', 'ghost', 'monster',
];

// Genres that indicate actual narrative fiction
const FICTION_GENRES = [
  'fiction', 'science fiction', 'fantasy', 'thriller', 'mystery',
  'horror', 'romance', 'adventure', 'historical fiction', 'literary fiction',
  'young adult', 'juvenile fiction', 'comics', 'graphic novels',
  'action', 'suspense', 'crime', 'drama',
];

// Genres that indicate reference/non-fiction (should be penalised on fiction queries)
const NON_FICTION_GENRES = [
  'technology', 'science', 'astronomy', 'industrial arts', 'knowledge',
  'periodicals', 'serial publications', 'literary criticism',
  'bibliographies', 'indexes', 'reference', 'self-help', 'self help',
  'business', 'biography', 'history', 'education', 'political science',
  'law', 'mathematics', 'computers', 'medical', 'health', 'philosophy',
  'psychology', 'social science', 'religion', 'language arts',
  'true crime', 'nature', 'gardening', 'cooking', 'sports',
  'transportation', 'architecture', 'art', 'performing arts',
  'juvenile nonfiction', 'language study',
];

// Primary genre categories (before the "/") that are ALWAYS non-fiction,
// even when combined with fiction subgenres (e.g. "Literary Criticism / Science Fiction")
const ALWAYS_NONFICTION_PRIMARY = [
  'literary criticism', 'reference', 'bibliographies', 'indexes',
  'performing arts', 'social science', 'political science',
  'biography', 'education', 'philosophy', 'psychology',
  'technology', 'computers', 'medical', 'health', 'law',
];

// Title words that strongly indicate a reference/non-fiction book
const REFERENCE_TITLE_SIGNALS = [
  'guide', 'introduction', 'encyclopedia', 'dictionary', 'handbook',
  'textbook', 'manual', 'yearbook', 'journal', 'proceedings',
  'bulletin', 'review of', 'annals', 'transactions', 'index',
  'catalogue', 'catalog', 'bibliography', 'companion to',
  'mechanic', 'mirror of science', 'humboldt library',
  'congressional record', 'saturday evening post',
  // Media/criticism — not narrative fiction
  'studies', 'movies', 'movie', 'films', 'film', 'tv ',
  'television', 'marketplace', 'review index', 'book review',
  'digest', 'who\'s who', 'almanac', 'atlas',
  'exploration of the universe',
];

/**
 * detectFictionIntent — returns true if the query is looking for fiction/narrative.
 * @param {string} query
 * @returns {boolean}
 */
const detectFictionIntent = (query) => {
  const q = query.toLowerCase();
  return FICTION_QUERY_SIGNALS.some((sig) => q.includes(sig));
};

/**
 * isReferenceBook — checks if a book is likely a reference/periodical/non-fiction
 * based on its title and genres.
 * @param {object} book
 * @returns {boolean}
 */
const isReferenceBook = (book) => {
  const titleLower = (book.title || "").toLowerCase();
  const genres = (book.genres || []).map((g) => g.toLowerCase());

  // Check title for reference signals
  const titleIsReference = REFERENCE_TITLE_SIGNALS.some((sig) =>
    titleLower.includes(sig)
  );
  if (titleIsReference) return true;

  // Check if any genre has a PRIMARY category (before "/") that is always non-fiction.
  // e.g. "Literary Criticism / Science Fiction & Fantasy" → primary = "literary criticism" → non-fiction
  const hasPrimaryNonfiction = genres.some((g) => {
    const primary = g.split('/')[0].trim();
    return ALWAYS_NONFICTION_PRIMARY.some((nfp) => primary.includes(nfp));
  });
  if (hasPrimaryNonfiction) return true;

  // Check if ALL genres are non-fiction (no fiction genre at all)
  if (genres.length > 0) {
    const hasPureFiction = genres.some((g) => {
      // Only count as fiction if the PRIMARY category is fiction-like,
      // not just because it contains "fiction" as a substring in a compound genre
      const primary = g.split('/')[0].trim();
      return FICTION_GENRES.some((fg) => primary.includes(fg));
    });
    const hasNonFiction = genres.some((g) =>
      NON_FICTION_GENRES.some((nfg) => g.includes(nfg))
    );
    if (hasNonFiction && !hasPureFiction) return true;
  }

  return false;
};

/**
 * getGenreAdjustment — returns a score adjustment based on genre match.
 * Heavily penalizes non-fiction and reference books when fiction is intended.
 *
 * @param {object} book
 * @param {boolean} fictionIntent
 * @returns {number}
 */
const getGenreAdjustment = (book, fictionIntent) => {
  if (!fictionIntent) return 0;
  const genres = (book.genres || []).map((g) => g.toLowerCase());

  // Reference books get the hardest penalty
  if (isReferenceBook(book)) return -0.40;

  if (genres.length === 0) return 0;

  // Check for non-fiction genres
  const hasNonFiction = genres.some((g) =>
    NON_FICTION_GENRES.some((nfg) => g.includes(nfg))
  );
  if (hasNonFiction) {
    // Only count as fiction if the PRIMARY genre category is fiction
    const hasPureFiction = genres.some((g) => {
      const primary = g.split('/')[0].trim();
      return FICTION_GENRES.some((fg) => primary.includes(fg));
    });
    // Even "mixed" books get a meaningful penalty — the user wants narrative fiction
    return hasPureFiction ? -0.15 : -0.30;
  }

  const hasFiction = genres.some((g) => {
    const primary = g.split('/')[0].trim();
    return FICTION_GENRES.some((fg) => primary.includes(fg));
  });
  if (hasFiction) return 0.10;

  return 0;
};

// ── Synonym expansion map ───────────────────────────────────────────────────
// Maps shorthand/alternate terms to their canonical genre names for matching.
const SYNONYM_MAP = {
  'sci': ['science fiction'],
  'scifi': ['science fiction'],
  'sci-fi': ['science fiction'],
  'fantasy': ['fantasy', 'fantastical'],
  'space': ['science fiction', 'space opera', 'space'],
  'dragon': ['fantasy', 'dragons'],
  'dragons': ['fantasy', 'dragons'],
  'magic': ['fantasy', 'magic', 'magical'],
  'horror': ['horror', 'supernatural', 'dark'],
  'mystery': ['mystery', 'detective', 'crime'],
  'romance': ['romance', 'love', 'romantic'],
  'thriller': ['thriller', 'suspense', 'crime'],
  'adventure': ['adventure', 'action', 'quest'],
  'epic': ['epic', 'saga', 'epic fantasy'],
  'political': ['political', 'politics', 'intrigue', 'political fiction'],
  'war': ['war', 'military', 'battle'],
  'spy': ['spy', 'espionage', 'intelligence'],
};

/**
 * applyHybridKeywordBoost
 *
 * Re-ranks semantic hits with:
 *  - 0.70 × vector score (cosine similarity)
 *  - keyword overlap on title/description/genres/AI keywords
 *  - ±genre adjustment when query implies fiction intent
 *  - reference book penalty
 *
 * @param {string} rawQuery  - Original user query (not the LLM-expanded one)
 * @param {Array<{ book: object, baseScore: number }>} items
 * @param {number} limit
 * @returns {Array<{ book: object, score: number }>}
 */
const applyHybridKeywordBoost = (rawQuery, items, limit) => {
  const cleanedQuery = rawQuery.trim().toLowerCase();
  
  // 1. Identify meaningful tokens (filter out common filler and noise)
  const noise = new Set([
    "books", "book", "novels", "novel", "about", "with", "find", "show",
    "me", "stories", "the", "a", "an", "for", "in", "reading",
    "recommendations", "detailed", "technical", "complex", "that",
    "have", "has", "are", "is", "like", "want", "looking", "give",
    "some", "good", "best", "great", "top",
  ]);
  const coreTokens = cleanedQuery
    .split(/\s+/)
    .filter(t => t.length > 1 && !noise.has(t));

  const fictionIntent = detectFictionIntent(cleanedQuery);

  if (fictionIntent) {
    console.log(`📚 Fiction intent detected for: "${rawQuery}"`);
  }

  const ranked = items
    .map(({ book, baseScore }) => {
      const titleLower = (book.title || "").toLowerCase();
      const descLower = (book.description || "").toLowerCase();
      const genreStrings = (book.genres || []).map(g => g.toLowerCase());
      const summaryKeywords = (book.aiSummary?.keywords || []).map(k => k.toLowerCase());
      const summaryThemes = (book.aiSummary?.themes || []).map(t => t.toLowerCase());

      let keywordScore = 0;
      let coreTokenHits = 0;

      // 2. Score by meaningful tokens (with synonym expansion)
      for (const token of coreTokens) {
        let hit = false;
        
        // Build expanded terms list using synonym map
        const expandedTerms = [token, ...(SYNONYM_MAP[token] || [])];
        
        for (const term of expandedTerms) {
          // Title match is a STRONG signal
          if (titleLower.includes(term)) {
            keywordScore += 0.12;
            hit = true;
          }
          
          // Genre match
          if (genreStrings.some(g => g.includes(term))) {
            keywordScore += 0.10;
            hit = true;
          }

          // AI keywords or themes match
          if (summaryKeywords.some(k => k.includes(term)) ||
              summaryThemes.some(t => t.includes(term))) {
            keywordScore += 0.08;
            hit = true;
          }

          // Description match is moderate
          if (descLower.includes(term)) {
            keywordScore += 0.04;
            hit = true;
          }
        }

        if (hit) coreTokenHits++;
      }

      // 3. Coverage modifier — penalize books that match NONE of the core tokens
      let coverageModifier = 0;
      if (coreTokens.length > 0) {
        const coverage = coreTokenHits / coreTokens.length;
        if (coverage === 0 && baseScore < 0.75) {
          coverageModifier = -0.10; // penalty for zero coverage
        } else if (coverage >= 0.5) {
          coverageModifier = 0.05; // bonus for good coverage
        }
      }

      // 4. Genre adjustment (fiction vs non-fiction)
      const genreAdj = getGenreAdjustment(book, fictionIntent);
      
      // 5. Final score
      const finalKeywordScore = Math.min(keywordScore, 0.35);
      const finalScore = 0.70 * baseScore + finalKeywordScore + coverageModifier + genreAdj;

      return { book, score: finalScore };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return ranked;
};

module.exports = { semanticSearch, hasEmbeddings, applyHybridKeywordBoost };
