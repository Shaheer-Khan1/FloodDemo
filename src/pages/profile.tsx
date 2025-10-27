import { useState, useEffect } from "react";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Loader2, Image as ImageIcon, Save } from "lucide-react";
import { useLocation } from "wouter";

export default function Profile() {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);

  // Redirect installers to their installation page
  useEffect(() => {
    if (userProfile?.role === "installer") {
      setLocation("/new-installation");
    }
  }, [userProfile, setLocation]);
  
  const [formData, setFormData] = useState({
    displayName: "",
    location: "",
    photoFile: null as File | null,
    photoURL: "",
  });

  useEffect(() => {
    if (userProfile) {
      setFormData({
        displayName: userProfile.displayName,
        location: userProfile.location,
        photoFile: null,
        photoURL: userProfile.photoURL || "",
      });
    }
  }, [userProfile]);

  const handleLocationDetect = () => {
    setDetectingLocation(true);
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
            setDetectingLocation(false);
          }
        },
        (error) => {
          toast({
            variant: "destructive",
            title: "Location access denied",
            description: "Please enter your location manually.",
          });
          setDetectingLocation(false);
        }
      );
    } else {
      toast({
        variant: "destructive",
        title: "Geolocation not supported",
        description: "Please enter your location manually.",
      });
      setDetectingLocation(false);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          variant: "destructive",
          title: "File too large",
          description: "Please select an image smaller than 5MB.",
        });
        return;
      }
      setFormData(prev => ({ 
        ...prev, 
        photoFile: file,
        photoURL: URL.createObjectURL(file)
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !userProfile) return;
    
    setLoading(true);
    try {
      let photoURL = formData.photoURL;
      
      // Upload new photo if selected
      if (formData.photoFile) {
        const storageRef = ref(storage, `profile-photos/${user.uid}`);
        await uploadBytes(storageRef, formData.photoFile);
        photoURL = await getDownloadURL(storageRef);
      }

      // Update profile in Firestore
      await updateDoc(doc(db, "users", user.uid), {
        displayName: formData.displayName,
        photoURL,
        location: formData.location,
        updatedAt: serverTimestamp(),
      });

      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to update profile",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  if (!userProfile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">My Profile</h1>
        <p className="text-muted-foreground">Manage your personal information</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>Update your profile details</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex flex-col items-center gap-4 pb-6">
              <Avatar className="h-32 w-32">
                <AvatarImage src={formData.photoURL} />
                <AvatarFallback className="text-2xl">
                  {formData.displayName.split(' ').map(n => n[0]).join('').toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <Button
                type="button"
                variant="outline"
                onClick={() => document.getElementById('profile-photo-upload')?.click()}
                data-testid="button-change-photo"
              >
                <ImageIcon className="mr-2 h-4 w-4" />
                Change Photo
              </Button>
              <input
                id="profile-photo-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoUpload}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  data-testid="input-edit-name"
                  placeholder="John Doe"
                  className="h-12"
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
                      data-testid="input-edit-location"
                      placeholder="Enter your location"
                      className="pl-10 h-12"
                      value={formData.location}
                      onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                      required
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleLocationDetect}
                    disabled={detectingLocation}
                    data-testid="button-detect-location-edit"
                    className="h-12"
                  >
                    {detectingLocation ? <Loader2 className="h-4 w-4 animate-spin" /> : "Detect"}
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="submit" disabled={loading} data-testid="button-save-profile">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
