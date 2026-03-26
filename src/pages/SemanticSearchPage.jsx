import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { get } from "@/lib/apiClient";
import { Sparkles, Search, Loader2, Zap, Brain, BookOpen, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const DIFFICULTIES = ["Beginner", "Intermediate", "Advanced"];

const EXAMPLE_QUERIES = [
  "A dark psychological thriller set in Victorian London...",
  "Beginner-friendly science fiction about space exploration...",
  "A coming-of-age story with strong female characters...",
  "Hard sci-fi with detailed technical world-building...",
  "Epic fantasy with complex political intrigue...",
  "Mystery novels with unreliable narrators...",
];

// ─── Skeleton Card ────────────────────────────────────────────────────────────
const SkeletonCard = () => (
  <div className="animate-pulse rounded-2xl overflow-hidden bg-card/60 border border-border/30">
    <div className="h-56 bg-muted/30" />
    <div className="p-4 space-y-2">
      <div className="h-3 bg-muted/40 rounded w-3/4" />
      <div className="h-3 bg-muted/30 rounded w-1/2" />
      <div className="h-5 bg-primary/10 rounded w-1/3 mt-3" />
    </div>
  </div>
);

// ─── Similarity Badge ─────────────────────────────────────────────────────────
const SimilarityBadge = ({ percent, searchType }) => {
  if (searchType !== "semantic" || percent == null) return null;
  const color =
    percent >= 70 ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/10"
      : percent >= 45 ? "text-blue-400 border-blue-500/40 bg-blue-500/10"
        : "text-muted-foreground border-border/40 bg-muted/10";
  return (
    <div
      className={cn(
        "absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold backdrop-blur-md",
        color
      )}
    >
      <Brain className="w-3 h-3" />
      {percent}%
    </div>
  );
};

// ─── Book Result Card ─────────────────────────────────────────────────────────
const SemanticBookCard = ({ result, searchType }) => {
  const navigate = useNavigate();
  const { book, similarityPercent } = result;
  const coverSrc =
    book.coverImage ||
    `https://covers.openlibrary.org/b/title/${encodeURIComponent(book.title)}-M.jpg`;

  return (
    <div
      className="group relative rounded-2xl overflow-hidden bg-card/60 border border-border/20 hover:border-primary/40 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 cursor-pointer"
      onClick={() => navigate(`/book/${book._id}`)}
    >
      <SimilarityBadge percent={similarityPercent} searchType={searchType} />

      {/* Book Cover */}
      <div className="relative h-56 overflow-hidden bg-muted/20">
        <img
          src={coverSrc}
          alt={book.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(book.title)}&size=400&background=6d28d9&color=fff&bold=true&format=svg`;
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>

      {/* Info */}
      <div className="p-4 space-y-2">
        <p className="font-bold text-sm text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors">
          {book.title}
        </p>
        <p className="text-xs text-muted-foreground line-clamp-1">{book.author}</p>

        <div className="flex items-center justify-between pt-1">
          <div className="flex gap-1 flex-wrap">
            {(book.genres || []).slice(0, 2).map((g) => (
              <span
                key={g}
                className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary/80 font-medium"
              >
                {g}
              </span>
            ))}
          </div>
          {book.averageRating > 0 && (
            <div className="flex items-center gap-0.5 text-amber-400 text-xs font-bold">
              <TrendingUp className="w-3 h-3" />
              {book.averageRating.toFixed(1)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SemanticSearchPage() {
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState("all");
  const [genre, setGenre] = useState("all");
  const [genres, setGenres] = useState([]);

  const [results, setResults] = useState([]);
  const [searchType, setSearchType] = useState(null); // 'semantic' | 'text' | null
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Animated placeholder cycling
  const [placeholder, setPlaceholder] = useState(EXAMPLE_QUERIES[0]);
  const placeholderIdx = useRef(0);
  useEffect(() => {
    const iv = setInterval(() => {
      placeholderIdx.current = (placeholderIdx.current + 1) % EXAMPLE_QUERIES.length;
      setPlaceholder(EXAMPLE_QUERIES[placeholderIdx.current]);
    }, 3500);
    return () => clearInterval(iv);
  }, []);

  // Load genres for filter
  useEffect(() => {
    get("/books", { limit: 100 })
      .then((data) => {
        const all = [...new Set((data.books || []).flatMap((b) => b.genres || []))].sort();
        setGenres(all);
      })
      .catch(() => { });
  }, []);

  const runSearch = useCallback(async (q) => {
    const trimmed = (q || query).trim();
    if (!trimmed) return;

    setLoading(true);
    setHasSearched(true);
    setErrorMsg(null);
    setResults([]);
    setSearchType(null);

    try {
      const params = { q: trimmed, topN: 30 };
      if (difficulty !== "all") params.difficulty = difficulty;
      if (genre !== "all") params.genre = genre;

      const data = await get("/books/semantic-search", params);
      setResults(data.results || []);
      setSearchType(data.searchType);
    } catch (err) {
      setErrorMsg(err?.message || "Search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [query, difficulty, genre]);

  const handleSubmit = (e) => {
    e.preventDefault();
    runSearch(query);
  };

  const handleSuggestion = (q) => {
    const stripped = q.replace(/\.\.\.$/, "").trim();
    setQuery(stripped);
    runSearch(stripped);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-10">

        {/* ── Hero ── */}
        <div className="text-center space-y-6 py-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-semibold">
            <Brain className="w-4 h-4" />
            AI-Powered Semantic Search
          </div>
          <h1 className="text-4xl md:text-6xl font-bold font-serif tracking-tight">
            Find Books by{" "}
            <span className="bg-gradient-to-r from-primary via-violet-400 to-pink-400 bg-clip-text text-transparent">
              Meaning
            </span>
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto text-lg">
            Describe what you're looking for in plain English. Our AI understands
            themes, moods, and concepts — not just keywords.
          </p>

          {/* ── Search Form ── */}
          <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
            <div className="relative group">
              {/* Glow ring */}
              <div className="absolute -inset-1 bg-gradient-to-r from-primary/40 via-violet-500/30 to-pink-500/30 rounded-2xl blur-lg opacity-0 group-focus-within:opacity-100 transition-opacity duration-700" />
              <div className="relative flex items-center bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl focus-within:border-primary/50 transition-colors">
                <Brain className="absolute left-5 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <input
                  id="semantic-search-input"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={placeholder}
                  className="flex-1 bg-transparent pl-14 pr-4 py-5 text-foreground placeholder:text-muted-foreground/50 text-base outline-none font-medium"
                />
                <button
                  type="submit"
                  disabled={loading || !query.trim()}
                  className="m-2 flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-40 disabled:pointer-events-none transition-all shadow-lg hover:shadow-primary/30 hover:scale-[1.02] active:scale-95"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  Search
                </button>
              </div>
            </div>
          </form>

          {/* ── Filters ── */}
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Select value={genre} onValueChange={setGenre}>
              <SelectTrigger className="w-40 bg-card/40 border-border/40 hover:border-primary/30 rounded-xl h-9 text-sm">
                <SelectValue placeholder="All Genres" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Genres</SelectItem>
                {genres.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={difficulty} onValueChange={setDifficulty}>
              <SelectTrigger className="w-40 bg-card/40 border-border/40 hover:border-primary/30 rounded-xl h-9 text-sm">
                <SelectValue placeholder="Any Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Level</SelectItem>
                {DIFFICULTIES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── Suggestions (pre-search) ── */}
        {!hasSearched && (
          <div className="space-y-4">
            <p className="text-center text-xs text-muted-foreground uppercase tracking-widest font-bold">
              Try an example
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLE_QUERIES.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSuggestion(q)}
                  className="px-4 py-2 rounded-full bg-card/60 border border-border/30 hover:border-primary/40 hover:bg-primary/5 text-sm text-muted-foreground hover:text-foreground transition-all duration-200"
                >
                  {q}
                </button>
              ))}
            </div>

            {/* Feature highlights */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-10">
              {[
                {
                  icon: Brain,
                  title: "Semantic Understanding",
                  desc: "Matches based on meaning and context, not just keyword overlap.",
                  color: "text-violet-400",
                },
                {
                  icon: Zap,
                  title: "768-Dimensional Vectors",
                  desc: "Each book and query is embedded using Google Gemini into a rich vector space.",
                  color: "text-amber-400",
                },
                {
                  icon: BookOpen,
                  title: "Cosine Similarity Ranking",
                  desc: "Results are ranked by the angle between your query vector and each book's embedding.",
                  color: "text-emerald-400",
                },
              ].map(({ icon: Icon, title, desc, color }) => (
                <div key={title} className="rounded-2xl bg-card/40 border border-border/20 p-6 space-y-3 text-center">
                  <div className={cn("inline-flex p-3 rounded-xl bg-card/60 border border-border/20", color)}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-foreground text-sm">{title}</h3>
                  <p className="text-muted-foreground text-xs leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Results ── */}
        {hasSearched && (
          <div className="space-y-6">
            {/* Results header */}
            {!loading && (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  {searchType === "semantic" ? (
                    <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/30 gap-1.5">
                      <Brain className="w-3 h-3" /> Semantic Match
                    </Badge>
                  ) : searchType === "google_books" ? (
                    <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 gap-1.5">
                      <Sparkles className="w-3 h-3" /> Google Books
                    </Badge>
                  ) : searchType === "text" ? (
                    <Badge variant="outline" className="gap-1.5 text-muted-foreground">
                      <Search className="w-3 h-3" /> Text Fallback
                    </Badge>
                  ) : null}
                  <span className="text-muted-foreground text-sm">
                    {results.length > 0 ? `${results.length} results` : "No results"}
                  </span>
                </div>
                <div className="h-px flex-1 bg-gradient-to-r from-border/50 to-transparent" />
              </div>
            )}

            {/* Error */}
            {errorMsg && (
              <div className="rounded-2xl bg-destructive/10 border border-destructive/30 p-6 text-center space-y-2">
                <p className="font-semibold text-destructive">{errorMsg}</p>
              </div>
            )}

            {/* Loading skeletons */}
            {loading && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
                {Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
            )}

            {/* Results grid */}
            {!loading && results.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
                {results.map((result, i) => (
                  <SemanticBookCard key={result.book._id || i} result={result} searchType={searchType} />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!loading && results.length === 0 && !errorMsg && (
              <div className="text-center py-24 space-y-4 bg-muted/10 rounded-3xl border border-dashed border-muted/40">
                <Search className="h-12 w-12 text-muted/30 mx-auto" />
                <div className="space-y-1">
                  <p className="font-bold text-foreground">No books found</p>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    Try a different query or check that book embeddings have been generated by an admin.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
