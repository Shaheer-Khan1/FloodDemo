import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, UserPlus, Users, ChevronRight } from "lucide-react";

export default function AdminManagement() {
  const { userProfile } = useAuth();
  const [, setLocation] = useLocation();

  const isAdmin = userProfile?.isAdmin;

  // Define admin management options
  const adminOptions = [
    {
      title: "Admin Panel",
      description: "Advanced system administration and configuration",
      icon: Shield,
      url: "/admin",
      color: "from-amber-500 to-amber-600",
    },
    {
      title: "Teams",
      description: "Manage teams and team members",
      icon: Users,
      url: "/teams",
      color: "from-green-500 to-green-600",
    },
    {
      title: "Create User",
      description: "Create new users and assign roles",
      icon: UserPlus,
      url: "/create-user",
      color: "from-blue-500 to-blue-600",
    },
  ];

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <div className="pt-6 pb-6 text-center px-6">
            <p className="text-xl font-semibold mb-2">Access Denied</p>
            <p className="text-muted-foreground">
              Only administrators can access this section.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Administration</h1>
        <p className="text-muted-foreground mt-2">
          System administration and user management
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {adminOptions.map((option) => {
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

