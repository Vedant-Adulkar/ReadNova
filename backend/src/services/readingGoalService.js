// backend/src/services/readingGoalService.js
const User = require("../models/User");

/**
 * setGoal — set or update the user's yearly reading goal.
 *
 * @param {string} userId
 * @param {number} yearly  - Target number of books for the year
 * @returns {object}       - { yearly, year }
 */
const setGoal = async (userId, yearly) => {
  if (!Number.isInteger(yearly) || yearly < 1) {
    const error = new Error("Yearly goal must be a positive integer");
    error.statusCode = 400;
    throw error;
  }

  const currentYear = new Date().getFullYear();
  const user = await User.findByIdAndUpdate(
    userId,
    { readingGoal: { yearly, year: currentYear } },
    { new: true, runValidators: true }
  ).select("readingGoal");

  return user.readingGoal;
};

/**
 * getProgress — calculate how many books the user has completed this year
 * vs. their yearly goal.
 *
 * @param {string} userId
 * @returns {{ goal: number, year: number, completed: number, percentage: number }}
 */
const getProgress = async (userId) => {
  const user = await User.findById(userId)
    .select("bookshelf.completed readingGoal")
    .populate("bookshelf.completed.book", "title")
    .lean();

  const { yearly = 0, year = new Date().getFullYear() } = user.readingGoal || {};

  // Count books added to the completed shelf in the goal year
  const startOfYear = new Date(`${year}-01-01T00:00:00.000Z`);
  const endOfYear = new Date(`${year}-12-31T23:59:59.999Z`);

  const completedThisYear = (user.bookshelf.completed || []).filter((entry) => {
    const addedAt = new Date(entry.addedAt);
    return addedAt >= startOfYear && addedAt <= endOfYear;
  }).length;

  const percentage =
    yearly > 0 ? Math.min(Math.round((completedThisYear / yearly) * 100), 100) : 0;

  return { goal: yearly, year, completed: completedThisYear, percentage };
};

module.exports = { setGoal, getProgress };
