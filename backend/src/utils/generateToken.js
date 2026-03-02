const jwt = require("jsonwebtoken");

/**
 * Generate a signed JWT for the given user.
 *
 * @param {string} userId  - MongoDB ObjectId as string
 * @param {string} role    - 'user' or 'admin'
 * @returns {string}       - Signed JWT token
 */
const generateToken = (userId, role) => {
  return jwt.sign({ id: userId, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

module.exports = generateToken;
