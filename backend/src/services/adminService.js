// backend/src/services/adminService.js
const User = require("../models/User");
const Book = require("../models/Book");
const Review = require("../models/Review");
const paginate = require("../utils/paginate");
const { embedBooksInBatches } = require("./embeddingService");

// ──────────────────────────────── User Management ────────────────────────────

/**
 * listUsers — paginated list of all users (admin view).
 * @param {object} query - req.query (page, limit, role filter)
 */
const listUsers = async (query) => {
  const { page, limit, skip } = paginate(query);
  const filter = {};
  if (query.role) filter.role = query.role;

  const [users, total] = await Promise.all([
    User.find(filter)
      .select("-password -preferenceEmbedding")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  return { users, total, page, pages: Math.ceil(total / limit) };
};

/**
 * updateUserRole — promote or demote a user.
 * @param {string} userId
 * @param {string} role - 'user' | 'admin'
 */
const updateUserRole = async (userId, role) => {
  if (!["user", "admin"].includes(role)) {
    const error = new Error("Role must be 'user' or 'admin'");
    error.statusCode = 400;
    throw error;
  }
  const user = await User.findByIdAndUpdate(userId, { role }, { new: true }).select("-password");
  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }
  return user;
};

/**
 * deleteUser — remove a user and all their reviews.
 * @param {string} userId
 */
const deleteUser = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }
  // Clean up their reviews so book ratings stay accurate
  await Review.deleteMany({ userId });
  await user.deleteOne();
};

// ──────────────────────────────── Review Moderation ──────────────────────────

/**
 * listAllReviews — paginated list of every review (moderation view).
 * @param {object} query
 */
const listAllReviews = async (query) => {
  const { page, limit, skip } = paginate(query);

  const [reviews, total] = await Promise.all([
    Review.find({})
      .populate("userId", "name email")
      .populate("bookId", "title author")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Review.countDocuments(),
  ]);

  return { reviews, total, page, pages: Math.ceil(total / limit) };
};

/**
 * adminDeleteReview — hard-delete any review and update the book's rating stats.
 * @param {string} reviewId
 */
const adminDeleteReview = async (reviewId) => {
  const review = await Review.findById(reviewId);
  if (!review) {
    const error = new Error("Review not found");
    error.statusCode = 404;
    throw error;
  }
  const bookId = review.bookId;
  await review.deleteOne();

  // Recalculate book rating
  const stats = await Review.aggregate([
    { $match: { bookId } },
    { $group: { _id: "$bookId", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  if (stats.length > 0) {
    await Book.findByIdAndUpdate(bookId, {
      averageRating: Math.round(stats[0].avg * 10) / 10,
      ratingsCount: stats[0].count,
    });
  } else {
    await Book.findByIdAndUpdate(bookId, { averageRating: 0, ratingsCount: 0 });
  }
};

// ──────────────────────────────── Dashboard Stats ────────────────────────────

/**
 * getDashboardStats — high-level counts for admin dashboard.
 */
const getDashboardStats = async () => {
  const [totalUsers, totalBooks, totalReviews, embeddedBooks] = await Promise.all([
    User.countDocuments(),
    Book.countDocuments(),
    Review.countDocuments(),
    Book.countDocuments({ embedding: { $not: { $size: 0 } } }),
  ]);
  return { totalUsers, totalBooks, totalReviews, embeddedBooks };
};

// ──────────────────────────────── Embedding Management ───────────────────────

/**
 * generateAllBookEmbeddings — bulk-generates Gemini embeddings for all books
 * that don't have one yet (or all books if overwrite=true).
 *
 * @param {boolean} overwrite  If true, re-embeds books that already have a vector.
 * @returns {Promise<{ processed: number, failed: number, skipped: number }>}
 */
const generateAllBookEmbeddings = async (overwrite = false) => {
  return embedBooksInBatches({ overwrite });
};

module.exports = {
  listUsers,
  updateUserRole,
  deleteUser,
  listAllReviews,
  adminDeleteReview,
  getDashboardStats,
  generateAllBookEmbeddings,
};
