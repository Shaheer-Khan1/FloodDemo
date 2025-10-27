import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Smartphone, Ruler, Users, Shield } from "lucide-react";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function Dashboard() {
  const { userProfile } = useAuth();
  const [, setLocation] = useLocation();
  const [teamsCount, setTeamsCount] = useState(0);

  // Fetch teams count in real-time
  useEffect(() => {
    if (!userProfile?.uid) return;

    const teamsQuery = query(
      collection(db, "teamMembers"),
      where("userId", "==", userProfile.uid)
    );

    const unsubscribe = onSnapshot(teamsQuery, (snapshot) => {
      setTeamsCount(snapshot.size);
    });

    return () => unsubscribe();
  }, [userProfile?.uid]);

  if (!userProfile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold">Profile Not Found</h2>
          <p className="text-muted-foreground">Please complete your profile setup.</p>
          <Button onClick={() => setLocation("/profile-setup")} data-testid="button-setup-profile">
            Setup Profile
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
            Welcome back, {userProfile.displayName.split(' ')[0]}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <p className="text-muted-foreground">
              {userProfile.isAdmin 
                ? "Admin Dashboard - Full system access" 
                : userProfile.role === "installer"
                ? "Installer Dashboard - Record installations"
                : userProfile.role === "verifier"
                ? "Verifier Dashboard - Review submissions"
                : "FlowSet IoT Installation Management"}
            </p>
            {userProfile.role && !userProfile.isAdmin && (
              <Badge variant="secondary" className="capitalize">
                {userProfile.role}
              </Badge>
            )}
            {userProfile.isAdmin && (
              <Badge variant="default" className="bg-blue-600">
                Administrator
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium mb-1">System Status</p>
                <p className="text-3xl font-bold text-green-600 dark:text-green-500">Active</p>
                <p className="text-xs text-muted-foreground mt-1">All systems operational</p>
              </div>
              <div className="h-14 w-14 rounded-xl bg-green-100 dark:bg-green-950 flex items-center justify-center">
                <Shield className="h-7 w-7 text-green-600 dark:text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium mb-1">My Teams</p>
                <p className="text-3xl font-bold">{teamsCount}</p>
                <p className="text-xs text-muted-foreground mt-1">Active team memberships</p>
              </div>
              <div className="h-14 w-14 rounded-xl bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                <Users className="h-7 w-7 text-blue-600 dark:text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* User Profile Card */}
      <Card className="border shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap space-y-0 pb-4">
          <CardTitle className="text-2xl font-bold">My Profile</CardTitle>
          <Button 
            size="sm"
            onClick={() => setLocation("/profile")}
            data-testid="button-edit-profile"
          >
            Edit Profile
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-6">
            <Avatar className="h-24 w-24">
              <AvatarImage src={userProfile.photoURL} />
              <AvatarFallback className="text-2xl">
                {userProfile.displayName.split(' ').map(n => n[0]).join('').toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="text-base font-medium" data-testid="text-user-name">{userProfile.displayName}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="text-base font-medium" data-testid="text-user-email">{userProfile.email}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  Location
                </p>
                <p className="text-base font-medium" data-testid="text-user-location">{userProfile.location}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Smartphone className="h-3 w-3" />
                  Device ID
                </p>
                <p className="text-base font-medium font-mono text-xs" data-testid="text-user-device">{userProfile.deviceId}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Ruler className="h-3 w-3" />
                  Height
                </p>
                <p className="text-base font-medium" data-testid="text-user-height">
                  {userProfile.height} {userProfile.heightUnit}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Admin Actions */}
          {userProfile.isAdmin && (
            <>
              <Button 
                variant="outline" 
                className="h-auto py-6 justify-start hover:bg-accent transition-all group"
                onClick={() => setLocation("/devices")}
              >
                <div className="h-12 w-12 rounded-xl bg-blue-100 dark:bg-blue-950 flex items-center justify-center mr-4">
                  <Shield className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-lg">Master Device List</div>
                  <div className="text-sm text-muted-foreground">View and manage all devices</div>
                </div>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-6 justify-start hover:bg-accent transition-all group"
                onClick={() => setLocation("/verification")}
              >
                <div className="h-12 w-12 rounded-xl bg-green-100 dark:bg-green-950 flex items-center justify-center mr-4">
                  <Shield className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-lg">Verification Queue</div>
                  <div className="text-sm text-muted-foreground">Review pending installations</div>
                </div>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-6 justify-start hover:bg-accent transition-all group"
                onClick={() => setLocation("/device-import")}
              >
                <div className="h-12 w-12 rounded-xl bg-purple-100 dark:bg-purple-950 flex items-center justify-center mr-4">
                  <Shield className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-lg">Import Devices</div>
                  <div className="text-sm text-muted-foreground">Bulk import from CSV</div>
                </div>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-6 justify-start hover:bg-accent transition-all group"
                onClick={() => setLocation("/admin")}
                data-testid="button-admin-dashboard"
              >
                <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mr-4">
                  <Shield className="h-6 w-6 text-slate-600 dark:text-slate-400" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-lg">Admin Dashboard</div>
                  <div className="text-sm text-muted-foreground">Manage users and teams</div>
                </div>
              </Button>
            </>
          )}

          {/* Installer Actions */}
          {userProfile.role === "installer" && !userProfile.isAdmin && (
            <>
              <Button 
                variant="outline" 
                className="h-auto py-6 justify-start hover:bg-accent transition-all group"
                onClick={() => setLocation("/new-installation")}
              >
                <div className="h-12 w-12 rounded-xl bg-blue-100 dark:bg-blue-950 flex items-center justify-center mr-4">
                  <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-lg">New Installation</div>
                  <div className="text-sm text-muted-foreground">Record a device installation</div>
                </div>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-6 justify-start hover:bg-accent transition-all group"
                onClick={() => setLocation("/my-submissions")}
              >
                <div className="h-12 w-12 rounded-xl bg-green-100 dark:bg-green-950 flex items-center justify-center mr-4">
                  <Users className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-lg">My Submissions</div>
                  <div className="text-sm text-muted-foreground">Track your installations</div>
                </div>
              </Button>
            </>
          )}

          {/* Verifier Actions */}
          {userProfile.role === "verifier" && !userProfile.isAdmin && (
            <>
              <Button 
                variant="outline" 
                className="h-auto py-6 justify-start hover:bg-accent transition-all group"
                onClick={() => setLocation("/verification")}
              >
                <div className="h-12 w-12 rounded-xl bg-green-100 dark:bg-green-950 flex items-center justify-center mr-4">
                  <Shield className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-lg">Verification Queue</div>
                  <div className="text-sm text-muted-foreground">Review pending installations</div>
                </div>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-6 justify-start hover:bg-accent transition-all group"
                onClick={() => setLocation("/devices")}
              >
                <div className="h-12 w-12 rounded-xl bg-blue-100 dark:bg-blue-950 flex items-center justify-center mr-4">
                  <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-lg">Device List</div>
                  <div className="text-sm text-muted-foreground">View all devices</div>
                </div>
              </Button>
            </>
          )}

          {/* Common Actions */}
          <Button 
            variant="outline" 
            className="h-auto py-6 justify-start hover:bg-accent transition-all group"
            onClick={() => setLocation("/teams")}
            data-testid="button-manage-teams"
          >
            <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mr-4">
              <Users className="h-6 w-6 text-slate-600 dark:text-slate-400" />
            </div>
            <div className="text-left">
              <div className="font-semibold text-lg">Teams</div>
              <div className="text-sm text-muted-foreground">Manage your teams</div>
            </div>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
