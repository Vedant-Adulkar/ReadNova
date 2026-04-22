import { useParams, Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { ArrowLeft, BookOpen, Library, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { AppLayout } from "@/components/AppLayout";
import { StarRating } from "@/components/StarRating";
import { BookCard } from "@/components/BookCard";
import { useBookshelf } from "@/contexts/BookshelfContext";
import { useToast } from "@/hooks/use-toast";
import { get, post } from "@/lib/apiClient";

export default function BookDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getStatus, setBookStatus } = useBookshelf();
  const [reviewText, setReviewText] = useState("");
  const [reviewRating, setReviewRating] = useState(0);
  const { toast } = useToast();

  const [book, setBook] = useState(null);
  const [aiSummary, setAiSummary] = useState(null);
  const [aiExplanation, setAiExplanation] = useState("");
  const [reviewSentiment, setReviewSentiment] = useState("");
  const [reviews, setReviews] = useState([]);
  const [reviewSummary, setReviewSummary] = useState({ averageRating: 0, totalReviews: 0 });
  const [similarBooks, setSimilarBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);

  // Detect: MongoDB ObjectId = 24 hex chars; anything else = Google Books volume ID
  const isMongoId = /^[a-f\d]{24}$/i.test(id);

  useEffect(() => {
    setLoading(true);

    if (isMongoId) {
      // ── Local MongoDB book ─────────────────────────────────────────────────
      Promise.all([
        get(`/books/${id}`),
        get(`/reviews/${id}`, { limit: 10 }),
        get(`/reviews/${id}/summary`),
      ])
        .then(([bookData, revData, summData]) => {
          setBook(bookData.book);
          setReviews(revData.reviews || []);
          setReviewSummary(summData.summary || { averageRating: 0, totalReviews: 0 });
          setLoading(false); // Show page immediately with core data

          // ── Lazy-load AI features in the background (non-blocking) ─────
          get(`/books/${id}/summary`).then((d) => setAiSummary(d.summary)).catch(() => {});

          if ((revData.reviews || []).length > 0) {
            get(`/books/${id}/review-summary`).then((d) => setReviewSentiment(d.summary)).catch(() => {});
          }
          if (bookData.book?.genres?.length) {
            get("/books", { genre: bookData.book.genres[0], limit: 4 })
              .then((d) => setSimilarBooks((d.books || []).filter((b) => b._id !== id).slice(0, 4)))
              .catch(() => {});
          }
        })
        .catch(() => { setBook(null); setLoading(false); });
    } else {
      // ── Google Books volume ────────────────────────────────────────────────
      get(`/books/google-volume/${id}`)
        .then((data) => {
          const b = data.book;
          setBook(b);

          if (b.aiSummary?.short) setAiSummary(b.aiSummary);

          const mid = b?.mongoId || null;

          // Fetch reviews in parallel, then hide loader
          Promise.all([
            get(`/reviews/${id}`, { limit: 10 }).catch(() => ({ reviews: [] })),
            get(`/reviews/${id}/summary`).catch(() => ({ summary: { averageRating: 0, totalReviews: 0 } })),
          ]).then(([revData, summData]) => {
            setReviews(revData.reviews || []);
            setReviewSummary(summData.summary || { averageRating: 0, totalReviews: 0 });
            setLoading(false); // Show page with core data

            // ── Lazy-load AI features (non-blocking) ─────────────────────
            if (mid && !b.aiSummary?.short) {
              get(`/books/${mid}/summary`).then((d) => { if (d.summary) setAiSummary(d.summary); }).catch(() => {});
            }
            if (mid && (revData.reviews || []).length > 0) {
              get(`/books/${mid}/review-summary`).then((d) => setReviewSentiment(d.summary)).catch(() => {});
            }
          });

          // Similar books (non-blocking)
          if (b?.genres?.length) {
            get("/books/google-search", { q: `subject:${b.genres[0]}`, limit: 5 })
              .then((d) => setSimilarBooks((d.books || []).filter((s) => s._id !== id).slice(0, 4)))
              .catch(() => {});
          }
        })
        .catch(() => { setBook(null); setLoading(false); });
    }
  }, [id, isMongoId]);

  const status = getStatus(id);
  const canReview = status === "completed";
  const hasMongoRecord = isMongoId || Boolean(book?.mongoId);

  const handleShelfChange = async (shelf) => {
    try {
      await setBookStatus(id, status === shelf ? null : shelf);
    } catch (err) {
      toast({ title: "Shelf update failed", description: err.message, variant: "destructive" });
    }
  };

  const handleReviewSubmit = async () => {
    if (reviewRating === 0) { toast({ title: "Please select a rating", variant: "destructive" }); return; }
    const trimmed = reviewText.trim();
    if (trimmed.length < 10) {
      toast({ title: "Review too short", description: "Please write at least 10 characters.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const data = await post(`/reviews/${id}`, { rating: reviewRating, reviewText: trimmed });
      setReviews((prev) => [data.review, ...prev]);
      toast({ title: "Review submitted!" });
      setReviewText("");
      setReviewRating(0);
      const bookIdForRefresh = isMongoId ? id : book?.mongoId;
      get(`/reviews/${id}/summary`).then((d) => setReviewSummary(d.summary)).catch(() => { });
      if (bookIdForRefresh) {
        get(`/books/${bookIdForRefresh}`).then((d) => setBook(d.book)).catch(() => { });
        get(`/books/${bookIdForRefresh}/review-summary`).then((d) => setReviewSentiment(d.summary)).catch(() => { });
      }
    } catch (err) {
      toast({ title: "Review failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateSummary = async () => {
    // Robust ID selection: prefers MongoDB ID if available, otherwise Google volumeId
    const bookId = book._id || book.googleBooksId || id;
    
    setGeneratingSummary(true);
    try {
      const data = await post(`/books/${bookId}/generate-summary`);
      // Instant state sync to avoid refresh
      setBook(data.book);
      setAiSummary(data.book.aiSummary);
      toast({ title: "Summary generated!", description: "AI has analyzed this book and updated its profile." });
    } catch (err) {
      toast({ title: "Generation failed", description: err.message || "Failed to generate AI summary.", variant: "destructive" });
    } finally {
      setGeneratingSummary(false);
    }
  };

  const difficultyColor = {
    Beginner: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    Intermediate: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    Advanced: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  };

  const normaliseSimilar = (b) => ({
    id: b._id || b.googleBooksId || b.id,
    _id: b._id || b.googleBooksId || b.id,
    title: b.title, author: b.author,
    cover: b.coverImage || `https://covers.openlibrary.org/b/title/${encodeURIComponent(b.title)}-M.jpg`,
    rating: b.averageRating ?? 0, reviewCount: b.ratingsCount ?? 0,
    genre: b.genres ?? [], difficulty: b.difficultyLevel,
  });

  if (loading) return <AppLayout><div className="flex justify-center p-16"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div></AppLayout>;
  if (!book) return (
    <AppLayout>
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Book not found.</p>
        <Button variant="link" asChild><Link to="/dashboard">Back to Dashboard</Link></Button>
      </div>
    </AppLayout>
  );

  const coverUrl = book.coverImage || `https://covers.openlibrary.org/b/title/${encodeURIComponent(book.title)}-M.jpg`;

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-4xl space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>

        {/* Book Header */}
        <div className="flex flex-col md:flex-row gap-6">
          <img src={coverUrl} alt={book.title} className="w-48 h-72 object-cover rounded-lg shadow-md" />
          <div className="space-y-3 flex-1">
            <h1 className="text-3xl font-bold font-serif text-foreground">{book.title}</h1>
            <p className="text-lg text-muted-foreground">by {book.author}</p>
            <div className="flex items-center gap-2">
              <StarRating rating={reviewSummary?.averageRating || 0} size={20} />
              <span className="text-sm text-muted-foreground">{(reviewSummary?.averageRating || 0).toFixed(1)} ({reviewSummary?.totalReviews || 0} reviews)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {(book.genres || []).map((g) => <Badge key={g} variant="outline">{g}</Badge>)}
              {book.difficultyLevel && <Badge className={difficultyColor[book.difficultyLevel]}>{book.difficultyLevel}</Badge>}
            </div>
            <p className="text-sm text-foreground">{book.description}</p>
            {/* Shelf Actions */}
            <div className="flex gap-2 flex-wrap pt-2">
              {[["want", "📚 Want to Read"], ["reading", "📖 Reading"], ["completed", "✅ Completed"]].map(([s, label]) => (
                <Button key={s} variant={status === s ? "default" : "outline"} size="sm" onClick={() => handleShelfChange(s)}>{label}</Button>
              ))}
            </div>
          </div>
        </div>

        {/* AI Summary Section */}
        {aiSummary && aiSummary.short && aiSummary.short.trim().length > 0 ? (
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-serif flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" /> AI Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-foreground leading-relaxed">
                {aiSummary.detailed || aiSummary.short}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-primary/5 border-dashed border-primary/30">
            <CardContent className="py-6 flex flex-col items-center justify-center text-center space-y-3">
              <BookOpen className="h-8 w-8 text-primary/40" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">No AI summary available yet</p>
                <p className="text-xs text-muted-foreground">Our AI can analyze themes and concepts for this book on-demand.</p>
              </div>
                <Button 
                  onClick={handleGenerateSummary} 
                  disabled={generatingSummary}
                  variant="outline"
                  className="mt-2 border-primary/50 hover:bg-primary/10"
                >
                  {generatingSummary ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing...</>
                  ) : (
                    <><Sparkles className="mr-2 h-4 w-4 text-amber-500" /> ✨ Generate AI Summary</>
                  )}
                </Button>
              </CardContent>
            </Card>
        )}

        {/* Review form (available for all books) */}
        {true && (
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-base font-serif">Write a Review</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {true ? (
                <>
                  <StarRating rating={reviewRating} interactive onChange={setReviewRating} size={24} />
                  <Textarea placeholder="Share your thoughts (min. 10 characters)..." value={reviewText} onChange={(e) => setReviewText(e.target.value)} />
                  <Button onClick={handleReviewSubmit} disabled={submitting}>{submitting ? "Submitting…" : "Submit Review"}</Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground italic">Add this book to your library to write a review.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Community Reviews (available for all books) */}
        {true && (
          <div className="space-y-3">
            <h3 className="font-serif font-semibold text-lg text-foreground">Community Reviews</h3>
            {reviewSentiment && reviews.length > 0 && (
              <Card className="bg-primary/5 border-primary/20 p-4">
                <p className="text-sm text-foreground italic">📊 AI Sentiment: {reviewSentiment}</p>
              </Card>
            )}
            {reviews.length > 0 ? (
              reviews.map((r) => (
                <Card key={r._id} className="p-4 bg-card border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                      {r.userId?.name?.[0] ?? "?"}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{r.userId?.name ?? "Anonymous"}</p>
                      <p className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="ml-auto"><StarRating rating={r.rating} size={12} /></div>
                  </div>
                  <p className="text-sm text-foreground">{r.reviewText}</p>
                </Card>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No community reviews yet.</p>
            )}
          </div>
        )}

        {/* Similar Books */}
        {similarBooks.length > 0 && (
          <div>
            <h3 className="font-serif font-semibold text-lg mb-4 text-foreground">Similar Books</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {similarBooks.map((b) => <BookCard key={b._id} book={normaliseSimilar(b)} />)}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
