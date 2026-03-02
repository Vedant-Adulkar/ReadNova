import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Search, Sun, Moon, User, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/contexts/ThemeContext";
import { useState } from "react";

export function Navbar({ onMenuToggle }) {
  const { theme, toggleTheme } = useTheme();
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const handleSearch = (e) => {
    e.preventDefault();
    if (search.trim()) {
      navigate(`/search?q=${encodeURIComponent(search.trim())}`);
      setSearch("");
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/60 backdrop-blur-xl transition-all duration-300">
      <div className="flex h-14 items-center gap-4 px-4 md:px-6">
        <Button variant="ghost" size="icon" onClick={onMenuToggle} className="lg:hidden hover:bg-primary/5">
          <Menu className="h-5 w-5 text-primary" />
        </Button>

        <Link to="/" className="flex items-center gap-2 font-serif font-bold text-xl tracking-tight text-foreground group">
          <div className="p-1.5 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
            <BookOpen className="h-5 w-5 text-primary" />
          </div>
          <span className="hidden sm:inline bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">BookWise</span>
        </Link>

        <form onSubmit={handleSearch} className="flex-1 max-w-md mx-6">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find me a book..."
              className="pl-9 h-9 bg-muted/30 border-transparent focus:border-primary/30 focus:bg-background transition-all rounded-full"
            />
          </div>
        </form>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={toggleTheme} className="rounded-full hover:bg-primary/5">
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" asChild className="rounded-full hover:bg-primary/5">
            <Link to="/profile">
              <User className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
