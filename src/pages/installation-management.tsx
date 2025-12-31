import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, List, CheckSquare, MapPin, ClipboardList, ChevronRight } from "lucide-react";

export default function InstallationManagement() {
  const { userProfile } = useAuth();
  const [, setLocation] = useLocation();

  const isAdmin = userProfile?.isAdmin;
  const isInstaller = userProfile?.role === "installer";
  const isVerifier = userProfile?.role === "verifier";
  const isManager = userProfile?.role === "manager";

  // Define installation management options
  const installationOptions = [
    {
      title: "New Installation",
      description: "Create a new device installation",
      icon: Plus,
      url: "/new-installation",
      color: "from-blue-500 to-blue-600",
      visible: isAdmin || isInstaller,
    },
    {
      title: "My Submissions",
      description: "View your submitted installations",
      icon: List,
      url: "/my-submissions",
      color: "from-green-500 to-green-600",
      visible: isAdmin || isInstaller,
    },
    {
      title: "Verification",
      description: "Verify and approve installations",
      icon: CheckSquare,
      url: "/verification",
      color: "from-purple-500 to-purple-600",
      visible: isAdmin || isVerifier || isManager,
    },
    {
      title: "Review Audit",
      description: "Audit trail of all verifications",
      icon: ClipboardList,
      url: "/review-audit",
      color: "from-orange-500 to-orange-600",
      visible: isAdmin,
    },
    {
      title: "Installations Map",
      description: "View installations on an interactive map",
      icon: MapPin,
      url: "/installations-map",
      color: "from-pink-500 to-pink-600",
      visible: isAdmin || isVerifier || userProfile?.role === "ministry",
    },
  ];

  const visibleOptions = installationOptions.filter(option => option.visible);

  if (visibleOptions.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <div className="pt-6 pb-6 text-center px-6">
            <p className="text-xl font-semibold mb-2">Access Denied</p>
            <p className="text-muted-foreground">
              You don't have permission to access installation management features.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Installation Management</h1>
        <p className="text-muted-foreground mt-2">
          Create, view, verify, and manage device installations
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {visibleOptions.map((option) => {
          const Icon = option.icon;
          return (
            <Card
              key={option.url}
              className="group hover:shadow-lg transition-all duration-200 cursor-pointer border-2 hover:border-primary/50"
              onClick={() => setLocation(option.url)}
            >
              <CardHeader>
                <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${option.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <CardTitle className="flex items-center justify-between">
                  {option.title}
                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                </CardTitle>
                <CardDescription>{option.description}</CardDescription>
              </CardHeader>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

