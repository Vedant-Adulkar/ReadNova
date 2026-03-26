const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const bookshelfItemSchema = new mongoose.Schema(
  {
    book: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false, // never included in query results by default
    },
    age: {
      type: Number,
      min: [1, "Age must be positive"],
      max: [120, "Age seems invalid"],
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    // Free-text personality profile (e.g. "loves sci-fi thrillers, hates gore")
    personalityProfile: {
      type: String,
      default: "",
      maxlength: [500, "Personality profile too long"],
    },
    // Dense vector embedding derived from quiz answers or behaviour (stored as array of numbers)
    preferenceEmbedding: {
      type: [Number],
      default: [],
    },
    // Bookshelf with three shelves
    bookshelf: {
      wantToRead: { type: [bookshelfItemSchema], default: [] },
      reading: { type: [bookshelfItemSchema], default: [] },
      completed: { type: [bookshelfItemSchema], default: [] },
    },
    // Reading goal: how many books the user wants to finish this year
    readingGoal: {
      yearly: { type: Number, default: 0, min: 0 },
      year: { type: Number, default: new Date().getFullYear() },
    },
    // Cloudinary-hosted profile picture
    profilePicture: { type: String, default: "" },
    profilePicturePublicId: { type: String, default: "" },
  },
  { timestamps: true }
);

// ── Indexes ────────────────────────────────────────────────
// email uniqueness is enforced by the `unique: true` on the field above (no need for a separate index call)

// ── Pre-save: hash password only when it is new or modified ─
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ── Instance method: compare plain-text password with hash ──
userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

// ── Hide sensitive fields when serialised ──────────────────
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model("User", userSchema);
