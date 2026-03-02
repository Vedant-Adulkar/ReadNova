import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { StarRating } from "./StarRating";

export function BookCard({ book, showExplanation = false }) {
  const difficultyColor = {
    Beginner: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    Intermediate: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    Advanced: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  };

  return (
    <Link to={`/book/${book.id}`}>
      <Card className="group relative overflow-hidden transition-all duration-500 hover:shadow-2xl hover:-translate-y-2 bg-card/40 backdrop-blur-sm border-border/40 premium-shadow">
        <div className="aspect-[2/3] overflow-hidden relative bg-muted/30">
          <img
            src={book.cover || `https://covers.openlibrary.org/b/title/${encodeURIComponent(book.title || "book")}-M.jpg`}
            alt={book.title}
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
            loading="lazy"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = `https://covers.openlibrary.org/b/title/${encodeURIComponent(book.title || "book")}-M.jpg`;
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-4">
            <p className="text-[10px] text-white/80 font-medium uppercase tracking-wider mb-1">Preview</p>
            <h4 className="text-white text-sm font-serif font-bold line-clamp-2">{book.title}</h4>
          </div>
          <div className="absolute top-2 right-2">
            <Badge className={`text-[10px] px-2 py-0.5 backdrop-blur-md border-none ${difficultyColor[book.difficulty] || "bg-primary/80 text-white"}`}>
              {book.difficulty}
            </Badge>
          </div>
        </div>
        <div className="p-4 space-y-2">
          <div className="space-y-0.5">
            <h3 className="font-serif font-bold text-sm leading-tight line-clamp-1 group-hover:text-primary transition-colors">
              {book.title}
            </h3>
            <p className="text-[11px] font-medium text-muted-foreground/80">{book.author}</p>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <StarRating rating={book.rating} size={10} />
              <span className="text-[10px] font-bold text-foreground/70">{book.rating}</span>
            </div>
            <span className="text-[10px] text-muted-foreground">{book.reviewCount > 1000 ? (book.reviewCount / 1000).toFixed(1) + 'k' : book.reviewCount} reviews</span>
          </div>

          {showExplanation && book.aiExplanation && (
            <div className="pt-2 mt-2 border-t border-border/30">
              <p className="text-[10px] text-primary/80 leading-relaxed italic line-clamp-2">
                <span className="font-bold not-italic">AI:</span> {book.aiExplanation}
              </p>
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
}
