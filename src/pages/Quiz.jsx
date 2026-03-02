import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { put } from "@/lib/apiClient";

// All genre / pace / difficulty / mood options
const steps = [
  {
    title: "What genres do you enjoy?",
    subtitle: "Pick at least 3",
    type: "multi",
    options: ["Fiction", "Sci-Fi", "Fantasy", "Mystery", "Thriller", "Romance", "Non-Fiction", "Self-Help", "Biography", "History", "Philosophy", "Horror"],
    min: 3,
  },
  {
    title: "How fast do you read?",
    subtitle: "This helps us recommend the right book length",
    type: "single",
    options: ["A few pages a day", "A chapter a day", "Multiple chapters a day", "I binge-read everything"],
  },
  {
    title: "What difficulty do you prefer?",
    subtitle: "We'll match books to your comfort level",
    type: "single",
    options: ["Beginner — Easy, light reads", "Intermediate — Moderate complexity", "Advanced — Dense, challenging works", "Mix it up!"],
  },
  {
    title: "What mood are you in?",
    subtitle: "We'll start with books that match",
    type: "multi",
    options: ["Happy & Uplifting", "Deep & Thoughtful", "Adventurous & Exciting", "Calm & Relaxing", "Dark & Intense"],
    min: 1,
  },
];

/**
 * buildEmbedding — convert quiz answers into a simple numeric vector.
 * In a real system this would call an embedding model; here we use a
 * deterministic hash so the backend receives a valid vector immediately.
 *
 * Dimension: 12 (one per genre option) + normalised pace (1) + difficulty (1) + mood count (1) = 15
 */
const GENRES = ["Fiction", "Sci-Fi", "Fantasy", "Mystery", "Thriller", "Romance", "Non-Fiction", "Self-Help", "Biography", "History", "Philosophy", "Horror"];
const buildEmbedding = (answers) => {
  const [genres, [pace], [difficulty], moods] = answers;
  const genreVec = GENRES.map((g) => (genres.includes(g) ? 1 : 0));
  const paceScore = ["A few pages a day", "A chapter a day", "Multiple chapters a day", "I binge-read everything"].indexOf(pace) / 3;
  const diffScore = ["Beginner — Easy, light reads", "Intermediate — Moderate complexity", "Advanced — Dense, challenging works", "Mix it up!"].indexOf(difficulty) / 3;
  const moodScore = moods.length / 5;
  return [...genreVec, paceScore, diffScore, moodScore];
};

const buildPersonalityProfile = (answers) => {
  const [genres, [pace], [difficulty], moods] = answers;
  return `Genres: ${genres.join(", ")}. Pace: ${pace}. Difficulty: ${difficulty}. Moods: ${moods.join(", ")}.`;
};

export default function Quiz() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(steps.map(() => []));
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { updateUser } = useAuth();

  const current = steps[step];
  const progress = ((step + 1) / steps.length) * 100;

  const toggleOption = (opt) => {
    setAnswers((prev) => {
      const copy = [...prev];
      if (current.type === "single") { copy[step] = [opt]; }
      else { copy[step] = copy[step].includes(opt) ? copy[step].filter((o) => o !== opt) : [...copy[step], opt]; }
      return copy;
    });
  };

  const canNext = current.type === "single" ? answers[step].length === 1 : answers[step].length >= (current.min || 1);

  const handleNext = async () => {
    if (step < steps.length - 1) { setStep(step + 1); return; }

    setSaving(true);
    try {
      const embedding = buildEmbedding(answers);
      const personalityProfile = buildPersonalityProfile(answers);
      const data = await put("/auth/preferences", { embedding, personalityProfile });
      updateUser(data.user);
      toast({ title: "Preferences saved!", description: "Curating your personalized library..." });
      navigate("/dashboard");
    } catch (err) {
      toast({ title: "Submission failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 md:p-8 overflow-hidden relative">
      {/* Background Decorative Blobs */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-accent/5 rounded-full blur-3xl -translate-x-1/2 translate-y-1/2" />

      <Card className="w-full max-w-xl glass-card border-none overflow-hidden relative z-10 animate-in fade-in zoom-in duration-700">
        <CardHeader className="space-y-6 pb-8">
          <div className="space-y-3">
            <div className="flex justify-between items-end">
              <span className="text-[10px] font-bold text-primary uppercase tracking-[0.2em]">Step {step + 1} of {steps.length}</span>
              <span className="text-[10px] font-bold text-muted-foreground">{Math.round(progress)}% Journey</span>
            </div>
            <Progress value={progress} className="h-1.5 bg-primary/10" />
          </div>
          <div className="space-y-1.5">
            <CardTitle className="font-serif text-3xl md:text-4xl font-bold text-foreground leading-tight">
              {current.title}
            </CardTitle>
            <p className="text-muted-foreground font-medium text-sm">{current.subtitle}</p>
          </div>
        </CardHeader>

        <CardContent className="space-y-8 pb-10">
          <div className="flex flex-wrap gap-2.5">
            {current.options.map((opt) => {
              const selected = answers[step].includes(opt);
              return (
                <button
                  key={opt}
                  onClick={() => toggleOption(opt)}
                  className={`px-5 py-2.5 rounded-2xl text-sm font-semibold transition-all duration-300 border ${selected
                      ? "bg-primary text-white border-primary shadow-lg shadow-primary/20 scale-105"
                      : "bg-background/50 text-muted-foreground border-border/50 hover:border-primary/40 hover:bg-primary/5 active:scale-95"
                    }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>

          <div className="flex gap-4 pt-4">
            {step > 0 && (
              <Button variant="outline" onClick={() => setStep(step - 1)} className="rounded-2xl border-border px-8 h-12 hover:bg-muted transition-all">
                Back
              </Button>
            )}
            <Button
              onClick={handleNext}
              disabled={!canNext || saving}
              className="flex-1 rounded-2xl h-12 text-sm font-bold shadow-xl shadow-primary/20 transition-all hover:scale-[1.02] active:scale-95"
            >
              {saving ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving Profile...
                </div>
              ) : step === steps.length - 1 ? (
                "Show My Recommendations"
              ) : (
                "Continue"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
