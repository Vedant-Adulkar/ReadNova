// backend/src/routes/bookshelfRoutes.js
const express = require("express");
const router = express.Router();
const { body } = require("express-validator");

const bookshelfController = require("../controllers/bookshelfController");
const { protect } = require("../middleware/authMiddleware");
const validate = require("../middleware/validateMiddleware");

// All bookshelf routes require authentication
router.use(protect);

// GET  /api/bookshelf
router.get("/", bookshelfController.getBookshelf);

// POST /api/bookshelf/:bookId  — add to WantToRead
router.post("/:bookId", bookshelfController.addToShelf);

// PUT  /api/bookshelf/:bookId/move  — move between shelves
router.put(
  "/:bookId/move",
  validate([
    body("from")
      .isIn(["wantToRead", "reading", "completed"])
      .withMessage("Invalid source shelf"),
    body("to")
      .isIn(["wantToRead", "reading", "completed"])
      .withMessage("Invalid destination shelf"),
  ]),
  bookshelfController.moveShelf
);

// DELETE /api/bookshelf/:bookId?shelf=wantToRead  — remove from shelf
router.delete("/:bookId", bookshelfController.removeFromShelf);

module.exports = router;
