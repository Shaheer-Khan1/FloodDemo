import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Users, Shield, FileDown, Gauge, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { translateTeamNameToArabic } from "@/lib/amanah-translations";
import type { Installation, Team } from "@/lib/types";

export default function Dashboard() {
  const { userProfile } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [teamsCount, setTeamsCount] = useState(0);
  
  // Sensor reading range filter state
  const [sensorRangeDialogOpen, setSensorRangeDialogOpen] = useState(false);
  const [minSensorReading, setMinSensorReading] = useState("");
  const [maxSensorReading, setMaxSensorReading] = useState("");
  const [loadingSensorRange, setLoadingSensorRange] = useState(false);

  // Variance filter state
  const [varianceFilterDialogOpen, setVarianceFilterDialogOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [varianceThreshold, setVarianceThreshold] = useState<string>("");
  const [deviceIdsInput, setDeviceIdsInput] = useState<string>("");
  const [loadingVarianceFilter, setLoadingVarianceFilter] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);

  const handleDeviceLocationCsv = async () => {
    try {
      const [installSnap, locSnap] = await Promise.all([
        getDocs(collection(db, "installations")),
        getDocs(collection(db, "locations")),
      ]);

      const locationsMap = new Map<
        string,
        { latitude: number; longitude: number }
      >();
      locSnap.forEach((d) => {
        const data: any = d.data();
        const rawId: string = data.locationId || d.id;
        const lat =
          typeof data.latitude === "number"
            ? data.latitude
            : data.latitude
            ? parseFloat(String(data.latitude))
            : null;
        const lon =
          typeof data.longitude === "number"
            ? data.longitude
            : data.longitude
            ? parseFloat(String(data.longitude))
            : null;
        if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) return;
        const base = { latitude: lat, longitude: lon };
        const idKey = String(rawId).trim();
        locationsMap.set(idKey, base);
        if (/^\d+$/.test(idKey)) {
          const numKey = String(Number(idKey)).trim();
          if (numKey !== idKey) {
            locationsMap.set(numKey, base);
          }
        }
      });

      const rows: string[][] = [];
      installSnap.forEach((d) => {
        const data: any = d.data();
        const deviceId = data.deviceId || d.id;
        const locationId = data.locationId ? String(data.locationId).trim() : "";

        const userLat =
          typeof data.latitude === "number"
            ? data.latitude
            : data.latitude
            ? parseFloat(String(data.latitude))
            : null;
        const userLon =
          typeof data.longitude === "number"
            ? data.longitude
            : data.longitude
            ? parseFloat(String(data.longitude))
            : null;

        const mapped = locationId ? locationsMap.get(locationId) : undefined;

        const userCoords =
          userLat != null && userLon != null
            ? `${userLat.toFixed(6)}, ${userLon.toFixed(6)}`
            : "-";
        const mappedCoords =
          mapped && mapped.latitude != null && mapped.longitude != null
            ? `${mapped.latitude.toFixed(6)}, ${mapped.longitude.toFixed(6)}`
            : "-";

        rows.push([
          String(deviceId),
          locationId || "-",
          userCoords,
          mappedCoords,
        ]);
      });

      if (rows.length === 0) {
        return;
      }

      const headers = [
        "Device ID",
        "Location ID",
        "User Coordinates",
        "Mapped Coordinates",
      ];
      const csvRows = [headers, ...rows];
      const csvContent = csvRows
        .map((row) =>
          row
            .map((val) => `"${(val ?? "").replace(/"/g, '""')}"`)
            .join(",")
        )
        .join("\r\n");

      const blob = new Blob(["\ufeff", csvContent], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `device-locations-${new Date().toISOString().slice(0, 10)}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed to export device locations CSV:", e);
    }
  };

  const handleSensorReadingRangeExport = async () => {
    if (!minSensorReading && !maxSensorReading) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please enter at least a minimum or maximum sensor reading value.",
      });
      return;
    }

    const min = minSensorReading ? parseFloat(minSensorReading) : -Infinity;
    const max = maxSensorReading ? parseFloat(maxSensorReading) : Infinity;

    if (isNaN(min) || isNaN(max)) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please enter valid numeric values for sensor readings.",
      });
      return;
    }

    if (min > max) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Minimum sensor reading cannot be greater than maximum.",
      });
      return;
    }

    setLoadingSensorRange(true);
    try {
      // Fetch all required data
      const [installationsSnap, teamsSnap, locationsSnap] = await Promise.all([
        getDocs(collection(db, "installations")),
        getDocs(collection(db, "teams")),
        getDocs(collection(db, "locations")),
      ]);

      // Create maps for quick lookup
      const teamsMap = new Map<string, Team>();
      teamsSnap.forEach((doc) => {
        teamsMap.set(doc.id, { id: doc.id, ...doc.data() } as Team);
      });

      const locationsMap = new Map<
        string,
        { latitude: number; longitude: number; municipalityName?: string }
      >();
      locationsSnap.forEach((d) => {
        const data: any = d.data();
        const rawId: string = data.locationId || d.id;
        const lat =
          typeof data.latitude === "number"
            ? data.latitude
            : data.latitude
            ? parseFloat(String(data.latitude))
            : null;
        const lon =
          typeof data.longitude === "number"
            ? data.longitude
            : data.longitude
            ? parseFloat(String(data.longitude))
            : null;
        if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) return;
        const idKey = String(rawId).trim();
        locationsMap.set(idKey, {
          latitude: lat,
          longitude: lon,
          municipalityName: data.municipalityName,
        });
        // Also add numeric key variant if applicable
        if (/^\d+$/.test(idKey)) {
          const numKey = String(Number(idKey)).trim();
          if (numKey !== idKey) {
            locationsMap.set(numKey, {
              latitude: lat,
              longitude: lon,
              municipalityName: data.municipalityName,
            });
          }
        }
      });

      // Filter installations by sensor reading range
      const filteredInstallations: Installation[] = [];
      installationsSnap.forEach((doc) => {
        const data = doc.data() as Installation;
        const sensorReading =
          typeof data.sensorReading === "number"
            ? data.sensorReading
            : data.sensorReading
            ? parseFloat(String(data.sensorReading))
            : null;

        if (
          sensorReading != null &&
          !isNaN(sensorReading) &&
          sensorReading >= min &&
          sensorReading <= max
        ) {
          filteredInstallations.push({
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate?.() || data.createdAt,
            updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
            verifiedAt: data.verifiedAt?.toDate?.() || data.verifiedAt,
          });
        }
      });

      if (filteredInstallations.length === 0) {
        toast({
          title: "No Data Found",
          description: `No devices found with sensor readings between ${minSensorReading || "any"} and ${maxSensorReading || "any"}.`,
        });
        setLoadingSensorRange(false);
        return;
      }

      // Generate CSV rows
      const rows: string[][] = [];
      filteredInstallations.forEach((inst) => {
        const locationId = inst.locationId ? String(inst.locationId).trim() : "";
        const isLocation9999 = locationId === "9999";

        // Get coordinates
        let latitude: number | null = null;
        let longitude: number | null = null;
        if (isLocation9999) {
          // For location 9999, use user-entered coordinates
          latitude = inst.latitude ?? null;
          longitude = inst.longitude ?? null;
        } else {
          // For other locations, use coordinates from locations collection
          const location = locationsMap.get(locationId);
          latitude = location?.latitude ?? null;
          longitude = location?.longitude ?? null;
        }

        const coordinates =
          latitude != null && longitude != null
            ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
            : "-";

        // Get amanah name
        const team = inst.teamId ? teamsMap.get(inst.teamId) : undefined;
        const teamName = team?.name || "";
        const amanahName = translateTeamNameToArabic(teamName) || teamName || "-";

        // Get municipality name
        const location = locationsMap.get(locationId);
        const municipalityName = location?.municipalityName || "-";

        // Get installer name
        const installerName = inst.installedByName || "-";

        // Get sensor reading (user entered by installer)
        const sensorReading = inst.sensorReading != null ? inst.sensorReading.toString() : "-";

        rows.push([
          inst.deviceId,
          locationId || "-",
          coordinates,
          amanahName,
          municipalityName,
          installerName,
          sensorReading,
        ]);
      });

      // Create CSV
      const headers = [
        "Device ID",
        "Location ID",
        "Coordinates",
        "Amanah Name",
        "Municipality Name",
        "Installer Name",
        "Sensor Reading",
      ];
      const csvRows = [headers, ...rows];
      const csvContent = csvRows
        .map((row) =>
          row
            .map((val) => `"${(val ?? "").replace(/"/g, '""')}"`)
            .join(",")
        )
        .join("\r\n");

      const blob = new Blob(["\ufeff", csvContent], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      link.setAttribute(
        "download",
        `sensor-reading-range-${minSensorReading || "min"}-${maxSensorReading || "max"}-${dateStr}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Export Successful",
        description: `Exported ${filteredInstallations.length} devices to CSV.`,
      });

      setSensorRangeDialogOpen(false);
      setMinSensorReading("");
      setMaxSensorReading("");
    } catch (e) {
      console.error("Failed to export sensor reading range CSV:", e);
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: e instanceof Error ? e.message : "Failed to export data. Please try again.",
      });
    } finally {
      setLoadingSensorRange(false);
    }
  };

  const handleVarianceFilterExport = async () => {
    if (!selectedTeamId) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please select a team.",
      });
      return;
    }

    if (!varianceThreshold || isNaN(parseFloat(varianceThreshold))) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please enter a valid variance threshold.",
      });
      return;
    }

    const threshold = parseFloat(varianceThreshold);
    if (threshold < 0) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Variance threshold must be a positive number.",
      });
      return;
    }

    // Parse device IDs from input (split by newline, comma, or space)
    const deviceIdsList = deviceIdsInput
      .split(/[\n,\s]+/)
      .map(id => id.trim().toUpperCase())
      .filter(id => id.length > 0);

    if (deviceIdsList.length === 0) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please paste at least one device ID.",
      });
      return;
    }

    setLoadingVarianceFilter(true);
    try {
      // Fetch all required data
      const [installationsSnap, teamsSnap, locationsSnap] = await Promise.all([
        getDocs(collection(db, "installations")),
        getDocs(collection(db, "teams")),
        getDocs(collection(db, "locations")),
      ]);

      // Create maps for quick lookup
      const teamsMap = new Map<string, Team>();
      teamsSnap.forEach((doc) => {
        teamsMap.set(doc.id, { id: doc.id, ...doc.data() } as Team);
      });

      const locationsMap = new Map<
        string,
        { latitude: number; longitude: number; municipalityName?: string }
      >();
      locationsSnap.forEach((d) => {
        const data: any = d.data();
        const rawId: string = data.locationId || d.id;
        const lat =
          typeof data.latitude === "number"
            ? data.latitude
            : data.latitude
            ? parseFloat(String(data.latitude))
            : null;
        const lon =
          typeof data.longitude === "number"
            ? data.longitude
            : data.longitude
            ? parseFloat(String(data.longitude))
            : null;
        if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) return;
        const idKey = String(rawId).trim();
        locationsMap.set(idKey, {
          latitude: lat,
          longitude: lon,
          municipalityName: data.municipalityName,
        });
        // Also add numeric key variant if applicable
        if (/^\d+$/.test(idKey)) {
          const numKey = String(Number(idKey)).trim();
          if (numKey !== idKey) {
            locationsMap.set(numKey, {
              latitude: lat,
              longitude: lon,
              municipalityName: data.municipalityName,
            });
          }
        }
      });

      // Filter installations by team, device IDs, and variance
      const filteredInstallations: Array<{
        installation: Installation;
        variance: number;
        sensorHeight: number;
        serverHeight: number | null;
      }> = [];

      installationsSnap.forEach((doc) => {
        const data = doc.data() as Installation;
        
        // Filter by team
        if (data.teamId !== selectedTeamId) return;
        
        // Filter by device IDs
        const deviceIdUpper = (data.deviceId || "").toUpperCase().trim();
        if (!deviceIdsList.includes(deviceIdUpper)) return;
        
        // Check if we have both sensor reading and server data
        const sensorHeight = data.sensorReading;
        const serverHeight = data.latestDisCm;
        
        if (sensorHeight == null || sensorHeight <= 0) return;
        if (serverHeight == null || serverHeight <= 0) return;
        
        // Calculate variance percentage
        const variance = (Math.abs(serverHeight - sensorHeight) / sensorHeight) * 100;
        
        // Filter by variance threshold
        if (variance <= threshold) return;
        
        filteredInstallations.push({
          installation: {
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate?.() || data.createdAt,
            updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
            verifiedAt: data.verifiedAt?.toDate?.() || data.verifiedAt,
          },
          variance,
          sensorHeight,
          serverHeight,
        });
      });

      if (filteredInstallations.length === 0) {
        toast({
          title: "No Data Found",
          description: `No devices found matching the criteria (team, variance > ${threshold}%, and device IDs).`,
        });
        setLoadingVarianceFilter(false);
        return;
      }

      // Generate CSV rows
      const rows: string[][] = [];
      filteredInstallations.forEach((item, index) => {
        const inst = item.installation;
        const locationId = inst.locationId ? String(inst.locationId).trim() : "";
        const isLocation9999 = locationId === "9999";

        // Get coordinates
        let latitude: number | null = null;
        let longitude: number | null = null;
        if (isLocation9999) {
          // For location 9999, use user-entered coordinates
          latitude = inst.latitude ?? null;
          longitude = inst.longitude ?? null;
        } else {
          // For other locations, use coordinates from locations collection
          const location = locationsMap.get(locationId);
          latitude = location?.latitude ?? null;
          longitude = location?.longitude ?? null;
        }

        const coordinates =
          latitude != null && longitude != null
            ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
            : "-";

        // Get amanah name
        const team = inst.teamId ? teamsMap.get(inst.teamId) : undefined;
        const teamName = team?.name || "";
        const amanahName = translateTeamNameToArabic(teamName) || teamName || "-";

        // Get municipality name
        const location = locationsMap.get(locationId);
        const municipalityName = location?.municipalityName || "-";

        rows.push([
          (index + 1).toString(), // Serial No
          locationId || "-", // Location ID
          coordinates, // Coordinates
          inst.deviceId, // Device ID
          amanahName, // Amanah
          municipalityName, // Municipality
          item.sensorHeight.toString(), // Sensor Height
          item.serverHeight?.toString() || "-", // Server Height
          item.variance.toFixed(2) + "%", // Variance
        ]);
      });

      // Create CSV
      const headers = [
        "Serial No",
        "Location ID",
        "Coordinates",
        "Device ID",
        "Amanah",
        "Municipality",
        "Sensor Height",
        "Server Height",
        "Variance",
      ];
      const csvRows = [headers, ...rows];
      const csvContent = csvRows
        .map((row) =>
          row
            .map((val) => `"${(val ?? "").replace(/"/g, '""')}"`)
            .join(",")
        )
        .join("\r\n");

      const blob = new Blob(["\ufeff", csvContent], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      link.setAttribute(
        "download",
        `variance-filter-team-${selectedTeamId}-threshold-${threshold}-${dateStr}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Export Successful",
        description: `Exported ${filteredInstallations.length} devices to CSV.`,
      });

      setVarianceFilterDialogOpen(false);
      setSelectedTeamId("");
      setVarianceThreshold("");
      setDeviceIdsInput("");
    } catch (e) {
      console.error("Failed to export variance filter CSV:", e);
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: e instanceof Error ? e.message : "Failed to export data. Please try again.",
      });
    } finally {
      setLoadingVarianceFilter(false);
    }
  };

  // Redirect installers to their installation page
  useEffect(() => {
    if (userProfile?.role === "installer") {
      setLocation("/new-installation");
    }
  }, [userProfile, setLocation]);

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

  // Fetch all teams for admin (for variance filter)
  useEffect(() => {
    if (!userProfile?.isAdmin) return;

    const unsubscribe = onSnapshot(collection(db, "teams"), (snapshot) => {
      const teamsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate(),
      })) as Team[];
      teamsData.sort((a, b) => a.name.localeCompare(b.name));
      setTeams(teamsData);
    });

    return () => unsubscribe();
  }, [userProfile?.isAdmin]);

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
                : userProfile.role === "manager"
                ? "Manager Dashboard - Monitor & analyze"
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
                onClick={handleDeviceLocationCsv}
              >
                <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mr-4">
                  <FileDown className="h-6 w-6 text-slate-600 dark:text-slate-400" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-lg">Export Device Locations</div>
                  <div className="text-sm text-muted-foreground">Device ID + user & mapped coordinates</div>
                </div>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-6 justify-start hover:bg-accent transition-all group"
                onClick={() => setSensorRangeDialogOpen(true)}
              >
                <div className="h-12 w-12 rounded-xl bg-orange-100 dark:bg-orange-950 flex items-center justify-center mr-4">
                  <Gauge className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-lg">Filter by Sensor Reading Range</div>
                  <div className="text-sm text-muted-foreground">Export devices by sensor reading range</div>
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
              <Button 
                variant="outline" 
                className="h-auto py-6 justify-start hover:bg-accent transition-all group"
                onClick={() => setVarianceFilterDialogOpen(true)}
              >
                <div className="h-12 w-12 rounded-xl bg-red-100 dark:bg-red-950 flex items-center justify-center mr-4">
                  <Gauge className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-lg">Filter by Variance & Device IDs</div>
                  <div className="text-sm text-muted-foreground">Export devices by team, variance threshold, and device IDs</div>
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

          {/* Manager Actions */}
          {userProfile.role === "manager" && !userProfile.isAdmin && (
            <>
              <Button 
                variant="outline" 
                className="h-auto py-6 justify-start hover:bg-accent transition-all group"
                onClick={() => setLocation("/devices")}
              >
                <div className="h-12 w-12 rounded-xl bg-purple-100 dark:bg-purple-950 flex items-center justify-center mr-4">
                  <Shield className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-lg">Master Device List</div>
                  <div className="text-sm text-muted-foreground">View consolidated data</div>
                </div>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-6 justify-start hover:bg-accent transition-all group"
                onClick={() => setLocation("/verification")}
              >
                <div className="h-12 w-12 rounded-xl bg-green-100 dark:bg-green-950 flex items-center justify-center mr-4">
                  <Users className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-lg">Verification Status</div>
                  <div className="text-sm text-muted-foreground">Monitor quality metrics</div>
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

      {/* Sensor Reading Range Filter Dialog */}
      <Dialog open={sensorRangeDialogOpen} onOpenChange={setSensorRangeDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Filter by Sensor Reading Range</DialogTitle>
            <DialogDescription>
              Enter a range of sensor readings to export device data. Leave either field empty to search from/to that value.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="min-reading">Minimum Sensor Reading</Label>
              <Input
                id="min-reading"
                type="number"
                placeholder="e.g., 100"
                value={minSensorReading}
                onChange={(e) => setMinSensorReading(e.target.value)}
                disabled={loadingSensorRange}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to search from any minimum value
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-reading">Maximum Sensor Reading</Label>
              <Input
                id="max-reading"
                type="number"
                placeholder="e.g., 500"
                value={maxSensorReading}
                onChange={(e) => setMaxSensorReading(e.target.value)}
                disabled={loadingSensorRange}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to search up to any maximum value
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSensorRangeDialogOpen(false);
                setMinSensorReading("");
                setMaxSensorReading("");
              }}
              disabled={loadingSensorRange}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSensorReadingRangeExport}
              disabled={loadingSensorRange}
            >
              {loadingSensorRange ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <FileDown className="h-4 w-4 mr-2" />
                  Export CSV
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Variance Filter Dialog */}
      <Dialog open={varianceFilterDialogOpen} onOpenChange={setVarianceFilterDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Filter by Variance & Device IDs</DialogTitle>
            <DialogDescription>
              Select a team, enter a variance threshold, and paste device IDs to export matching devices.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="team-select">Team</Label>
              <Select
                value={selectedTeamId}
                onValueChange={setSelectedTeamId}
                disabled={loadingVarianceFilter}
              >
                <SelectTrigger id="team-select">
                  <SelectValue placeholder="Select a team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="variance-threshold">Variance Threshold (%)</Label>
              <Input
                id="variance-threshold"
                type="number"
                placeholder="e.g., 10"
                value={varianceThreshold}
                onChange={(e) => setVarianceThreshold(e.target.value)}
                disabled={loadingVarianceFilter}
                min="0"
                step="0.1"
              />
              <p className="text-xs text-muted-foreground">
                Only devices with variance above this threshold will be exported
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="device-ids">Device IDs</Label>
              <Textarea
                id="device-ids"
                placeholder="Paste device IDs here (one per line, or separated by commas)"
                value={deviceIdsInput}
                onChange={(e) => setDeviceIdsInput(e.target.value)}
                disabled={loadingVarianceFilter}
                rows={6}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Paste device IDs separated by newlines, commas, or spaces
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setVarianceFilterDialogOpen(false);
                setSelectedTeamId("");
                setVarianceThreshold("");
                setDeviceIdsInput("");
              }}
              disabled={loadingVarianceFilter}
            >
              Cancel
            </Button>
            <Button
              onClick={handleVarianceFilterExport}
              disabled={loadingVarianceFilter}
            >
              {loadingVarianceFilter ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <FileDown className="h-4 w-4 mr-2" />
                  Export CSV
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
