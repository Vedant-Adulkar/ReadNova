// backend/src/routes/reviewRoutes.js
const express = require("express");
const router = express.Router();
const { body } = require("express-validator");

const reviewController = require("../controllers/reviewController");
const { protect } = require("../middleware/authMiddleware");
const validate = require("../middleware/validateMiddleware");

// Note: JSON bodies send `rating` as a number; validator.isInt expects strings unless
// we coerce first — use custom validation to accept both.
const reviewValidation = [
  body("rating")
    .notEmpty()
    .withMessage("Rating is required")
    .custom((value) => {
      const n = Number(value);
      if (isNaN(n) || !Number.isInteger(n) || n < 1 || n > 5) {
        throw new Error("Rating must be a whole number between 1 and 5");
      }
      return true;
    }),
  body("reviewText")
    .trim()
    .notEmpty()
    .withMessage("Review text is required")
    .isLength({ min: 10, max: 2000 })
    .withMessage("Review must be 10–2000 characters"),
];

// GET  /api/reviews/:bookId  — public
router.get("/:bookId/summary", reviewController.getReviewSummary);
router.get("/:bookId", reviewController.getBookReviews);

// POST /api/reviews/:bookId  — protected
router.post(
  "/:bookId",
  protect,
  validate(reviewValidation),
  reviewController.createReview
);

// PUT  /api/reviews/:reviewId  — protected
router.put(
  "/:reviewId",
  protect,
  validate([
    body("rating")
      .optional()
      .custom((value) => {
        if (value === undefined || value === null || value === "") return true;
        const n = typeof value === "number" ? value : parseInt(String(value), 10);
        if (!Number.isInteger(n) || n < 1 || n > 5) {
          throw new Error("Rating must be an integer between 1 and 5");
        }
        return true;
      }),
    body("reviewText")
      .optional()
      .trim()
      .isLength({ min: 10, max: 2000 })
      .withMessage("Review 10–2000 chars"),
  ]),
  reviewController.updateReview
);

// DELETE /api/reviews/:reviewId  — protected (owner or admin)
router.delete("/:reviewId", protect, reviewController.deleteReview);

module.exports = router;
