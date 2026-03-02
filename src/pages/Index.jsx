import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Sparkles, Heart, Target, Users, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BookCard } from "@/components/BookCard";
import { motion } from "framer-motion";
import { get } from "@/lib/apiClient";

const features = [
  { icon: Sparkles, title: "AI Recommendations", description: "Get personalized book suggestions powered by AI that understands your taste." },
  { icon: Heart, title: "Mood-Based Discovery", description: "Find books that match your current mood—happy, thoughtful, adventurous, or relaxing." },
  { icon: Target, title: "Reading Goals", description: "Set and track your reading goals with visual progress dashboards and streaks." },
  { icon: Users, title: "Community Reviews", description: "Read AI-summarized community sentiments and share your own reviews." },
];

const Index = () => {
  const [trendingBooks, setTrendingBooks] = useState([]);

  useEffect(() => {
    get("/books", { limit: 4 })
      .then((d) => setTrendingBooks(
        (d.books || []).map((b) => ({
          id: b._id,
          _id: b._id,
          title: b.title,
          author: b.author,
          cover: b.coverImage || `https://covers.openlibrary.org/b/title/${encodeURIComponent(b.title)}-M.jpg`,
          rating: b.averageRating ?? 0,
          reviewCount: b.ratingsCount ?? 0,
          genre: b.genres ?? [],
          difficulty: b.difficultyLevel,
        }))
      ))
      .catch(() => { }); // landing page — fail silently
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative overflow-hidden px-4 py-20 md:py-32">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        <div className="relative mx-auto max-w-4xl text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="mb-6 flex justify-center">
              <BookOpen className="h-16 w-16 text-primary" />
            </div>
            <h1 className="mb-4 text-4xl font-bold font-serif md:text-6xl text-foreground">
              Your Next Favorite Book,{" "}
              <span className="text-primary">Found by AI</span>
            </h1>
            <p className="mb-8 text-lg text-muted-foreground max-w-2xl mx-auto">
              Discover books tailored to your mood, reading level, and personality.
              BookWise combines AI intelligence with community wisdom to find your perfect read.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button size="lg" asChild className="text-base">
                <Link to="/signup">Get Started Free</Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="text-base">
                <Link to="/dashboard">
                  Explore Books <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="px-4 py-16 bg-card/50">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-3xl font-bold font-serif text-center mb-12 text-foreground">
            Why Readers Love BookWise
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f, i) => (
              <motion.div key={f.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
                <Card className="p-6 text-center h-full bg-card border-border hover:shadow-md transition-shadow">
                  <f.icon className="h-10 w-10 text-primary mx-auto mb-4" />
                  <h3 className="font-serif font-semibold mb-2 text-foreground">{f.title}</h3>
                  <p className="text-sm text-muted-foreground">{f.description}</p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Trending */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold font-serif text-foreground">Trending Now</h2>
            <Button variant="ghost" asChild>
              <Link to="/dashboard">View All <ArrowRight className="ml-1 h-4 w-4" /></Link>
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {trendingBooks.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-4 py-12 bg-card/50">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2 font-serif font-bold text-lg">
              <BookOpen className="h-6 w-6 text-primary" /> BookWise
            </div>
            <div className="flex gap-6 text-sm text-muted-foreground">
              <Link to="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
              <Link to="/bookshelf" className="hover:text-foreground transition-colors">Bookshelf</Link>
              <Link to="/goals" className="hover:text-foreground transition-colors">Goals</Link>
              <Link to="/search" className="hover:text-foreground transition-colors">Search</Link>
            </div>
            <p className="text-xs text-muted-foreground">© 2025 BookWise. Built with ❤️</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
