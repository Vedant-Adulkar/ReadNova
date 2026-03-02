const jwt = require("jsonwebtoken");
const asyncHandler = require("../utils/asyncHandler");
const User = require("../models/User");

/**
 * protect — verifies the Bearer JWT in the Authorization header.
 * Attaches the full user document (without password) to req.user.
 * Returns 401 if the token is missing, malformed, or expired.
 */
const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    res.status(401);
    throw new Error("Not authorised — no token provided");
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    res.status(401);
    throw new Error("Not authorised — token invalid or expired");
  }

  // Re-fetch user from DB so role/status changes take effect immediately
  const user = await User.findById(decoded.id).select("-password");
  if (!user) {
    res.status(401);
    throw new Error("Not authorised — user no longer exists");
  }

  req.user = user;
  next();
});

/**
 * adminOnly — must be used AFTER protect.
 * Returns 403 if the authenticated user is not an admin.
 */
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    return next();
  }
  res.status(403);
  throw new Error("Forbidden — admin access required");
};

module.exports = { protect, adminOnly };
