import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Loader2, Wrench, ClipboardCheck, Shield, BarChart3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function RoleSelection() {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selecting, setSelecting] = useState(false);
  const [selectedRole, setSelectedRole] = useState<"installer" | "verifier" | "manager" | null>(null);

  const handleRoleSelect = async (role: "installer" | "verifier" | "manager") => {
    if (!userProfile?.uid) return;

    setSelecting(true);
    setSelectedRole(role);

    try {
      await updateDoc(doc(db, "userProfiles", userProfile.uid), {
        role: role,
        updatedAt: new Date(),
      });

      toast({
        title: "Role Selected",
        description: `You are now set as ${
          role === "installer" ? "an Installer" : 
          role === "verifier" ? "a Verifier" : 
          "a Manager"
        }.`,
      });

      // Redirect based on role
      if (role === "installer") {
        setLocation("/new-installation");
      } else if (role === "verifier") {
        setLocation("/verification");
      } else {
        setLocation("/devices");
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to set role",
        description: error instanceof Error ? error.message : "An error occurred.",
      });
      setSelecting(false);
      setSelectedRole(null);
    }
  };

  // If user is already an admin, redirect to dashboard
  if (userProfile?.isAdmin) {
    setLocation("/dashboard");
    return null;
  }

  // If user already has a role, redirect appropriately
  if (userProfile?.role && !selecting) {
    if (userProfile.role === "installer") {
      setLocation("/new-installation");
    } else if (userProfile.role === "verifier") {
      setLocation("/verification");
    } else if (userProfile.role === "manager") {
      setLocation("/devices");
    } else {
      setLocation("/dashboard");
    }
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <Card className="max-w-4xl w-full border shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-lg">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <CardTitle className="text-3xl font-bold">Welcome to FlowSet!</CardTitle>
          <CardDescription className="text-base mt-2">
            Please select your role to continue. This determines your access and responsibilities in the system.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Installer Role */}
            <Card 
              className={`cursor-pointer transition-all hover:shadow-lg hover:scale-105 ${
                selectedRole === "installer" ? "ring-2 ring-blue-600 shadow-lg" : ""
              }`}
              onClick={() => !selecting && handleRoleSelect("installer")}
            >
              <CardContent className="p-8 text-center space-y-4">
                <div className="mx-auto h-20 w-20 rounded-full bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                  <Wrench className="h-10 w-10 text-blue-600 dark:text-blue-500" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold mb-2">Installer</h3>
                  <Badge variant="secondary" className="mb-3">Field Technician</Badge>
                  <p className="text-sm text-muted-foreground">
                    Record device installations in the field
                  </p>
                </div>
                
                <div className="text-left space-y-2 pt-4 border-t">
                  <p className="text-sm font-semibold">You will be able to:</p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>✓ Create new installations</li>
                    <li>✓ Validate device IDs</li>
                    <li>✓ Upload installation photos</li>
                    <li>✓ Track your submissions</li>
                    <li>✓ View verification status</li>
                  </ul>
                </div>

                <Button 
                  className="w-full mt-4"
                  disabled={selecting}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRoleSelect("installer");
                  }}
                >
                  {selecting && selectedRole === "installer" ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    "Select Installer"
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Verifier Role */}
            <Card 
              className={`cursor-pointer transition-all hover:shadow-lg hover:scale-105 ${
                selectedRole === "verifier" ? "ring-2 ring-green-600 shadow-lg" : ""
              }`}
              onClick={() => !selecting && handleRoleSelect("verifier")}
            >
              <CardContent className="p-8 text-center space-y-4">
                <div className="mx-auto h-20 w-20 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center">
                  <ClipboardCheck className="h-10 w-10 text-green-600 dark:text-green-500" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold mb-2">Verifier</h3>
                  <Badge variant="secondary" className="mb-3">Quality Assurance</Badge>
                  <p className="text-sm text-muted-foreground">
                    Review and verify installation submissions
                  </p>
                </div>
                
                <div className="text-left space-y-2 pt-4 border-t">
                  <p className="text-sm font-semibold">You will be able to:</p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>✓ Review pending installations</li>
                    <li>✓ Compare installer vs server data</li>
                    <li>✓ Approve installations</li>
                    <li>✓ Flag issues with reasons</li>
                    <li>✓ Monitor data quality</li>
                  </ul>
                </div>

                <Button 
                  className="w-full mt-4 bg-green-600 hover:bg-green-700"
                  disabled={selecting}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRoleSelect("verifier");
                  }}
                >
                  {selecting && selectedRole === "verifier" ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    "Select Verifier"
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Manager Role */}
            <Card 
              className={`cursor-pointer transition-all hover:shadow-lg hover:scale-105 ${
                selectedRole === "manager" ? "ring-2 ring-purple-600 shadow-lg" : ""
              }`}
              onClick={() => !selecting && handleRoleSelect("manager")}
            >
              <CardContent className="p-8 text-center space-y-4">
                <div className="mx-auto h-20 w-20 rounded-full bg-purple-100 dark:bg-purple-950 flex items-center justify-center">
                  <BarChart3 className="h-10 w-10 text-purple-600 dark:text-purple-500" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold mb-2">Manager</h3>
                  <Badge variant="secondary" className="mb-3">Management & Reporting</Badge>
                  <p className="text-sm text-muted-foreground">
                    Monitor performance and analyze data
                  </p>
                </div>
                
                <div className="text-left space-y-2 pt-4 border-t">
                  <p className="text-sm font-semibold">You will be able to:</p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>✓ View high-level KPI dashboards</li>
                    <li>✓ Access master device data</li>
                    <li>✓ Filter by date, region, team</li>
                    <li>✓ View performance charts</li>
                    <li>✓ Monitor team metrics</li>
                  </ul>
                </div>

                <Button 
                  className="w-full mt-4 bg-purple-600 hover:bg-purple-700"
                  disabled={selecting}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRoleSelect("manager");
                  }}
                >
                  {selecting && selectedRole === "manager" ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    "Select Manager"
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

