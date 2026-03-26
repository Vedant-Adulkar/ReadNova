// backend/src/controllers/adminController.js
const asyncHandler = require("../utils/asyncHandler");
const adminService = require("../services/adminService");
const bookService = require("../services/bookService");
const Book = require("../models/Book");
const { embedText, buildBookText } = require("../services/embeddingService");

// ─── Dashboard ───────────────────────────────────────────────────────────────
// @desc   Get admin dashboard stats
// @route  GET /api/admin/stats
// @access Admin
exports.getDashboardStats = asyncHandler(async (req, res) => {
  const stats = await adminService.getDashboardStats();
  res.json({ success: true, stats });
});

// ─── User Management ─────────────────────────────────────────────────────────
// @desc   List all users
// @route  GET /api/admin/users
// @access Admin
exports.listUsers = asyncHandler(async (req, res) => {
  const result = await adminService.listUsers(req.query);
  res.json({ success: true, ...result });
});

// @desc   Update a user's role
// @route  PUT /api/admin/users/:userId/role
// @access Admin
exports.updateUserRole = asyncHandler(async (req, res) => {
  const user = await adminService.updateUserRole(req.params.userId, req.body.role);
  res.json({ success: true, user });
});

// @desc   Delete a user (and their reviews)
// @route  DELETE /api/admin/users/:userId
// @access Admin
exports.deleteUser = asyncHandler(async (req, res) => {
  await adminService.deleteUser(req.params.userId);
  res.json({ success: true, message: "User deleted successfully" });
});

// ─── Book Management (admin shortcuts — full CRUD handled in bookRoutes) ─────
// @desc   List paginated books (admin view with extra fields)
// @route  GET /api/admin/books
// @access Admin
exports.listBooks = asyncHandler(async (req, res) => {
  const result = await bookService.getBooks(req.query);
  res.json({ success: true, ...result });
});

// ─── Review Moderation ────────────────────────────────────────────────────────
// @desc   List all reviews
// @route  GET /api/admin/reviews
// @access Admin
exports.listAllReviews = asyncHandler(async (req, res) => {
  const result = await adminService.listAllReviews(req.query);
  res.json({ success: true, ...result });
});

// @desc   Delete any review
// @route  DELETE /api/admin/reviews/:reviewId
// @access Admin
exports.deleteReview = asyncHandler(async (req, res) => {
  await adminService.adminDeleteReview(req.params.reviewId);
  res.json({ success: true, message: "Review deleted by admin" });
});

// ─── Semantic Embedding Management ────────────────────────────────────────────
// @desc   Generate Gemini embeddings for all books
// @route  POST /api/admin/generate-embeddings
// @access Admin
// @query  overwrite=true  (optional) Re-embed books that already have a vector
exports.generateEmbeddings = asyncHandler(async (req, res) => {
  const overwrite = req.query.overwrite === "true";

  // Fire the batch process — this can take minutes for large catalogs.
  // We respond immediately with an acknowledgment and let it run async.
  // For production, this should be a background job (e.g., Bull queue).
  const stats = await adminService.generateAllBookEmbeddings(overwrite);

  res.json({
    success: true,
    message: `Book embedding generation complete.`,
    ...stats,
  });
});

// ─── Embed Missing Books ───────────────────────────────────────────────────────
// @desc   Background-embed all books that currently have no embedding vector
// @route  POST /api/admin/embed-missing
// @access Admin
exports.embedMissingBooks = asyncHandler(async (req, res) => {
  const unembedded = await Book.find({
    $or: [
      { embedding: { $exists: false } },
      { embedding: { $size: 0 } },
      { embedding: null },
    ],
  }).lean();

  // Respond immediately — the actual work runs in the background
  res.json({
    success: true,
    message: `Embedding ${unembedded.length} books in the background...`,
    count: unembedded.length,
  });

  // Fire-and-forget embedding loop
  (async () => {
    let success = 0;
    let failed = 0;
    for (const bookDoc of unembedded) {
      try {
        const text = buildBookText(bookDoc);
        const vector = await embedText(text);
        if (vector.length > 0) {
          await Book.findByIdAndUpdate(bookDoc._id, { embedding: vector });
          success += 1;
          console.log(`  ✅ [embed-missing] "${bookDoc.title}"`);
        } else {
          failed += 1;
          console.warn(`  ⚠️  [embed-missing] Empty vector for "${bookDoc.title}"`);
        }
      } catch (err) {
        failed += 1;
        console.error(`  ❌ [embed-missing] "${bookDoc.title}":`, err.message);
      }
    }
    console.log(`\n✨ [embed-missing] Done — success: ${success}, failed: ${failed}`);
  })();
});
