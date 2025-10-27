import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, QrCode, CheckCircle2, Upload, Image as ImageIcon, MapPin, Camera } from "lucide-react";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, query, where, getDocs } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useLocation } from "wouter";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

export default function NewInstallation() {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  
  const [deviceId, setDeviceId] = useState("");
  const [fullDeviceId, setFullDeviceId] = useState(""); // Store the full UID after validation
  const [validatingDevice, setValidatingDevice] = useState(false);
  const [deviceValid, setDeviceValid] = useState<boolean | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<any>(null);
  
  const [locationId, setLocationId] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [sensorReading, setSensorReading] = useState("");
  const [mandatoryImage, setMandatoryImage] = useState<File | null>(null);
  const [optionalImage, setOptionalImage] = useState<File | null>(null);
  const [mandatoryImagePreview, setMandatoryImagePreview] = useState<string | null>(null);
  const [optionalImagePreview, setOptionalImagePreview] = useState<string | null>(null);
  
  const [submitting, setSubmitting] = useState(false);

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({
        variant: "destructive",
        title: "Location Not Supported",
        description: "Your browser doesn't support geolocation.",
      });
      return;
    }

    setGettingLocation(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude);
        setLongitude(position.coords.longitude);
        setLocationId(`${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`);
        setGettingLocation(false);
        toast({
          title: "Location Captured",
          description: "GPS coordinates have been recorded.",
        });
      },
      (error) => {
        setGettingLocation(false);
        let errorMessage = "Unable to retrieve your location.";
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = "Location permission denied. Please enable location access.";
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = "Location information is unavailable.";
            break;
          case error.TIMEOUT:
            errorMessage = "Location request timed out.";
            break;
        }
        
        toast({
          variant: "destructive",
          title: "Location Error",
          description: errorMessage,
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const validateDeviceId = async () => {
    const last4Digits = deviceId.trim();
    
    if (!last4Digits) {
      toast({
        variant: "destructive",
        title: "Device ID Required",
        description: "Please enter the last 4 digits of the Device UID.",
      });
      return;
    }

    if (last4Digits.length !== 4) {
      toast({
        variant: "destructive",
        title: "Invalid Input",
        description: "Please enter exactly 4 digits.",
      });
      return;
    }

    setValidatingDevice(true);
    setDeviceValid(null);
    setDeviceInfo(null);
    setFullDeviceId("");

    try {
      // Fetch all devices and find the one with matching last 4 digits
      const devicesRef = collection(db, "devices");
      const querySnapshot = await getDocs(devicesRef);
      
      const matchingDevices = querySnapshot.docs.filter(doc => {
        const uid = doc.id;
        return uid.slice(-4).toUpperCase() === last4Digits.toUpperCase();
      });

      if (matchingDevices.length === 0) {
        setDeviceValid(false);
        toast({
          variant: "destructive",
          title: "Device Not Found",
          description: "No device found with these last 4 digits in the master database.",
        });
        return;
      }

      if (matchingDevices.length > 1) {
        setDeviceValid(false);
        toast({
          variant: "destructive",
          title: "Multiple Devices Found",
          description: "Multiple devices match these digits. Please contact admin.",
        });
        return;
      }

      const deviceDoc = matchingDevices[0];
      const device = deviceDoc.data();

      // Check if already installed
      if (device.status !== "pending") {
        setDeviceValid(false);
        toast({
          variant: "destructive",
          title: "Device Already Processed",
          description: `This device has status: ${device.status}. Only pending devices can be installed.`,
        });
        return;
      }

      setDeviceValid(true);
      setDeviceInfo(device);
      setFullDeviceId(deviceDoc.id);
      toast({
        title: "Device Validated",
        description: `Device ${deviceDoc.id} is ready for installation.`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Validation Failed",
        description: error instanceof Error ? error.message : "An error occurred.",
      });
      setDeviceValid(false);
    } finally {
      setValidatingDevice(false);
    }
  };

  const handleMandatoryImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast({
          variant: "destructive",
          title: "Invalid File",
          description: "Please upload an image file.",
        });
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast({
          variant: "destructive",
          title: "File Too Large",
          description: "Image must be less than 5MB.",
        });
        return;
      }
      setMandatoryImage(file);
      const reader = new FileReader();
      reader.onloadend = () => setMandatoryImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleOptionalImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast({
          variant: "destructive",
          title: "Invalid File",
          description: "Please upload an image file.",
        });
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast({
          variant: "destructive",
          title: "File Too Large",
          description: "Image must be less than 5MB.",
        });
        return;
      }
      setOptionalImage(file);
      const reader = new FileReader();
      reader.onloadend = () => setOptionalImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const uploadImage = async (file: File, deviceId: string, type: "mandatory" | "optional"): Promise<string> => {
    const timestamp = Date.now();
    const fileName = `${deviceId}_${type}_${timestamp}_${file.name}`;
    const storageRef = ref(storage, `installations/${deviceId}/${fileName}`);
    
    await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(storageRef);
    return downloadURL;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!deviceValid || !deviceInfo) {
      toast({
        variant: "destructive",
        title: "Device Not Validated",
        description: "Please validate the Device ID first.",
      });
      return;
    }

    if (!latitude || !longitude) {
      toast({
        variant: "destructive",
        title: "GPS Location Required",
        description: "Please capture GPS coordinates before submitting.",
      });
      return;
    }

    if (!sensorReading.trim() || isNaN(Number(sensorReading))) {
      toast({
        variant: "destructive",
        title: "Invalid Sensor Reading",
        description: "Please enter a valid numeric sensor reading.",
      });
      return;
    }

    if (!mandatoryImage) {
      toast({
        variant: "destructive",
        title: "Image Required",
        description: "Please upload at least one image of the installation.",
      });
      return;
    }

    if (!userProfile) {
      toast({
        variant: "destructive",
        title: "Authentication Required",
        description: "Please log in to submit an installation.",
      });
      return;
    }

    setSubmitting(true);

    try {
      // Upload images using the full device ID
      const mandatoryImageUrl = await uploadImage(mandatoryImage, fullDeviceId, "mandatory");
      let optionalImageUrl: string | undefined;
      if (optionalImage) {
        optionalImageUrl = await uploadImage(optionalImage, fullDeviceId, "optional");
      }

      // Create installation document
      const installationId = `${fullDeviceId}_${Date.now()}`;
      await setDoc(doc(db, "installations", installationId), {
        id: installationId,
        deviceId: fullDeviceId,
        locationId: locationId.trim(),
        latitude: latitude,
        longitude: longitude,
        sensorReading: Number(sensorReading),
        imageUrl: mandatoryImageUrl,
        optionalImageUrl: optionalImageUrl || null,
        installedBy: userProfile.uid,
        installedByName: userProfile.displayName,
        teamId: userProfile.teamId || null,
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Update device status
      await updateDoc(doc(db, "devices", fullDeviceId), {
        status: "installed",
        updatedAt: serverTimestamp(),
      });

      toast({
        title: "Installation Submitted",
        description: "Your installation has been successfully recorded.",
      });

      // Reset form
      setDeviceId("");
      setFullDeviceId("");
      setDeviceValid(null);
      setDeviceInfo(null);
      setLocationId("");
      setLatitude(null);
      setLongitude(null);
      setSensorReading("");
      setMandatoryImage(null);
      setOptionalImage(null);
      setMandatoryImagePreview(null);
      setOptionalImagePreview(null);

      // Navigate to submissions
      setTimeout(() => setLocation("/my-submissions"), 1500);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Submission Failed",
        description: error instanceof Error ? error.message : "An error occurred.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
          New Installation
        </h1>
        <p className="text-muted-foreground mt-2">Record a new device installation</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Device ID Validation */}
        <Card className="border shadow-sm">
          <CardHeader>
            <CardTitle>Step 1: Validate Device</CardTitle>
            <CardDescription>Enter the last 4 digits of the Device UID to verify it exists</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="deviceId">Last 4 Digits of Device UID</Label>
                <Input
                  id="deviceId"
                  value={deviceId}
                  onChange={(e) => {
                    setDeviceId(e.target.value.toUpperCase());
                    setDeviceValid(null);
                    setDeviceInfo(null);
                    setFullDeviceId("");
                  }}
                  placeholder="Enter last 4 digits (e.g., A3D5)"
                  maxLength={4}
                  disabled={submitting}
                  className="font-mono uppercase"
                />
              </div>
              <div className="flex items-end gap-2">
                <Button
                  type="button"
                  onClick={validateDeviceId}
                  disabled={validatingDevice || submitting}
                  variant="outline"
                >
                  {validatingDevice ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Validate"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={submitting}
                  title="Scan QR Code"
                >
                  <QrCode className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {deviceValid === true && deviceInfo && (
              <Alert className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-semibold text-green-900 dark:text-green-100">Device Validated Successfully</p>
                    <div className="p-2 bg-white dark:bg-slate-800 rounded border border-green-200 dark:border-green-700">
                      <p className="text-xs font-medium text-green-900 dark:text-green-100 mb-1">Full Device UID:</p>
                      <p className="font-mono text-xs text-green-800 dark:text-green-200 break-all">{fullDeviceId}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-green-800 dark:text-green-200">
                      <div><span className="font-medium">Product ID:</span> {deviceInfo.productId}</div>
                      <div><span className="font-medium">IMEI:</span> {deviceInfo.deviceImei}</div>
                      <div><span className="font-medium">Serial:</span> <span className="font-mono text-[10px]">{deviceInfo.deviceSerialId}</span></div>
                      <div><span className="font-medium">ICCID:</span> <span className="font-mono text-[10px]">{deviceInfo.iccid}</span></div>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {deviceValid === false && (
              <Alert variant="destructive">
                <AlertDescription>
                  Device validation failed. Please check the Device ID and try again.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Installation Details */}
        <Card className={`border shadow-sm ${!deviceValid ? "opacity-50" : ""}`}>
          <CardHeader>
            <CardTitle>Step 2: Installation Details</CardTitle>
            <CardDescription>Enter the installation information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>GPS Location *</Label>
              <Button
                type="button"
                onClick={getCurrentLocation}
                disabled={!deviceValid || gettingLocation || submitting}
                variant="outline"
                className="w-full"
              >
                {gettingLocation ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Getting Location...
                  </>
                ) : (
                  <>
                    <MapPin className="h-4 w-4 mr-2" />
                    Capture GPS Coordinates
                  </>
                )}
              </Button>
              
              {latitude && longitude && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md">
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-blue-600 mt-0.5" />
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium text-blue-900 dark:text-blue-100">Location Captured</p>
                      <div className="grid grid-cols-2 gap-2 text-xs text-blue-800 dark:text-blue-200">
                        <div>
                          <span className="font-medium">Latitude:</span>
                          <span className="ml-1 font-mono">{latitude.toFixed(6)}</span>
                        </div>
                        <div>
                          <span className="font-medium">Longitude:</span>
                          <span className="ml-1 font-mono">{longitude.toFixed(6)}</span>
                        </div>
                      </div>
                      <a
                        href={`https://www.google.com/maps?q=${latitude},${longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                      >
                        View on Google Maps →
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="sensorReading">Sensor Reading *</Label>
              <Input
                id="sensorReading"
                type="number"
                step="0.01"
                value={sensorReading}
                onChange={(e) => setSensorReading(e.target.value)}
                placeholder="Enter sensor reading value"
                disabled={!deviceValid || submitting}
                required
              />
            </div>
          </CardContent>
        </Card>

        {/* Image Capture */}
        <Card className={`border shadow-sm ${!deviceValid ? "opacity-50" : ""}`}>
          <CardHeader>
            <CardTitle>Step 3: Capture Photos</CardTitle>
            <CardDescription>Take installation photos using your device camera (at least one required)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Mandatory Image */}
            <div>
              <Label htmlFor="mandatoryImage" className="flex items-center gap-2 mb-3">
                <Camera className="h-4 w-4" />
                Installation Photo *
                <Badge variant="secondary">Required</Badge>
              </Label>
              <label htmlFor="mandatoryImage">
                <div className={`
                  flex flex-col items-center justify-center 
                  border-2 border-dashed rounded-lg p-6 
                  cursor-pointer transition-colors
                  ${!deviceValid || submitting 
                    ? 'border-gray-300 bg-gray-50 cursor-not-allowed' 
                    : 'border-primary/50 hover:border-primary hover:bg-primary/5'
                  }
                `}>
                  {mandatoryImagePreview ? (
                    <div className="relative w-full">
                      <img
                        src={mandatoryImagePreview}
                        alt="Installation preview"
                        className="w-full h-48 object-cover rounded-lg border"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="absolute top-2 right-2"
                        onClick={(e) => {
                          e.preventDefault();
                          setMandatoryImage(null);
                          setMandatoryImagePreview(null);
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Camera className="h-12 w-12 text-muted-foreground mb-2" />
                      <p className="text-sm font-medium text-center">Tap to capture photo</p>
                      <p className="text-xs text-muted-foreground text-center mt-1">
                        Use your device camera
                      </p>
                    </>
                  )}
                </div>
              </label>
              <Input
                id="mandatoryImage"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleMandatoryImageChange}
                disabled={!deviceValid || submitting}
                className="hidden"
              />
            </div>

            {/* Optional Image */}
            <div>
              <Label htmlFor="optionalImage" className="flex items-center gap-2 mb-3">
                <Camera className="h-4 w-4" />
                Additional Photo
                <Badge variant="outline">Optional</Badge>
              </Label>
              <label htmlFor="optionalImage">
                <div className={`
                  flex flex-col items-center justify-center 
                  border-2 border-dashed rounded-lg p-6 
                  cursor-pointer transition-colors
                  ${!deviceValid || submitting 
                    ? 'border-gray-300 bg-gray-50 cursor-not-allowed' 
                    : 'border-primary/50 hover:border-primary hover:bg-primary/5'
                  }
                `}>
                  {optionalImagePreview ? (
                    <div className="relative w-full">
                      <img
                        src={optionalImagePreview}
                        alt="Optional preview"
                        className="w-full h-48 object-cover rounded-lg border"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="absolute top-2 right-2"
                        onClick={(e) => {
                          e.preventDefault();
                          setOptionalImage(null);
                          setOptionalImagePreview(null);
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Camera className="h-12 w-12 text-muted-foreground mb-2" />
                      <p className="text-sm font-medium text-center">Tap to capture photo</p>
                      <p className="text-xs text-muted-foreground text-center mt-1">
                        Use your device camera
                      </p>
                    </>
                  )}
                </div>
              </label>
              <Input
                id="optionalImage"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleOptionalImageChange}
                disabled={!deviceValid || submitting}
                className="hidden"
              />
            </div>
          </CardContent>
        </Card>

        {/* Submit Button */}
        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => setLocation("/my-submissions")}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!deviceValid || submitting}
            className="min-w-[150px]"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Submit Installation
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

