import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BookCard } from "@/components/BookCard";
import { Search as SearchIcon, Loader2, Sparkles } from "lucide-react";
import { get } from "@/lib/apiClient";
import { cn } from "@/lib/utils";

const DIFFICULTIES = ["Beginner", "Intermediate", "Advanced"];

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [selectedGenre, setSelectedGenre] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [sortBy, setSortBy] = useState("relevance");

  const [books, setBooks] = useState([]);
  const [genres, setGenres] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // ── Fetch distinct genres from first page of books for the filter dropdown ──
  useEffect(() => {
    get("/books", { limit: 100 })
      .then((data) => {
        const allGenres = [...new Set((data.books || []).flatMap((b) => b.genres || []))].sort();
        setGenres(allGenres);
      })
      .catch(console.error);
  }, []);

  const search = useCallback(async () => {
    setLoading(true);
    try {
      if (query.trim()) {
        // ── Live search via Google Books API ─────────────────────────────────
        const params = { q: query.trim(), limit: 40 };
        if (selectedGenre !== "all") params.q += ` subject:${selectedGenre}`;
        if (difficulty !== "all") params.difficulty = difficulty;

        const data = await get("/books/google-search", params);
        let results = data.books || [];

        // Client-side sort
        if (sortBy === "rating") results = [...results].sort((a, b) => b.averageRating - a.averageRating);
        else if (sortBy === "title") results = [...results].sort((a, b) => a.title.localeCompare(b.title));

        setBooks(results);
        setTotal(data.total || results.length);
      } else {
        // ── Browse local DB when no query ────────────────────────────────────
        const params = { limit: 48 };
        if (selectedGenre !== "all") params.genre = selectedGenre;
        if (difficulty !== "all") params.difficulty = difficulty;

        const data = await get("/books", params);
        let results = data.books || [];

        if (sortBy === "rating") results = [...results].sort((a, b) => b.averageRating - a.averageRating);
        else if (sortBy === "title") results = [...results].sort((a, b) => a.title.localeCompare(b.title));

        setBooks(results);
        setTotal(data.total || results.length);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [query, selectedGenre, difficulty, sortBy]);

  // Re-search whenever filters change
  useEffect(() => { search(); }, [search]);

  const normaliseBook = (b) => ({
    // Support both local MongoDB (_id) and Google Books (googleBooksId / id)
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
    previewLink: b.previewLink,
    source: b.source,
  });

  return (
    <AppLayout>
      <div className="space-y-10 max-w-7xl mx-auto">
        <div className="space-y-6">
          <div className="space-y-2">
            <Badge variant="outline" className="bg-primary/5 text-primary">Discovery</Badge>
            <h1 className="text-3xl md:text-5xl font-bold font-serif text-foreground tracking-tight">Explore the <span className="text-primary italic">Library</span></h1>
          </div>

          <div className="relative group max-w-2xl">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-accent/10 rounded-2xl blur opacity-25 group-focus-within:opacity-50 transition duration-1000"></div>
            <div className="relative">
              <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title, author, genre, or theme..."
                className="pl-12 h-14 bg-background/80 backdrop-blur-sm border-border/50 text-lg rounded-2xl shadow-xl focus:ring-primary/20 focus:border-primary/40 transition-all"
              />
            </div>
          </div>
        </div>

        {/* Filters & Sorting */}
        <div className="flex flex-wrap items-center gap-4 border-b border-border/50 pb-8">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-1">Genre</span>
              <Select value={selectedGenre} onValueChange={setSelectedGenre}>
                <SelectTrigger className="w-44 bg-card/40 border-border/40 hover:border-primary/30 transition-all rounded-xl h-10">
                  <SelectValue placeholder="All Genres" />
                </SelectTrigger>
                <SelectContent className="glass-card">
                  <SelectItem value="all">All Genres</SelectItem>
                  {genres.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-1">Difficulty</span>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger className="w-44 bg-card/40 border-border/40 hover:border-primary/30 transition-all rounded-xl h-10">
                  <SelectValue placeholder="Difficulty" />
                </SelectTrigger>
                <SelectContent className="glass-card">
                  <SelectItem value="all">Any Level</SelectItem>
                  {DIFFICULTIES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 ml-auto">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-1 text-right block pr-1">Sort</span>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-40 bg-card/40 border-border/40 hover:border-primary/30 transition-all rounded-xl h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="glass-card">
                  <SelectItem value="relevance">Top Match</SelectItem>
                  <SelectItem value="rating">Top Rated</SelectItem>
                  <SelectItem value="title">A - Z</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-bold font-serif text-foreground">
              {loading ? "Sifting through books..." : `Found ${total} matches`}
            </h2>
            <div className="h-px flex-1 bg-gradient-to-r from-border/50 to-transparent mx-6 hidden md:block" />
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <Loader2 className="animate-spin h-12 w-12 text-primary/40" />
              <p className="text-muted-foreground font-medium animate-pulse">Consulting the archives...</p>
            </div>
          ) : (
            <>
              {books.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6 md:gap-8">
                  {books.map((book) => <BookCard key={book._id} book={normaliseBook(book)} showExplanation />)}
                </div>
              ) : (
                <div className="text-center py-24 space-y-4 bg-muted/10 rounded-3xl border border-dashed border-muted/50">
                  <SearchIcon className="h-12 w-12 text-muted/30 mx-auto" />
                  <div className="space-y-1">
                    <p className="text-foreground font-bold">No books match your criteria</p>
                    <p className="text-sm text-muted-foreground">Try broadening your search or adjusting the filters.</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
