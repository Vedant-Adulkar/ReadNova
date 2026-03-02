// backend/src/services/authService.js
const User = require("../models/User");
const generateToken = require("../utils/generateToken");
const { embedText } = require("./embeddingService");

/**
 * register — create a new user account.
 * Password hashing is handled by the User model's pre-save hook.
 *
 * @param {{ name, email, password, age }} data
 * @returns {{ user: object, token: string }}
 */
const register = async ({ name, email, password, age }) => {
  // Check for existing account
  const existing = await User.findOne({ email });
  if (existing) {
    const error = new Error("An account with this email already exists");
    error.statusCode = 409;
    throw error;
  }

  const user = await User.create({ name, email, password, age });
  const token = generateToken(user._id, user.role);

  return { user: user.toJSON(), token };
};

/**
 * login — authenticate a user and return a token.
 *
 * @param {{ email, password }} credentials
 * @returns {{ user: object, token: string }}
 */
const login = async ({ email, password }) => {
  // Explicitly select password (field is select:false in schema)
  const user = await User.findOne({ email }).select("+password");

  if (!user) {
    const error = new Error("Invalid email or password");
    error.statusCode = 401;
    throw error;
  }

  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    const error = new Error("Invalid email or password");
    error.statusCode = 401;
    throw error;
  }

  const token = generateToken(user._id, user.role);
  return { user: user.toJSON(), token };
};

/**
 * updatePreferenceEmbedding — store the vector generated from quiz answers.
 * If a personalityProfile string is provided and no pre-computed embedding
 * is supplied, automatically generates one via Gemini text-embedding-004.
 * This activates the content-based recommendation engine for the user.
 *
 * @param {string}   userId
 * @param {number[]} embedding          - Pre-computed vector (may be empty)
 * @param {string}   [personalityProfile]
 */
const updatePreferenceEmbedding = async (userId, embedding, personalityProfile) => {
  const update = {};

  let finalEmbedding = embedding || [];
  if (personalityProfile && finalEmbedding.length === 0) {
    console.log(`🧠 Auto-generating preference embedding for user ${userId}...`);
    finalEmbedding = await embedText(personalityProfile);
  }

  if (finalEmbedding.length > 0) update.preferenceEmbedding = finalEmbedding;
  if (personalityProfile !== undefined) update.personalityProfile = personalityProfile;

  return User.findByIdAndUpdate(userId, update, { new: true });
};

module.exports = { register, login, updatePreferenceEmbedding };
