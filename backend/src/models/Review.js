const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference is required"],
    },
    bookId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Book",
      required: [true, "Book reference is required"],
    },
    rating: {
      type: Number,
      required: [true, "Rating is required"],
      min: [1, "Rating must be at least 1"],
      max: [5, "Rating cannot exceed 5"],
    },
    reviewText: {
      type: String,
      required: [true, "Review text is required"],
      trim: true,
      minlength: [10, "Review must be at least 10 characters"],
      maxlength: [2000, "Review cannot exceed 2000 characters"],
    },
  },
  { timestamps: true }
);

// ── Indexes ────────────────────────────────────────────────
// Composite unique index: one review per user per book
reviewSchema.index({ userId: 1, bookId: 1 }, { unique: true });

// Fast lookup of all reviews for a book (used in summarization)
reviewSchema.index({ bookId: 1, createdAt: -1 });

module.exports = mongoose.model("Review", reviewSchema);
