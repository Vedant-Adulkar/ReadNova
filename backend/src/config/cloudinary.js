const cloudinary = require("cloudinary").v2;

/**
 * Configure Cloudinary SDK using environment variables.
 * Must be called after dotenv is loaded (i.e. in server.js before imports).
 */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

module.exports = cloudinary;
