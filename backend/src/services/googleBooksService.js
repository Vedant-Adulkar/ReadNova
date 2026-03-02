// backend/src/services/googleBooksService.js
// Proxies searches to the Google Books Volumes API and normalises the
// response into the same shape the rest of the app uses.

const GOOGLE_BOOKS_API = "https://www.googleapis.com/books/v1/volumes";

/**
 * Map a raw Google Books volume to the internal book shape.
 */
const normaliseVolume = (volume) => {
  const info = volume.volumeInfo || {};

  // Pick the best available cover image, prefer thumbnail (most reliably available)
  const images = info.imageLinks || {};

  let coverImage = null;
  if (images.thumbnail) {
    // Bump zoom level for a larger image and force HTTPS
    coverImage = images.thumbnail
      .replace(/^http:\/\//i, "https://")
      .replace("zoom=1", "zoom=2")
      .replace("&edge=curl", ""); // remove curl effect for cleaner display
  } else if (images.smallThumbnail) {
    coverImage = images.smallThumbnail
      .replace(/^http:\/\//i, "https://")
      .replace("&edge=curl", "");
  }

  // If no imageLinks at all, build the standard Google Books cover URL from the volume ID
  if (!coverImage && volume.id) {
    coverImage = `https://books.google.com/books/content?id=${volume.id}&printsec=frontcover&img=1&zoom=2&source=gbs_api`;
  }

  // Derive a rough difficulty from page count
  const pages = info.pageCount || 0;
  let difficultyLevel = "Beginner";
  if (pages > 400) difficultyLevel = "Advanced";
  else if (pages > 200) difficultyLevel = "Intermediate";

  // Google Books average rating is out of 5
  const averageRating = info.averageRating ?? 0;
  const ratingsCount = info.ratingsCount ?? 0;

  return {
    // Use googleBooksId as a stable pseudo-id so BookCard links work
    _id: volume.id,
    googleBooksId: volume.id,
    title: info.title || "Unknown Title",
    author: (info.authors || ["Unknown Author"]).join(", "),
    genres: info.categories || [],
    description:
      info.description
        ? info.description.replace(/<[^>]*>/g, "").slice(0, 500)
        : "No description available.",
    coverImage: coverImage,
    averageRating,
    ratingsCount,
    difficultyLevel,
    pageCount: pages,
    publishedDate: info.publishedDate || null,
    language: info.language || null,
    previewLink: info.previewLink || null,
    source: "google_books",
  };
};

/**
 * searchGoogleBooks
 *
 * @param {string} query       - Free-text or structured query (e.g. "intitle:Dune")
 * @param {object} options
 * @param {number} [options.limit=20]      - Max results (capped at 40 by Google)
 * @param {number} [options.startIndex=0]  - Pagination offset
 * @param {string} [options.langRestrict]  - ISO 639-1 language code
 * @returns {{ books: object[], total: number }}
 */
const searchGoogleBooks = async (query, { limit = 20, startIndex = 0, langRestrict } = {}) => {
  if (!query || !query.trim()) {
    return { books: [], total: 0 };
  }

  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_BOOKS_API_KEY is not configured on the server.");
  }

  const maxResults = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 40);

  const url = new URL(GOOGLE_BOOKS_API);
  url.searchParams.set("q", query.trim());
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("startIndex", String(startIndex));
  url.searchParams.set("printType", "books");
  url.searchParams.set("key", apiKey);
  if (langRestrict) url.searchParams.set("langRestrict", langRestrict);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Google Books API error ${res.status}: ${msg}`);
  }

  const data = await res.json();

  const items = data.items || [];
  const books = items.map(normaliseVolume);
  const total = data.totalItems || books.length;

  return { books, total };
};

/**
 * getGoogleBookById — fetch a single Google Books volume by its volume ID.
 * @param {string} volumeId  e.g. "rF1NEQAAQBAJ"
 * @returns {object}         Normalised book object
 */
const getGoogleBookById = async (volumeId) => {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_BOOKS_API_KEY is not configured.");

  const res = await fetch(
    `https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(volumeId)}?key=${apiKey}`
  );

  if (!res.ok) {
    const error = new Error("Google Book not found");
    error.statusCode = 404;
    throw error;
  }

  const volume = await res.json();
  return normaliseVolume(volume);
};

module.exports = { searchGoogleBooks, getGoogleBookById };
