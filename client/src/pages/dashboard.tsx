import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Smartphone, Ruler, Users, Shield } from "lucide-react";
import { useLocation } from "wouter";

export default function Dashboard() {
  const { userProfile } = useAuth();
  const [, setLocation] = useLocation();

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
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back, {userProfile.displayName}</p>
        </div>
        {userProfile.isAdmin && (
          <Badge variant="secondary" className="gap-1">
            <Shield className="h-3 w-3" />
            Admin
          </Badge>
        )}
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <p className="text-2xl font-bold text-green-600">Active</p>
              </div>
              <div className="h-8 w-8 rounded-md bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                <Shield className="h-4 w-4 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">My Teams</p>
                <p className="text-2xl font-bold">0</p>
              </div>
              <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
                <Users className="h-4 w-4 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Device</p>
                <p className="text-2xl font-bold">Online</p>
              </div>
              <div className="h-8 w-8 rounded-md bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                <Smartphone className="h-4 w-4 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Alerts</p>
                <p className="text-2xl font-bold">0</p>
              </div>
              <div className="h-8 w-8 rounded-md bg-yellow-100 dark:bg-yellow-900/20 flex items-center justify-center">
                <Shield className="h-4 w-4 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* User Profile Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap space-y-0 pb-2">
          <CardTitle className="text-xl font-semibold">My Profile</CardTitle>
          <Button 
            variant="outline" 
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
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Button 
            variant="outline" 
            className="h-auto py-4 justify-start"
            onClick={() => setLocation("/teams")}
            data-testid="button-manage-teams"
          >
            <Users className="mr-2 h-5 w-5" />
            <div className="text-left">
              <div className="font-semibold">Manage Teams</div>
              <div className="text-sm text-muted-foreground">Create and manage your teams</div>
            </div>
          </Button>
          {userProfile.isAdmin && (
            <Button 
              variant="outline" 
              className="h-auto py-4 justify-start"
              onClick={() => setLocation("/admin")}
              data-testid="button-admin-dashboard"
            >
              <Shield className="mr-2 h-5 w-5" />
              <div className="text-left">
                <div className="font-semibold">Admin Dashboard</div>
                <div className="text-sm text-muted-foreground">View all users and teams</div>
              </div>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
