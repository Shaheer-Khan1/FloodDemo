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
          <p className="text-muted-foreground mt-2">Here's what's happening with your flood monitoring system</p>
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
              <div className="font-semibold text-lg">Manage Teams</div>
              <div className="text-sm text-muted-foreground">Create and manage your teams</div>
            </div>
          </Button>
          {userProfile.isAdmin && (
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
                <div className="text-sm text-muted-foreground">View all users and teams</div>
              </div>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
