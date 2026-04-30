// src/pages/Recommendations.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Dedicated AI Recommendations page.
// Surfaces the hybrid engine (content-based + collaborative + Gemini) with:
//   - Conversational search bar
//   - Mood chip filters
//   - Per-book match score badges
//   - Skeleton loaders & cold-start empty state
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Sparkles,
  Loader2,
  Brain,
  BookOpen,
  Search,
  RefreshCw,
  Star,
  TrendingUp,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppLayout } from "@/components/AppLayout";
import { get } from "@/lib/apiClient";
import { useAuth } from "@/contexts/AuthContext";
import { useBookshelf } from "@/contexts/BookshelfContext";

// ── Mood chips ─────────────────────────────────────────────────────────────────
const MOODS = [
  { label: "Happy", emoji: "😊", color: "from-amber-400 to-yellow-300" },
  { label: "Thoughtful", emoji: "🤔", color: "from-violet-500 to-purple-400" },
  { label: "Adventurous", emoji: "🗺️", color: "from-emerald-500 to-teal-400" },
  { label: "Relaxing", emoji: "😌", color: "from-sky-400 to-blue-300" },
  { label: "Intense", emoji: "🔥", color: "from-red-500 to-orange-400" },
];

// ── Session cache helpers ──────────────────────────────────────────────────────
const CACHE_TTL = 10 * 60 * 1000;

const getCache = (key) => {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { sessionStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
};

const setCache = (key, data) => {
  try { sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch { /* quota */ }
};

// ── Normalise a backend rec/book to a flat shape ───────────────────────────────
const normalise = (item) => {
  const b = item?.book ?? item;
  return {
    id: b._id || b.googleBooksId || b.id,
    _id: b._id || b.googleBooksId || b.id,
    title: b.title || "Unknown Title",
    author: b.author || "Unknown Author",
    cover:
      b.coverImage ||
      `https://covers.openlibrary.org/b/title/${encodeURIComponent(b.title || "")}-M.jpg`,
    rating: b.averageRating ?? 0,
    genres: b.genres ?? [],
    difficulty: b.difficultyLevel || null,
    finalScore: item?.finalScore ?? null,
    contentScore: item?.contentScore ?? null,
    collaborativeScore: item?.collaborativeScore ?? null,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
export default function Recommendations() {
  const { user } = useAuth();
  const { getStatus } = useBookshelf();

  const [query, setQuery] = useState("");
  const [activeMood, setActiveMood] = useState(null);

  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sectionTitle, setSectionTitle] = useState("AI Picks For You");
  const [hasQuiz, setHasQuiz] = useState(false);

  // ── Derive initial query from user profile ────────────────────────────────
  const profileQuery = useCallback(() => {
    const profile = user?.personalityProfile || "";
    const genreMatch = profile.match(/Genres:\s*([^.]+)/);
    const genres = genreMatch
      ? genreMatch[1].split(",").map((g) => g.trim()).filter(Boolean)
      : [];
    return genres.length > 0 ? genres.join(" ") : null;
  }, [user?.personalityProfile]);

  // ── Generic fetch helper ──────────────────────────────────────────────────
  const fetchRecs = useCallback(
    async ({ mood, query: q, topN = 30, cacheKey, title }) => {
      if (!user) return;

      const cached = getCache(cacheKey);
      if (cached && cached.length > 0) {
        setBooks(cached);
        setSectionTitle(title);
        return;
      }

      setLoading(true);
      setBooks([]);
      setSectionTitle(title);

      try {
        const params = { topN };
        if (mood) params.mood = mood;
        else if (q) params.query = q;

        const data = await get("/recommendations", params);
        const raw = data.recommendations || [];
        const normalised = raw
          .map(normalise)
          .filter((b) => !getStatus(b._id)); // exclude already-shelved books

        setCache(cacheKey, normalised);
        setBooks(normalised);
      } catch (err) {
        console.warn("Recommendations error:", err.message);
        setBooks([]);
      } finally {
        setLoading(false);
      }
    },
    [user, getStatus]
  );

  // ── On mount: load personalised picks ────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    const profile = user?.personalityProfile || "";
    setHasQuiz(!!profile);

    const pq = profileQuery();
    if (pq) {
      fetchRecs({
        query: pq,
        topN: 30,
        cacheKey: `recs_default_${user._id}`,
        title: "AI Picks For You",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id]);

  // ── Mood chip handler ─────────────────────────────────────────────────────
  const handleMood = (mood) => {
    if (activeMood === mood) {
      setActiveMood(null);
      // Revert to personalised picks
      const pq = profileQuery();
      if (pq) {
        fetchRecs({
          query: pq,
          topN: 30,
          cacheKey: `recs_default_${user?._id}`,
          title: "AI Picks For You",
        });
      }
      return;
    }
    setActiveMood(mood);
    fetchRecs({
      mood,
      topN: 30,
      cacheKey: `recs_mood_${mood}_${user?._id}`,
      title: `${MOODS.find((m) => m.label === mood)?.emoji} ${mood} Reads`,
    });
  };

  // ── Search handler ────────────────────────────────────────────────────────
  const handleSearch = (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setActiveMood(null);
    fetchRecs({
      query: query.trim(),
      topN: 30,
      cacheKey: `recs_search_${query.trim().toLowerCase().slice(0, 40)}`,
      title: `Results for "${query}"`,
    });
  };

  // ── Refresh ───────────────────────────────────────────────────────────────
  const handleRefresh = () => {
    if (!user) return;
    // Clear caches
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith("recs_"))
      .forEach((k) => sessionStorage.removeItem(k));

    setActiveMood(null);
    setQuery("");
    const pq = profileQuery();
    fetchRecs({
      query: pq || "popular fiction",
      topN: 30,
      cacheKey: `recs_default_${user._id}`,
      title: "AI Picks For You",
    });
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-8 space-y-8 max-w-6xl">

        {/* ── Page Header ──────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-primary/10">
                <Brain className="h-5 w-5 text-primary" />
              </div>
              <h1 className="text-3xl md:text-4xl font-bold font-serif tracking-tight">
                AI Recommendations
              </h1>
            </div>
            <p className="text-muted-foreground text-sm">
              Personalised by our hybrid engine — content matching + reader taste signals
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="gap-2 self-start sm:self-center"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* ── Conversational Search ─────────────────────────────────────── */}
        <form onSubmit={handleSearch} className="relative max-w-2xl">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="rec-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. short mystery for beginners, epic sci-fi saga…"
            className="pl-10 pr-20 py-5 text-base rounded-xl bg-card border-border"
          />
          <Button
            type="submit"
            size="sm"
            className="absolute right-2 top-1/2 -translate-y-1/2 gap-1.5"
            disabled={loading || !query.trim()}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Search
          </Button>
        </form>

        {/* ── Mood Chips ───────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2">
          {MOODS.map((mood) => {
            const isActive = activeMood === mood.label;
            return (
              <button
                key={mood.label}
                id={`mood-${mood.label.toLowerCase()}`}
                onClick={() => handleMood(mood.label)}
                className={`
                  inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium
                  transition-all duration-200 border
                  ${isActive
                    ? `bg-gradient-to-r ${mood.color} text-white border-transparent shadow-md scale-105`
                    : "bg-card border-border text-muted-foreground hover:border-primary/40 hover:text-foreground hover:scale-105"
                  }
                `}
              >
                <span>{mood.emoji}</span>
                {mood.label}
              </button>
            );
          })}
        </div>

        {/* ── Results Section ──────────────────────────────────────────── */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl md:text-2xl font-bold font-serif tracking-tight">
              {loading ? (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Finding your next great read…
                </span>
              ) : (
                sectionTitle
              )}
            </h2>
            {!loading && books.length > 0 && (
              <span className="text-sm text-muted-foreground">
                {books.length} books
              </span>
            )}
          </div>

          {/* Cold-start state */}
          {!loading && !hasQuiz && books.length === 0 && (
            <ColdStartCard />
          )}

          {/* Skeleton loaders */}
          {loading && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          )}

          {/* Book grid */}
          {!loading && books.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
              {books.map((book) => (
                <RecommendationCard key={book.id} book={book} />
              ))}
            </div>
          )}

          {/* Empty state after search */}
          {!loading && books.length === 0 && hasQuiz && (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
              <div className="p-4 rounded-full bg-muted/30">
                <BookOpen className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground font-medium">
                No recommendations found. Try a different query or mood.
              </p>
              <Button variant="ghost" size="sm" onClick={handleRefresh}>
                Reset picks
              </Button>
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function RecommendationCard({ book }) {
  const matchPct =
    book.finalScore != null ? Math.round(book.finalScore * 100) : null;

  const matchColor =
    matchPct >= 80
      ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
      : matchPct >= 60
      ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
      : "bg-muted text-muted-foreground border-border";

  return (
    <Link
      to={`/book/${book.id}`}
      id={`rec-card-${book.id}`}
      className="group flex flex-col rounded-2xl overflow-hidden bg-card border border-border/50
                 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5
                 transition-all duration-300 hover:-translate-y-1"
    >
      {/* Cover */}
      <div className="relative aspect-[2/3] overflow-hidden bg-muted">
        <img
          src={book.cover}
          alt={book.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            e.currentTarget.src = `https://via.placeholder.com/200x300/1a1a2e/a0a0b0?text=${encodeURIComponent(book.title)}`;
          }}
        />
        {/* Match score badge */}
        {matchPct != null && (
          <div className={`absolute top-2 right-2 text-xs font-bold px-2 py-0.5 rounded-full border backdrop-blur-sm ${matchColor}`}>
            {matchPct}%
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 space-y-1.5 flex-1">
        <p className="font-semibold text-sm leading-snug line-clamp-2 group-hover:text-primary transition-colors">
          {book.title}
        </p>
        <p className="text-xs text-muted-foreground line-clamp-1">{book.author}</p>

        <div className="flex flex-wrap gap-1 pt-0.5">
          {book.genres.slice(0, 1).map((g) => (
            <Badge key={g} variant="secondary" className="text-xs px-1.5 py-0">
              {g}
            </Badge>
          ))}
          {book.difficulty && (
            <Badge variant="outline" className="text-xs px-1.5 py-0">
              {book.difficulty}
            </Badge>
          )}
        </div>

        {book.rating > 0 && (
          <div className="flex items-center gap-1 pt-0.5">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            <span className="text-xs text-muted-foreground">{book.rating.toFixed(1)}</span>
          </div>
        )}
      </div>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div className="flex flex-col rounded-2xl overflow-hidden bg-card border border-border/30 animate-pulse">
      <div className="aspect-[2/3] bg-muted" />
      <div className="p-3 space-y-2">
        <div className="h-3.5 bg-muted rounded w-4/5" />
        <div className="h-3 bg-muted rounded w-3/5" />
        <div className="h-5 bg-muted rounded w-1/3 mt-1" />
      </div>
    </div>
  );
}

function ColdStartCard() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 border border-dashed border-border rounded-3xl bg-muted/10">
      <div className="p-4 rounded-full bg-primary/10">
        <TrendingUp className="h-8 w-8 text-primary" />
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-lg">Your AI picks are waiting</p>
        <p className="text-muted-foreground text-sm max-w-xs">
          Take the taste quiz so our engine can learn your reading style and personalise your recommendations.
        </p>
      </div>
      <Button asChild>
        <Link to="/quiz">Take the Quiz →</Link>
      </Button>
    </div>
  );
}
