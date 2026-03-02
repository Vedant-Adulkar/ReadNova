// backend/seedBooks.js
const mongoose = require("mongoose");
require("dotenv").config();
const Book = require("./src/models/Book");

const sampleBooks = [
  {
    title: "The Great Gatsby",
    author: "F. Scott Fitzgerald",
    genres: ["Fiction", "Classic"],
    description: "A story of wealth, love, and the American Dream in the 1920s.",
    difficultyLevel: "Intermediate",
    averageRating: 4.5,
    ratingsCount: 1200,
    embedding: Array(15).fill(0.1),
  },
  {
    title: "The Hobbit",
    author: "J.R.R. Tolkien",
    genres: ["Fantasy", "Adventure"],
    description: "A hobbit's journey to reclaim a lost kingdom from a dragon.",
    difficultyLevel: "Intermediate",
    averageRating: 4.8,
    ratingsCount: 3500,
    embedding: Array(15).fill(0.2),
  },
  {
    title: "Sherlock Holmes: A Study in Scarlet",
    author: "Arthur Conan Doyle",
    genres: ["Mystery", "Thriller"],
    description: "The first appearance of the legendary detective Sherlock Holmes.",
    difficultyLevel: "Intermediate",
    averageRating: 4.6,
    ratingsCount: 2200,
    embedding: Array(15).fill(0.3),
  },
  {
    title: "The Alchemist",
    author: "Paulo Coelho",
    genres: ["Fiction", "Philosophy"],
    description: "An Andalusian shepherd boy travels to Egypt in search of treasure.",
    difficultyLevel: "Beginner",
    averageRating: 4.7,
    ratingsCount: 5000,
    embedding: Array(15).fill(0.4),
  },
  {
    title: "Sapiens: A Brief History of Humankind",
    author: "Yuval Noah Harari",
    genres: ["Non-Fiction", "History"],
    description: "A sweeping narrative of humanity's creation and evolution.",
    difficultyLevel: "Advanced",
    averageRating: 4.8,
    ratingsCount: 4200,
    embedding: Array(15).fill(0.5),
  },
  {
    title: "Atomic Habits",
    author: "James Clear",
    genres: ["Self-Help", "Non-Fiction"],
    description: "An easy and proven way to build good habits and break bad ones.",
    difficultyLevel: "Beginner",
    averageRating: 4.9,
    ratingsCount: 8000,
    embedding: Array(15).fill(0.6),
  },
  {
    title: "Project Hail Mary",
    author: "Andy Weir",
    genres: ["Sci-Fi", "Thriller"],
    description: "A lone astronaut must save the Earth from an extinction-level threat.",
    difficultyLevel: "Intermediate",
    averageRating: 4.9,
    ratingsCount: 1500,
    embedding: Array(15).fill(0.7),
  },
  {
    title: "The Silent Patient",
    author: "Alex Michaelides",
    genres: ["Thriller", "Mystery"],
    description: "A woman shoots her husband and never speaks another word.",
    difficultyLevel: "Intermediate",
    averageRating: 4.4,
    ratingsCount: 2800,
    embedding: Array(15).fill(0.8),
  }
];

async function seedDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    await Book.deleteMany({});
    console.log("🗑️  Cleared existing books");

    await Book.insertMany(sampleBooks);
    console.log(`📚 Seeded ${sampleBooks.length} books`);

    await mongoose.disconnect();
    console.log("👋 Disconnected from MongoDB");
  } catch (err) {
    console.error("🚨 Seeding failed:", err.message);
    process.exit(1);
  }
}

seedDB();
