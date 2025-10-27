import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, QrCode, CheckCircle2, Upload, Image as ImageIcon } from "lucide-react";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
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
  const [validatingDevice, setValidatingDevice] = useState(false);
  const [deviceValid, setDeviceValid] = useState<boolean | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<any>(null);
  
  const [locationId, setLocationId] = useState("");
  const [sensorReading, setSensorReading] = useState("");
  const [mandatoryImage, setMandatoryImage] = useState<File | null>(null);
  const [optionalImage, setOptionalImage] = useState<File | null>(null);
  const [mandatoryImagePreview, setMandatoryImagePreview] = useState<string | null>(null);
  const [optionalImagePreview, setOptionalImagePreview] = useState<string | null>(null);
  
  const [submitting, setSubmitting] = useState(false);

  const validateDeviceId = async () => {
    if (!deviceId.trim()) {
      toast({
        variant: "destructive",
        title: "Device ID Required",
        description: "Please enter a Device ID to validate.",
      });
      return;
    }

    setValidatingDevice(true);
    setDeviceValid(null);
    setDeviceInfo(null);

    try {
      const deviceRef = doc(db, "devices", deviceId.trim());
      const deviceSnap = await getDoc(deviceRef);

      if (!deviceSnap.exists()) {
        setDeviceValid(false);
        toast({
          variant: "destructive",
          title: "Device Not Found",
          description: "This Device ID does not exist in the master database.",
        });
        return;
      }

      const device = deviceSnap.data();

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
      toast({
        title: "Device Validated",
        description: "Device is ready for installation.",
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

    if (!locationId.trim()) {
      toast({
        variant: "destructive",
        title: "Location ID Required",
        description: "Please enter a Location ID.",
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
      // Upload images
      const mandatoryImageUrl = await uploadImage(mandatoryImage, deviceId, "mandatory");
      let optionalImageUrl: string | undefined;
      if (optionalImage) {
        optionalImageUrl = await uploadImage(optionalImage, deviceId, "optional");
      }

      // Create installation document
      const installationId = `${deviceId}_${Date.now()}`;
      await setDoc(doc(db, "installations", installationId), {
        id: installationId,
        deviceId: deviceId.trim(),
        locationId: locationId.trim(),
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
      await updateDoc(doc(db, "devices", deviceId.trim()), {
        status: "installed",
        updatedAt: serverTimestamp(),
      });

      toast({
        title: "Installation Submitted",
        description: "Your installation has been successfully recorded.",
      });

      // Reset form
      setDeviceId("");
      setDeviceValid(null);
      setDeviceInfo(null);
      setLocationId("");
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
            <CardDescription>Enter the Device ID to verify it exists in the system</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="deviceId">Device ID</Label>
                <Input
                  id="deviceId"
                  value={deviceId}
                  onChange={(e) => {
                    setDeviceId(e.target.value);
                    setDeviceValid(null);
                    setDeviceInfo(null);
                  }}
                  placeholder="Enter Device ID or scan QR code"
                  disabled={submitting}
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
                  <div className="space-y-1">
                    <p className="font-semibold text-green-900 dark:text-green-100">Device Validated Successfully</p>
                    <div className="grid grid-cols-2 gap-2 text-xs text-green-800 dark:text-green-200">
                      <div><span className="font-medium">Batch:</span> {deviceInfo.batchId}</div>
                      <div><span className="font-medium">City:</span> {deviceInfo.cityOfDispatch}</div>
                      <div><span className="font-medium">Manufacturer:</span> {deviceInfo.manufacturer}</div>
                      <div><span className="font-medium">Description:</span> {deviceInfo.description}</div>
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
            <div>
              <Label htmlFor="locationId">Location ID *</Label>
              <Input
                id="locationId"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                placeholder="Enter installation location ID"
                disabled={!deviceValid || submitting}
                required
              />
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

        {/* Image Upload */}
        <Card className={`border shadow-sm ${!deviceValid ? "opacity-50" : ""}`}>
          <CardHeader>
            <CardTitle>Step 3: Upload Images</CardTitle>
            <CardDescription>Upload installation photos (at least one required)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Mandatory Image */}
            <div>
              <Label htmlFor="mandatoryImage" className="flex items-center gap-2">
                Installation Photo *
                <Badge variant="secondary">Required</Badge>
              </Label>
              <Input
                id="mandatoryImage"
                type="file"
                accept="image/*"
                onChange={handleMandatoryImageChange}
                disabled={!deviceValid || submitting}
                className="mt-2"
              />
              {mandatoryImagePreview && (
                <div className="mt-4 relative">
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
                    onClick={() => {
                      setMandatoryImage(null);
                      setMandatoryImagePreview(null);
                    }}
                  >
                    Remove
                  </Button>
                </div>
              )}
            </div>

            {/* Optional Image */}
            <div>
              <Label htmlFor="optionalImage" className="flex items-center gap-2">
                Additional Photo
                <Badge variant="outline">Optional</Badge>
              </Label>
              <Input
                id="optionalImage"
                type="file"
                accept="image/*"
                onChange={handleOptionalImageChange}
                disabled={!deviceValid || submitting}
                className="mt-2"
              />
              {optionalImagePreview && (
                <div className="mt-4 relative">
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
                    onClick={() => {
                      setOptionalImage(null);
                      setOptionalImagePreview(null);
                    }}
                  >
                    Remove
                  </Button>
                </div>
              )}
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

