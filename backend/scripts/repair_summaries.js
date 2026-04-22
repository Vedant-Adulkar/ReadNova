const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

async function repair() {
  try {
    // Navigate from /home/vedant/Documents/Projects/Book/ai-book-buddy-main/
    const envPath = "/home/vedant/Documents/Projects/Book/ai-book-buddy-main/backend/.env";
    const envContent = fs.readFileSync(envPath, "utf8");
    const MONGO_URI_MATCH = envContent.match(/MONGO_URI=(.*)/);
    
    if (!MONGO_URI_MATCH) {
      throw new Error("MONGO_URI not found in .env");
    }
    const MONGO_URI = MONGO_URI_MATCH[1].trim();

    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);

    const Book = mongoose.model("Book", new mongoose.Schema({
      aiSummary: { short: String },
      summaryVersion: String,
      summaryGeneratedAt: Date
    }));

    // Find books that have a summary but no version
    const books = await Book.find({
      "aiSummary.short": { $ne: "" },
      $or: [
        { summaryVersion: { $exists: false } },
        { summaryVersion: "" },
        { summaryVersion: null }
      ]
    });

    console.log(`Found ${books.length} books needing summary repair.`);

    for (const book of books) {
      book.summaryVersion = "v2";
      if (!book.summaryGeneratedAt) {
        book.summaryGeneratedAt = new Date();
      }
      // Using updateOne to avoid schema validation issues with partial model
      await Book.updateOne(
        { _id: book._id },
        { 
          $set: { 
            summaryVersion: "v2",
            summaryGeneratedAt: book.summaryGeneratedAt 
          } 
        }
      );
      console.log(`- Repaired: ${book._id}`);
    }

    console.log("Repair completed successfully.");
    process.exit(0);
  } catch (err) {
    console.error("Repair failed:", err);
    process.exit(1);
  }
}

repair();
