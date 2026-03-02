import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

/**
 * ProtectedRoute
 * Redirects to /login if the user is not authenticated.
 * Shows a premium loading indicator while checking auth state.
 */
export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-center">
        <div className="relative mb-4 h-16 w-16">
          <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
          <Loader2 className="relative h-16 w-16 animate-spin text-primary" />
        </div>
        <p className="animate-pulse font-serif text-lg font-medium text-muted-foreground">
          Checking your library...
        </p>
      </div>
    );
  }

  if (!user) {
    // Redirect to login but save the current location to return after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
