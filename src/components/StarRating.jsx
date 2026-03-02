import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function StarRating({ rating, maxRating = 5, size = 16, interactive = false, onChange }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: maxRating }, (_, i) => {
        const filled = i < Math.floor(rating);
        const half = !filled && i < rating;
        return (
          <Star
            key={i}
            size={size}
            className={cn(
              "transition-colors",
              filled ? "fill-primary text-primary" : half ? "fill-primary/50 text-primary" : "text-muted-foreground/30",
              interactive && "cursor-pointer hover:text-primary hover:fill-primary/70"
            )}
            onClick={() => interactive && onChange?.(i + 1)}
          />
        );
      })}
    </div>
  );
}
