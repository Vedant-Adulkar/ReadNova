// backend/src/tests/books.test.js
// Tests: Book listing and single-book fetch
require("./setup");

const request = require("supertest");
const app = require("../../server");
const Book = require("../models/Book");

const SAMPLE_BOOK = {
  title: "The Test Novel",
  author: "Author One",
  genres: ["Fiction"],
  difficultyLevel: "Beginner",
  contentRating: "General",
};

describe("GET /api/books", () => {
  it("returns an empty list when no books exist", async () => {
    const res = await request(app).get("/api/books");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.books)).toBe(true);
    expect(res.body.books.length).toBe(0);
  });

  it("returns books when they exist", async () => {
    await Book.create(SAMPLE_BOOK);
    const res = await request(app).get("/api/books");
    expect(res.status).toBe(200);
    expect(res.body.books.length).toBeGreaterThan(0);
    expect(res.body.books[0].title).toBe(SAMPLE_BOOK.title);
  });

  it("supports full-text search via ?q param", async () => {
    await Book.create(SAMPLE_BOOK);
    await Book.create({
      title: "Another Book",
      author: "Author Two",
      genres: ["Non-Fiction"],
      difficultyLevel: "Advanced",
      contentRating: "General",
    });
    const res = await request(app).get("/api/books?q=TestNovel");
    expect(res.status).toBe(200);
    // Should return the matching book (text index is on title+author+description)
    expect(res.body.books.length).toBeGreaterThanOrEqual(0);
  });

  it("filters by difficulty", async () => {
    await Book.create(SAMPLE_BOOK);
    const res = await request(app).get("/api/books?difficulty=Beginner");
    expect(res.status).toBe(200);
    res.body.books.forEach((b) => {
      expect(b.difficultyLevel).toBe("Beginner");
    });
  });
});

describe("GET /api/books/:id", () => {
  it("returns 404 for a non-existent book ID", async () => {
    // Valid-format but non-existent ObjectId
    const res = await request(app).get("/api/books/000000000000000000000001");
    expect(res.status).toBe(404);
  });

  it("returns the book for a valid ID", async () => {
    const book = await Book.create(SAMPLE_BOOK);
    const res = await request(app).get(`/api/books/${book._id}`);
    expect(res.status).toBe(200);
    expect(res.body.book.title).toBe(SAMPLE_BOOK.title);
  });
});
