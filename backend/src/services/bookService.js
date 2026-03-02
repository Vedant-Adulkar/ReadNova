// backend/src/services/bookService.js
const Book = require("../models/Book");
const cloudinary = require("../config/cloudinary");
const paginate = require("../utils/paginate");

/**
 * createBook — admin-only book creation.
 *
 * @param {object} data  - Book fields (title, author, genres, etc.)
 * @returns {object}     - Created book document
 */
const createBook = async (data) => {
  const book = await Book.create(data);
  return book;
};

/**
 * getBooks — paginated book listing with optional full-text search
 * and attribute-level filters.
 *
 * Query params supported: q (text search), genre, difficulty, page, limit
 *
 * @param {object} query  - req.query object
 * @returns {{ books: object[], total: number, page: number, pages: number }}
 */
const getBooks = async (query) => {
  const { page, limit, skip } = paginate(query);
  const filter = {};

  // Full-text search using MongoDB's text index on title + author + description
  if (query.q && query.q.trim()) {
    filter.$text = { $search: query.q.trim() };
  }

  if (query.genre) {
    filter.genres = { $in: [query.genre] };
  }

  if (query.difficulty) {
    filter.difficultyLevel = query.difficulty;
  }

  const [books, total] = await Promise.all([
    Book.find(filter)
      .sort(query.q ? { score: { $meta: "textScore" } } : { createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Book.countDocuments(filter),
  ]);

  return { books, total, page, pages: Math.ceil(total / limit) };
};

/**
 * getBookById — fetch a single book by ID.
 *
 * @param {string} bookId
 * @returns {object}
 */
const getBookById = async (bookId) => {
  const book = await Book.findById(bookId).lean();
  if (!book) {
    const error = new Error("Book not found");
    error.statusCode = 404;
    throw error;
  }
  return book;
};

/**
 * updateBook — admin-only partial update.
 *
 * @param {string} bookId
 * @param {object} updates
 * @returns {object}
 */
const updateBook = async (bookId, updates) => {
  const book = await Book.findByIdAndUpdate(bookId, updates, {
    new: true,
    runValidators: true,
  }).lean();

  if (!book) {
    const error = new Error("Book not found");
    error.statusCode = 404;
    throw error;
  }
  return book;
};

/**
 * deleteBook — admin-only deletion. Also removes cover from Cloudinary.
 *
 * @param {string} bookId
 */
const deleteBook = async (bookId) => {
  const book = await Book.findById(bookId);
  if (!book) {
    const error = new Error("Book not found");
    error.statusCode = 404;
    throw error;
  }

  // Remove cover image from Cloudinary if it exists
  if (book.coverImagePublicId) {
    try {
      await cloudinary.uploader.destroy(book.coverImagePublicId);
    } catch (err) {
      console.warn("Could not remove Cloudinary image:", err.message);
    }
  }

  await book.deleteOne();
};

/**
 * uploadCoverImage — upload a book cover to Cloudinary via buffer stream.
 * Returns the secure URL and public_id for storage on the Book document.
 *
 * @param {Buffer} buffer       - File buffer from multer memoryStorage
 * @param {string} bookId       - Used to build a deterministic public_id
 * @returns {{ url: string, publicId: string }}
 */
const uploadCoverImage = (buffer, bookId) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "ai-book-buddy/covers",
        public_id: `book_${bookId}`,
        overwrite: true,
        resource_type: "image",
        transformation: [{ width: 400, height: 600, crop: "fill" }],
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    uploadStream.end(buffer);
  });
};

module.exports = { createBook, getBooks, getBookById, updateBook, deleteBook, uploadCoverImage };
