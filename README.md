# AI Book Buddy 📚

An AI-powered social book recommendation platform that helps you discover, track, and discuss books you'll love.

## Features

- 🤖 **AI Recommendations** — Personalised picks powered by Google Gemini
- 🔍 **Google Books Search** — Live search across millions of books via Google Books API
- 🧠 **Semantic Search** — Find books by feel and concept, not just keywords
- 📚 **Smart Bookshelf** — Track reading status (Want to Read, Reading, Completed)
- 🎯 **Reading Goals** — Set and track yearly reading targets
- ⭐ **Community Reviews** — Rate books and read AI sentiment summaries
- 🌗 **Dark / Light Mode** — Comfortable reading in any environment

## Tech Stack

### Frontend
- React + Vite
- Tailwind CSS + shadcn/ui
- React Router v6
- TanStack Query

### Backend
- Node.js + Express
- MongoDB + Mongoose
- Google Gemini AI
- Google Books API

## Getting Started

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- Google Books API key
- Google Gemini API key

### Setup

1. **Clone the repo**
   ```bash
   git clone <your-repo-url>
   cd ai-book-buddy
   ```

2. **Install frontend deps**
   ```bash
   npm install
   ```

3. **Install backend deps**
   ```bash
   cd backend && npm install
   ```

4. **Configure environment variables**

   Frontend `.env`:
   ```env
   VITE_API_URL=http://localhost:5000/api
   ```

   Backend `backend/.env`:
   ```env
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/readnova
   JWT_SECRET=your_jwt_secret
   JWT_EXPIRE=30d
   GEMINI_API_KEY=your_gemini_key
   GOOGLE_BOOKS_API_KEY=your_google_books_key
   # Cloudinary (for book covers + profile pictures)
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   # CORS — comma-separated list of allowed frontend origins
   ALLOWED_ORIGINS=http://localhost:8080
   # Pinecone — vector DB for semantic search
   PINECONE_API_KEY=your_pinecone_api_key
   PINECONE_INDEX_NAME=books-index
   ```

5. **Run development servers**

   Backend:
   ```bash
   cd backend && npm run dev
   ```

   Frontend (in a separate terminal):
   ```bash
   npm run dev
   ```

6. Open `http://localhost:8080`

## Pinecone Setup (Semantic Search)

1. Create a free account at [pinecone.io](https://www.pinecone.io)
2. Create a new index:
   - **Name:** `books-index`
   - **Dimension:** `768`
   - **Metric:** `cosine`
3. Copy your API key into `backend/.env`
4. After seeding books, run the bulk embed script:
   ```bash
   cd backend
   npm run embed           # embed books not yet embedded
   npm run embed:overwrite # re-embed everything
   ```
   Or trigger it via the admin dashboard: `POST /api/admin/generate-embeddings`

## Running Tests

**Frontend (Vitest + React Testing Library):**
```bash
npm test
```

**Backend (Jest + Supertest + in-memory MongoDB):**
```bash
cd backend && npm test
```

## Deployment

### Backend → Render
1. Create a new **Web Service** on [render.com](https://render.com)
2. Connect your GitHub repo → set **Root Directory** to `backend`
3. Build command: `npm install` · Start command: `node server.js`
4. Add all env vars from `backend/.env.example` in the Render dashboard
5. The `render.yaml` blueprint in the repo root automates steps 2–4

### Frontend → Vercel
1. Import the repo on [vercel.com](https://vercel.com)
2. Framework preset: **Vite** · Root Directory: `/` (repo root)
3. Add `VITE_API_URL=https://your-render-backend.onrender.com/api`
4. The `vercel.json` handles SPA routing rewrites automatically

## API Overview

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | — | Register new user |
| POST | `/api/auth/login` | — | Login |
| GET | `/api/auth/me` | JWT | Current user |
| PUT | `/api/auth/preferences` | JWT | Save quiz embedding |
| GET | `/api/books` | — | List books (paginated) |
| GET | `/api/books/:id` | — | Single book |
| GET | `/api/books/:id/summary` | — | AI-generated summary |
| GET | `/api/books/:id/review-summary` | — | AI community sentiment |
| GET | `/api/books/google-search?q=` | — | Google Books search |
| GET | `/api/books/semantic-search?q=` | JWT | Semantic embedding search |
| GET | `/api/recommendations?mood=Happy` | JWT | Mood-based recs |
| GET | `/api/recommendations?query=...` | JWT | Conversational recs |
| GET | `/api/recommendations/:id/explain` | JWT | AI explanation |
| POST | `/api/bookshelf` | JWT | Add to bookshelf |
| PATCH | `/api/bookshelf/move` | JWT | Move between shelves |
| DELETE | `/api/bookshelf/:bookId` | JWT | Remove from shelf |
| GET | `/api/bookshelf` | JWT | Get bookshelf |
| POST | `/api/reviews` | JWT | Create review (completed only) |
| GET | `/api/reviews/book/:id` | — | Book reviews |
| PUT | `/api/reading-goal` | JWT | Set yearly goal |
| GET | `/api/reading-goal/progress` | JWT | Goal progress |
| POST | `/api/upload/profile` | JWT | Upload profile picture |

## Project Structure

```
ai-book-buddy/
├── src/                  # Frontend React app
│   ├── components/       # Reusable UI components
│   ├── contexts/         # Auth, Bookshelf contexts
│   ├── pages/            # Route pages
│   ├── lib/              # API client, utilities
│   └── test/             # Vitest component tests
├── backend/
│   └── src/
│       ├── ai/           # Gemini service (circuit-breaker)
│       ├── controllers/  # Route handlers
│       ├── middleware/    # Auth, rate-limit, error handling
│       ├── models/        # Mongoose schemas
│       ├── recommendation/# Hybrid engine (content + collab)
│       ├── routes/        # Express routes
│       ├── services/      # Business logic
│       ├── tests/         # Jest + Supertest API tests
│       └── utils/         # Helpers (cache, paginate, etc.)
├── render.yaml           # Render deployment blueprint
└── vercel.json           # Vercel SPA routing config
```

## License

MIT
