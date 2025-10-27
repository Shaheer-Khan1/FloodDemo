import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
//import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Loader2 } from "lucide-react";

export default function ProfileSetup() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Check if profile already exists (from admin registration)
  useEffect(() => {
    const checkProfile = async () => {
      if (!user) {
        setLocation("/login");
        return;
      }

      if (userProfile) {
        // User already has a profile, redirect to appropriate page
        if (userProfile.role === "installer") {
          setLocation("/new-installation");
        } else {
          setLocation("/dashboard");
        }
        return;
      }

      // Try to get profile from userProfiles collection
      try {
        const profileDocRef = doc(db, "userProfiles", user.uid);
        const profileSnapshot = await getDoc(profileDocRef);
        
        if (profileSnapshot.exists()) {
          const data = profileSnapshot.data();
          setFormData({
            displayName: data.displayName || "",
            location: data.location || "",
          });
        }
      } catch (error: any) {
        console.error("Error fetching profile:", error);
        // If permission error, profile doesn't exist yet - this is okay during signup
        if (error.code !== 'permission-denied') {
          console.error("Error details:", error);
        }
      }
    };

    checkProfile();
  }, [user, userProfile, authLoading, setLocation]);
  
  const [formData, setFormData] = useState({
    displayName: "",
    location: "",
  });

  const handleLocationDetect = () => {
    setLoading(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude } = position.coords;
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
            );
            const data = await response.json();
            const location = data.display_name || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
            setFormData(prev => ({ ...prev, location }));
            toast({
              title: "Location detected",
              description: location,
            });
          } catch (error) {
            toast({
              variant: "destructive",
              title: "Failed to get location name",
              description: "Using coordinates instead",
            });
          } finally {
            setLoading(false);
          }
        },
        (error) => {
          toast({
            variant: "destructive",
            title: "Location access denied",
            description: "Please enter your location manually.",
          });
          setLoading(false);
        }
      );
    } else {
      toast({
        variant: "destructive",
        title: "Geolocation not supported",
        description: "Please enter your location manually.",
      });
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const profileData = {
        uid: user.uid,
        email: user.email,
        displayName: formData.displayName,
        location: formData.location,
        updatedAt: serverTimestamp(),
      };

      // Update profile in both userProfiles and users collections
      const userProfilesRef = doc(db, "userProfiles", user.uid);
      await setDoc(userProfilesRef, profileData, { merge: true });

      const usersRef = doc(db, "users", user.uid);
      await setDoc(usersRef, profileData, { merge: true });

      toast({
        title: "Profile saved!",
        description: "Your profile has been updated.",
      });
      
      // Redirect based on role
      const profileSnapshot = await getDoc(userProfilesRef);
      const userProfileData = profileSnapshot.data();
      
      if (userProfileData?.role === "installer") {
        setLocation("/new-installation");
      } else {
        setLocation("/dashboard");
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to save profile",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = () => {
    return (
      formData.displayName.trim() &&
      formData.location.trim()
    );
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Don't render if no user
  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle className="text-2xl">Complete Your Profile</CardTitle>
          <CardDescription>
            Complete your profile setup
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                data-testid="input-name"
                placeholder="John Doe"
                value={formData.displayName}
                onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="location"
                    data-testid="input-location"
                    placeholder="Enter your location"
                    className="pl-10"
                    value={formData.location}
                    onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                    required
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleLocationDetect}
                  disabled={loading}
                  data-testid="button-detect-location"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Detect"}
                </Button>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-4">
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!isFormValid() || loading}
              className="w-full"
              data-testid="button-submit-profile"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Complete Setup
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
