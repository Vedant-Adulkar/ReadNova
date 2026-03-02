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
   MONGODB_URI=mongodb://localhost:27017/ai-book-buddy
   JWT_SECRET=your_jwt_secret
   GEMINI_API_KEY=your_gemini_key
   GOOGLE_BOOKS_API_KEY=your_google_books_key
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

## Project Structure

```
ai-book-buddy/
├── src/                  # Frontend React app
│   ├── components/       # Reusable UI components
│   ├── contexts/         # Auth, Bookshelf contexts
│   ├── pages/            # Route pages
│   └── lib/              # API client, utilities
└── backend/
    └── src/
        ├── controllers/  # Route handlers
        ├── models/        # Mongoose schemas
        ├── routes/        # Express routes
        └── services/      # Business logic (AI, Google Books)
```

## License

MIT
