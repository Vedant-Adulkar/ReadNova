// backend/src/services/reviewService.js
const mongoose = require("mongoose");
const Review = require("../models/Review");
const Book = require("../models/Book");
const User = require("../models/User");

/**
 * resolveBookMongoId — map route param (Mongo ObjectId string OR Google Books volume id)
 * to the canonical Book document _id. Returns null if no book exists in DB.
 *
 * @param {string} paramId
 * @returns {Promise<import("mongoose").Types.ObjectId | null>}
 */
const resolveBookMongoId = async (paramId) => {
  if (paramId == null || paramId === "") return null;
  const s = String(paramId).trim();

  if (mongoose.Types.ObjectId.isValid(s) && /^[a-f\d]{24}$/i.test(s)) {
    const byId = await Book.findById(s).select("_id").lean();
    if (byId) return byId._id;
  }

  const byGoogle = await Book.findOne({ googleBooksId: s }).select("_id").lean();
  if (byGoogle) return byGoogle._id;

  // Fallback: fuzzy match by title & author (helps with seeded books lacking googleBooksId)
  // This is only safe if we have enough metadata to be reasonably sure (title + author)
  if (!mongoose.Types.ObjectId.isValid(s)) {
    const { getGoogleBookById } = require("./googleBooksService");
    try {
      const gBook = await getGoogleBookById(s);
      if (gBook && gBook.title && gBook.author) {
        // First try fuzzy match by title & author
        const byTitleAuthor = await Book.findOne({
          title: { $regex: new RegExp(`^${gBook.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
          author: { $regex: new RegExp(`^${gBook.author.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
        }).select("_id").lean();
        
        if (byTitleAuthor) return byTitleAuthor._id;

        // If still not found, AUTO-IMPORT from Google Books
        const newBook = await Book.create({
          title: gBook.title,
          author: gBook.author,
          genres: (gBook.genres || []).slice(0, 10), // Schema allows max 10
          description: (gBook.description || "").slice(0, 5000),
          coverImage: gBook.coverImage,
          averageRating: 0, // Isolate internal-only ratings
          ratingsCount: 0,  // Isolate internal-only counts
          difficultyLevel: gBook.difficultyLevel || "Beginner",
          pageCount: gBook.pageCount,
          googleBooksId: s,
          contentRating: "General",
          source: "google_books",
        });
        return newBook._id;
      }
    } catch (err) {
      console.error("Auto-import failed during resolveBookMongoId:", err.message);
      return null;
    }
  }

  return null;
};

/**
 * recalculateBookRating — recompute averageRating and ratingsCount
 * on the Book document after any create/update/delete.
 *
 * @param {string} bookId
 */
const recalculateBookRating = async (bookId) => {
  const bid = mongoose.Types.ObjectId.isValid(bookId)
    ? new mongoose.Types.ObjectId(String(bookId))
    : bookId;

  const stats = await Review.aggregate([
    { $match: { bookId: bid } },
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
const createReview = async (userId, routeBookId, { rating, reviewText }) => {
  const bookId = await resolveBookMongoId(routeBookId);
  if (!bookId) {
    const error = new Error("Book not found — import or open the book from the catalog first.");
    error.statusCode = 404;
    throw error;
  }

  const ratingNum = typeof rating === "number" ? rating : parseInt(String(rating), 10);
  const text = String(reviewText || "").trim();

  // Rule relaxed: user no longer needs to have the book on their Completed shelf to review it.
  // We just proceed with creation.

  // ── 2. Create review (unique index handles duplicate protection) ─
  const review = await Review.create({
    userId,
    bookId,
    rating: ratingNum,
    reviewText: text,
  });

  await review.populate("userId", "name");

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
const getBookReviews = async (routeBookId, query) => {
  const paginate = require("../utils/paginate");
  const { skip, limit, page } = paginate(query);

  const bookId = await resolveBookMongoId(routeBookId);
  if (!bookId) {
    return { reviews: [], total: 0, page, pages: 0 };
  }

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

/**
 * Get internal summary of reviews for a book (averages, counts)
 * @param {string} bookId - Mongo ID or Google Books ID
 * @returns {Promise<Object>} Summary object
 */
const getReviewSummary = async (bookId) => {
  const bid = await resolveBookMongoId(bookId);
  if (!bid) {
    return { averageRating: 0, totalReviews: 0 };
  }

  const stats = await Review.aggregate([
    { $match: { bookId: bid } },
    {
      $group: {
        _id: "$bookId",
        averageRating: { $avg: "$rating" },
        totalReviews: { $sum: 1 },
      },
    },
  ]);

  if (stats.length === 0) {
    return { averageRating: 0, totalReviews: 0 };
  }

  return {
    averageRating: Math.round(stats[0].averageRating * 10) / 10,
    totalReviews: stats[0].totalReviews,
  };
};

module.exports = {
  createReview,
  getBookReviews,
  updateReview,
  deleteReview,
  resolveBookMongoId,
  getReviewSummary,
};
