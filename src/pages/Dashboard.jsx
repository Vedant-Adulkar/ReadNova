import { useState, useEffect } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BookCard } from "@/components/BookCard";
import { AppLayout } from "@/components/AppLayout";
import { get } from "@/lib/apiClient";
import { useAuth } from "@/contexts/AuthContext";

const moods = ["Happy", "Thoughtful", "Adventurous", "Relaxing", "Intense"];

// Map mood labels → genre/keyword hints sent to the backend search
const MOOD_QUERY = {
  Happy: "uplifting feel-good",
  Thoughtful: "literary philosophy",
  Adventurous: "adventure action",
  Relaxing: "cozy light",
  Intense: "thriller dark intense",
};

export default function Dashboard() {
  const { user } = useAuth();
  const [selectedMood, setSelectedMood] = useState(null);
  const [query, setQuery] = useState("");
  const [aiResponse, setAiResponse] = useState("");

  const [recommendations, setRecommendations] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [trending, setTrending] = useState([]);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);

  const [loadingTrending, setLoadingTrending] = useState(false);

  // ── Trending Now = Google Books popular new releases ───────────────────────
  useEffect(() => {
    setLoadingTrending(true);
    get("/books/google-search", { q: "popular fiction bestsellers 2024", limit: 12 })
      .then((data) => setTrending(data.books || []))
      .catch(console.error)
      .finally(() => setLoadingTrending(false));
  }, []);

  // ── For You = Google Books curated picks (always Google Books) ─────────────
  useEffect(() => {
    if (!user) return;
    setLoadingRecs(true);
    get("/books/google-search", { q: "must read award winning classic novels", limit: 12 })
      .then((data) => setRecommendations(data.books || []))
      .catch(console.error)
      .finally(() => setLoadingRecs(false));
  }, [user]);

  // ── Mood chips → Google Books search ──────────────────────────────────────
  useEffect(() => {
    if (!selectedMood) return;
    setLoadingRecs(true);
    const moodQ = MOOD_QUERY[selectedMood] || selectedMood;
    get("/books/google-search", { q: moodQ, limit: 12 })
      .then((data) => setRecommendations(data.books || []))
      .catch(console.error)
      .finally(() => setLoadingRecs(false));
  }, [selectedMood]);

  // ── Search handler ────────────────────────────────────────────────────────
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoadingSearch(true);
    setAiResponse("");
    try {
      // Merge results from: recommendations engine + Google Books + local DB
      const [recsData, googleData, booksData] = await Promise.all([
        get("/recommendations", { query, topN: 8 }).catch(() => ({ recommendations: [] })),
        get("/books/google-search", { q: query, limit: 20 }).catch(() => ({ books: [] })),
        get("/books", { q: query, limit: 8 }).catch(() => ({ books: [] })),
      ]);
      const recBooks = (recsData.recommendations || []).map((r) => r.book);
      const googleBooks = googleData.books || [];
      const directBooks = booksData.books || [];
      // Merge, deduplicate by _id / googleBooksId
      const seen = new Set();
      const merged = [...recBooks, ...googleBooks, ...directBooks].filter((b) => {
        const key = b._id || b.googleBooksId || b.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setSearchResults(merged);
      setAiResponse(`Found ${merged.length} books matching "${query}"`);
    } catch (err) {
      setAiResponse(`Search failed: ${err.message || "Please try again."}`);
    } finally {
      setLoadingSearch(false);
    }
  };

  // ── normalise a backend book to the shape BookCard expects ────────────────
  const normaliseBook = (item) => {
    const b = item?.book ?? item;
    return {
      id: b._id || b.googleBooksId || b.id,
      _id: b._id || b.googleBooksId || b.id,
      title: b.title,
      author: b.author,
      cover: b.coverImage || `https://covers.openlibrary.org/b/title/${encodeURIComponent(b.title)}-M.jpg`,
      rating: b.averageRating ?? 0,
      reviewCount: b.ratingsCount ?? 0,
      genre: b.genres ?? [],
      difficulty: b.difficultyLevel,
      description: b.description,
      aiExplanation: item?.explanation || "",
    };
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-8 max-w-6xl">
        {/* Conversational Search */}
        <div className="space-y-3">
          <form onSubmit={handleSearch} className="relative max-w-2xl">
            <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Find me a short mystery for beginners..."
              className="pl-9 bg-card border-border text-base py-5" />
          </form>
          {aiResponse && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 max-w-2xl">
              <p className="text-sm text-foreground">{aiResponse}</p>
            </div>
          )}
        </div>

        {/* Mood Chips */}
        <div className="flex gap-2 flex-wrap">
          {moods.map((mood) => (
            <Badge key={mood} variant={selectedMood === mood ? "default" : "outline"}
              className={`cursor-pointer px-4 py-1.5 text-sm transition-colors ${selectedMood === mood ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              onClick={() => setSelectedMood(selectedMood === mood ? null : mood)}>
              {mood === "Happy" && "😊 "}{mood === "Thoughtful" && "🤔 "}{mood === "Adventurous" && "🗺️ "}{mood === "Relaxing" && "😌 "}{mood === "Intense" && "🔥 "}{mood}
            </Badge>
          ))}
        </div>

        {/* Search Results */}
        {query && (
          <Section title={loadingSearch ? "Searching…" : `Search Results (${searchResults.length})`}>
            {loadingSearch
              ? <Loader2 className="animate-spin h-6 w-6 text-primary" />
              : searchResults.length > 0
                ? <BookGrid books={searchResults.map(normaliseBook)} showExplanation />
                : <p className="text-muted-foreground text-sm">No books found. Try different keywords!</p>}
          </Section>
        )}

        {/* For You / Mood / Trending */}
        {!query && (
          <>
            <Section title={selectedMood ? `Based on Your Mood: ${selectedMood}` : "For You"}>
              {loadingRecs
                ? <Loader2 className="animate-spin h-6 w-6 text-primary" />
                : <BookGrid books={recommendations.map(normaliseBook)} showExplanation />}
            </Section>
            <Section title="Trending Now">
              {loadingTrending
                ? <Loader2 className="animate-spin h-6 w-6 text-primary" />
                : <BookGrid books={trending.map(normaliseBook)} />}
            </Section>
          </>
        )}
      </div>
    </AppLayout>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl md:text-3xl font-bold font-serif tracking-tight text-foreground">{title}</h2>
        {subtitle && <p className="text-muted-foreground text-sm font-medium">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function BookGrid({ books, showExplanation }) {
  if (!books.length) return (
    <div className="p-12 rounded-3xl bg-muted/20 border border-dashed border-muted text-center">
      <p className="text-muted-foreground font-medium">No books to show yet.</p>
    </div>
  );
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6 md:gap-8">
      {books.map((book) => <BookCard key={book.id} book={book} showExplanation={showExplanation} />)}
    </div>
  );
}
