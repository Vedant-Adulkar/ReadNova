const mongoose = require("mongoose");

// Maximum number of connection retries on startup
const MAX_RETRIES = 5;
const RETRY_INTERVAL_MS = 5000;

/**
 * Connect to MongoDB with exponential-backoff retry logic.
 * Registers event listeners for disconnect / reconnect events.
 */
const connectDB = async (attempt = 1) => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      // Mongoose 8+ ignores most legacy options; keep this for clarity
      serverSelectionTimeoutMS: 10000,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    // Graceful handling of runtime disconnects
    mongoose.connection.on("disconnected", () => {
      console.warn("⚠  MongoDB disconnected. Attempting to reconnect...");
    });

    mongoose.connection.on("reconnected", () => {
      console.log("✅ MongoDB reconnected.");
    });

    mongoose.connection.on("error", (err) => {
      console.error("🚨 MongoDB runtime error:", err.message);
    });
  } catch (error) {
    console.error(
      `❌ MongoDB connection failed (attempt ${attempt}/${MAX_RETRIES}): ${error.message}`
    );

    if (attempt < MAX_RETRIES) {
      const delay = RETRY_INTERVAL_MS * attempt; // simple linear back-off
      console.log(`   Retrying in ${delay / 1000}s...`);
      setTimeout(() => connectDB(attempt + 1), delay);
    } else {
      console.error("🔴 Max retries reached. Exiting process.");
      process.exit(1);
    }
  }
};

module.exports = connectDB;
