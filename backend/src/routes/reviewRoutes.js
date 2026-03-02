// backend/src/routes/reviewRoutes.js
const express = require("express");
const router = express.Router();
const { body } = require("express-validator");

const reviewController = require("../controllers/reviewController");
const { protect } = require("../middleware/authMiddleware");
const validate = require("../middleware/validateMiddleware");

const reviewValidation = [
  body("rating")
    .isInt({ min: 1, max: 5 })
    .withMessage("Rating must be between 1 and 5"),
  body("reviewText")
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage("Review must be 10–2000 characters"),
];

// GET  /api/reviews/:bookId  — public
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
    body("rating").optional().isInt({ min: 1, max: 5 }).withMessage("Rating 1–5"),
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
