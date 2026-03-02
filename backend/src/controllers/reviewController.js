// backend/src/controllers/reviewController.js
const asyncHandler = require("../utils/asyncHandler");
const reviewService = require("../services/reviewService");

// @desc   Submit a review for a book (book must be in Completed shelf)
// @route  POST /api/reviews/:bookId
// @access Protected
exports.createReview = asyncHandler(async (req, res) => {
  const { rating, reviewText } = req.body;
  const review = await reviewService.createReview(
    req.user._id,
    req.params.bookId,
    { rating, reviewText }
  );
  res.status(201).json({ success: true, review });
});

// @desc   Get all reviews for a book (paginated)
// @route  GET /api/reviews/:bookId
// @access Public
exports.getBookReviews = asyncHandler(async (req, res) => {
  const result = await reviewService.getBookReviews(req.params.bookId, req.query);
  res.json({ success: true, ...result });
});

// @desc   Update own review
// @route  PUT /api/reviews/:reviewId
// @access Protected
exports.updateReview = asyncHandler(async (req, res) => {
  const review = await reviewService.updateReview(
    req.params.reviewId,
    req.user._id,
    req.body,
    req.user.role
  );
  res.json({ success: true, review });
});

// @desc   Delete own review (or admin)
// @route  DELETE /api/reviews/:reviewId
// @access Protected
exports.deleteReview = asyncHandler(async (req, res) => {
  await reviewService.deleteReview(
    req.params.reviewId,
    req.user._id,
    req.user.role
  );
  res.json({ success: true, message: "Review deleted successfully" });
});
