import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Box, PackageOpen, PackageCheck, ChevronRight } from "lucide-react";

export default function BoxManagement() {
  const { userProfile } = useAuth();
  const [, setLocation] = useLocation();

  const isAdmin = userProfile?.isAdmin;
  const isManager = userProfile?.role === "manager";
  const isVerifier = userProfile?.role === "verifier";

  // Define box management options
  const boxOptions = [
    {
      title: "Assign Box",
      description: "Assign boxes to teams and installers",
      icon: Box,
      url: "/assign-box",
      color: "from-blue-500 to-blue-600",
      visible: isAdmin || isManager,
    },
    {
      title: "Open Boxes",
      description: "Mark boxes as opened and ready for installation",
      icon: PackageOpen,
      url: "/open-boxes",
      color: "from-green-500 to-green-600",
      visible: isAdmin || isVerifier,
    },
    {
      title: "Box Status",
      description: "View status of all boxes and devices",
      icon: PackageCheck,
      url: "/box-status",
      color: "from-purple-500 to-purple-600",
      visible: isAdmin,
    },
  ];

  const visibleOptions = boxOptions.filter(option => option.visible);

  if (!isAdmin && !isManager && !isVerifier) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-xl font-semibold mb-2">Access Denied</p>
            <p className="text-muted-foreground">
              You don't have permission to access box management features.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Box Management</h1>
        <p className="text-muted-foreground mt-2">
          Manage device boxes, assignments, and status
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

