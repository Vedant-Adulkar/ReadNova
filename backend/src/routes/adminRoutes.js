// backend/src/routes/adminRoutes.js
const express = require("express");
const router = express.Router();
const { body } = require("express-validator");

const adminController = require("../controllers/adminController");
const { protect, adminOnly } = require("../middleware/authMiddleware");
const validate = require("../middleware/validateMiddleware");

// All admin routes require authentication AND admin role
router.use(protect, adminOnly);

// GET  /api/admin/stats
router.get("/stats", adminController.getDashboardStats);

// ─── User Management ─────────────────────────────────────
// GET    /api/admin/users
router.get("/users", adminController.listUsers);

// PUT    /api/admin/users/:userId/role
router.put(
  "/users/:userId/role",
  validate([
    body("role")
      .isIn(["user", "admin"])
      .withMessage("Role must be 'user' or 'admin'"),
  ]),
  adminController.updateUserRole
);

// DELETE /api/admin/users/:userId
router.delete("/users/:userId", adminController.deleteUser);

// ─── Book Management ──────────────────────────────────────
// GET    /api/admin/books
router.get("/books", adminController.listBooks);

// ─── Review Moderation ────────────────────────────────────
// GET    /api/admin/reviews
router.get("/reviews", adminController.listAllReviews);

// DELETE /api/admin/reviews/:reviewId
router.delete("/reviews/:reviewId", adminController.deleteReview);

// ─── Embedding Management ─────────────────────────────────
// POST   /api/admin/generate-embeddings
// Query: ?overwrite=true  (optional, re-embeds already-embedded books)
router.post("/generate-embeddings", adminController.generateEmbeddings);

// POST   /api/admin/embed-missing
// Embeds only books that currently have an empty embedding array (fire-and-forget)
router.post("/embed-missing", adminController.embedMissingBooks);

module.exports = router;
