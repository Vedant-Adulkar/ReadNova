import { useParams, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { ArrowLeft, BookOpen, Sparkles, Loader2 } from "lucide-react";
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
  const { getStatus, setBookStatus } = useBookshelf();
  const [reviewText, setReviewText] = useState("");
  const [reviewRating, setReviewRating] = useState(0);
  const { toast } = useToast();

  const [book, setBook] = useState(null);
  const [aiSummary, setAiSummary] = useState("");
  const [aiExplanation, setAiExplanation] = useState("");
  const [reviewSentiment, setReviewSentiment] = useState("");
  const [reviews, setReviews] = useState([]);
  const [similarBooks, setSimilarBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Detect: MongoDB ObjectId = 24 hex chars; anything else = Google Books volume ID
  const isMongoId = /^[a-f\d]{24}$/i.test(id);

  useEffect(() => {
    setLoading(true);

    if (isMongoId) {
      // ── Local MongoDB book ─────────────────────────────────────────────────
      Promise.all([
        get(`/books/${id}`),
        get(`/reviews/${id}`, { limit: 10 }),
      ])
        .then(([bookData, revData]) => {
          setBook(bookData.book);
          setReviews(revData.reviews || []);
          get(`/books/${id}/summary`).then((d) => setAiSummary(d.summary)).catch(() => { });
          get(`/recommendations/${id}/explain`).then((d) => setAiExplanation(d.explanation)).catch(() => { });
          if ((revData.reviews || []).length > 0) {
            get(`/books/${id}/review-summary`).then((d) => setReviewSentiment(d.summary)).catch(() => { });
          }
          if (bookData.book?.genres?.length) {
            get("/books", { genre: bookData.book.genres[0], limit: 4 })
              .then((d) => setSimilarBooks((d.books || []).filter((b) => b._id !== id).slice(0, 4)))
              .catch(() => { });
          }
        })
        .catch(() => setBook(null))
        .finally(() => setLoading(false));
    } else {
      // ── Google Books volume ────────────────────────────────────────────────
      get(`/books/google-volume/${id}`)
        .then((data) => {
          const b = data.book;
          setBook(b);
          // Fetch similar books from Google Books using the first genre
          if (b?.genres?.length) {
            get("/books/google-search", { q: `subject:${b.genres[0]}`, limit: 5 })
              .then((d) => setSimilarBooks((d.books || []).filter((s) => s._id !== id).slice(0, 4)))
              .catch(() => { });
          }
        })
        .catch(() => setBook(null))
        .finally(() => setLoading(false));
    }
  }, [id, isMongoId]);

  const status = getStatus(id);
  const canReview = status === "completed";

  const handleShelfChange = async (shelf) => {
    try {
      await setBookStatus(id, status === shelf ? null : shelf);
    } catch (err) {
      toast({ title: "Shelf update failed", description: err.message, variant: "destructive" });
    }
  };

  const handleReviewSubmit = async () => {
    if (reviewRating === 0) { toast({ title: "Please select a rating", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      const data = await post(`/reviews/${id}`, { rating: reviewRating, reviewText });
      setReviews((prev) => [data.review, ...prev]);
      toast({ title: "Review submitted!" });
      setReviewText("");
      setReviewRating(0);
      // Refresh book to get updated averageRating
      get(`/books/${id}`).then((d) => setBook(d.book)).catch(() => { });
    } catch (err) {
      toast({ title: "Review failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
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
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dashboard"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
        </Button>

        {/* Book Header */}
        <div className="flex flex-col md:flex-row gap-6">
          <img src={coverUrl} alt={book.title} className="w-48 h-72 object-cover rounded-lg shadow-md" />
          <div className="space-y-3 flex-1">
            <h1 className="text-3xl font-bold font-serif text-foreground">{book.title}</h1>
            <p className="text-lg text-muted-foreground">by {book.author}</p>
            <div className="flex items-center gap-2">
              <StarRating rating={book.averageRating} size={20} />
              <span className="text-sm text-muted-foreground">{book.averageRating} ({book.ratingsCount} reviews)</span>
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

        {/* AI Explanation & Methodology */}
        {aiExplanation && (
          <div className="space-y-4">
            <Card className="bg-primary/5 border-primary/20 overflow-hidden relative">
              <div className="absolute top-0 right-0 p-3 opacity-10">
                <Sparkles className="h-12 w-12 text-primary" />
              </div>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-serif flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> Why This Book?
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-foreground leading-relaxed">{aiExplanation}</p>
                <div className="mt-4 pt-4 border-t border-primary/10 flex items-center gap-3">
                  <div className="flex -space-x-2">
                    <div className="h-6 w-6 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center" title="Content Filtering">
                      <Library className="h-3 w-3 text-blue-600" />
                    </div>
                    <div className="h-6 w-6 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center" title="AI Personalization">
                      <Sparkles className="h-3 w-3 text-purple-600" />
                    </div>
                  </div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    Recommended via Hybrid Engine (Content + Social signals)
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* AI Summary */}
        {aiSummary && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-serif flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" /> AI Summary
              </CardTitle>
            </CardHeader>
            <CardContent><p className="text-sm text-foreground">{aiSummary}</p></CardContent>
          </Card>
        )}

        {/* Review Form — only available for local (MongoDB) books */}
        {isMongoId && (
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-base font-serif">Write a Review</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {canReview ? (
                <>
                  <StarRating rating={reviewRating} interactive onChange={setReviewRating} size={24} />
                  <Textarea placeholder="Share your thoughts..." value={reviewText} onChange={(e) => setReviewText(e.target.value)} />
                  <Button onClick={handleReviewSubmit} disabled={submitting}>{submitting ? "Submitting…" : "Submit Review"}</Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground italic">Mark this book as "Completed" to write a review.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Community Reviews */}
        {reviews.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-serif font-semibold text-lg text-foreground">Community Reviews</h3>
            {reviewSentiment && (
              <Card className="bg-primary/5 border-primary/20 p-4">
                <p className="text-sm text-foreground italic">📊 AI Sentiment: {reviewSentiment}</p>
              </Card>
            )}
            {reviews.map((r) => (
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
            ))}
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
