// backend/src/routes/recommendationRoutes.js
const express = require("express");
const router = express.Router();

const recommendationController = require("../controllers/recommendationController");
const { protect } = require("../middleware/authMiddleware");
const { geminiLimiter } = require("../middleware/rateLimitMiddleware");

// All recommendation routes require a logged-in user
router.use(protect);

// GET  /api/recommendations?query=short mystery&topN=10
router.get("/", geminiLimiter, recommendationController.getRecommendations);

// GET  /api/recommendations/ai-health  — circuit-breaker status
router.get("/ai-health", recommendationController.getAIHealth);

// GET  /api/recommendations/:bookId/explain
router.get("/:bookId/explain", geminiLimiter, recommendationController.getExplanation);

module.exports = router;
