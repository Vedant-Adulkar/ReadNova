// backend/src/controllers/recommendationController.js
const asyncHandler = require("../utils/asyncHandler");
const recommendationService = require("../services/recommendationService");
const gemini = require("../ai/geminiService");

// @desc   Get personalised book recommendations
// @route  GET /api/recommendations
// @access Protected
// Query:  ?query=short beginner mystery&topN=10
exports.getRecommendations = asyncHandler(async (req, res) => {
  const { query = "", topN = 10 } = req.query;

  try {
    const results = await recommendationService.getRecommendations(req.user, {
      query,
      topN: Math.min(parseInt(topN, 10) || 10, 50), // Hard cap at 50
    });

    res.json({ success: true, count: results.length, recommendations: results });
  } catch (error) {
    console.error("DEBUG: Recommendation error -", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// @desc   Get AI explanation for why a specific book was recommended
// @route  GET /api/recommendations/:bookId/explain
// @access Protected
exports.getExplanation = asyncHandler(async (req, res) => {
  const { book, explanation } = await recommendationService.getExplanation(
    req.user,
    req.params.bookId
  );
  res.json({ success: true, book, explanation });
});

// @desc   Get circuit-breaker health status for Gemini (debug / admin)
// @route  GET /api/recommendations/ai-health
// @access Protected
exports.getAIHealth = asyncHandler(async (req, res) => {
  const status = gemini.getBreakerStatus();
  res.json({ success: true, circuitBreaker: status });
});
