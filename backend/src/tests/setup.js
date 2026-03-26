// backend/src/tests/setup.js
// Shared test setup: in-memory MongoDB via mongodb-memory-server
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongod;

// Start in-memory DB before all tests
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

// Clear collections after each test to keep tests isolated
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

// Stop server and disconnect after all tests
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
