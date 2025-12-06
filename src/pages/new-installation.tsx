import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, QrCode, CheckCircle2, Upload, Image as ImageIcon, MapPin, Camera, X, AlertTriangle } from "lucide-react";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, query, where, getDocs } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useLocation } from "wouter";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Html5Qrcode } from "html5-qrcode";

export default function NewInstallation() {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [checkingPending, setCheckingPending] = useState(true);
  
  const [deviceId, setDeviceId] = useState(""); // used for manual full UID fallback
  const [qrScannedUid, setQrScannedUid] = useState("");
  const [deviceInputMethod, setDeviceInputMethod] = useState<"qr"|"manual"|null>(null);
  const [deviceValidationMode, setDeviceValidationMode] = useState<'manual'|'qr'>('manual');
  const [fullDeviceId, setFullDeviceId] = useState(""); // Store the full UID after validation
  const [validatingDevice, setValidatingDevice] = useState(false);
  const [deviceValid, setDeviceValid] = useState<boolean | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<any>(null);
  const [deviceErrorMessage, setDeviceErrorMessage] = useState<{ title: string; description: string } | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  
  const [locationId, setLocationId] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [sensorReading, setSensorReading] = useState("");
  const [sensorReadingUnit, setSensorReadingUnit] = useState<"cm" | "m">("cm");
  const [latestDisCm, setLatestDisCm] = useState<number | null>(null);
  const [images, setImages] = useState<(File | null)[]>([null, null, null, null]);
  const [imagePreviews, setImagePreviews] = useState<(string | null)[]>([null, null, null, null]);
  const [video, setVideo] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  
  const [submitting, setSubmitting] = useState(false);

  // Initialize QR Scanner with better settings
  useEffect(() => {
    const initScanner = async () => {
      if (showScanner && !scannerRef.current) {
        const scanner = new Html5Qrcode("qr-reader");
        scannerRef.current = scanner;

        try {
          // Start scanning with better settings for low-quality QR codes
          await scanner.start(
            { facingMode: "environment" }, // Use back camera on mobile
            {
              fps: 20, // Higher FPS
              qrbox: { width: 300, height: 300 }, // Larger scanning area
            },
            (decodedText, decodedResult) => {
              // QR mode: Extract after last '-' or fallback to full UID
              const scanned = decodedText.trim();
              const justUid = scanned.includes("-") ? scanned.split("-").pop()?.toUpperCase() : scanned.toUpperCase();
              setQrScannedUid(justUid || "");
              setDeviceId("");
              setDeviceInputMethod('qr');
              setDeviceValid(null); setDeviceInfo(null); setFullDeviceId(""); setDeviceErrorMessage(null);
              setShowScanner(false);
              scanner.stop().then(() => { scannerRef.current = null; }).catch(console.error);
              toast({ title: "QR Code Scanned", description: `UID: ${justUid}` });
            },
            (error) => {
              // Error callback - can be ignored for continuous scanning
              // console.log(error);
            }
          );
        } catch (error) {
          console.error("Scanner init failed:", error);
          toast({
            variant: "destructive",
            title: "Camera Error",
            description: "Could not access camera. Try manual entry.",
          });
        }
      }
    };

    initScanner();

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(console.error);
        scannerRef.current = null;
      }
    };
  }, [showScanner, toast]);

  const handleScannerClose = () => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(console.error);
      scannerRef.current = null;
    }
    setShowScanner(false);
  };

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

  // Always validate by full UID (from qrScannedUid or deviceId)
  const validateDeviceId = async () => {
    const entered = (qrScannedUid || deviceId).trim().toUpperCase();
    if (!entered) {
      toast({
        variant: "destructive",
        title: "Device UID Required",
        description: "Please scan or enter the full Device UID.",
      });
      return;
    }
    setValidatingDevice(true);
    setDeviceValid(null);
    setDeviceInfo(null);
    setFullDeviceId("");
    setDeviceErrorMessage(null);
    try {
      const devicesRef = collection(db, "devices");
      const querySnapshot = await getDocs(devicesRef);
      const matchingDevices = querySnapshot.docs.filter(doc => doc.id.toUpperCase() === entered);
      if (matchingDevices.length === 0) {
        setDeviceValid(false);
        setDeviceErrorMessage({
          title: "Device Not Found",
          description: "No device found matching this UID in the master database.",
        });
        return;
      }
      const deviceDoc = matchingDevices[0];
      const device = deviceDoc.data() as any;

      // Enforce team ownership if both installer and device have team assignment
      if (userProfile?.teamId && device.teamId && device.teamId !== userProfile.teamId) {
        setDeviceValid(false);
        setDeviceErrorMessage({
          title: "Device Belongs to Another Team",
          description: "This device is assigned to a different team and cannot be installed by you.",
        });
        return;
      }

      // If the device has been assigned to a specific installer, only that user may install it.
      if (userProfile?.role === "installer") {
        if (!device.assignedInstallerId) {
          setDeviceValid(false);
          setDeviceErrorMessage({
            title: "Installer Not Assigned",
            description:
              "This device has not been assigned to an installer yet. Please contact your verifier or manager.",
          });
          return;
        }
        if (device.assignedInstallerId !== userProfile.uid) {
          setDeviceValid(false);
          setDeviceErrorMessage({
            title: "Assigned to Another Installer",
            description:
              "This device is assigned to a different installer in your team. You cannot perform this installation.",
          });
          return;
        }
      }

      // Enforce box-opened rule: device can only be installed once its box has been opened
      if (device.boxNumber && device.boxOpened !== true) {
        setDeviceValid(false);
        setDeviceErrorMessage({
          title: "Box Not Opened Yet",
          description: "This device is inside a box that has not been opened by your team verifier yet.",
        });
        return;
      }
      
      // Check if device already has an installation
      const installationsQuery = query(
        collection(db, "installations"),
        where("deviceId", "==", deviceDoc.id)
      );
      const existingInstallations = await getDocs(installationsQuery);
      
      if (!existingInstallations.empty) {
        setDeviceValid(false);
        setDeviceErrorMessage({
          title: "Installation Already Exists",
          description: `There is already an installation made for this device (${deviceDoc.id}). Each device can only be installed once.`,
        });
        return;
      }
      
      setDeviceValid(true);
      setDeviceInfo(device);
      setFullDeviceId(deviceDoc.id);
      setDeviceErrorMessage(null);
      // Tag input method for save
      setDeviceInputMethod(qrScannedUid ? 'qr' : 'manual');
    } catch (error) {
      setDeviceValid(false);
      setDeviceErrorMessage({
        title: "Validation Error",
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setValidatingDevice(false);
    }
  };

  const handleImageChange = (index: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check if file was selected from gallery (not captured from camera)
      // Note: This is a basic heuristic - file.lastModified can help detect
      const isFromGallery = file.webkitRelativePath || file.lastModified < Date.now() - 5000;
      
      if (isFromGallery) {
        // Warn but allow it, as the capture attribute should handle this on mobile
        // On desktop, users might need to upload
      }
      
      if (!file.type.startsWith("image/")) {
        toast({
          variant: "destructive",
          title: "Invalid File",
          description: "Please capture an image using the camera.",
        });
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast({
          variant: "destructive",
          title: "File Too Large",
          description: "Image must be less than 5MB. Please capture again.",
        });
        return;
      }
      
      const newImages = [...images];
      newImages[index] = file;
      setImages(newImages);
      
      const reader = new FileReader();
      reader.onloadend = () => {
        const newPreviews = [...imagePreviews];
        newPreviews[index] = reader.result as string;
        setImagePreviews(newPreviews);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = (index: number) => {
    const newImages = [...images];
    newImages[index] = null;
    setImages(newImages);
    
    const newPreviews = [...imagePreviews];
    newPreviews[index] = null;
    setImagePreviews(newPreviews);
  };

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("video/")) {
        toast({
          variant: "destructive",
          title: "Invalid File",
          description: "Please upload a video file.",
        });
        return;
      }
      
      // Check file size (max 100MB)
      if (file.size > 100 * 1024 * 1024) {
        toast({
          variant: "destructive",
          title: "File Too Large",
          description: "Video must be less than 100MB.",
        });
        return;
      }
      
      setVideo(file);
      const reader = new FileReader();
      reader.onloadend = () => setVideoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const uploadFile = async (file: File, deviceId: string, fileType: "image" | "video", index?: number): Promise<string> => {
    const timestamp = Date.now();
    const suffix = fileType === "image" ? `image_${index}` : "360video";
    const fileName = `${deviceId}_${suffix}_${timestamp}_${file.name}`;
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

    // GPS is optional now; proceed even if missing
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

    // Check if at least two images are uploaded
    const uploadedImages = images.filter(img => img !== null);
    if (uploadedImages.length < 2) {
      toast({
        variant: "destructive",
        title: "Images Required",
        description: "Please capture at least two installation photos.",
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
      // Check if device already has an installation
      const installationsQuery = query(
        collection(db, "installations"),
        where("deviceId", "==", fullDeviceId)
      );
      const existingInstallations = await getDocs(installationsQuery);
      
      if (!existingInstallations.empty) {
        toast({
          variant: "destructive",
          title: "Device Already Installed",
          description: `This device (${fullDeviceId}) already has an installation. Each device can only be installed once.`,
        });
        setSubmitting(false);
        return;
      }

      // Upload all images
      const imageUrls: string[] = [];
      for (let i = 0; i < images.length; i++) {
        if (images[i]) {
          const url = await uploadFile(images[i]!, fullDeviceId, "image", i);
          imageUrls.push(url);
        }
      }

      // Upload video if present
      let videoUrl: string | undefined;
      if (video) {
        videoUrl = await uploadFile(video, fullDeviceId, "video");
      }

      // Convert sensor reading to cm if needed
      let sensorReadingCm = Number(sensorReading);
      if (sensorReadingUnit === "m") {
        sensorReadingCm = sensorReadingCm * 100;
      }

      // Create installation document
      const installationId = `${fullDeviceId}_${Date.now()}`;
      await setDoc(doc(db, "installations", installationId), {
        id: installationId,
        deviceId: fullDeviceId,
        locationId: locationId.trim(),
        latitude: latitude || null, // Save null if not available
        longitude: longitude || null, // Save null if not available
        sensorReading: sensorReadingCm,
        latestDisCm: null,
        imageUrls: imageUrls,
        videoUrl: videoUrl || null,
        installedBy: userProfile.uid,
        installedByName: userProfile.displayName,
        teamId: userProfile.teamId || null,
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        deviceInputMethod,
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
      setDeviceErrorMessage(null);
      setLocationId("");
      setLatitude(null);
      setLongitude(null);
      setSensorReading("");
      setSensorReadingUnit("cm");
      setLatestDisCm(null);
      setImages([null, null, null, null]);
      setImagePreviews([null, null, null, null]);
      setVideo(null);
      setVideoPreview(null);

      // Navigate to submissions page (installer can continue making new installations)
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
            <CardDescription>Scan QR code or enter the full Device UID if scanning does not work.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Button type="button" onClick={() => setShowScanner(true)} variant="outline" disabled={showScanner || submitting}>
                {showScanner ? (<Loader2 className="h-4 w-4 animate-spin" />) : (<><QrCode className="h-4 w-4 mr-1" /> Scan QR Code</>)}
              </Button>
              {qrScannedUid && (<div className="font-mono bg-muted px-3 py-2 rounded text-xs">{qrScannedUid}</div>)}
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="deviceId">Or enter full Device UID:</Label>
              <Input id="deviceId" value={deviceId} onChange={e => { setDeviceId(e.target.value.toUpperCase()); setDeviceValid(null); setDeviceInfo(null); setFullDeviceId(""); setQrScannedUid(""); setDeviceInputMethod('manual'); setDeviceErrorMessage(null); }} placeholder="Full UID (e.g., 6461561B7911ED6E)" disabled={submitting} className="font-mono uppercase w-64" />
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Button type="button" onClick={validateDeviceId} disabled={validatingDevice || submitting || (!qrScannedUid && !deviceId)} variant="outline">
                {validatingDevice ? (<Loader2 className="h-4 w-4 animate-spin" />) : ("Validate Device")}
              </Button>
              {deviceValid === true && deviceInfo && (
                <Badge variant="success" className="bg-green-500 text-white text-xs h-7 ml-2">Device Found</Badge>
              )}
            </div>
            {deviceValid === true && deviceInfo && (
              <Alert className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800 mt-4">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-semibold text-green-900 dark:text-green-100">Device validated successfully!</p>
                    <div className="p-2 bg-white dark:bg-slate-800 rounded border border-green-200 dark:border-green-700">
                      <span className="text-xs font-bold">UID: {fullDeviceId}</span><br />
                      {deviceInfo.productId && <span className="text-xs">Product: {deviceInfo.productId}</span>}
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}
            {deviceValid === false && deviceErrorMessage && (
              <Alert className="bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 mt-4" variant="destructive">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <AlertDescription>
                  <p className="font-semibold text-red-900 dark:text-red-100">{deviceErrorMessage.description}</p>
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
                    Capture GPS Coordinates (Optional)
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
            <Label htmlFor="locationId">Location ID *</Label>
            <Input
              id="locationId"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              placeholder="Enter location ID (e.g., site code or name)"
              disabled={!deviceValid || submitting}
              required
            />
          </div>

            <div>
              <Label htmlFor="sensorReading">Sensor Reading *</Label>
              <div className="flex gap-2">
                <Input
                  id="sensorReading"
                  type="number"
                  step="0.01"
                  value={sensorReading}
                  onChange={(e) => setSensorReading(e.target.value)}
                  placeholder="Enter sensor reading value"
                  disabled={!deviceValid || submitting}
                  required
                  className="flex-1"
                />
                <select
                  value={sensorReadingUnit}
                  onChange={(e) => setSensorReadingUnit(e.target.value as "cm" | "m")}
                  disabled={!deviceValid || submitting}
                  className="px-3 py-2 border border-input bg-background rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="cm">cm</option>
                  <option value="m">m</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Image & Video Capture */}
        <Card className={`border shadow-sm ${!deviceValid ? "opacity-50" : ""}`}>
          <CardHeader>
            <CardTitle>Step 3: Capture Media</CardTitle>
            <CardDescription>Take up to 4 installation photos (at least 2 required) and optionally upload a 360° video</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Images Grid */}
            <div>
              <Label className="flex items-center gap-2 mb-3">
                <Camera className="h-4 w-4" />
                Installation Photos (up to 4) - Camera Capture Only
                <Badge variant="secondary">At least 2 required</Badge>
              </Label>
              <p className="text-sm text-muted-foreground mb-3">
                Take photos directly using your device camera. Uploads from gallery are not allowed.
              </p>
              <div className="grid grid-cols-2 gap-4">
                {images.map((image, index) => (
                  <div key={index}>
                    <label htmlFor={`image-${index}`} className="block">
                      <div className={`
                        flex flex-col items-center justify-center 
                        border-2 border-dashed rounded-lg p-4 
                        cursor-pointer transition-colors min-h-[160px]
                        ${!deviceValid || submitting 
                          ? 'border-gray-300 bg-gray-50 cursor-not-allowed' 
                          : 'border-primary/50 hover:border-primary hover:bg-primary/5'
                        }
                      `}>
                        {imagePreviews[index] ? (
                          <div className="relative w-full">
                            <img
                              src={imagePreviews[index]!}
                              alt={`Photo ${index + 1}`}
                              className="w-full h-32 object-cover rounded-lg border"
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              className="absolute top-1 right-1 h-6 w-6 p-0"
                              onClick={(e) => {
                                e.preventDefault();
                                handleRemoveImage(index);
                              }}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <Camera className="h-8 w-8 text-muted-foreground mb-1" />
                            <p className="text-xs font-medium text-center">Photo {index + 1}</p>
                            <p className="text-[10px] text-muted-foreground text-center mt-0.5">
                              Tap to capture
                            </p>
                          </>
                        )}
                      </div>
                    </label>
                    <Input
                      id={`image-${index}`}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleImageChange(index)}
                      disabled={!deviceValid || submitting}
                      className="hidden"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* 360 Video Upload */}
            <div>
              <Label className="flex items-center gap-2 mb-3">
                <Upload className="h-4 w-4" />
                360° Video
                <Badge variant="outline">Optional</Badge>
              </Label>
              <label htmlFor="video360">
                <div className={`
                  flex flex-col items-center justify-center 
                  border-2 border-dashed rounded-lg p-6 
                  cursor-pointer transition-colors
                  ${!deviceValid || submitting 
                    ? 'border-gray-300 bg-gray-50 cursor-not-allowed' 
                    : 'border-primary/50 hover:border-primary hover:bg-primary/5'
                  }
                `}>
                  {videoPreview ? (
                    <div className="relative w-full">
                      <video
                        src={videoPreview}
                        controls
                        className="w-full h-48 object-cover rounded-lg border"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="absolute top-2 right-2"
                        onClick={(e) => {
                          e.preventDefault();
                          setVideo(null);
                          setVideoPreview(null);
                        }}
                      >
                        Remove
                      </Button>
                      {video && (
                        <p className="text-xs text-muted-foreground mt-2">
                          {(video.size / (1024 * 1024)).toFixed(2)} MB
                        </p>
                      )}
                    </div>
                  ) : (
                    <>
                      <Upload className="h-12 w-12 text-muted-foreground mb-2" />
                      <p className="text-sm font-medium text-center">Tap to upload 360° video</p>
                      <p className="text-xs text-muted-foreground text-center mt-1">
                        Max 100MB • MP4, MOV, AVI
                      </p>
                    </>
                  )}
                </div>
              </label>
              <Input
                id="video360"
                type="file"
                accept="video/*"
                onChange={handleVideoChange}
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

      {/* QR Scanner Modal */}
      {showScanner && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <QrCode className="h-5 w-5" />
                  Scan QR Code
                </CardTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleScannerClose}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <CardDescription>
                Position the QR code within the frame to scan
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div id="qr-reader" className="w-full"></div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

