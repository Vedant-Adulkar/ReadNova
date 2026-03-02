// backend/server.js
// ─────────────────────────────────────────────────────────────────────────────
// Entry point for the AI-Powered Social Book Recommendation Platform API.
// Loads environment variables, connects to MongoDB, configures middleware,
// mounts all route groups, and starts the Express server.
// ─────────────────────────────────────────────────────────────────────────────

require("dotenv").config(); // Must be first so all env vars are available

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");

const connectDB = require("./src/config/db");
const errorHandler = require("./src/middleware/errorMiddleware");
const { globalLimiter } = require("./src/middleware/rateLimitMiddleware");

// ── Route imports ─────────────────────────────────────────────────────────────
const authRoutes = require("./src/routes/authRoutes");
const bookRoutes = require("./src/routes/bookRoutes");
const bookshelfRoutes = require("./src/routes/bookshelfRoutes");
const reviewRoutes = require("./src/routes/reviewRoutes");
const recommendationRoutes = require("./src/routes/recommendationRoutes");
const readingGoalRoutes = require("./src/routes/readingGoalRoutes");
const adminRoutes = require("./src/routes/adminRoutes");

// ── Connect to MongoDB ─────────────────────────────────────────────────────────
connectDB();

// ── Create Express app ────────────────────────────────────────────────────────
const app = express();

// ── Security middleware ───────────────────────────────────────────────────────
app.use(helmet()); // Sets secure HTTP headers

// CORS — allow origins from env (supports multiple comma-separated values)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. Postman, curl) in development
      if (!origin || process.env.NODE_ENV === "development") return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
    credentials: true,
  })
);

// ── General middleware ────────────────────────────────────────────────────────
app.use(globalLimiter);                           // Global rate limiter
app.use(express.json({ limit: "10kb" }));         // JSON body parser (limit prevents large payloads)
app.use(express.urlencoded({ extended: false })); // URL-encoded body parser
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ── API Routes ────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/books", bookRoutes);
app.use("/api/bookshelf", bookshelfRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/recommendations", recommendationRoutes);
app.use("/api/reading-goal", readingGoalRoutes);
app.use("/api/admin", adminRoutes);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ── Central error handler (must be last middleware) ───────────────────────────
app.use(errorHandler);

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(
    `🚀 Server running in ${process.env.NODE_ENV || "development"} mode on port ${PORT}`
  );
});

// ── Graceful shutdown on unhandled rejection ──────────────────────────────────
process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err.message);
  server.close(() => process.exit(1));
});

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err.message);
  process.exit(1);
});

module.exports = app; // Export for testing
