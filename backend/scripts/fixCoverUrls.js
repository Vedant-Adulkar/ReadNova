#!/usr/bin/env node
/**
 * fixCoverUrls.js — Strip expired `imgtk` tokens from Google Books cover URLs.
 * These tokens expire and cause 429/403 errors. The base URL works fine without them.
 *
 * Usage:  node scripts/fixCoverUrls.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Book = require("../src/models/Book");

const MONGO_URI = process.env.MONGO_URI;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log("✅ Connected to MongoDB");

  // Find all books with imgtk in their cover URL
  const books = await Book.find({
    coverImage: { $regex: "imgtk=" },
  }).select("_id title coverImage");

  console.log(`📚 Found ${books.length} books with imgtk tokens in cover URLs`);

  let updated = 0;
  for (const book of books) {
    const cleanUrl = book.coverImage.replace(/&imgtk=[^&]*/g, "");
    if (cleanUrl !== book.coverImage) {
      await Book.updateOne({ _id: book._id }, { $set: { coverImage: cleanUrl } });
      updated++;
    }
  }

  console.log(`✨ Updated ${updated} cover URLs (stripped imgtk tokens)`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
