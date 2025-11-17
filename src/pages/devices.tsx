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
  const [productFilter, setProductFilter] = useState<string>("all");

  // Real-time devices listener (admin only)
  useEffect(() => {
    if (!userProfile?.isAdmin) return;
    const devicesQuery = collection(db, "devices");

    const unsubscribe = onSnapshot(
      devicesQuery as any,
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

  // Real-time installations listener (admin only)
  useEffect(() => {
    if (!userProfile?.isAdmin) return;
    const installationsQuery = collection(db, "installations");

    const unsubscribe = onSnapshot(
      installationsQuery as any,
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

  // Real-time server data listener (admin only)
  useEffect(() => {
    if (!userProfile?.isAdmin) return;
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

  // Get unique product IDs for filter
  const uniqueProductIds = useMemo(() => {
    const productIds = new Set(devices.map(d => d.productId).filter(Boolean));
    return Array.from(productIds).sort();
  }, [devices]);

  // Filter devices
  const filteredDevices = useMemo(() => {
    return devicesWithDetails.filter(device => {
      const matchesSearch = searchTerm === "" ||
        device.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        device.productId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        device.deviceSerialId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        device.deviceImei.toLowerCase().includes(searchTerm.toLowerCase()) ||
        device.iccid.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === "all" || device.status === statusFilter;
      const matchesProduct = productFilter === "all" || device.productId === productFilter;

      return matchesSearch && matchesStatus && matchesProduct;
    });
  }, [devicesWithDetails, searchTerm, statusFilter, productFilter]);

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setProductFilter("all");
  };

  const hasActiveFilters = searchTerm !== "" || statusFilter !== "all" || productFilter !== "all";

  // Stats
  const stats = useMemo(() => {
    // Count installations by status
    const totalInstallations = installations.length;
    const pendingSubmissions = installations.filter(inst => inst.status === "pending").length;
    const verifiedSubmissions = installations.filter(inst => inst.status === "verified").length;
    const flaggedSubmissions = installations.filter(inst => inst.status === "flagged").length;
    // Remaining Devices = total devices - total installation submissions
    const remainingDevices = devices.length - totalInstallations;
    
    return {
      total: devices.length,
      pendingSubmissions,
      totalInstallations,
      verifiedSubmissions,
      flaggedSubmissions,
      remainingDevices,
    };
  }, [devices, installations]);

  // Admin-only access gate
  if (!userProfile?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">Only administrators can view the master device list.</p>
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
      {/* Shipment Header */}
      <Card className="border-2 border-primary/20 bg-primary/5 dark:bg-primary/10">
        <CardContent className="p-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-primary mb-1">Shipment No#1</h2>
            <p className="text-lg font-semibold text-slate-700 dark:text-slate-300">Project: MOMAH</p>
          </div>
        </CardContent>
      </Card>

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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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
              <p className="text-sm text-muted-foreground font-medium">Pending Submissions</p>
              <p className="text-3xl font-bold mt-1 text-yellow-600">{stats.pendingSubmissions}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground font-medium">Total Installation Submissions</p>
              <p className="text-3xl font-bold mt-1 text-blue-600">{stats.totalInstallations}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground font-medium">Verified Submissions</p>
              <p className="text-3xl font-bold mt-1 text-green-600">{stats.verifiedSubmissions}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground font-medium">Flagged Submissions</p>
              <p className="text-3xl font-bold mt-1 text-red-600">{stats.flaggedSubmissions}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground font-medium">Remaining Devices</p>
              <p className="text-3xl font-bold mt-1 text-slate-600">{stats.remainingDevices}</p>
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
              placeholder="Search by Device UID, Product ID, Serial ID, IMEI, or ICCID..."
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

            {/* Product Filter */}
            <Select value={productFilter} onValueChange={setProductFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Products" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Products</SelectItem>
                {uniqueProductIds.map((productId) => (
                  <SelectItem key={productId} value={productId}>
                    {productId}
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
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="px-2 py-2 w-[100px]">
                    <div className="truncate">Device UID</div>
                  </TableHead>
                  <TableHead className="px-2 py-2 w-[70px]">
                    <div className="truncate">Box</div>
                  </TableHead>
                  <TableHead className="px-2 py-2 w-[80px]">
                    <div className="truncate">Product</div>
                  </TableHead>
                  <TableHead className="px-2 py-2 w-[140px]">
                    <div className="truncate">Serial ID</div>
                  </TableHead>
                  <TableHead className="px-2 py-2 w-[110px]">
                    <div className="truncate">IMEI</div>
                  </TableHead>
                  <TableHead className="px-2 py-2 w-[120px]">
                    <div className="truncate">ICCID</div>
                  </TableHead>
                  <TableHead className="px-2 py-2 w-[100px]">
                    <div className="truncate">Timestamp</div>
                  </TableHead>
                  <TableHead className="px-2 py-2 w-[90px]">Status</TableHead>
                  <TableHead className="px-2 py-2 w-[100px]">
                    <div className="truncate">Installed By</div>
                  </TableHead>
                  <TableHead className="px-2 py-2 w-[80px]">
                    <div className="truncate">Location</div>
                  </TableHead>
                  <TableHead className="px-2 py-2 w-[70px]">
                    <div className="truncate">Sensor</div>
                  </TableHead>
                  <TableHead className="px-2 py-2 w-[70px]">
                    <div className="truncate">Server</div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDevices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                      No devices found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDevices.map((device) => {
                    const config = statusConfig[device.status];
                    const Icon = config.icon;
                    
                    return (
                      <TableRow key={device.id} className="text-xs">
                        <TableCell className="px-2 py-2 font-mono font-medium">
                          <div className="truncate max-w-[100px]" title={device.id}>
                            {device.id}
                          </div>
                        </TableCell>
                        <TableCell className="px-2 py-2">
                          <div className="truncate max-w-[70px]" title={device.boxNumber || "-"}>
                            {device.boxNumber || "-"}
                          </div>
                        </TableCell>
                        <TableCell className="px-2 py-2">
                          <div className="truncate max-w-[80px]" title={device.productId}>
                            {device.productId}
                          </div>
                        </TableCell>
                        <TableCell className="px-2 py-2 font-mono">
                          <div className="truncate max-w-[140px]" title={device.deviceSerialId}>
                            {device.deviceSerialId}
                          </div>
                        </TableCell>
                        <TableCell className="px-2 py-2 font-mono">
                          <div className="truncate max-w-[110px]" title={device.deviceImei}>
                            {device.deviceImei}
                          </div>
                        </TableCell>
                        <TableCell className="px-2 py-2 font-mono">
                          <div className="truncate max-w-[120px]" title={device.iccid}>
                            {device.iccid}
                          </div>
                        </TableCell>
                        <TableCell className="px-2 py-2 text-muted-foreground">
                          <div className="truncate max-w-[100px]" title={device.timestamp || "-"}>
                            {device.timestamp ? device.timestamp.split(' ')[0] : "-"}
                          </div>
                        </TableCell>
                        <TableCell className="px-2 py-2">
                          <Badge variant="outline" className={`${config.color} text-[10px] px-1.5 py-0.5`}>
                            <Icon className="h-2.5 w-2.5 mr-0.5" />
                            {config.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-2 py-2">
                          <div className="truncate max-w-[100px]" title={device.installation?.installedByName || "-"}>
                            {device.installation?.installedByName || "-"}
                          </div>
                        </TableCell>
                        <TableCell className="px-2 py-2">
                          <div className="truncate max-w-[80px]" title={device.installation?.locationId || "-"}>
                            {device.installation?.locationId || "-"}
                          </div>
                        </TableCell>
                        <TableCell className="px-2 py-2">
                          <div className="truncate max-w-[70px]" title={String(device.installation?.sensorReading ?? "-")}>
                            {device.installation?.sensorReading ?? "-"}
                          </div>
                        </TableCell>
                        <TableCell className="px-2 py-2">
                          <div className="truncate max-w-[70px]" title={String(device.serverData?.sensorData ?? "-")}>
                            {device.serverData?.sensorData ?? "-"}
                          </div>
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

