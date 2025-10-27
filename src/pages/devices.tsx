import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, query, orderBy, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Loader2, AlertCircle, Filter, X, FileUp, Package, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import { useLocation } from "wouter";
import type { Device, Installation, ServerData } from "@/lib/types";

interface DeviceWithDetails extends Device {
  installation?: Installation;
  serverData?: ServerData;
}

const statusConfig = {
  pending: { label: "Pending", icon: Clock, color: "text-yellow-600 bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800" },
  installed: { label: "Installed", icon: Package, color: "text-blue-600 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800" },
  verified: { label: "Verified", icon: CheckCircle, color: "text-green-600 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800" },
  flagged: { label: "Flagged", icon: AlertTriangle, color: "text-red-600 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800" },
};

export default function Devices() {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [devices, setDevices] = useState<DeviceWithDetails[]>([]);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [serverDataList, setServerDataList] = useState<ServerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [cityFilter, setCityFilter] = useState<string>("all");

  // Real-time devices listener
  useEffect(() => {
    if (!userProfile?.isAdmin && userProfile?.role !== "verifier") return;

    const unsubscribe = onSnapshot(
      collection(db, "devices"),
      (snapshot) => {
        const devicesData = snapshot.docs.map(doc => ({
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate(),
          updatedAt: doc.data().updatedAt?.toDate(),
        })) as Device[];
        
        // Sort in JavaScript to avoid index requirement
        devicesData.sort((a, b) => {
          if (!a.createdAt || !b.createdAt) return 0;
          return b.createdAt.getTime() - a.createdAt.getTime();
        });
        
        setDevices(devicesData);
        setLoading(false);
      },
      (error) => {
        toast({
          variant: "destructive",
          title: "Failed to load devices",
          description: error.message,
        });
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userProfile, toast]);

  // Real-time installations listener
  useEffect(() => {
    if (!userProfile?.isAdmin && userProfile?.role !== "verifier") return;

    const unsubscribe = onSnapshot(
      collection(db, "installations"),
      (snapshot) => {
        const installationsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate(),
          updatedAt: doc.data().updatedAt?.toDate(),
          verifiedAt: doc.data().verifiedAt?.toDate(),
        })) as Installation[];
        setInstallations(installationsData);
      },
      (error) => {
        console.error("Failed to load installations:", error);
      }
    );

    return () => unsubscribe();
  }, [userProfile]);

  // Real-time server data listener
  useEffect(() => {
    if (!userProfile?.isAdmin && userProfile?.role !== "verifier") return;

    const unsubscribe = onSnapshot(
      collection(db, "serverData"),
      (snapshot) => {
        const serverData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate(),
          receivedAt: doc.data().receivedAt?.toDate(),
        })) as ServerData[];
        setServerDataList(serverData);
      },
      (error) => {
        console.error("Failed to load server data:", error);
      }
    );

    return () => unsubscribe();
  }, [userProfile]);

  // Merge devices with installation and server data
  const devicesWithDetails = useMemo(() => {
    return devices.map(device => {
      const installation = installations.find(inst => inst.deviceId === device.id);
      const serverData = serverDataList.find(sd => sd.deviceId === device.id);
      return { ...device, installation, serverData };
    });
  }, [devices, installations, serverDataList]);

  // Get unique cities for filter
  const uniqueCities = useMemo(() => {
    const cities = new Set(devices.map(d => d.cityOfDispatch).filter(Boolean));
    return Array.from(cities).sort();
  }, [devices]);

  // Filter devices
  const filteredDevices = useMemo(() => {
    return devicesWithDetails.filter(device => {
      const matchesSearch = searchTerm === "" ||
        device.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        device.batchId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        device.manufacturer.toLowerCase().includes(searchTerm.toLowerCase()) ||
        device.description.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === "all" || device.status === statusFilter;
      const matchesCity = cityFilter === "all" || device.cityOfDispatch === cityFilter;

      return matchesSearch && matchesStatus && matchesCity;
    });
  }, [devicesWithDetails, searchTerm, statusFilter, cityFilter]);

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setCityFilter("all");
  };

  const hasActiveFilters = searchTerm !== "" || statusFilter !== "all" || cityFilter !== "all";

  // Stats
  const stats = useMemo(() => {
    return {
      total: devices.length,
      pending: devices.filter(d => d.status === "pending").length,
      installed: devices.filter(d => d.status === "installed").length,
      verified: devices.filter(d => d.status === "verified").length,
      flagged: devices.filter(d => d.status === "flagged").length,
    };
  }, [devices]);

  if (!userProfile?.isAdmin && userProfile?.role !== "verifier") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">Only administrators and verifiers can view the master device list.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
            Master Device List
          </h1>
          <p className="text-muted-foreground mt-2">Manage and track all IoT devices</p>
        </div>
        {userProfile?.isAdmin && (
          <Button onClick={() => setLocation("/device-import")}>
            <FileUp className="h-4 w-4 mr-2" />
            Import Devices
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="border shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground font-medium">Total Devices</p>
              <p className="text-3xl font-bold mt-1">{stats.total}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground font-medium">Pending</p>
              <p className="text-3xl font-bold mt-1 text-yellow-600">{stats.pending}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground font-medium">Installed</p>
              <p className="text-3xl font-bold mt-1 text-blue-600">{stats.installed}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground font-medium">Verified</p>
              <p className="text-3xl font-bold mt-1 text-green-600">{stats.verified}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground font-medium">Flagged</p>
              <p className="text-3xl font-bold mt-1 text-red-600">{stats.flagged}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filters */}
      <Card className="border shadow-sm">
        <CardContent className="p-6 space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by Device ID, Batch ID, Manufacturer, or Description..."
              className="pl-10 h-12"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Filters Row */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Filters:</span>
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="installed">Installed</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="flagged">Flagged</SelectItem>
              </SelectContent>
            </Select>

            {/* City Filter */}
            <Select value={cityFilter} onValueChange={setCityFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Cities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cities</SelectItem>
                {uniqueCities.map((city) => (
                  <SelectItem key={city} value={city}>
                    {city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Clear Filters Button */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="gap-1"
              >
                <X className="h-4 w-4" />
                Clear Filters
              </Button>
            )}

            {/* Results Count */}
            <div className="ml-auto text-sm text-muted-foreground">
              {filteredDevices.length} of {devices.length} devices
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Devices Table */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Devices ({filteredDevices.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device ID</TableHead>
                  <TableHead>Batch ID</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Manufacturer</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Installed By</TableHead>
                  <TableHead>Location ID</TableHead>
                  <TableHead>Sensor Reading</TableHead>
                  <TableHead>Server Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDevices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      No devices found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDevices.map((device) => {
                    const config = statusConfig[device.status];
                    const Icon = config.icon;
                    
                    return (
                      <TableRow key={device.id}>
                        <TableCell className="font-mono font-medium">{device.id}</TableCell>
                        <TableCell>{device.batchId}</TableCell>
                        <TableCell>{device.cityOfDispatch}</TableCell>
                        <TableCell>{device.manufacturer}</TableCell>
                        <TableCell className="max-w-xs truncate">{device.description}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={config.color}>
                            <Icon className="h-3 w-3 mr-1" />
                            {config.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {device.installation?.installedByName || "-"}
                        </TableCell>
                        <TableCell>
                          {device.installation?.locationId || "-"}
                        </TableCell>
                        <TableCell>
                          {device.installation?.sensorReading ?? "-"}
                        </TableCell>
                        <TableCell>
                          {device.serverData?.sensorData ?? "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

