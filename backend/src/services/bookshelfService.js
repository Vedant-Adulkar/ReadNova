// backend/src/services/bookshelfService.js
const User = require("../models/User");
const Book = require("../models/Book");

const VALID_SHELVES = ["wantToRead", "reading", "completed"];

// Valid upward transitions (users can only move forward, not backward)
const ALLOWED_TRANSITIONS = {
  wantToRead: ["reading", "completed"],
  reading: ["wantToRead", "completed"],
  completed: ["wantToRead", "reading"],
};

/** Helper: assert a shelf name is valid. */
const assertValidShelf = (shelf) => {
  if (!VALID_SHELVES.includes(shelf)) {
    const error = new Error(`Invalid shelf. Must be one of: ${VALID_SHELVES.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }
};

/** Helper: check if a book already exists on any shelf. */
const findBookOnAnyShelf = (user, bookId) => {
  const id = bookId.toString();
  for (const shelf of VALID_SHELVES) {
    const found = user.bookshelf[shelf].find((e) => e.book.toString() === id);
    if (found) return shelf;
  }
  return null;
};

/**
 * addToShelf — add a book to the user's WantToRead shelf.
 * Returns an error if the book is already on any shelf.
 *
 * @param {string} userId
 * @param {string} bookId
 * @returns {object}  Updated user bookshelf
 */
const addToShelf = async (userId, bookId) => {
  const [user, book] = await Promise.all([
    User.findById(userId),
    Book.findById(bookId).lean(),
  ]);

  if (!book) {
    const error = new Error("Book not found");
    error.statusCode = 404;
    throw error;
  }

  const existingShelf = findBookOnAnyShelf(user, bookId);
  if (existingShelf) {
    const error = new Error(`Book is already on your '${existingShelf}' shelf`);
    error.statusCode = 409;
    throw error;
  }

  user.bookshelf.wantToRead.push({ book: bookId });
  await user.save();
  return user.bookshelf;
};

/**
 * moveShelf — move a book between shelves following allowed transitions.
 * wantToRead → reading → completed
 *
 * @param {string} userId
 * @param {string} bookId
 * @param {string} fromShelf
 * @param {string} toShelf
 * @returns {object}  Updated user bookshelf
 */
const moveShelf = async (userId, bookId, fromShelf, toShelf) => {
  assertValidShelf(fromShelf);
  assertValidShelf(toShelf);

  // Validate transition direction
  if (!ALLOWED_TRANSITIONS[fromShelf].includes(toShelf)) {
    const error = new Error(
      `Cannot move from '${fromShelf}' to '${toShelf}'. ` +
      `Allowed: ${ALLOWED_TRANSITIONS[fromShelf].join(", ") || "none"}`
    );
    error.statusCode = 400;
    throw error;
  }

  const user = await User.findById(userId);
  const bookIdStr = bookId.toString();

  // Confirm the book is actually on the fromShelf
  const idx = user.bookshelf[fromShelf].findIndex(
    (e) => e.book.toString() === bookIdStr
  );
  if (idx === -1) {
    const error = new Error(`Book not found on your '${fromShelf}' shelf`);
    error.statusCode = 404;
    throw error;
  }

  // Remove from source shelf
  user.bookshelf[fromShelf].splice(idx, 1);

  // Add to destination shelf (avoid duplicate just in case)
  const alreadyOnTarget = user.bookshelf[toShelf].some(
    (e) => e.book.toString() === bookIdStr
  );
  if (!alreadyOnTarget) {
    user.bookshelf[toShelf].push({ book: bookId });
  }

  await user.save();
  return user.bookshelf;
};

/**
 * removeFromShelf — remove a book from a specific shelf entirely.
 *
 * @param {string} userId
 * @param {string} bookId
 * @param {string} shelf
 * @returns {object}  Updated user bookshelf
 */
const removeFromShelf = async (userId, bookId, shelf) => {
  assertValidShelf(shelf);

  const user = await User.findById(userId);
  const bookIdStr = bookId.toString();

  const idx = user.bookshelf[shelf].findIndex(
    (e) => e.book.toString() === bookIdStr
  );
  if (idx === -1) {
    const error = new Error(`Book not found on your '${shelf}' shelf`);
    error.statusCode = 404;
    throw error;
  }

  user.bookshelf[shelf].splice(idx, 1);
  await user.save();
  return user.bookshelf;
};

/**
 * getBookshelf — return the user's full bookshelf with populated book details.
 *
 * @param {string} userId
 * @returns {object}
 */
const getBookshelf = async (userId) => {
  const user = await User.findById(userId)
    .populate("bookshelf.wantToRead.book")
    .populate("bookshelf.reading.book")
    .populate("bookshelf.completed.book")
    .lean();

  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  return user.bookshelf;
};

module.exports = { addToShelf, moveShelf, removeFromShelf, getBookshelf };
