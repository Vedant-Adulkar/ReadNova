import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Target, Flame, Trophy, BookOpen, Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { get, post } from "@/lib/apiClient";
import { useToast } from "@/hooks/use-toast";

const milestones = [
  { label: "First Book Completed", min: 1 },
  { label: "5 Books Read", min: 5 },
  { label: "10 Books Read", min: 10 },
  { label: "Read 3 Genres", min: 3 },
  { label: "25 Books Read", min: 25 },
  { label: "50 Books Read", min: 50 },
];

export default function Goals() {
  const [progress, setProgress] = useState(null);
  const [yearlyGoal, setYearlyGoal] = useState(24);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    get("/reading-goal/progress")
      .then((data) => {
        setProgress(data.progress);
        if (data.progress.goal > 0) setYearlyGoal(data.progress.goal);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSaveGoal = async () => {
    setSaving(true);
    try {
      await post("/reading-goal", { yearly: yearlyGoal });
      const data = await get("/reading-goal/progress");
      setProgress(data.progress);
      toast({ title: "Goal updated!", description: `Your goal is now ${yearlyGoal} books.` });
    } catch (err) {
      toast({ title: "Failed to save goal", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <AppLayout><div className="flex justify-center p-16"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div></AppLayout>;

  const booksRead = progress?.completed ?? 0;
  const goal = progress?.goal ?? yearlyGoal;
  const pct = progress?.percentage ?? 0;

  const achievedMilestones = new Set(
    milestones.filter((m) => m.min <= booksRead).map((m) => m.label)
  );

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-5xl space-y-6">
        <h1 className="text-2xl font-bold font-serif text-foreground">Reading Goals</h1>

        {/* Goal Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-card border-border p-5">
            <div className="flex items-center gap-3 mb-3">
              <Target className="h-6 w-6 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Yearly Goal ({progress?.year})</p>
                <p className="text-2xl font-bold font-serif text-foreground">{booksRead}/{goal}</p>
              </div>
            </div>
            <Progress value={pct} className="h-3 mb-2" />
            <p className="text-xs text-muted-foreground">{pct}% complete</p>
          </Card>

          <Card className="bg-card border-border p-5">
            <div className="flex items-center gap-3 mb-3">
              <BookOpen className="h-6 w-6 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Books This Year</p>
                <p className="text-2xl font-bold font-serif text-foreground">{booksRead}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{Math.max(0, goal - booksRead)} more to reach your goal</p>
          </Card>

          <Card className="bg-card border-border p-5">
            <div className="flex items-center gap-3">
              <Flame className="h-6 w-6 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Milestones Hit</p>
                <p className="text-2xl font-bold font-serif text-foreground">{achievedMilestones.size}/{milestones.length}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">🔥 Keep reading!</p>
          </Card>
        </div>

        {/* Milestones */}
        <Card className="bg-card border-border p-5">
          <h3 className="font-serif font-semibold mb-4 flex items-center gap-2 text-foreground">
            <Trophy className="h-5 w-5 text-primary" /> Milestones
          </h3>
          <div className="space-y-3">
            {milestones.map((m) => (
              <div key={m.label} className="flex items-center gap-3">
                <span className={achievedMilestones.has(m.label) ? "text-primary" : "text-muted-foreground/30"}>
                  {achievedMilestones.has(m.label) ? "✅" : "⬜"}
                </span>
                <span className={`text-sm ${achievedMilestones.has(m.label) ? "text-foreground" : "text-muted-foreground"}`}>{m.label}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Update Goal */}
        <Card className="bg-card border-border p-5">
          <h3 className="font-serif font-semibold mb-4 text-foreground">Update Yearly Goal</h3>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">Books per year</label>
              <Input type="number" min={1} value={yearlyGoal} onChange={(e) => setYearlyGoal(+e.target.value)} className="w-32" />
            </div>
            <Button onClick={handleSaveGoal} disabled={saving}>
              {saving ? "Saving…" : "Save Goal"}
            </Button>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
