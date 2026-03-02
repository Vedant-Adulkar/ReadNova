// backend/src/controllers/authController.js
const asyncHandler = require("../utils/asyncHandler");
const authService = require("../services/authService");

// @desc   Register a new user
// @route  POST /api/auth/register
// @access Public
exports.register = asyncHandler(async (req, res) => {
  const { name, email, password, age } = req.body;
  const { user, token } = await authService.register({ name, email, password, age });
  res.status(201).json({ success: true, token, user });
});

// @desc   Login user and get token
// @route  POST /api/auth/login
// @access Public
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const { user, token } = await authService.login({ email, password });
  res.json({ success: true, token, user });
});

// @desc   Get logged-in user profile
// @route  GET /api/auth/me
// @access Protected
exports.getMe = asyncHandler(async (req, res) => {
  res.json({ success: true, user: req.user });
});

// @desc   Update preference embedding after quiz
// @route  PUT /api/auth/preferences
// @access Protected
exports.updatePreferences = asyncHandler(async (req, res) => {
  const { embedding, personalityProfile } = req.body;
  const user = await authService.updatePreferenceEmbedding(
    req.user._id,
    embedding,
    personalityProfile
  );
  res.json({ success: true, user });
});
