// backend/src/controllers/recommendationController.js
const asyncHandler = require("../utils/asyncHandler");
const recommendationService = require("../services/recommendationService");
const gemini = require("../ai/geminiService");

// @desc   Get personalised book recommendations
// @route  GET /api/recommendations?mood=Happy  OR  ?query=short mystery&topN=10
// @access Protected
// ── Mood takes priority over query — they are mutually exclusive ─────────────
exports.getRecommendations = asyncHandler(async (req, res) => {
  const { mood, query, topN = 10 } = req.query;

  // Build a clean input object: mood OR query, never both
  const input = {};
  if (mood) {
    input.mood = mood;
  } else if (query) {
    input.query = query;
  }
  input.topN = Math.min(parseInt(topN, 10) || 10, 50); // hard cap at 50

  try {
    const results = await recommendationService.getRecommendations(req.user, input);
    res.json({ success: true, count: results.length, recommendations: results });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ success: false, message: error.message });
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
