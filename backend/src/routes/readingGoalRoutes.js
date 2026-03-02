// backend/src/routes/readingGoalRoutes.js
const express = require("express");
const router = express.Router();
const { body } = require("express-validator");

const readingGoalController = require("../controllers/readingGoalController");
const { protect } = require("../middleware/authMiddleware");
const validate = require("../middleware/validateMiddleware");

router.use(protect);

// POST /api/reading-goal
router.post(
  "/",
  validate([
    body("yearly")
      .isInt({ min: 1, max: 10000 })
      .withMessage("Yearly goal must be a positive integer"),
  ]),
  readingGoalController.setGoal
);

// GET /api/reading-goal/progress
router.get("/progress", readingGoalController.getProgress);

module.exports = router;
