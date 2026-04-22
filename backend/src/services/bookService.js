// backend/src/services/bookService.js
const crypto = require("crypto");
const Book = require("../models/Book");
const cloudinary = require("../config/cloudinary");
const paginate = require("../utils/paginate");
const gemini = require("../ai/geminiService");

// ── Stale lock threshold (5 minutes) ──────────────────────────────────────────
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

// ── Dedup hash: MD5 of normalised title + author ──────────────────────────────
const makeSummaryHash = (title, author) =>
  crypto
    .createHash("md5")
    .update(`${(title || "").toLowerCase().trim()}::${(author || "").toLowerCase().trim()}`)
    .digest("hex");

/**
 * createBook — admin-only book creation.
 *
 * @param {object} data  - Book fields (title, author, genres, etc.)
 * @returns {object}     - Created book document
 */
const createBook = async (data) => {
  const book = await Book.create(data);
  return book;
};

/**
 * getBooks — paginated book listing with optional full-text search
 * and attribute-level filters.
 *
 * Query params supported: q (text search), genre, difficulty, page, limit
 *
 * @param {object} query  - req.query object
 * @returns {{ books: object[], total: number, page: number, pages: number }}
 */
const getBooks = async (query) => {
  const { page, limit, skip } = paginate(query);
  const filter = {};

  // Full-text search using MongoDB's text index on title + author + description
  if (query.q && query.q.trim()) {
    filter.$text = { $search: query.q.trim() };
  }

  if (query.genre) {
    filter.genres = { $in: [query.genre] };
  }

  if (query.difficulty) {
    filter.difficultyLevel = query.difficulty;
  }

  const [books, total] = await Promise.all([
    Book.find(filter)
      .sort(query.q ? { score: { $meta: "textScore" } } : { createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Book.countDocuments(filter),
  ]);

  return { books, total, page, pages: Math.ceil(total / limit) };
};

/**
 * getBookById — fetch a single book by ID.
 *
 * @param {string} bookId
 * @returns {object}
 */
const getBookById = async (bookId) => {
  const book = await Book.findById(bookId).lean();
  if (!book) {
    const error = new Error("Book not found");
    error.statusCode = 404;
    throw error;
  }
  return book;
};

/**
 * updateBook — admin-only partial update.
 *
 * @param {string} bookId
 * @param {object} updates
 * @returns {object}
 */
const updateBook = async (bookId, updates) => {
  const book = await Book.findByIdAndUpdate(bookId, updates, {
    new: true,
    runValidators: true,
  }).lean();

  if (!book) {
    const error = new Error("Book not found");
    error.statusCode = 404;
    throw error;
  }
  return book;
};

/**
 * deleteBook — admin-only deletion. Also removes cover from Cloudinary.
 *
 * @param {string} bookId
 */
const deleteBook = async (bookId) => {
  const book = await Book.findById(bookId);
  if (!book) {
    const error = new Error("Book not found");
    error.statusCode = 404;
    throw error;
  }

  // Remove cover image from Cloudinary if it exists
  if (book.coverImagePublicId) {
    try {
      await cloudinary.uploader.destroy(book.coverImagePublicId);
    } catch (err) {
      console.warn("Could not remove Cloudinary image:", err.message);
    }
  }

  await book.deleteOne();
};

/**
 * uploadCoverImage — upload a book cover to Cloudinary via buffer stream.
 * Returns the secure URL and public_id for storage on the Book document.
 *
 * @param {Buffer} buffer       - File buffer from multer memoryStorage
 * @param {string} bookId       - Used to build a deterministic public_id
 * @returns {{ url: string, publicId: string }}
 */
const uploadCoverImage = (buffer, bookId) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "ai-book-buddy/covers",
        public_id: `book_${bookId}`,
        overwrite: true,
        resource_type: "image",
        transformation: [{ width: 400, height: 600, crop: "fill" }],
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    uploadStream.end(buffer);
  });
};

module.exports = { createBook, getBooks, getBookById, updateBook, deleteBook, uploadCoverImage, getOrGenerateSummary, clearStaleSummaryLocks, makeSummaryHash };

// ────────────────────────────────────────────────────────────────────────────
// Lazy AI Summary Generation (Caching Pipeline)
// ────────────────────────────────────────────────────────────────────────────

/**
 * getOrGenerateSummary — returns a cached AI summary if available,
 * otherwise generates one via Gemini, persists it, and triggers a re-embed.
 *
 * Concurrency-safe via atomic findOneAndUpdate lock.
 * Dedup-safe via summaryHash (MD5 of title+author).
 * Stale-safe via 5-minute lock timeout.
 *
 * @param {string} bookId
 * @returns {Promise<object|null>}  aiSummary object or null on failure
 */
async function getOrGenerateSummary(bookId) {
  // ── 1. Fetch book and check cache ───────────────────────────────────────
  const book = await Book.findById(bookId).lean();
  if (!book) return null;

  const currentVersion = gemini.SUMMARY_PROMPT_VERSION;

  // Cache hit: summary exists AND matches current prompt version
  if (
    book.aiSummary?.short &&
    book.summaryVersion === currentVersion
  ) {
    return book.aiSummary;
  }

  // ── 2. Dedup check: another book with same title+author already has summary
  const hash = makeSummaryHash(book.title, book.author);
  if (hash) {
    const existing = await Book.findOne({
      _id: { $ne: bookId },
      summaryHash: hash,
      summaryVersion: currentVersion,
      "aiSummary.short": { $ne: "" },
    }).lean();

    if (existing?.aiSummary?.short) {
      // Copy summary from duplicate
      await Book.findByIdAndUpdate(bookId, {
        aiSummary: existing.aiSummary,
        summaryVersion: currentVersion,
        summaryHash: hash,
        summaryGeneratedAt: existing.summaryGeneratedAt,
        isSummarizing: false,
      });
      console.log(`📋 Dedup: copied summary from "${existing.title}" → "${book.title}"`);
      return existing.aiSummary;
    }
  }

  // ── 3. Atomic lock acquisition ──────────────────────────────────────────
  // Only one process can lock at a time. Stale locks (>5 min) are overridden.
  const now = new Date();
  const staleThreshold = new Date(Date.now() - LOCK_TIMEOUT_MS);

  const locked = await Book.findOneAndUpdate(
    {
      _id: bookId,
      $or: [
        { isSummarizing: { $ne: true } },
        { isSummarizing: { $exists: false } },
        // Override stale locks: summaryGeneratedAt is used as lock timestamp
        { summaryGeneratedAt: { $lt: staleThreshold } },
        { summaryGeneratedAt: { $exists: false } },
        { summaryGeneratedAt: null },
      ],
    },
    {
      $set: { isSummarizing: true, summaryGeneratedAt: now },
    },
    { new: true }
  );

  if (!locked) {
    // Another request already holds the lock — return null (caller shows "generating...")
    console.log(`🔒 summary lock held for "${book.title}" — skipping.`);
    return null;
  }

  // ── 4. Generate summary via Gemini ──────────────────────────────────────
  try {
    const summary = await gemini.generateBookSummary(book);

    if (!summary || !summary.short) {
      // Generation failed — release lock
      await Book.findByIdAndUpdate(bookId, { isSummarizing: false });
      console.warn(`⚠️ Summary generation failed for "${book.title}"`);
      return null;
    }

    // ── 5. Persist summary + update tracking fields ─────────────────────
    await Book.findByIdAndUpdate(bookId, {
      aiSummary: summary,
      summaryVersion: currentVersion,
      summaryHash: hash,
      summaryGeneratedAt: new Date(),
      isSummarizing: false,
    });
    console.log(`✅ Generated + cached summary for "${book.title}" [${currentVersion}]`);

    // ── 6. Mandatory re-embed (fire-and-forget) ─────────────────────────
    // Import lazily to avoid circular dependency
    setImmediate(async () => {
      try {
        const { embedText, buildBookText, buildPineconeMetadata } = require("./embeddingService");
        const { getIndex, isPineconeConfigured } = require("./pineconeClient");

        const updatedBook = await Book.findById(bookId).lean();
        if (!updatedBook) return;

        const text = buildBookText(updatedBook);
        const embedding = await embedText(text);

        if (embedding.length > 0) {
          await Book.findByIdAndUpdate(bookId, {
            embedding,
            embeddingStatus: "done",
            embeddingVersion: "v3",
          });
          console.log(`🔄 Re-embedded "${updatedBook.title}" with AI summary data.`);

          // Upsert to Pinecone if configured
          if (isPineconeConfigured()) {
            try {
              await getIndex().upsert({
                records: [{
                  id: bookId.toString(),
                  values: embedding,
                  metadata: buildPineconeMetadata(updatedBook),
                }],
              });
              console.log(`📍 Pinecone upserted for "${updatedBook.title}".`);
            } catch (err) {
              console.warn(`⚠️ Pinecone upsert failed for "${updatedBook.title}":`, err.message);
            }
          }
        }
      } catch (err) {
        console.warn(`⚠️ Re-embed failed for bookId=${bookId}:`, err.message);
      }
    });

    return summary;
  } catch (err) {
    // Release lock on any error
    await Book.findByIdAndUpdate(bookId, { isSummarizing: false }).catch(() => { });
    console.error(`❌ getOrGenerateSummary error for "${book.title}":`, err.message);
    return null;
  }
}

/**
 * clearStaleSummaryLocks — clears isSummarizing flags that got stuck
 * (e.g., server crash mid-generation). Called on server startup.
 *
 * @returns {Promise<number>}  Number of stale locks cleared
 */
async function clearStaleSummaryLocks() {
  const staleThreshold = new Date(Date.now() - LOCK_TIMEOUT_MS);

  const result = await Book.updateMany(
    {
      isSummarizing: true,
      $or: [
        { summaryGeneratedAt: { $lt: staleThreshold } },
        { summaryGeneratedAt: { $exists: false } },
        { summaryGeneratedAt: null },
      ],
    },
    { $set: { isSummarizing: false } }
  );

  const cleared = result.modifiedCount || 0;
  if (cleared > 0) {
    console.log(`🔓 Cleared ${cleared} stale summary lock(s) on startup.`);
  }
  return cleared;
}
