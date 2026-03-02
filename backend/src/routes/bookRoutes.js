// backend/src/routes/bookRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const { body } = require("express-validator");

const bookController = require("../controllers/bookController");
const googleBooksController = require("../controllers/googleBooksController");
const { protect, adminOnly } = require("../middleware/authMiddleware");
const validate = require("../middleware/validateMiddleware");
const { geminiLimiter } = require("../middleware/rateLimitMiddleware");
const { semanticSearchBooks } = require("../controllers/searchController");

// Multer configured with memory storage (buffer passed to Cloudinary stream)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) return cb(null, true);
    cb(new Error("Only image files are allowed"), false);
  },
});

const bookValidation = [
  body("title").trim().notEmpty().withMessage("Title is required"),
  body("author").trim().notEmpty().withMessage("Author is required"),
  body("difficultyLevel")
    .optional()
    .isIn(["Beginner", "Intermediate", "Advanced"])
    .withMessage("Invalid difficulty level"),
  body("genres").optional().isArray().withMessage("Genres must be an array"),
];

// ── Public routes ──────────────────────────────────────────
router.get("/", bookController.getBooks);

// ── Google Books Live Search (MUST be before /:id) ──────────────────────────
// GET /api/books/google-search?q=...&limit=20&page=1
router.get("/google-search", googleBooksController.searchGoogleBooks);

// ── Semantic Search (MUST be before /:id to avoid ObjectId cast error) ──────
// GET /api/books/semantic-search?q=dark+mystery&topN=10&genre=Fiction
router.get("/semantic-search", protect, geminiLimiter, semanticSearchBooks);

// ── Google Books single volume (MUST be before /:id) ─────────────────────────
// GET /api/books/google-volume/:volumeId
router.get("/google-volume/:volumeId", googleBooksController.getGoogleBookById);

// ── Single book & AI features ─────────────────────────────
router.get("/:id", bookController.getBookById);
router.get("/:id/summary", geminiLimiter, bookController.getAISummary);
router.get("/:id/review-summary", geminiLimiter, bookController.getReviewSummary);

// ── Admin routes ───────────────────────────────────────────
router.post(
  "/",
  protect,
  adminOnly,
  validate(bookValidation),
  bookController.createBook
);

router.put(
  "/:id",
  protect,
  adminOnly,
  validate(bookValidation),
  bookController.updateBook
);

router.delete("/:id", protect, adminOnly, bookController.deleteBook);

// Cover image upload (multipart form)
router.post(
  "/:id/cover",
  protect,
  adminOnly,
  upload.single("cover"),
  bookController.uploadCover
);

module.exports = router;
