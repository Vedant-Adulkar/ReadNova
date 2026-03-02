import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/StarRating";
import { BookCard } from "@/components/BookCard";
import { useAuth } from "@/contexts/AuthContext";
import { useBookshelf } from "@/contexts/BookshelfContext";
import { User, BookOpen, Library, Target, Settings, Loader2 } from "lucide-react";
import { get } from "@/lib/apiClient";
import { Link } from "react-router-dom";

export default function Profile() {
  const { user, logout } = useAuth();
  const { entries, loadingShelf } = useBookshelf();
  const [reviews, setReviews] = useState([]);

  const completed = entries.filter((e) => e.status === "completed");
  const reading = entries.filter((e) => e.status === "reading");

  const genresExplored = [...new Set(completed.flatMap((e) => {
    const b = e.book;
    return Array.isArray(b?.genres) ? b.genres : [];
  }))];

  const publicShelf = completed.slice(0, 4).map((e) => e.book).filter(Boolean);

  useEffect(() => {
    if (!user) return;
    // Fetch user's own reviews — use admin route if admin, else skip (no per-user endpoint needed)
    // We approximate by showing 0 reviews; a /api/reviews/mine endpoint could be added
  }, [user]);

  const normBook = (b) => b && ({
    id: b._id, _id: b._id, title: b.title, author: b.author,
    cover: b.coverImage || `https://covers.openlibrary.org/b/title/${encodeURIComponent(b.title ?? "")}-M.jpg`,
    rating: b.averageRating ?? 0, reviewCount: b.ratingsCount ?? 0,
    genre: b.genres ?? [], difficulty: b.difficultyLevel, description: b.description,
  });

  if (!user) return (
    <AppLayout>
      <div className="p-8 text-center space-y-4">
        <p className="text-muted-foreground">Please log in to view your profile.</p>
        <Button asChild><Link to="/login">Log In</Link></Button>
      </div>
    </AppLayout>
  );

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-4xl space-y-6">
        {/* Profile Header */}
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center">
            <User className="h-8 w-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold font-serif text-foreground">{user.name}</h1>
            <p className="text-sm text-muted-foreground">{user.email} · {user.role}</p>
          </div>
          <Button variant="outline" size="sm" onClick={logout}>Log Out</Button>
        </div>

        {/* Stats */}
        {loadingShelf
          ? <div className="flex justify-center py-8"><Loader2 className="animate-spin h-6 w-6 text-primary" /></div>
          : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Books Read" value={completed.length.toString()} icon={<BookOpen className="h-5 w-5 text-primary" />} />
              <StatCard label="Currently Reading" value={reading.length.toString()} icon={<Library className="h-5 w-5 text-primary" />} />
              <StatCard label="Genres Explored" value={genresExplored.length.toString()} icon={<Target className="h-5 w-5 text-primary" />} />
              <StatCard label="All Shelved" value={entries.length.toString()} icon={<Settings className="h-5 w-5 text-primary" />} />
            </div>
          )}

        {/* Genres Explored */}
        <Card className="bg-card border-border p-5">
          <h3 className="font-serif font-semibold mb-3 text-foreground">Genres Explored</h3>
          <div className="flex flex-wrap gap-2">
            {genresExplored.length > 0
              ? genresExplored.map((g) => <Badge key={g} variant="secondary">{g}</Badge>)
              : <p className="text-sm text-muted-foreground">Complete some books to discover your genre tastes!</p>}
          </div>
        </Card>

        {/* Public Bookshelf */}
        <div>
          <h3 className="font-serif font-semibold text-lg mb-4 text-foreground">Completed Books</h3>
          {publicShelf.filter(Boolean).length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {publicShelf.filter(Boolean).map((b) => <BookCard key={b._id} book={normBook(b)} />)}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Complete some books to show them here!</p>
          )}
        </div>

        {/* Personality Profile */}
        {user.personalityProfile && (
          <Card className="bg-card border-border p-5">
            <h3 className="font-serif font-semibold mb-3 text-foreground">Preferences</h3>
            <p className="text-sm text-muted-foreground">{user.personalityProfile}</p>
            <Button variant="outline" size="sm" className="mt-4" asChild>
              <Link to="/quiz">Retake Quiz</Link>
            </Button>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

function StatCard({ label, value, icon }) {
  return (
    <Card className="p-4 bg-card border-border">
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <p className="text-2xl font-bold font-serif text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </div>
    </Card>
  );
}
