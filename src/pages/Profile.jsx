import { useRef, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookCard } from "@/components/BookCard";
import { useAuth } from "@/contexts/AuthContext";
import { useBookshelf } from "@/contexts/BookshelfContext";
import { User, BookOpen, Library, Target, Settings, Loader2, Camera } from "lucide-react";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export default function Profile() {
  const { user, token, updateProfilePicture } = useAuth();
  const { entries, loadingShelf } = useBookshelf();
  const { toast } = useToast();
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const completed = entries.filter((e) => e.status === "completed");
  const reading   = entries.filter((e) => e.status === "reading");

  const genresExplored = [...new Set(completed.flatMap((e) => {
    const b = e.book;
    return Array.isArray(b?.genres) ? b.genres : [];
  }))];

  const publicShelf = completed.slice(0, 4).map((e) => e.book).filter(Boolean);

  const normBook = (b) => b && ({
    id: b._id, _id: b._id, title: b.title, author: b.author,
    cover: b.coverImage || `https://covers.openlibrary.org/b/title/${encodeURIComponent(b.title ?? "")}-M.jpg`,
    rating: b.averageRating ?? 0, reviewCount: b.ratingsCount ?? 0,
    genre: b.genres ?? [], difficulty: b.difficultyLevel, description: b.description,
  });

  // ── Profile picture upload ─────────────────────────────────────────────────
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum size is 2 MB.", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append("avatar", file);

      const res = await fetch(`${API_BASE}/upload/profile`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "Upload failed");

      // Optimistic update — no full refetch needed
      updateProfilePicture(data.profilePicture);
      toast({ title: "Avatar updated!" });
    } catch (err) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

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
          {/* Avatar with upload trigger */}
          <div className="relative group">
            <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden ring-2 ring-primary/30">
              {user.profilePicture ? (
                <img src={user.profilePicture} alt={user.name} className="h-full w-full object-cover" />
              ) : (
                <User className="h-8 w-8 text-primary" />
              )}
            </div>
            {/* Camera overlay */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label="Change profile picture"
              className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:cursor-not-allowed"
            >
              {uploading
                ? <Loader2 className="h-5 w-5 text-white animate-spin" />
                : <Camera className="h-5 w-5 text-white" />}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>

          <div className="flex-1">
            <h1 className="text-2xl font-bold font-serif text-foreground">{user.name}</h1>
            <p className="text-sm text-muted-foreground">{user.email} · {user.role}</p>
            {uploading && (
              <p className="text-xs text-primary mt-1 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Uploading picture…
              </p>
            )}
          </div>
          <LogoutButton />
        </div>

        {/* Stats */}
        {loadingShelf
          ? <div className="flex justify-center py-8"><Loader2 className="animate-spin h-6 w-6 text-primary" /></div>
          : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Books Read"        value={completed.length.toString()} icon={<BookOpen className="h-5 w-5 text-primary" />} />
              <StatCard label="Currently Reading" value={reading.length.toString()}   icon={<Library  className="h-5 w-5 text-primary" />} />
              <StatCard label="Genres Explored"   value={genresExplored.length.toString()} icon={<Target className="h-5 w-5 text-primary" />} />
              <StatCard label="All Shelved"       value={entries.length.toString()}    icon={<Settings className="h-5 w-5 text-primary" />} />
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

        {/* Completed Books */}
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

function LogoutButton() {
  const { logout } = useAuth();
  return <Button variant="outline" size="sm" onClick={logout}>Log Out</Button>;
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
