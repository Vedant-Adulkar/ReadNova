import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

/**
 * PublicRoute
 * Redirects to /dashboard if the user is ALREADY authenticated.
 * Used for Login/Signup/Landing pages.
 */
export function PublicRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-center">
        <div className="relative mb-4 h-16 w-16">
          <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
          <Loader2 className="relative h-16 w-16 animate-spin text-primary" />
        </div>
        <p className="animate-pulse font-serif text-lg font-medium text-muted-foreground">
          Preparing your desk...
        </p>
      </div>
    );
  }

  if (user) {
    // Already logged in? Go straight to the dashboard
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
