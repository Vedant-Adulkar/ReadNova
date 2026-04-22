// backend/scripts/seedFiction.js
// ─────────────────────────────────────────────────────────────────────────────
// Seeds the database with ~500+ FICTION novels across multiple genres.
//
// Strategy:
//   - For sci-fi: use "intitle:" queries with known novel names (Google Books'
//     subject: filter is unreliable for sci-fi and returns non-fiction)
//   - For other genres: use "subject:fiction" + genre filters which work better
//
// Usage:
//   node scripts/seedFiction.js              # seed fiction books
//   node scripts/seedFiction.js --dry-run    # preview queries without importing
// ─────────────────────────────────────────────────────────────────────────────

const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const Book = require("../src/models/Book");
const { searchGoogleBooks } = require("../src/services/googleBooksService");
const { embedText, buildBookText, buildPineconeMetadata } = require("../src/services/embeddingService");
const { getIndex, isPineconeConfigured } = require("../src/services/pineconeClient");

// ── Seed queries — FICTION NOVELS ONLY ──────────────────────────────────────
const SEED_QUERIES = [
  // ══════════════════════════════════════════════════════════════════════════
  // SCIENCE FICTION — specific titles & authors to avoid non-fiction pollution
  // ══════════════════════════════════════════════════════════════════════════
  { q: "intitle:Dune inauthor:Herbert", limit: 10 },
  { q: "intitle:Foundation inauthor:Asimov", limit: 10 },
  { q: "intitle:Neuromancer inauthor:Gibson", limit: 5 },
  { q: "intitle:Ender's Game inauthor:Card", limit: 5 },
  { q: "inauthor:\"Arthur C. Clarke\" subject:fiction", limit: 10 },
  { q: "inauthor:\"Isaac Asimov\" subject:fiction", limit: 10 },
  { q: "inauthor:\"Philip K. Dick\" subject:fiction", limit: 10 },
  { q: "inauthor:\"Ursula Le Guin\" subject:fiction", limit: 10 },
  { q: "inauthor:\"Ray Bradbury\" subject:fiction", limit: 10 },
  { q: "inauthor:\"Robert Heinlein\" subject:fiction", limit: 10 },
  { q: "inauthor:\"Andy Weir\" subject:fiction", limit: 10 },
  { q: "inauthor:\"Liu Cixin\" subject:fiction", limit: 5 },
  { q: "inauthor:\"N.K. Jemisin\" subject:fiction", limit: 10 },
  { q: "inauthor:\"Octavia Butler\" subject:fiction", limit: 10 },
  { q: "inauthor:\"William Gibson\" subject:fiction", limit: 5 },
  { q: "inauthor:\"Kim Stanley Robinson\" subject:fiction", limit: 10 },
  { q: "inauthor:\"Becky Chambers\" subject:fiction", limit: 5 },
  { q: "inauthor:\"Adrian Tchaikovsky\" subject:fiction", limit: 10 },
  { q: "inauthor:\"Stanislaw Lem\" subject:fiction", limit: 5 },
  { q: "inauthor:\"Dan Simmons\" subject:fiction", limit: 5 },
  { q: "intitle:Hyperion inauthor:Simmons", limit: 5 },
  { q: "intitle:\"The Expanse\" inauthor:Corey", limit: 10 },
  { q: "intitle:\"Old Man's War\" inauthor:Scalzi", limit: 5 },
  { q: "intitle:\"Snow Crash\" inauthor:Stephenson", limit: 5 },
  { q: "intitle:\"The Martian\" inauthor:Weir", limit: 5 },
  { q: "intitle:\"Ringworld\" inauthor:Niven", limit: 5 },
  { q: "intitle:\"Red Mars\" inauthor:Robinson", limit: 5 },
  { q: "inauthor:\"Iain Banks\" subject:fiction", limit: 10 },
  { q: "inauthor:\"Peter Hamilton\" subject:fiction", limit: 10 },

  // ══════════════════════════════════════════════════════════════════════════
  // FANTASY — subject filter works well here
  // ══════════════════════════════════════════════════════════════════════════
  { q: "inauthor:\"Brandon Sanderson\" subject:fiction", limit: 15 },
  { q: "inauthor:\"Patrick Rothfuss\" subject:fiction", limit: 5 },
  { q: "inauthor:\"Joe Abercrombie\" subject:fiction", limit: 10 },
  { q: "inauthor:\"Robin Hobb\" subject:fiction", limit: 10 },
  { q: "inauthor:\"Terry Pratchett\" subject:fiction", limit: 15 },
  { q: "inauthor:\"Neil Gaiman\" subject:fiction", limit: 10 },
  { q: "inauthor:\"George R.R. Martin\" subject:fiction", limit: 10 },
  { q: "inauthor:\"Robert Jordan\" subject:fiction", limit: 10 },
  { q: "inauthor:\"J.R.R. Tolkien\" subject:fiction", limit: 10 },
  { q: "inauthor:\"Leigh Bardugo\" subject:fiction", limit: 10 },
  { q: "inauthor:\"Sarah J. Maas\" subject:fiction", limit: 10 },
  { q: "inauthor:\"Anne McCaffrey\" subject:fiction", limit: 10 },
  { q: "subject:fiction subject:fantasy epic world building magic", limit: 20 },
  { q: "subject:fiction subject:fantasy dragon quest adventure", limit: 20 },
  { q: "subject:fiction subject:fantasy dark sword sorcery", limit: 20 },

  // ══════════════════════════════════════════════════════════════════════════
  // MYSTERY / THRILLER
  // ══════════════════════════════════════════════════════════════════════════
  { q: "inauthor:\"Agatha Christie\" subject:fiction", limit: 15 },
  { q: "inauthor:\"Lee Child\" subject:fiction", limit: 10 },
  { q: "inauthor:\"Tana French\" subject:fiction", limit: 10 },
  { q: "inauthor:\"Gillian Flynn\" subject:fiction", limit: 5 },
  { q: "inauthor:\"Michael Connelly\" subject:fiction", limit: 10 },
  { q: "subject:fiction detective mystery crime bestseller", limit: 20 },
  { q: "subject:fiction psychological thriller suspense novel", limit: 20 },

  // ══════════════════════════════════════════════════════════════════════════
  // ROMANCE
  // ══════════════════════════════════════════════════════════════════════════
  { q: "inauthor:\"Colleen Hoover\" subject:fiction", limit: 10 },
  { q: "inauthor:\"Ali Hazelwood\" subject:fiction", limit: 5 },
  { q: "subject:fiction romance contemporary bestselling novel", limit: 20 },
  { q: "subject:fiction historical romance regency", limit: 20 },
  { q: "subject:fiction romance fantasy enemies lovers", limit: 15 },

  // ══════════════════════════════════════════════════════════════════════════
  // LITERARY FICTION
  // ══════════════════════════════════════════════════════════════════════════
  { q: "inauthor:\"Kazuo Ishiguro\" subject:fiction", limit: 5 },
  { q: "inauthor:\"Donna Tartt\" subject:fiction", limit: 5 },
  { q: "subject:fiction literary award winning novel Pulitzer", limit: 15 },
  { q: "subject:fiction coming of age novel bildungsroman", limit: 15 },
  { q: "subject:fiction historical novel world war", limit: 20 },
  { q: "subject:fiction family saga generations bestselling", limit: 15 },

  // ══════════════════════════════════════════════════════════════════════════
  // HORROR
  // ══════════════════════════════════════════════════════════════════════════
  { q: "inauthor:\"Stephen King\" subject:fiction", limit: 15 },
  { q: "inauthor:\"Shirley Jackson\" subject:fiction", limit: 5 },
  { q: "subject:fiction horror gothic supernatural novel", limit: 15 },
  { q: "subject:fiction horror psychological novel haunted", limit: 15 },

  // ══════════════════════════════════════════════════════════════════════════
  // YOUNG ADULT
  // ══════════════════════════════════════════════════════════════════════════
  { q: "inauthor:\"Rick Riordan\" subject:fiction", limit: 10 },
  { q: "inauthor:\"Suzanne Collins\" subject:fiction", limit: 5 },
  { q: "subject:fiction young adult adventure dystopian", limit: 20 },

  // ══════════════════════════════════════════════════════════════════════════
  // CLASSICS
  // ══════════════════════════════════════════════════════════════════════════
  { q: "subject:fiction classic literature Dickens novel", limit: 10 },
  { q: "subject:fiction classic literature Dostoevsky Tolstoy", limit: 10 },
  { q: "subject:fiction classic literature Jane Austen Bronte", limit: 10 },
];

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

async function seedFiction() {
  const dryRun = process.argv.includes("--dry-run");

  console.log("🌱 Starting fiction seed...\n");
  console.log(`   Queries: ${SEED_QUERIES.length}`);
  console.log(`   Mode: ${dryRun ? "DRY RUN (no imports)" : "LIVE"}\n`);

  if (dryRun) {
    SEED_QUERIES.forEach((q, i) => console.log(`  ${i + 1}. "${q.q}" (limit: ${q.limit})`));
    process.exit(0);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Connected to MongoDB\n");

  const usePinecone = isPineconeConfigured();
  if (usePinecone) console.log("📍 Pinecone configured — vectors will be upserted.\n");

  let totalImported = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let pineconeBatch = [];

  for (let qi = 0; qi < SEED_QUERIES.length; qi++) {
    const { q, limit } = SEED_QUERIES[qi];
    console.log(`\n📖 [${qi + 1}/${SEED_QUERIES.length}] Searching: "${q}" (limit: ${limit})`);

    try {
      const { books } = await searchGoogleBooks(q, { limit, langRestrict: "en" });
      console.log(`   Found ${books.length} books from Google`);

      for (const gb of books) {
        if (!gb.googleBooksId) continue;
        if (!gb.title || !gb.author || gb.author === "Unknown Author") continue;

        // Skip books with no description
        if (!gb.description || gb.description === "No description available.") {
          totalSkipped++;
          continue;
        }

        // Check if already exists
        const exists = await Book.findOne({
          $or: [
            { googleBooksId: gb.googleBooksId },
            { title: gb.title, author: gb.author },
          ],
        });
        if (exists) {
          totalSkipped++;
          continue;
        }

        try {
          const book = new Book({
            title: gb.title,
            author: gb.author,
            description: gb.description || "",
            genres: gb.genres || [],
            difficultyLevel: gb.difficultyLevel || "Intermediate",
            coverImage: gb.coverImage || "",
            averageRating: gb.averageRating || 0,
            ratingsCount: gb.ratingsCount || 0,
            contentRating: "General",
            googleBooksId: gb.googleBooksId,
            source: "google_books",
          });

          // Generate v3 embedding
          const text = buildBookText(book);
          const embedding = await embedText(text);
          if (embedding.length > 0) {
            book.embedding = embedding;
            book.embeddingStatus = "done";
            book.embeddingVersion = "v3";
          } else {
            book.embeddingStatus = "failed";
          }

          await book.save();
          totalImported++;
          console.log(`   ✅ [${totalImported}] "${gb.title}" by ${gb.author}`);

          // Queue for Pinecone
          if (usePinecone && embedding.length > 0) {
            pineconeBatch.push({
              id: book._id.toString(),
              values: embedding,
              metadata: buildPineconeMetadata(book),
            });
            if (pineconeBatch.length >= 50) {
              try {
                await getIndex().upsert({ records: pineconeBatch });
                console.log(`   📍 Upserted ${pineconeBatch.length} vectors to Pinecone.`);
              } catch (err) {
                console.warn(`   ⚠️ Pinecone upsert failed: ${err.message}`);
              }
              pineconeBatch = [];
            }
          }
        } catch (err) {
          if (err.code === 11000) { totalSkipped++; }
          else { totalFailed++; console.error(`   ❌ Failed: "${gb.title}": ${err.message}`); }
        }
      }
      await sleep(1200);
    } catch (err) {
      console.error(`   ❌ Search failed for "${q}": ${err.message}`);
      await sleep(2000);
    }
  }

  // Flush remaining Pinecone batch
  if (usePinecone && pineconeBatch.length > 0) {
    try {
      await getIndex().upsert({ records: pineconeBatch });
      console.log(`\n📍 Final Pinecone upsert: ${pineconeBatch.length} vectors.`);
    } catch (err) {
      console.warn(`⚠️ Final Pinecone upsert failed: ${err.message}`);
    }
  }

  // Final stats
  const totalBooks = await Book.countDocuments({});
  const { isFiction } = require("../src/services/embeddingService");
  const allBooks = await Book.find({}).select("genres description").lean();
  const fictionCount = allBooks.filter(b => isFiction(b)).length;

  console.log(`\n${"═".repeat(60)}`);
  console.log(`🌱 Seed complete!`);
  console.log(`   ✅ Imported:  ${totalImported}`);
  console.log(`   ⏭️  Skipped:   ${totalSkipped}`);
  console.log(`   ❌ Failed:    ${totalFailed}`);
  console.log(`   ─────────────────────────`);
  console.log(`   📚 Total books in DB:  ${totalBooks}`);
  console.log(`   📖 Fiction books:      ${fictionCount}`);
  console.log(`${"═".repeat(60)}\n`);

  await mongoose.disconnect();
  process.exit(0);
}

seedFiction().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
