/**
 * errorMiddleware — central Express error handler.
 *
 * Maps common Mongoose and JWT error types to appropriate HTTP status codes.
 * In production the stack trace is hidden; in development it is included.
 */
const errorHandler = (err, req, res, next) => {
  // Use the status already set on the response (if any), else default to 500
  let statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  let message = err.message || "Internal Server Error";

  // ── Mongoose: invalid ObjectId ─────────────────────────
  if (err.name === "CastError" && err.kind === "ObjectId") {
    statusCode = 400;
    message = `Invalid ID format: ${err.value}`;
  }

  // ── Mongoose: schema validation failed ─────────────────
  if (err.name === "ValidationError") {
    statusCode = 400;
    // Collect all field-level messages into one string
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(". ");
  }

  // ── Mongoose: duplicate key (unique index violation) ────
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || "field";
    message = `Duplicate value for '${field}'. Please use a different value.`;
  }

  // ── JWT errors ─────────────────────────────────────────
  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid token";
  }
  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Token has expired";
  }

  res.status(statusCode).json({
    success: false,
    message,
    // Only expose stack trace in development
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

module.exports = errorHandler;
