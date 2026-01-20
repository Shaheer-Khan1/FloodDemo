import { useState, useEffect, useMemo, useCallback } from "react";

// Custom debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
import { collection, onSnapshot, query, orderBy, doc, updateDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { getInstallationsCollection, getDevicesCollection, isSmartLPGUser } from "@/lib/user-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Search, Loader2, AlertCircle, Filter, X, FileUp, Package, CheckCircle, Clock, AlertTriangle, Download } from "lucide-react";
import { useLocation } from "wouter";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import type { Device, Installation, ServerData } from "@/lib/types";

interface DeviceWithDetails extends Device {
  installation?: Installation;
  serverData?: ServerData;
}

const statusConfig: Record<string, { label: string; icon: any; color: string }> = {
  pending: { label: "Pending", icon: Clock, color: "text-yellow-600 bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800" },
  installed: { label: "Installed", icon: Package, color: "text-blue-600 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800" },
  verified: { label: "Verified", icon: CheckCircle, color: "text-green-600 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800" },
  flagged: { label: "Flagged", icon: AlertTriangle, color: "text-red-600 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800" },
  unknown: { label: "Unknown", icon: AlertCircle, color: "text-gray-600 bg-gray-50 dark:bg-gray-950/20 border-gray-200 dark:border-gray-800" },
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
  const isLPGUser = isSmartLPGUser(auth.currentUser);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [productFilter, setProductFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [deviceUidsFilter, setDeviceUidsFilter] = useState<string>("");
  const [boxFilter, setBoxFilter] = useState<string>("all");
  const [displayLimit, setDisplayLimit] = useState(500);
  
  // Debounce filters for smooth performance
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const debouncedDeviceUidsFilter = useDebounce(deviceUidsFilter, 300);

  // Real-time devices listener (admin only)
  useEffect(() => {
    if (!userProfile?.isAdmin) return;
    const devicesCollectionName = getDevicesCollection(auth.currentUser);
    const devicesQuery = collection(db, devicesCollectionName);

    const unsubscribe = onSnapshot(
      devicesQuery as any,
      (snapshot) => {
        const devicesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate(),
          updatedAt: doc.data().updatedAt?.toDate(),
        })) as Device[];
        
        // Debug: Log first device to see actual structure
        if (devicesData.length > 0 && isLPGUser) {
          console.log('📊 Smart LPG Device Sample:', devicesData[0]);
          console.log('📊 Available fields:', Object.keys(devicesData[0]));
        }
        
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
    const installationsCollectionName = getInstallationsCollection(auth.currentUser);
    const installationsQuery = collection(db, installationsCollectionName);

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
        
        // Debug: Log first installation to see actual structure
        if (installationsData.length > 0 && isLPGUser) {
          console.log('📋 Smart LPG Installation Sample:', installationsData[0]);
          console.log('📋 Available installation fields:', Object.keys(installationsData[0]));
        }
        
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

  // Create lookup maps for O(1) performance instead of O(n) .find()
  const installationMap = useMemo(() => {
    const map = new Map<string, Installation>();
    installations.forEach(inst => {
      if (inst.deviceId) {
        map.set(inst.deviceId, inst);
      }
    });
    return map;
  }, [installations]);

  const serverDataMap = useMemo(() => {
    const map = new Map<string, ServerData>();
    serverDataList.forEach(sd => {
      if (sd.deviceId) {
        map.set(sd.deviceId, sd);
      }
    });
    return map;
  }, [serverDataList]);

  // Merge devices with installation and server data using Maps for O(1) lookups
  const devicesWithDetails = useMemo(() => {
    return devices.map(device => {
      const installation = installationMap.get(device.id);
      const serverData = serverDataMap.get(device.id);
      return { ...device, installation, serverData };
    });
  }, [devices, installationMap, serverDataMap]);

  // Get unique product IDs for filter
  const uniqueProductIds = useMemo(() => {
    const productIds = new Set(devices.map(d => d.productId).filter(Boolean));
    return Array.from(productIds).sort();
  }, [devices]);

  // Get unique box identifiers (final boxNumber or fallback to boxCode)
  const uniqueBoxes = useMemo(() => {
    const boxes = new Set(
      devices
        .map(d => d.boxNumber || d.boxCode)
        .filter((b): b is string => !!b)
    );
    return Array.from(boxes).sort();
  }, [devices]);

  // Filter and sort devices (using debounced values for smooth performance)
  const filteredDevices = useMemo(() => {
    const filtered = devicesWithDetails.filter(device => {
      // Device UIDs filter (if active, only show devices in the list)
      let matchesDeviceUids = true;
      if (debouncedDeviceUidsFilter.trim()) {
        const deviceUidsList = debouncedDeviceUidsFilter
          .split('\n')
          .map(uid => uid.trim().toUpperCase())
          .filter(uid => uid.length > 0);
        
        if (deviceUidsList.length > 0) {
          matchesDeviceUids = deviceUidsList.includes(device.id.toUpperCase());
        }
      }

      const matchesSearch = debouncedSearchTerm === "" ||
        device.id.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        device.productId.toLowerCase().includes(debouncedSearchTerm.toLowerCase());

      // Status filter - handle "not_installed" as special case
      let matchesStatus = true;
      if (statusFilter === "all") {
        matchesStatus = true;
      } else if (statusFilter === "not_installed") {
        matchesStatus = !device.installation; // No installation exists
      } else {
        matchesStatus = device.status === statusFilter;
      }
      
      const matchesProduct = productFilter === "all" || device.productId === productFilter;

      const deviceBox = device.boxNumber || device.boxCode || "";
      const matchesBox = boxFilter === "all" || (deviceBox && deviceBox === boxFilter);

      // Apply date filter (filter by installation date)
      let matchesDate = true;
      if (dateFilter) {
        if (!device.installation?.createdAt) {
          matchesDate = false; // No installation, exclude if date filter is active
        } else {
          const filterDate = new Date(dateFilter);
          filterDate.setHours(0, 0, 0, 0);
          const nextDay = new Date(filterDate);
          nextDay.setDate(nextDay.getDate() + 1);
          
          const installDate = new Date(device.installation.createdAt);
          installDate.setHours(0, 0, 0, 0);
          matchesDate = installDate >= filterDate && installDate < nextDay;
        }
      }

      return matchesDeviceUids && matchesSearch && matchesStatus && matchesProduct && matchesDate && matchesBox;
    });
    
    // Sort by creation date (newest first) - only sort filtered results for better performance
    filtered.sort((a, b) => {
      if (!a.createdAt || !b.createdAt) return 0;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    
    return filtered;
  }, [devicesWithDetails, debouncedDeviceUidsFilter, debouncedSearchTerm, statusFilter, productFilter, dateFilter, boxFilter]);
  
  // Reset display limit when filters change
  useEffect(() => {
    setDisplayLimit(500);
  }, [debouncedSearchTerm, debouncedDeviceUidsFilter, statusFilter, productFilter, dateFilter, boxFilter]);

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setProductFilter("all");
    setBoxFilter("all");
    setDateFilter("");
    setDeviceUidsFilter("");
    setDisplayLimit(500);
  };

  const hasActiveFilters =
    searchTerm !== "" ||
    statusFilter !== "all" ||
    productFilter !== "all" ||
    boxFilter !== "all" ||
    dateFilter !== "" ||
    deviceUidsFilter.trim() !== "";

  // Limit displayed devices for performance
  const displayedDevices = useMemo(() => {
    return filteredDevices.slice(0, displayLimit);
  }, [filteredDevices, displayLimit]);

  const handleShowMore = useCallback(() => {
    setDisplayLimit(prev => prev + 500);
  }, []);

  const downloadDeviceUidsCSV = () => {
    try {
      // Create CSV with only device UIDs
      const csvRows: string[][] = [];
      
      filteredDevices.forEach((device, index) => {
        csvRows.push([
          (index + 1).toString(), // Serial No
          device.id, // Device UID
        ]);
      });

      // Create CSV
      const headers = ["Serial No", "Device UID"];
      const allRows = [headers, ...csvRows];
      const csvContent = allRows
        .map((row) =>
          row
            .map((value) => {
              const safeValue = value ?? "";
              return `"${safeValue.replace(/"/g, '""')}"`;
            })
            .join(",")
        )
        .join("\r\n");

      const blob = new Blob(["\ufeff", csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      link.setAttribute("download", `device-uids-${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Export Complete",
        description: `Exported ${csvRows.length} device UID(s) successfully.`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: error.message || "An error occurred during export.",
      });
    }
  };

  // Stats - optimized to use single loop instead of multiple filters
  const stats = useMemo(() => {
    // Single pass through installations for all stats
    let pendingSubmissions = 0;
    let verifiedSubmissions = 0;
    let flaggedSubmissions = 0;
    const deviceIdsWithInstallations = new Set<string>();
    
    installations.forEach(inst => {
      if (inst.status === "pending") pendingSubmissions++;
      else if (inst.status === "verified") verifiedSubmissions++;
      else if (inst.status === "flagged") flaggedSubmissions++;
      
      if (inst.deviceId) deviceIdsWithInstallations.add(inst.deviceId);
    });
    
    const uniqueDevicesInstalled = deviceIdsWithInstallations.size;
    const remainingDevices = devices.length - uniqueDevicesInstalled;
    
    return {
      total: devices.length,
      pendingSubmissions,
      totalInstallations: installations.length,
      verifiedSubmissions,
      flaggedSubmissions,
      remainingDevices,
      uniqueDevicesInstalled,
    };
  }, [devices.length, installations]);

  const dataIntegrity = useMemo(() => {
    // Build device ID set once
    const deviceIdSet = new Set<string>();
    devices.forEach(device => {
      const normalized = device.id?.trim().toUpperCase();
      if (normalized) deviceIdSet.add(normalized);
    });

    // Group installations by device ID in single pass
    const installationGroups = new Map<string, Installation[]>();
    installations.forEach((installation) => {
      const normalized = installation.deviceId?.trim().toUpperCase();
      if (!normalized) return;
      
      const existing = installationGroups.get(normalized);
      if (existing) {
        existing.push(installation);
      } else {
        installationGroups.set(normalized, [installation]);
      }
    });

    const installationsWithoutDevice: { deviceId: string; installations: Installation[] }[] = [];
    const duplicateInstallations: { deviceId: string; installations: Installation[] }[] = [];

    // Single pass to categorize issues
    installationGroups.forEach((installs, deviceId) => {
      if (!deviceIdSet.has(deviceId)) {
        installationsWithoutDevice.push({ deviceId, installations: installs });
      }
      if (installs.length > 1) {
        duplicateInstallations.push({ deviceId, installations: installs });
      }
    });

    // Sort by count descending
    installationsWithoutDevice.sort((a, b) => b.installations.length - a.installations.length);
    duplicateInstallations.sort((a, b) => b.installations.length - a.installations.length);

    return {
      installationsWithoutDevice,
      duplicateInstallations,
    };
  }, [devices, installations]);

  // Access gate: admins only
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
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={downloadDeviceUidsCSV}
              disabled={filteredDevices.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Download Device UIDs CSV
            </Button>
          <Button onClick={() => setLocation("/device-import")}>
            <FileUp className="h-4 w-4 mr-2" />
            Import Devices
          </Button>
          </div>
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
              <p className="text-xs text-muted-foreground mt-1">({stats.uniqueDevicesInstalled} unique devices)</p>
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
              <p className="text-sm text-muted-foreground font-medium">Not Installed</p>
              <p className="text-3xl font-bold mt-1 text-slate-600">{stats.remainingDevices}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Data Integrity */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            Data Integrity Checks
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {dataIntegrity.installationsWithoutDevice.length === 0 && dataIntegrity.duplicateInstallations.length === 0 ? (
            <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20 p-4 text-sm text-green-700 dark:text-green-300">
              ✅ All installations have matching device records and every device has at most one installation.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm">Installations Without Device</p>
                    <Badge variant="outline" className="text-xs">
                      {dataIntegrity.installationsWithoutDevice.length}
                    </Badge>
                  </div>
                  {dataIntegrity.installationsWithoutDevice.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No orphan installations detected.</p>
                  ) : (
                    <div className="space-y-2">
                      {dataIntegrity.installationsWithoutDevice.slice(0, 5).map((entry) => (
                        <div key={entry.deviceId} className="p-3 border rounded-md">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-mono font-semibold">{entry.deviceId}</span>
                            <Badge variant="secondary" className="text-xs">
                              {entry.installations.length} record{entry.installations.length === 1 ? "" : "s"}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            First seen at location {entry.installations[0]?.locationId || "-"} by {entry.installations[0]?.installedByName || "Unknown"}
                          </p>
                        </div>
                      ))}
                      {dataIntegrity.installationsWithoutDevice.length > 5 && (
                        <p className="text-xs text-muted-foreground text-right">
                          + {dataIntegrity.installationsWithoutDevice.length - 5} more
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm">Duplicate Installations</p>
                    <Badge variant="outline" className="text-xs">
                      {dataIntegrity.duplicateInstallations.length}
                    </Badge>
                  </div>
                  {dataIntegrity.duplicateInstallations.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No duplicate installations detected.</p>
                  ) : (
                    <div className="space-y-2">
                      {dataIntegrity.duplicateInstallations.slice(0, 5).map((entry) => (
                        <div key={entry.deviceId} className="p-3 border rounded-md">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-mono font-semibold">{entry.deviceId}</span>
                            <Badge variant="secondary" className="text-xs">
                              {entry.installations.length} installs
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Latest installer: {entry.installations[entry.installations.length - 1]?.installedByName || "Unknown"} • Location {entry.installations[entry.installations.length - 1]?.locationId || "-"}
                          </p>
                        </div>
                      ))}
                      {dataIntegrity.duplicateInstallations.length > 5 && (
                        <p className="text-xs text-muted-foreground text-right">
                          + {dataIntegrity.duplicateInstallations.length - 5} more
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 p-3 text-xs text-amber-800 dark:text-amber-200">
                Installations listed above reference device IDs that are missing from the master list or appear more than once. Fix them by importing the missing device or cleaning up the extra installation so the dashboard totals align.
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Search & Filters */}
      <Card className="border shadow-sm">
        <CardContent className="p-6 space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by Device UID or Product ID..."
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
                <SelectItem value="not_installed">Not Installed</SelectItem>
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

            {/* Date Filter */}
            <div className="flex items-center gap-2">
              <Label htmlFor="date-filter" className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                Installation Date:
              </Label>
              <Input
                id="date-filter"
                type="date"
                className="w-[180px]"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              />
            </div>

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

          {/* Device UIDs Filter */}
          <div className="pt-4 border-t">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="device-uids-filter" className="text-sm font-semibold">
                  Filter by Specific Device UIDs
                </Label>
                {deviceUidsFilter.trim() && (
                  <Badge variant="secondary" className="text-xs">
                    {deviceUidsFilter.split('\n').filter(uid => uid.trim()).length} UIDs entered
                  </Badge>
                )}
              </div>
              <Textarea
                id="device-uids-filter"
                placeholder="Enter device UIDs, one per line (e.g., E75832989D048709)"
                value={deviceUidsFilter}
                onChange={(e) => setDeviceUidsFilter(e.target.value)}
                className="font-mono text-sm h-24 resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Enter device UIDs (one per line) to show only those devices. Leave empty to show all devices.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Devices Table */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">
            Devices ({displayedDevices.length}{filteredDevices.length > displayLimit ? ` of ${filteredDevices.length}` : ''})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="px-2 py-2 w-[200px]">
                    <div className="truncate">Device UID</div>
                  </TableHead>
                  {!isLPGUser && (
                    <>
                      <TableHead className="px-2 py-2 w-[70px]">
                        <div className="truncate">Box</div>
                      </TableHead>
                      <TableHead className="px-2 py-2 w-[80px]">
                        <div className="truncate">Product</div>
                      </TableHead>
                    </>
                  )}
                  {isLPGUser && (
                    <>
                      <TableHead className="px-2 py-2 w-[120px]">
                        <div className="truncate">Device Type</div>
                      </TableHead>
                      <TableHead className="px-2 py-2 w-[100px]">
                        <div className="truncate">Level (cm)</div>
                      </TableHead>
                      <TableHead className="px-2 py-2 w-[100px]">
                        <div className="truncate">Level (%)</div>
                      </TableHead>
                      <TableHead className="px-2 py-2 w-[80px]">
                        <div className="truncate">Battery (V)</div>
                      </TableHead>
                      <TableHead className="px-2 py-2 w-[80px]">
                        <div className="truncate">Temp (°C)</div>
                      </TableHead>
                      <TableHead className="px-2 py-2 w-[80px]">
                        <div className="truncate">Signal</div>
                      </TableHead>
                    </>
                  )}
                  <TableHead className="px-2 py-2 w-[110px]">
                    <div className="truncate">Created At</div>
                  </TableHead>
                  <TableHead className="px-2 py-2 w-[90px]">Status</TableHead>
                  {!isLPGUser && (
                    <>
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
                    </>
                  )}
                  {isLPGUser && (
                    <>
                      <TableHead className="px-2 py-2 w-[100px]">
                        <div className="truncate">Manufacturer</div>
                      </TableHead>
                      <TableHead className="px-2 py-2 w-[100px]">
                        <div className="truncate">Model</div>
                      </TableHead>
                      <TableHead className="px-2 py-2 w-[100px]">
                        <div className="truncate">IMEI</div>
                      </TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDevices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isLPGUser ? 11 : 9} className="text-center text-muted-foreground py-8">
                      No devices found
                    </TableCell>
                  </TableRow>
                ) : (
                  displayedDevices.map((device) => {
                    // Check if device has an installation
                    const hasInstallation = !!device.installation;
                    const config = statusConfig[device.status] || statusConfig.unknown;
                    const Icon = config.icon;
                    
                    return (
                      <TableRow key={device.id} className="text-xs">
                        {/* Device UID */}
                        <TableCell className="px-2 py-2 font-mono font-medium">
                          <div className="whitespace-nowrap">
                            {isLPGUser ? ((device as any).device_id || device.id) : device.id}
                          </div>
                        </TableCell>

                        {/* Flood Sensor Specific Columns */}
                        {!isLPGUser && (
                          <>
                            <TableCell className="px-2 py-2 text-xs">
                              {(() => {
                                const original = device.boxCode || "-";
                                const identifier = device.boxNumber;
                                return (
                                  <div className="space-y-0.5">
                                    <div className="break-words" title={original}>
                                      {original}
                                    </div>
                                    {identifier && (
                                      <div className="inline-flex items-center rounded-full border border-muted px-1.5 py-0.5 text-[10px] text-muted-foreground bg-muted/40">
                                        ID: {identifier}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </TableCell>
                            <TableCell className="px-2 py-2">
                              <div className="truncate max-w-[80px]" title={device.productId}>
                                {device.productId}
                              </div>
                            </TableCell>
                          </>
                        )}

                        {/* Smart LPG Specific Columns */}
                        {isLPGUser && (
                          <>
                            <TableCell className="px-2 py-2">
                              <div className="truncate max-w-[120px]" title={(device as any).device_type || "-"}>
                                {(device as any).device_type || "-"}
                              </div>
                            </TableCell>
                            <TableCell className="px-2 py-2">
                              <div className="truncate max-w-[100px]" title={String((device as any).level_cm ?? "-")}>
                                {(device as any).level_cm ?? "-"}
                              </div>
                            </TableCell>
                            <TableCell className="px-2 py-2">
                              <div className="truncate max-w-[100px]" title={String((device as any).level_percent ?? "-")}>
                                {(device as any).level_percent ?? "-"}
                              </div>
                            </TableCell>
                            <TableCell className="px-2 py-2">
                              <div className="truncate max-w-[80px]" title={String((device as any).battery_volt ?? "-")}>
                                {(device as any).battery_volt ?? "-"}
                              </div>
                            </TableCell>
                            <TableCell className="px-2 py-2">
                              <div className="truncate max-w-[80px]" title={String((device as any).temp ?? "-")}>
                                {(device as any).temp ?? "-"}
                              </div>
                            </TableCell>
                            <TableCell className="px-2 py-2">
                              <div className="truncate max-w-[80px]" title={String((device as any).signal_rssi ?? "-")}>
                                {(device as any).signal_rssi ?? "-"}
                              </div>
                            </TableCell>
                          </>
                        )}

                        {/* Created At */}
                        <TableCell className="px-2 py-2 text-muted-foreground">
                          <div className="truncate max-w-[110px]" title={
                            isLPGUser 
                              ? ((device as any).timestamp_utc || (device as any).created_at)
                              : (device.createdAt ? format(device.createdAt, "MMM d, yyyy HH:mm") : "-")
                          }>
                            {isLPGUser 
                              ? (() => {
                                  const timestamp = (device as any).timestamp_utc || (device as any).created_at;
                                  if (!timestamp) return "-";
                                  try {
                                    return format(new Date(timestamp), "MMM d, HH:mm");
                                  } catch {
                                    return timestamp;
                                  }
                                })()
                              : (device.createdAt ? format(device.createdAt, "MMM d, yyyy HH:mm") : "-")
                            }
                          </div>
                        </TableCell>

                        {/* Status */}
                        <TableCell className="px-2 py-2">
                          {!hasInstallation ? (
                            <Badge variant="outline" className="text-slate-600 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-[10px] px-1.5 py-0.5">
                              <Package className="h-2.5 w-2.5 mr-0.5" />
                              Not Installed
                            </Badge>
                          ) : (
                            <Badge variant="outline" className={`${config.color} text-[10px] px-1.5 py-0.5`}>
                              <Icon className="h-2.5 w-2.5 mr-0.5" />
                              {config.label}
                            </Badge>
                          )}
                        </TableCell>

                        {/* Flood Sensor Additional Columns */}
                        {!isLPGUser && (
                          <>
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
                          </>
                        )}

                        {/* Smart LPG Additional Columns */}
                        {isLPGUser && (
                          <>
                            <TableCell className="px-2 py-2">
                              <div className="truncate max-w-[100px]" title={(device as any).manufacturer || "-"}>
                                {(device as any).manufacturer || "-"}
                              </div>
                            </TableCell>
                            <TableCell className="px-2 py-2">
                              <div className="truncate max-w-[100px]" title={(device as any).model || "-"}>
                                {(device as any).model || "-"}
                              </div>
                            </TableCell>
                            <TableCell className="px-2 py-2 font-mono text-xs">
                              <div className="truncate max-w-[100px]" title={(device as any).imei || "-"}>
                                {(device as any).imei || "-"}
                              </div>
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          
          {displayedDevices.length < filteredDevices.length && (
            <div className="mt-6 p-4 text-center border-t bg-muted/30">
              <Button variant="default" size="lg" onClick={handleShowMore} className="min-w-[200px]">
                Show More ({filteredDevices.length - displayedDevices.length} remaining)
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

