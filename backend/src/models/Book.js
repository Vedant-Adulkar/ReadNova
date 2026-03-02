const mongoose = require("mongoose");

const bookSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Book title is required"],
      trim: true,
      maxlength: [300, "Title is too long"],
    },
    author: {
      type: String,
      required: [true, "Author is required"],
      trim: true,
      maxlength: [200, "Author name is too long"],
    },
    genres: {
      type: [String],
      default: [],
      validate: {
        validator: (v) => Array.isArray(v) && v.length <= 10,
        message: "A book can have at most 10 genres",
      },
    },
    description: {
      type: String,
      default: "",
      maxlength: [5000, "Description is too long"],
    },
    difficultyLevel: {
      type: String,
      enum: {
        values: ["Beginner", "Intermediate", "Advanced"],
        message: "Difficulty must be Beginner, Intermediate or Advanced",
      },
      default: "Intermediate",
    },
    // Dense embedding vector used for content-based similarity scoring
    embedding: {
      type: [Number],
      default: [],
    },
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    ratingsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    coverImage: {
      type: String,
      default: "",
    },
    // Cloudinary public_id so we can delete / replace the image later
    coverImagePublicId: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// ── Indexes ────────────────────────────────────────────────
// Compound text index for full-text search across title, author, description
bookSchema.index({ title: "text", author: "text", description: "text" });

// Individual indexes used in content filtering and sorting
bookSchema.index({ genres: 1 });
bookSchema.index({ difficultyLevel: 1 });
bookSchema.index({ averageRating: -1 });
bookSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Book", bookSchema);
