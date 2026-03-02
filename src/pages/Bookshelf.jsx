import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookCard } from "@/components/BookCard";
import { useBookshelf } from "@/contexts/BookshelfContext";
import { BookOpen, Library, CheckCircle, Loader2, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/**
 * Normalise a book entry from the API-backed BookshelfContext
 * into the shape that <BookCard> expects.
 */
function normBook(entry) {
  const b = entry?.book;
  if (!b || typeof b === "string") return null; // book not populated yet
  return {
    id: b._id,
    _id: b._id,
    title: b.title,
    author: b.author,
    cover: b.coverImage || `https://covers.openlibrary.org/b/title/${encodeURIComponent(b.title ?? "")}-M.jpg`,
    rating: b.averageRating ?? 0,
    reviewCount: b.ratingsCount ?? 0,
    genre: b.genres ?? [],
    difficulty: b.difficultyLevel,
    description: b.description,
  };
}

export default function Bookshelf() {
  const { entries, loadingShelf } = useBookshelf();
  const [sortBy, setSortBy] = useState("dateAdded");

  const getSorted = (status) => {
    const filtered = entries
      .filter((e) => e.status === status)
      .map((e) => ({ ...e, normB: normBook(e) }))
      .filter((e) => e.normB);

    return filtered.sort((a, b) => {
      if (sortBy === "title") return a.normB.title.localeCompare(b.normB.title);
      if (sortBy === "rating") return b.normB.rating - a.normB.rating;
      return new Date(b.addedAt) - new Date(a.addedAt);
    });
  };

  const wantToRead = getSorted("want");
  const reading = getSorted("reading");
  const completed = getSorted("completed");

  const totalGenres = [...new Set(completed.flatMap((e) => e.normB?.genre ?? []))];

  if (loadingShelf) {
    return (
      <AppLayout>
        <div className="flex justify-center p-24">
          <Loader2 className="animate-spin h-10 w-10 text-primary/40" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-10 max-w-7xl mx-auto">
        <div className="space-y-2">
          <Badge variant="outline" className="bg-primary/5 text-primary">Library</Badge>
          <h1 className="text-3xl md:text-4xl font-bold font-serif text-foreground">My Virtual Bookshelf</h1>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <StatCard icon={<CheckCircle className="h-6 w-6 text-emerald-500" />} label="Read" value={completed.length} color="bg-emerald-500/5" />
          <StatCard icon={<BookOpen className="h-6 w-6 text-blue-500" />} label="Reading" value={reading.length} color="bg-blue-500/5" />
          <StatCard icon={<Library className="h-6 w-6 text-amber-500" />} label="Wishlist" value={wantToRead.length} color="bg-amber-500/5" />
          <StatCard icon={<Sparkles className="h-6 w-6 text-purple-500" />} label="Genere Types" value={totalGenres.length} color="bg-purple-500/5" />
        </div>

        <div className="flex items-center justify-between border-b border-border/50 pb-2">
          <Tabs defaultValue="reading" className="w-full">
            <div className="flex items-center justify-between flex-wrap gap-4 mb-8">
              <TabsList className="bg-muted/30 p-1 rounded-xl glass-card">
                <TabsTrigger value="reading" className="rounded-lg px-4 py-2">Reading ({reading.length})</TabsTrigger>
                <TabsTrigger value="want" className="rounded-lg px-4 py-2">Wishlist ({wantToRead.length})</TabsTrigger>
                <TabsTrigger value="completed" className="rounded-lg px-4 py-2">Finished ({completed.length})</TabsTrigger>
              </TabsList>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sort by:</span>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-40 bg-card/50 border-border/50 rounded-lg h-9"><SelectValue /></SelectTrigger>
                  <SelectContent className="glass-card">
                    <SelectItem value="dateAdded">Recent</SelectItem>
                    <SelectItem value="title">Alphabetical</SelectItem>
                    <SelectItem value="rating">Rating</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <TabsContent value="want" className="focus-visible:outline-none">
              <BookGrid items={wantToRead} emptyText="Your wishlist is empty. Explore and find your next read!" />
            </TabsContent>

            <TabsContent value="reading" className="focus-visible:outline-none">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {reading.map((e) => (
                  <Link key={e.bookId} to={`/book/${e.bookId}`}>
                    <Card className="flex gap-6 p-5 glass-card hover:border-primary/30 transition-all duration-300 group">
                      <div className="relative shrink-0">
                        <img src={e.normB.cover} alt={e.normB.title} className="w-20 h-28 object-cover rounded-lg shadow-md group-hover:scale-105 transition-transform duration-300" />
                        <div className="absolute -top-2 -right-2 bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg pulse">Reading</div>
                      </div>
                      <div className="flex-1 flex flex-col justify-between py-1">
                        <div className="space-y-1">
                          <h3 className="font-serif font-bold text-lg text-foreground group-hover:text-primary transition-colors line-clamp-1">{e.normB.title}</h3>
                          <p className="text-sm font-medium text-muted-foreground">{e.normB.author}</p>
                        </div>
                        <div className="space-y-3">
                          <div className="flex justify-between items-end">
                            <span className="text-[10px] font-bold text-primary uppercase tracking-widest italic">Journey in progress</span>
                            <span className="text-[10px] font-bold text-muted-foreground">Est. 50%</span>
                          </div>
                          <Progress value={50} className="h-1.5 bg-primary/10" />
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))}
                {reading.length === 0 && (
                  <div className="col-span-2 p-12 text-center bg-muted/20 border border-dashed border-muted rounded-3xl">
                    <p className="text-muted-foreground font-medium">You aren't reading anything right now. Time to start a new adventure?</p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="completed" className="focus-visible:outline-none">
              <BookGrid items={completed} emptyText="You haven't finished any books yet. Keep reading!" />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppLayout>
  );
}

function BookGrid({ items, emptyText }) {
  if (items.length === 0) return (
    <div className="p-12 text-center bg-muted/20 border border-dashed border-muted rounded-3xl">
      <p className="text-muted-foreground font-medium">{emptyText}</p>
    </div>
  );
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6 md:gap-8">
      {items.map((e) => <BookCard key={e.bookId} book={e.normB} />)}
    </div>
  );
}

function StatCard({ icon, label, value, color }) {
  return (
    <Card className={cn("p-6 flex items-center gap-5 glass-card border-none transition-all duration-300 hover:scale-105", color)}>
      <div className="p-3 rounded-2xl bg-background/50 shadow-inner">
        {icon}
      </div>
      <div>
        <p className="text-3xl font-bold font-serif text-foreground leading-none mb-1">{value}</p>
        <p className="text-xs font-bold text-muted-foreground/60 uppercase tracking-widest">{label}</p>
      </div>
    </Card>
  );
}
