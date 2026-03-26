// backend/src/controllers/bookshelfController.js
const asyncHandler = require("../utils/asyncHandler");
const mongoose = require("mongoose");
const bookshelfService = require("../services/bookshelfService");
const Book = require("../models/Book");
const { getGoogleBookById } = require("../services/googleBooksService");

// ─── Helper: is this a valid MongoDB ObjectId? ────────────────────────────────
const isMongoId = (id) => mongoose.Types.ObjectId.isValid(id) && /^[a-f\d]{24}$/i.test(id);

/**
 * resolveBookId
 *
 * If `bookId` is already a Mongo ObjectId → use it directly.
 * If it looks like a Google Books volume ID → fetch the volume from Google Books
 * and upsert it into MongoDB, then return the local _id.
 *
 * This lets users add Google Books results to their shelf without needing a
 * separate "import" step.
 */
const resolveBookId = async (bookId) => {
  if (isMongoId(bookId)) return bookId;

  // Try to find an existing local book with this googleBooksId
  const existing = await Book.findOne({ googleBooksId: bookId }).select("_id").lean();
  if (existing) return existing._id.toString();

  // Fetch from Google Books and save to MongoDB
  const googleBook = await getGoogleBookById(bookId);

  const newBook = await Book.create({
    title: googleBook.title,
    author: googleBook.author,
    genres: googleBook.genres,
    description: googleBook.description,
    coverImage: googleBook.coverImage,
    averageRating: googleBook.averageRating,
    ratingsCount: googleBook.ratingsCount,
    difficultyLevel: googleBook.difficultyLevel || "Beginner",
    pageCount: googleBook.pageCount,
    publishedDate: googleBook.publishedDate,
    googleBooksId: bookId,
    embedding: [],
    contentRating: "General",
  });

  return newBook._id.toString();
};

// @desc   Get user's full bookshelf (all 3 shelves, populated)
// @route  GET /api/bookshelf
// @access Protected
exports.getBookshelf = asyncHandler(async (req, res) => {
  const bookshelf = await bookshelfService.getBookshelf(req.user._id);
  res.json({ success: true, bookshelf });
});

// @desc   Add a book to WantToRead shelf
//         Accepts both MongoDB ObjectIds AND Google Books volume IDs.
//         Google Books volumes are auto-saved to MongoDB on first add.
// @route  POST /api/bookshelf/:bookId
// @access Protected
exports.addToShelf = asyncHandler(async (req, res) => {
  const resolvedId = await resolveBookId(req.params.bookId);
  const bookshelf = await bookshelfService.addToShelf(req.user._id, resolvedId);
  res.status(201).json({ success: true, bookshelf, resolvedBookId: resolvedId });
});

// @desc   Move a book between shelves
// @route  PUT /api/bookshelf/:bookId/move
// @access Protected
// Body:   { from: 'wantToRead', to: 'reading' }
exports.moveShelf = asyncHandler(async (req, res) => {
  const { from, to } = req.body;
  const resolvedId = await resolveBookId(req.params.bookId);
  const bookshelf = await bookshelfService.moveShelf(req.user._id, resolvedId, from, to);
  res.json({ success: true, bookshelf });
});

// @desc   Remove a book from a specific shelf
// @route  DELETE /api/bookshelf/:bookId
// @access Protected
// Query:  ?shelf=wantToRead
exports.removeFromShelf = asyncHandler(async (req, res) => {
  const shelf = req.query.shelf || "wantToRead";
  // For remove, resolve only if it's a Google Books ID (it may already be saved)
  const resolvedId = await resolveBookId(req.params.bookId);
  const bookshelf = await bookshelfService.removeFromShelf(req.user._id, resolvedId, shelf);
  res.json({ success: true, bookshelf });
});
