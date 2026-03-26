// backend/src/routes/uploadRoutes.js
// Profile picture upload — authenticated users only.
// Validates file type + size, deletes old Cloudinary image to prevent storage leaks,
// then uploads the new one and persists the URLs on the User document.

const express = require("express");
const multer = require("multer");
const router = express.Router();

const { protect } = require("../middleware/authMiddleware");
const cloudinary = require("../config/cloudinary");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");

// ── Multer: memory storage, 2 MB limit, images only ──────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) return cb(null, true);
    cb(new Error("Only image files are allowed"), false);
  },
});

/**
 * @route  POST /api/upload/profile
 * @access Protected
 * @body   multipart/form-data field: "avatar"
 */
router.post(
  "/profile",
  protect,
  upload.single("avatar"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      res.status(400);
      throw new Error("No image file provided");
    }

    const user = await User.findById(req.user._id);

    // ── 1. Delete old Cloudinary image to prevent storage leaks ──────────────
    if (user.profilePicturePublicId) {
      try {
        await cloudinary.uploader.destroy(user.profilePicturePublicId);
      } catch (err) {
        console.warn("⚠️  Could not delete old profile image:", err.message);
        // Non-fatal — proceed with upload
      }
    }

    // ── 2. Upload new image via buffer stream ─────────────────────────────────
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "ai-book-buddy/profiles",
          public_id: `profile_${user._id}`,
          overwrite: true,
          resource_type: "image",
          transformation: [{ width: 200, height: 200, crop: "fill", gravity: "face" }],
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });

    // ── 3. Persist URLs on the User document ──────────────────────────────────
    user.profilePicture = uploadResult.secure_url;
    user.profilePicturePublicId = uploadResult.public_id;
    await user.save();

    res.json({
      success: true,
      profilePicture: uploadResult.secure_url,
      message: "Profile picture updated",
    });
  })
);

module.exports = router;
