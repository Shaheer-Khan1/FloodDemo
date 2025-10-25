import { useState } from "react";
import { useLocation } from "wouter";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Smartphone, Image as ImageIcon, Ruler, Loader2 } from "lucide-react";

export default function ProfileSetup() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    displayName: user?.displayName || "",
    location: "",
    deviceId: "",
    height: "",
    heightUnit: "cm" as "cm" | "ft",
    photoFile: null as File | null,
    photoURL: user?.photoURL || "",
  });

  const totalSteps = 4;

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

  const handleSubmit = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      let photoURL = formData.photoURL;
      
      // Upload photo if a file was selected
      if (formData.photoFile) {
        const storageRef = ref(storage, `profile-photos/${user.uid}`);
        await uploadBytes(storageRef, formData.photoFile);
        photoURL = await getDownloadURL(storageRef);
      }

      // Save profile to Firestore
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: user.email,
        displayName: formData.displayName,
        photoURL,
        location: formData.location,
        deviceId: formData.deviceId,
        height: parseFloat(formData.height),
        heightUnit: formData.heightUnit,
        isAdmin: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast({
        title: "Profile created!",
        description: "Welcome to the flood warning system.",
      });
      setLocation("/dashboard");
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

  const canProceed = () => {
    switch (step) {
      case 1:
        return formData.displayName.trim() && formData.location.trim();
      case 2:
        return formData.deviceId.trim();
      case 3:
        return true; // Photo is optional
      case 4:
        return formData.height && parseFloat(formData.height) > 0;
      default:
        return false;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div className="space-y-2 mb-4">
            <Progress value={(step / totalSteps) * 100} className="h-2" />
            <p className="text-sm text-muted-foreground text-center">
              Step {step} of {totalSteps}
            </p>
          </div>
          <CardTitle>Complete Your Profile</CardTitle>
          <CardDescription>
            Help us set up your flood warning profile
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  data-testid="input-name"
                  placeholder="John Doe"
                  className="h-12"
                  value={formData.displayName}
                  onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
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
                      className="pl-10 h-12"
                      value={formData.location}
                      onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleLocationDetect}
                    disabled={loading}
                    data-testid="button-detect-location"
                    className="h-12"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Auto-detect"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-2">
              <Label htmlFor="deviceId">Device ID</Label>
              <div className="relative">
                <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="deviceId"
                  data-testid="input-device-id"
                  placeholder="e.g., DEVICE-12345"
                  className="pl-10 h-12"
                  value={formData.deviceId}
                  onChange={(e) => setFormData(prev => ({ ...prev, deviceId: e.target.value }))}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Your unique flood monitoring device identifier
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <Label>Profile Photo (Optional)</Label>
              <div className="flex flex-col items-center gap-4">
                <Avatar className="h-32 w-32">
                  <AvatarImage src={formData.photoURL} />
                  <AvatarFallback className="text-2xl">
                    {formData.displayName.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById('photo-upload')?.click()}
                    data-testid="button-upload-photo"
                  >
                    <ImageIcon className="mr-2 h-4 w-4" />
                    Choose Photo
                  </Button>
                  <input
                    id="photo-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoUpload}
                  />
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  Recommended: 400x400px, max 5MB
                </p>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="height">Height</Label>
                <div className="relative">
                  <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="height"
                    data-testid="input-height"
                    type="number"
                    step="0.1"
                    placeholder="Enter height"
                    className="pl-10 h-12"
                    value={formData.height}
                    onChange={(e) => setFormData(prev => ({ ...prev, height: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <RadioGroup
                  value={formData.heightUnit}
                  onValueChange={(value: "cm" | "ft") => setFormData(prev => ({ ...prev, heightUnit: value }))}
                  data-testid="radio-height-unit"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="cm" id="cm" />
                    <Label htmlFor="cm" className="font-normal cursor-pointer">Centimeters (cm)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="ft" id="ft" />
                    <Label htmlFor="ft" className="font-normal cursor-pointer">Feet (ft)</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-4">
            {step > 1 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(step - 1)}
                disabled={loading}
                data-testid="button-back"
              >
                Back
              </Button>
            )}
            {step < totalSteps ? (
              <Button
                type="button"
                onClick={() => setStep(step + 1)}
                disabled={!canProceed() || loading}
                className="flex-1"
                data-testid="button-next"
              >
                Next
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={!canProceed() || loading}
                className="flex-1"
                data-testid="button-submit-profile"
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Complete Setup
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
