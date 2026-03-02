// backend/src/controllers/googleBooksController.js
const asyncHandler = require("../utils/asyncHandler");
const { searchGoogleBooks, getGoogleBookById } = require("../services/googleBooksService");

/**
 * searchGoogleBooks
 *
 * @route  GET /api/books/google-search
 * @access Public
 * @query  q      {string}  Search query (required)
 * @query  limit  {number}  Max results, default 20, max 40
 * @query  page   {number}  Page number (1-based), default 1
 */
exports.searchGoogleBooks = asyncHandler(async (req, res) => {
  const { q = "", limit = 20, page = 1 } = req.query;

  if (!q.trim()) {
    return res.status(400).json({
      success: false,
      message: "Query parameter 'q' is required.",
    });
  }

  const parsedLimit = Math.min(parseInt(limit, 10) || 20, 40);
  const startIndex = (Math.max(parseInt(page, 10) || 1, 1) - 1) * parsedLimit;

  const { books, total } = await searchGoogleBooks(q.trim(), {
    limit: parsedLimit,
    startIndex,
  });

  return res.json({
    success: true,
    source: "google_books",
    query: q.trim(),
    total,
    books,
  });
});

/**
 * getGoogleBookById
 *
 * @route  GET /api/books/google-volume/:volumeId
 * @access Public
 */
exports.getGoogleBookById = asyncHandler(async (req, res) => {
  const { volumeId } = req.params;
  const book = await getGoogleBookById(volumeId);
  return res.json({ success: true, book });
});
