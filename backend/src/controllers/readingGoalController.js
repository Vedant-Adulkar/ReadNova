// backend/src/controllers/readingGoalController.js
const asyncHandler = require("../utils/asyncHandler");
const readingGoalService = require("../services/readingGoalService");

// @desc   Set or update yearly reading goal
// @route  POST /api/reading-goal
// @access Protected
exports.setGoal = asyncHandler(async (req, res) => {
  const { yearly } = req.body;
  const readingGoal = await readingGoalService.setGoal(req.user._id, Number(yearly));
  res.json({ success: true, readingGoal });
});

// @desc   Get reading progress for the current year
// @route  GET /api/reading-goal/progress
// @access Protected
exports.getProgress = asyncHandler(async (req, res) => {
  const progress = await readingGoalService.getProgress(req.user._id);
  res.json({ success: true, progress });
});
