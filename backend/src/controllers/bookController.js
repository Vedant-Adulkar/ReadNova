// backend/src/controllers/bookController.js
const asyncHandler = require("../utils/asyncHandler");
const bookService = require("../services/bookService");
const gemini = require("../ai/geminiService");
const reviewService = require("../services/reviewService");

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

// @desc   Get AI-generated simplified summary of a book
// @route  GET /api/books/:id/summary
// @access Public
exports.getAISummary = asyncHandler(async (req, res) => {
  const book = await bookService.getBookById(req.params.id);
  const summary = await gemini.generateBookSummary(book);
  res.json({ success: true, summary });
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
