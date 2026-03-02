// backend/src/routes/authRoutes.js
const express = require("express");
const router = express.Router();
const { body } = require("express-validator");

const authController = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");
const validate = require("../middleware/validateMiddleware");
const { authLimiter } = require("../middleware/rateLimitMiddleware");

// Apply strict rate limiting to all auth routes
router.use(authLimiter);

// POST /api/auth/register
router.post(
  "/register",
  validate([
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().normalizeEmail().withMessage("Valid email required"),
    body("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters"),
    body("age").optional().isInt({ min: 1, max: 120 }).withMessage("Invalid age"),
  ]),
  authController.register
);

// POST /api/auth/login
router.post(
  "/login",
  validate([
    body("email").isEmail().normalizeEmail().withMessage("Valid email required"),
    body("password").notEmpty().withMessage("Password is required"),
  ]),
  authController.login
);

// GET /api/auth/me  (protected)
router.get("/me", protect, authController.getMe);

// PUT /api/auth/preferences  (protected)
router.put(
  "/preferences",
  protect,
  validate([
    body("embedding")
      .isArray({ min: 1 })
      .withMessage("Embedding must be a non-empty array"),
  ]),
  authController.updatePreferences
);

module.exports = router;
