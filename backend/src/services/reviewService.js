// backend/src/services/reviewService.js
const Review = require("../models/Review");
const Book = require("../models/Book");
const User = require("../models/User");

/**
 * recalculateBookRating — recompute averageRating and ratingsCount
 * on the Book document after any create/update/delete.
 *
 * @param {string} bookId
 */
const recalculateBookRating = async (bookId) => {
  const stats = await Review.aggregate([
    { $match: { bookId: require("mongoose").Types.ObjectId.createFromHexString(bookId.toString()) } },
    {
      $group: {
        _id: "$bookId",
        averageRating: { $avg: "$rating" },
        ratingsCount: { $sum: 1 },
      },
    },
  ]);

  if (stats.length > 0) {
    await Book.findByIdAndUpdate(bookId, {
      averageRating: Math.round(stats[0].averageRating * 10) / 10, // 1 decimal
      ratingsCount: stats[0].ratingsCount,
    });
  } else {
    // All reviews deleted
    await Book.findByIdAndUpdate(bookId, { averageRating: 0, ratingsCount: 0 });
  }
};

/**
 * createReview — user submits a review for a book.
 *
 * Business rule: the book MUST be in the user's Completed shelf.
 *
 * @param {string} userId
 * @param {string} bookId
 * @param {{ rating: number, reviewText: string }} data
 * @returns {object}  Created review
 */
const createReview = async (userId, bookId, { rating, reviewText }) => {
  // ── 1. Enforce "must have completed the book" rule ──────
  const user = await User.findById(userId).select("bookshelf.completed");
  const hasCompleted = user.bookshelf.completed.some(
    (e) => e.book.toString() === bookId.toString()
  );

  if (!hasCompleted) {
    const error = new Error(
      "You can only review books that are on your Completed shelf"
    );
    error.statusCode = 403;
    throw error;
  }

  // ── 2. Create review (unique index handles duplicate protection) ─
  const review = await Review.create({ userId, bookId, rating, reviewText });

  // ── 3. Update book rating stats ──────────────────────────
  await recalculateBookRating(bookId);

  return review;
};

/**
 * getBookReviews — paginated reviews for a specific book.
 *
 * @param {string} bookId
 * @param {object} query  - req.query (page, limit)
 * @returns {{ reviews: object[], total: number }}
 */
const getBookReviews = async (bookId, query) => {
  const paginate = require("../utils/paginate");
  const { skip, limit, page } = paginate(query);

  const [reviews, total] = await Promise.all([
    Review.find({ bookId })
      .populate("userId", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Review.countDocuments({ bookId }),
  ]);

  return { reviews, total, page, pages: Math.ceil(total / limit) };
};

/**
 * updateReview — owner or admin can update rating/reviewText.
 *
 * @param {string} reviewId
 * @param {string} userId    - Must match review.userId (or be admin)
 * @param {object} updates   - { rating?, reviewText? }
 * @param {string} role      - Caller's role
 * @returns {object}
 */
const updateReview = async (reviewId, userId, updates, role) => {
  const review = await Review.findById(reviewId);
  if (!review) {
    const error = new Error("Review not found");
    error.statusCode = 404;
    throw error;
  }

  if (review.userId.toString() !== userId.toString() && role !== "admin") {
    const error = new Error("Not authorised to update this review");
    error.statusCode = 403;
    throw error;
  }

  if (updates.rating !== undefined) review.rating = updates.rating;
  if (updates.reviewText !== undefined) review.reviewText = updates.reviewText;
  await review.save();

  await recalculateBookRating(review.bookId);
  return review;
};

/**
 * deleteReview — owner or admin can delete.
 *
 * @param {string} reviewId
 * @param {string} userId
 * @param {string} role
 */
const deleteReview = async (reviewId, userId, role) => {
  const review = await Review.findById(reviewId);
  if (!review) {
    const error = new Error("Review not found");
    error.statusCode = 404;
    throw error;
  }

  if (review.userId.toString() !== userId.toString() && role !== "admin") {
    const error = new Error("Not authorised to delete this review");
    error.statusCode = 403;
    throw error;
  }

  const bookId = review.bookId;
  await review.deleteOne();
  await recalculateBookRating(bookId);
};

module.exports = { createReview, getBookReviews, updateReview, deleteReview };
