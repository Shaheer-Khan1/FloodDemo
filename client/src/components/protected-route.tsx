import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { Loader2 } from "lucide-react";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, userProfile, loading } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        // Not authenticated - redirect to login
        setLocation("/login");
      } else if (!userProfile && location !== "/profile-setup") {
        // Authenticated but no profile and not already on setup page - redirect to setup
        setLocation("/profile-setup");
      } else if (userProfile && location === "/profile-setup") {
        // Has profile but on setup page - redirect to dashboard
        setLocation("/dashboard");
      }
    }
  }, [user, userProfile, loading, location, setLocation]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !userProfile) {
    return null;
  }

  return <>{children}</>;
}
