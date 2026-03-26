// backend/src/tests/auth.test.js
// Tests: User registration and login flows
require("./setup");

const request = require("supertest");
const app = require("../../server");

const VALID_USER = {
  name: "Test User",
  email: "test@example.com",
  password: "password123",
  age: 25,
};

describe("POST /api/auth/register", () => {
  it("registers a new user and returns a token", async () => {
    const res = await request(app).post("/api/auth/register").send(VALID_USER);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe(VALID_USER.email);
    // Password must NEVER be returned
    expect(res.body.user.password).toBeUndefined();
  });

  it("returns 409 for duplicate email", async () => {
    await request(app).post("/api/auth/register").send(VALID_USER);
    const res = await request(app).post("/api/auth/register").send(VALID_USER);
    expect(res.status).toBe(409);
  });

  it("returns 400 if password is shorter than 8 characters", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...VALID_USER, password: "short" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await request(app).post("/api/auth/register").send(VALID_USER);
  });

  it("logs in with correct credentials", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: VALID_USER.email,
      password: VALID_USER.password,
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it("returns 401 for wrong password", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: VALID_USER.email,
      password: "wrongpassword",
    });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/auth/me", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns the current user with a valid token", async () => {
    const regRes = await request(app).post("/api/auth/register").send(VALID_USER);
    const { token } = regRes.body;

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(VALID_USER.email);
  });
});
