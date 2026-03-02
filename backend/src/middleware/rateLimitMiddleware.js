const rateLimit = require("express-rate-limit");

/**
 * Shared rate-limit message format for all limiters.
 */
const rateLimitMessage = (windowMinutes) => ({
  success: false,
  message: `Too many requests. Please try again after ${windowMinutes} minute(s).`,
});

/**
 * globalLimiter — applied to all routes.
 * 200 requests per 15 minutes per IP.
 */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage(15),
});

/**
 * authLimiter — applied to /api/auth routes.
 * Prevents brute-force login & registration attacks.
 * 10 requests per 15 minutes per IP.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage(15),
  skipSuccessfulRequests: false,
});

/**
 * geminiLimiter — applied to AI-heavy routes.
 * Prevents quota exhaustion caused by a single user spamming.
 * 10 requests per 1 minute per IP.
 */
const geminiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage(1),
});

module.exports = { globalLimiter, authLimiter, geminiLimiter };
