// backend/src/controllers/bookshelfController.js
const asyncHandler = require("../utils/asyncHandler");
const bookshelfService = require("../services/bookshelfService");

// @desc   Get user's full bookshelf (all 3 shelves, populated)
// @route  GET /api/bookshelf
// @access Protected
exports.getBookshelf = asyncHandler(async (req, res) => {
  const bookshelf = await bookshelfService.getBookshelf(req.user._id);
  res.json({ success: true, bookshelf });
});

// @desc   Add a book to WantToRead shelf
// @route  POST /api/bookshelf/:bookId
// @access Protected
exports.addToShelf = asyncHandler(async (req, res) => {
  const bookshelf = await bookshelfService.addToShelf(
    req.user._id,
    req.params.bookId
  );
  res.status(201).json({ success: true, bookshelf });
});

// @desc   Move a book between shelves
// @route  PUT /api/bookshelf/:bookId/move
// @access Protected
// Body:   { from: 'wantToRead', to: 'reading' }
exports.moveShelf = asyncHandler(async (req, res) => {
  const { from, to } = req.body;
  const bookshelf = await bookshelfService.moveShelf(
    req.user._id,
    req.params.bookId,
    from,
    to
  );
  res.json({ success: true, bookshelf });
});

// @desc   Remove a book from a specific shelf
// @route  DELETE /api/bookshelf/:bookId
// @access Protected
// Query:  ?shelf=wantToRead
exports.removeFromShelf = asyncHandler(async (req, res) => {
  const shelf = req.query.shelf || "wantToRead";
  const bookshelf = await bookshelfService.removeFromShelf(
    req.user._id,
    req.params.bookId,
    shelf
  );
  res.json({ success: true, bookshelf });
});
