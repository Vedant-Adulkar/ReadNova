// backend/src/controllers/bookController.js
const asyncHandler = require("../utils/asyncHandler");
const bookService = require("../services/bookService");
const gemini = require("../ai/geminiService");
const reviewService = require("../services/reviewService");
const Book = require("../models/Book");
const googleBooksService = require("../services/googleBooksService");
const embeddingService = require("../services/embeddingService");

// @desc   Create a new book
// @route  POST /api/books
// @access Admin
exports.createBook = asyncHandler(async (req, res) => {
  const book = await bookService.createBook(req.body);
  res.status(201).json({ success: true, book });
});

// @desc   Get all books (paginated, searchable)
// @route  GET /api/books
// @access Public
exports.getBooks = asyncHandler(async (req, res) => {
  const result = await bookService.getBooks(req.query);
  res.json({ success: true, ...result });
});

// @desc   Get single book by ID
// @route  GET /api/books/:id
// @access Public
exports.getBookById = asyncHandler(async (req, res) => {
  const book = await bookService.getBookById(req.params.id);
  res.json({ success: true, book });
});

// @desc   Update a book
// @route  PUT /api/books/:id
// @access Admin
exports.updateBook = asyncHandler(async (req, res) => {
  const book = await bookService.updateBook(req.params.id, req.body);
  res.json({ success: true, book });
});

// @desc   Delete a book
// @route  DELETE /api/books/:id
// @access Admin
exports.deleteBook = asyncHandler(async (req, res) => {
  await bookService.deleteBook(req.params.id);
  res.json({ success: true, message: "Book deleted successfully" });
});

// @desc   Upload book cover image
// @route  POST /api/books/:id/cover
// @access Admin
exports.uploadCover = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error("No image file provided");
  }
  const { url, publicId } = await bookService.uploadCoverImage(
    req.file.buffer,
    req.params.id
  );
  // Persist URLs on the book document
  const book = await bookService.updateBook(req.params.id, {
    coverImage: url,
    coverImagePublicId: publicId,
  });
  res.json({ success: true, book });
});

// @desc   Get AI-generated structured summary of a book (fetch ONLY, no auto-gen)
// @route  GET /api/books/:id/summary
// @access Public
exports.getAISummary = asyncHandler(async (req, res) => {
  const book = await bookService.getBookById(req.params.id);

  if (!book.aiSummary?.short) {
    return res.json({
      success: true,
      summary: null,
      message: "No summary available for this book. Use the generate-summary endpoint.",
    });
  }

  res.json({ success: true, summary: book.aiSummary, cached: true });
});

// @desc   Force generate an AI summary for a book (on-demand)
// @route  POST /api/books/:id/generate-summary
// @access Private
exports.generateSummary = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const isMongoId = (val) => /^[a-f\d]{24}$/i.test(val);

  // 1. Resolve Book (Database or Google Import)
  let book;
  if (isMongoId(id)) {
    book = await Book.findById(id);
  } else {
    book = await Book.findOne({ googleBooksId: id });
    
    if (!book) {
      console.log(`📥 Importing book "${id}" from Google Books for on-demand summary...`);
      const googleBook = await googleBooksService.getGoogleBookById(id);
      if (!googleBook) {
        return res.status(404).json({ success: false, message: "Book not found in Google API" });
      }

      book = new Book({
        title: googleBook.title,
        author: googleBook.author,
        description: googleBook.description || "No description available",
        genres: googleBook.genres || [],
        coverImage: googleBook.coverImage || "",
        googleBooksId: id,
        source: "google_books"
      });
      await book.save();
    }
  }

  if (!book) {
    return res.status(404).json({ success: false, message: "Book not found" });
  }

  // 2. Pre-Lock Generation Guard (Cost prevention)
  if (book.aiSummary?.short?.trim()) {
    return res.json({ success: true, book, cached: true });
  }

  // 3. Atomic Locking (Atomic update to prevent race conditions)
  const lockQuery = isMongoId(id) ? { _id: book._id } : { googleBooksId: id };
  const lockedBook = await Book.findOneAndUpdate(
    { ...lockQuery, isSummarizing: { $ne: true } },
    { $set: { isSummarizing: true } },
    { new: true }
  );

  if (!lockedBook) {
    return res.status(429).json({ success: false, message: "Generation already in progress." });
  }

  try {
    // 4. Generate AI Summary (via Fallback Chain)
    const summary = await gemini.generateBookSummary(lockedBook);
    if (!summary || !summary.short) {
      throw new Error("AI provider returned empty summary");
    }

    // 5. Sanitization
    const clean = (t) => (t || "").replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
    const finalSummary = {
      short: clean(summary.short).slice(0, 500),
      detailed: clean(summary.detailed).slice(0, 2000),
      themes: summary.themes || [],
      keywords: summary.keywords || [],
      tone: summary.tone || "Informative",
      audience: summary.audience || "General Readers"
    };

    // 6. Enrichment: Re-calculate Text Embedding (Structured for precision)
    const embeddingText = `
      Title: ${lockedBook.title}
      Author: ${lockedBook.author}
      Description: ${lockedBook.description || ""}
      Summary: ${finalSummary.short}
    `;
    const embedding = await embeddingService.embedText(embeddingText);

    // 7. Persist & Release Lock
    const updatedBook = await Book.findByIdAndUpdate(
      lockedBook._id,
      {
        $set: {
          aiSummary: finalSummary,
          summaryVersion: gemini.SUMMARY_PROMPT_VERSION || "v2",
          summaryGeneratedAt: new Date(),
          embedding: embedding.length > 0 ? embedding : lockedBook.embedding,
          embeddingStatus: embedding.length > 0 ? "done" : "failed",
          isSummarizing: false
        }
      },
      { new: true }
    );

    console.log(`✨ Successfully generated AI summary and re-embedded: "${updatedBook.title}"`);
    res.json({ success: true, book: updatedBook });

  } catch (error) {
    console.error("❌ Summary generation failed:", error.message);
    
    // Release lock on failure
    await Book.findByIdAndUpdate(lockedBook._id, { $set: { isSummarizing: false } });
    
    res.status(500).json({ 
      success: false, 
      message: "Failed to generate AI summary. Please try again later." 
    });
  }
});

// @desc   Get AI-generated community sentiment from reviews
// @route  GET /api/books/:id/review-summary
// @access Public
exports.getReviewSummary = asyncHandler(async (req, res) => {
  const { reviews } = await reviewService.getBookReviews(req.params.id, {
    page: 1,
    limit: 30,
  });
  const summary = await gemini.summarizeReviews(reviews);
  res.json({ success: true, summary });
});
