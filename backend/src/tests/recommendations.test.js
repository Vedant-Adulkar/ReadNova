// backend/src/tests/recommendations.test.js
// Tests: Recommendation API access control and basic response shape.
// Gemini is mocked to avoid real API calls in CI.
require("./setup");

jest.mock("../ai/geminiService", () => ({
  parseConversationalQuery: jest.fn().mockResolvedValue({
    genres: ["Fiction"],
    difficulty: null,
    keywords: ["test"],
    maxPages: null,
  }),
  generateExplanation: jest.fn().mockResolvedValue("This book matches your interests."),
  getBreakerStatus: jest.fn().mockReturnValue({ state: "CLOSED", failures: 0, lastFailureTime: null }),
}));

const request = require("supertest");
const app = require("../../server");
const Book = require("../models/Book");

// Helper: register a user and return their JWT
const registerAndLogin = async (overrides = {}) => {
  const payload = {
    name: "Rec User",
    email: "recuser@test.com",
    password: "password123",
    age: 25,
    ...overrides,
  };
  const res = await request(app).post("/api/auth/register").send(payload);
  return res.body.token;
};

describe("GET /api/recommendations", () => {
  it("returns 401 for unauthenticated requests", async () => {
    const res = await request(app).get("/api/recommendations");
    expect(res.status).toBe(401);
  });

  it("returns 200 with an array for a cold-start user (no embedding)", async () => {
    const token = await registerAndLogin();
    // Create a General-rated book so the DB has something
    await Book.create({
      title: "Sample Book",
      author: "Author",
      genres: ["Fiction"],
      difficultyLevel: "Beginner",
      contentRating: "General",
    });

    const res = await request(app)
      .get("/api/recommendations")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.recommendations)).toBe(true);
  });

  it("accepts a ?mood=Happy param and returns 200", async () => {
    const token = await registerAndLogin({ email: "mooduser@test.com" });
    await Book.create({
      title: "Happy Book",
      author: "Author",
      genres: ["Humor"],
      difficultyLevel: "Beginner",
      contentRating: "General",
    });

    const res = await request(app)
      .get("/api/recommendations?mood=Happy")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.recommendations)).toBe(true);
  });

  it("filters out Mature content for users under 18", async () => {
    const token = await registerAndLogin({ email: "teen@test.com", age: 15 });
    await Book.create([
      { title: "Teen Book", author: "A", genres: ["Fiction"], difficultyLevel: "Beginner", contentRating: "General" },
      { title: "Adult Book", author: "B", genres: ["Fiction"], difficultyLevel: "Advanced", contentRating: "Mature" },
    ]);

    const res = await request(app)
      .get("/api/recommendations")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    // No Mature-rated book should appear for a 15-year-old
    const hasMature = res.body.recommendations.some(
      (r) => (r.book?.contentRating || r.contentRating) === "Mature"
    );
    expect(hasMature).toBe(false);
  });
});
