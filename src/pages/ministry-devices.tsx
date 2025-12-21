import { useEffect, useMemo, useState, useCallback } from "react";

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
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  CheckCircle,
  CloudOff, 
  CircleCheck, 
  Database,
  X,
  Filter,
  FileDown,
  FileText,
  Loader2
} from "lucide-react";
import jsPDF from "jspdf";
import { getStorage, ref, getDownloadURL } from "firebase/storage";
import type { Device, Installation } from "@/lib/types";
import { format } from "date-fns";
import { translateTeamNameToArabic } from "@/lib/amanah-translations";

const storage = getStorage();
const PRIMARY_COLOR: [number, number, number] = [12, 91, 211];
const TEXT_COLOR: [number, number, number] = [33, 33, 33];
const LABEL_COLOR: [number, number, number] = [100, 106, 125];

const SPECIAL_LOCATION_IDS = new Set(["9999", "999"]);
const formatCoordinates = (latitude: number, longitude: number): string =>
  `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
const buildReportFileName = (value: string): string => {
  const safeName = value
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w\u0600-\u06FF_-]/g, "")
    .replace(/_+/g, "_");
  const normalizedName = safeName || "Unknown";
  return `${normalizedName}_List_${format(new Date(), "yyyy-MM-dd")}.csv`;
};
const parseCoordinate = (value: number | string | null | undefined): number | null => {
  if (value == null) return null;
  const num = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isNaN(num) ? null : num;
};

const statusConfig = {
  pending: { 
    label: "Pending Verification", 
    icon: Clock, 
    color: "text-yellow-600 bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800" 
  },
  verified: { 
    label: "Verified", 
    icon: CheckCircle, 
    color: "text-green-600 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800" 
  },
  flagged: { 
    label: "Flagged", 
    icon: AlertTriangle, 
    color: "text-red-600 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800" 
  },
};

interface Location {
  id: string;
  locationId: string;
  latitude: number;
  longitude: number;
  municipalityName?: string;
}

export default function MinistryDevices() {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [devices, setDevices] = useState<Device[]>([]);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<'all' | 'withServerData' | 'noServerData'>('all');
  const [dateFilter, setDateFilter] = useState<string>("");
  const [generatingReport, setGeneratingReport] = useState(false);
  const [exporting9999, setExporting9999] = useState(false);
  const [exportingGroupedCsv, setExportingGroupedCsv] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(500);
  const [loading, setLoading] = useState(true);
  
  // Debounce filters for smooth performance
  const debouncedDateFilter = useDebounce(dateFilter, 300);
  const [isFiltering, setIsFiltering] = useState(false);
  
  // Track loading state for initial data
  useEffect(() => {
    if (devices.length > 0 && installations.length > 0) {
      setLoading(false);
    }
  }, [devices.length, installations.length]);
  
  // Show filtering indicator while debouncing
  useEffect(() => {
    if (dateFilter !== debouncedDateFilter) {
      setIsFiltering(true);
    } else {
      setIsFiltering(false);
    }
  }, [dateFilter, debouncedDateFilter]);

  useEffect(() => {
    const unsubD = onSnapshot(collection(db, "devices"), (snap) => {
      const data = snap.docs.map((d) => ({ ...(d.data() as any), id: d.id })) as Device[];
      setDevices(data);
    });
    const unsubI = onSnapshot(collection(db, "installations"), (snap) => {
      const data = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
        createdAt: d.data().createdAt?.toDate(),
        updatedAt: d.data().updatedAt?.toDate(),
      })) as Installation[];
      setInstallations(data);
    });
    const unsubT = onSnapshot(collection(db, "teams"), (snap) => {
      setTeams(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as any);
    });
    const unsubL = onSnapshot(collection(db, "locations"), (snap) => {
      const data = snap.docs.map((d) => {
        const docData = d.data() as any;
        // Parse coordinates as numbers (handle both string and number formats)
        const lat = typeof docData.latitude === 'number' 
          ? docData.latitude 
          : (docData.latitude ? parseFloat(String(docData.latitude)) : null);
        const lon = typeof docData.longitude === 'number'
          ? docData.longitude
          : (docData.longitude ? parseFloat(String(docData.longitude)) : null);
        
        return {
          id: d.id,
          locationId: docData.locationId || d.id, // Use document ID as fallback
          latitude: lat,
          longitude: lon,
          municipalityName: docData.municipalityName || undefined,
        } as Location;
      }).filter(loc => loc.latitude != null && loc.longitude != null && !isNaN(loc.latitude) && !isNaN(loc.longitude));
      
      setLocations(data);
    });
    return () => { unsubD(); unsubI(); unsubT(); unsubL(); };
  }, []);

  const teamIdToName = useMemo(() => {
    const map: Record<string, string> = {};
    teams.forEach((t) => { if (t.id) map[t.id] = (t as any).name; });
    return map;
  }, [teams]);

  // Create a map of locationId -> coordinates
  // In admin upload, document ID = locationId, so we map by both id and locationId field
  const locationMap = useMemo(() => {
    const map = new Map<string, Location>();
    locations.forEach((loc) => {
      // Map by document ID (which is the locationId in admin upload)
      if (loc.id) {
        const idKey = String(loc.id).trim();
        map.set(idKey, loc);
        // Also try without leading zeros for numeric IDs
        if (/^\d+$/.test(idKey)) {
          const numKey = String(Number(idKey)).trim();
          if (numKey !== idKey) {
            map.set(numKey, loc);
          }
        }
      }
      // Map by locationId field if it exists and differs from document ID
      if (loc.locationId && String(loc.locationId).trim() !== String(loc.id).trim()) {
        const locIdKey = String(loc.locationId).trim();
        map.set(locIdKey, loc);
        // Also try without leading zeros for numeric IDs
        if (/^\d+$/.test(locIdKey)) {
          const numKey = String(Number(locIdKey)).trim();
          if (numKey !== locIdKey) {
            map.set(numKey, loc);
          }
        }
      }
    });
    return map;
  }, [locations]);

  // Create a map of deviceId -> latest installation for O(1) lookups
  const installationsByDevice = useMemo(() => {
    const map = new Map<string, Installation>();
    
    // Group installations by deviceId and keep only the latest one
    installations.forEach(inst => {
      const existing = map.get(inst.deviceId);
      if (!existing || (inst.createdAt && existing.createdAt && inst.createdAt > existing.createdAt)) {
        map.set(inst.deviceId, inst);
      }
    });
    
    return map;
  }, [installations]);

  // Create rows with installation data and calculated metrics (much faster with map lookup)
  const allRows = useMemo(() => {
    return devices
      .map((d) => {
        const inst = installationsByDevice.get(d.id);
        if (!inst) return null;
        
        const amanah = inst.teamId ? teamIdToName[inst.teamId] || inst.teamId : "-";
        
        // Calculate variance if we have both sensor reading and server data
        let percentageDifference: number | undefined;
        if (inst.latestDisCm != null && inst.sensorReading != null) {
          const diff = Math.abs(inst.latestDisCm - inst.sensorReading);
          percentageDifference = (diff / inst.sensorReading) * 100;
        }
        
        const hasServerData = inst.latestDisCm != null && inst.latestDisCm > 0;
        const hasNoServerData = !hasServerData;
        const isPreVerified = inst.systemPreVerified === true;
        const isVerified = inst.status === "verified";
        const isPending = inst.status === "pending";
        
        // Pre-calculate location data to avoid expensive lookups during render
        const locationId = inst?.locationId ? String(inst.locationId).trim() : null;
        let location: Location | null = null;
        if (locationId) {
          location = locationMap.get(locationId);
          // Only do fallback search if map lookup failed and it's needed
          if (!location && locations.length > 0 && locations.length < 5000) {
            location = locations.find(loc => 
              String(loc.id).trim() === locationId || 
              String(loc.locationId).trim() === locationId
            ) || null;
          }
        }
        const isSwapped = locationId === "9999";
        const hasCoordinates = location && 
          typeof location.latitude === 'number' && 
          typeof location.longitude === 'number' &&
          !isNaN(location.latitude) &&
          !isNaN(location.longitude);
        
        return { 
          device: d, 
          inst, 
          amanah,
          percentageDifference,
          hasServerData,
          hasNoServerData,
          isPreVerified,
          isVerified,
          isPending,
          locationId,
          location,
          isSwapped,
          hasCoordinates
        };
      })
      // Only show devices that have at least one installation (installed devices)
      .filter((row): row is NonNullable<typeof row> => row !== null);
  }, [devices, installationsByDevice, teamIdToName, locationMap, locations]);

  // Calculate all filter counts in a single pass for better performance
  const filterCounts = useMemo(() => {
    let pending = 0;
    let withServerData = 0;
    let noServerData = 0;
    let preVerified = 0;
    let verified = 0;
    
    allRows.forEach(row => {
      if (row.isPending) pending++;
      if (row.hasServerData) withServerData++;
      if (row.hasNoServerData) noServerData++;
      if (row.isPreVerified) preVerified++;
      if (row.isVerified) verified++;
    });
    
    return { pending, withServerData, noServerData, preVerified, verified };
  }, [allRows]);

  const pendingCount = filterCounts.pending;
  const withServerDataCount = filterCounts.withServerData;
  const noServerDataCount = filterCounts.noServerData;
  const preVerifiedCount = filterCounts.preVerified;
  const verifiedCount = filterCounts.verified;

  // Apply filters to rows
  const rows = useMemo(() => {
    let filtered = allRows;

    // Apply active filter (only one can be active at a time)
    if (activeFilter === 'pending') {
      filtered = allRows.filter(row => row.isPending);
    } else if (activeFilter === 'withServerData') {
      filtered = allRows.filter(row => row.hasServerData);
    } else if (activeFilter === 'noServerData') {
      filtered = allRows.filter(row => row.hasNoServerData);
    } else if (activeFilter === 'preVerified') {
      filtered = allRows.filter(row => row.isPreVerified);
    } else if (activeFilter === 'verified') {
      filtered = allRows.filter(row => row.isVerified);
    }

    // Apply team filter
    if (teamFilter !== "all") {
      filtered = filtered.filter((row) => row.amanah === teamFilter);
    }

    // Apply date filter (using debounced value)
    if (debouncedDateFilter) {
      const filterDate = new Date(debouncedDateFilter);
      filterDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(filterDate);
      nextDay.setDate(nextDay.getDate() + 1);
      
      filtered = filtered.filter(row => {
        if (!row.inst.createdAt) return false;
        const installDate = new Date(row.inst.createdAt);
        installDate.setHours(0, 0, 0, 0);
        return installDate >= filterDate && installDate < nextDay;
      });
    }

    // Sort by installation time, latest on top
    filtered.sort((a, b) => {
      const aTime = a.inst.createdAt?.getTime() || 0;
      const bTime = b.inst.createdAt?.getTime() || 0;
      return bTime - aTime; // newest first
    });

    return filtered;
  }, [allRows, activeFilter, teamFilter, debouncedDateFilter]);
  
  // Paginate rows for performance
  const paginatedRows = useMemo(() => {
    return rows.slice(0, displayLimit);
  }, [rows, displayLimit]);
  
  // Reset display limit when filters change
  useEffect(() => {
    setDisplayLimit(500);
  }, [teamFilter, activeFilter, debouncedDateFilter]);
  
  // Handle "Show More" button
  const handleShowMore = useCallback(() => {
    setDisplayLimit(prev => prev + 500);
  }, []);

  const downloadCsv = (rowsData: string[][], filename: string) => {
    const headers = ["Serial No", "Location ID", "Coordinates", "Device ID", "Amanah", "Municipality", "Sensor Height"];
    const csvRows = [headers, ...rowsData];
    const csvContent = csvRows
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
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleLocation9999Export = () => {
    setExporting9999(true);
    
    try {
      // Filter for location 9999 only from all installations
      const location9999Installations = allRows.filter(row => {
        const locationId = row.inst?.locationId ? String(row.inst.locationId).trim() : "";
        return locationId === "9999";
      });

      if (location9999Installations.length === 0) {
        toast({
          title: "No Location 9999 Found",
          description: "No installations with location ID 9999 were found.",
        });
        setExporting9999(false);
        return;
      }

      // Group by Amanah
      const groupedByAmanah: Record<string, typeof location9999Installations> = {};
      
      location9999Installations.forEach(row => {
        const amanahName = row.amanah || "Unknown";
        if (!groupedByAmanah[amanahName]) {
          groupedByAmanah[amanahName] = [];
        }
        groupedByAmanah[amanahName].push(row);
      });

      // Generate CSV for each Amanah
      Object.entries(groupedByAmanah).forEach(([amanahName, amanahRows]) => {
        // Sort by installer name and device ID
        const sortedRows = [...amanahRows].sort((a, b) => {
          const nameA = a.inst.installedByName || "";
          const nameB = b.inst.installedByName || "";
          if (nameA !== nameB) return nameA.localeCompare(nameB);
          return a.device.id.localeCompare(b.device.id);
        });

        const headers = [
          "Serial No", "Location ID", "Coordinates", "Device ID", "Installer Name", "Amanah", "Municipality", "Sensor Height"
        ];

        const csvRows = sortedRows.map((row, index) => {
          const { device, inst } = row;
          const locationId = inst?.locationId ? String(inst.locationId).trim() : "";
          const location = locationMap.get(locationId);
          
          // For location 9999, use installation coordinates if available, otherwise use location coordinates
          const latitude = inst?.latitude != null ? inst.latitude : (location?.latitude ?? null);
          const longitude = inst?.longitude != null ? inst.longitude : (location?.longitude ?? null);
          
          // Format coordinates as a single string
          let coordinates = "-";
          if (latitude != null && longitude != null) {
            coordinates = formatCoordinates(latitude, longitude);
          }
          
          return [
            (index + 1).toString(),
            locationId || "-",
            coordinates,
            device.id,
            inst.installedByName || "-",
            row.amanah || "-",
            location?.municipalityName || "-",
            inst.sensorReading != null ? inst.sensorReading.toString() : "-"
          ];
        });

        const allCsvRows = [headers, ...csvRows];
        const csvContent = allCsvRows
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
        const dateStr = format(new Date(), "yyyy-MM-dd");
        const fileName = `Location_9999_${amanahName.replace(/[^a-z0-9]/gi, "_")}_${dateStr}.csv`;
        link.setAttribute("download", fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      });

      const amanahCount = Object.keys(groupedByAmanah).length;
      toast({
        title: "Export Complete",
        description: `Exported ${location9999Installations.length} location 9999 installation(s) across ${amanahCount} Amanah(s).`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: error.message || "An error occurred during export.",
      });
    } finally {
      setExporting9999(false);
    }
  };

  const handleCsvExport = () => {
    if (rows.length === 0) {
      toast({
        title: "No devices found",
        description: "There are no devices in the current view to export.",
      });
      return;
    }

    const rowsByAmanah: Record<string, string[][]> = {};
    let totalRows = 0;

    rows.forEach((row) => {
      const { device, inst, amanah } = row;
      const rawLocationId = inst?.locationId ? String(inst.locationId).trim() : "";
      let location: Location | null = null;
      if (rawLocationId) {
        location = locationMap.get(rawLocationId) ?? null;
        if (!location && locations.length > 0) {
          location =
            locations.find(
              (loc) =>
                String(loc.id).trim() === rawLocationId ||
                String(loc.locationId).trim() === rawLocationId
            ) ?? null;
        }
      }

      const instLat = parseCoordinate(inst?.latitude);
      const instLon = parseCoordinate(inst?.longitude);

      let coordinates = "-";
      if (SPECIAL_LOCATION_IDS.has(rawLocationId)) {
        if (instLat != null && instLon != null) {
          coordinates = formatCoordinates(instLat, instLon);
        } else if (location?.latitude != null && location?.longitude != null) {
          coordinates = formatCoordinates(location.latitude, location.longitude);
        }
      } else {
        if (location?.latitude != null && location?.longitude != null) {
          coordinates = formatCoordinates(location.latitude, location.longitude);
        } else if (instLat != null && instLon != null) {
          coordinates = `${formatCoordinates(instLat, instLon)} (user entered)`;
        }
      }

      const sensorReadingValue = inst?.sensorReading != null ? String(inst.sensorReading) : "-";
      const englishAmanahName = amanah || "-";
      const translatedAmanah = translateTeamNameToArabic(
        englishAmanahName === "-" ? null : englishAmanahName
      );
      const amanahForExport = translatedAmanah ?? englishAmanahName;
      const municipalityName = location?.municipalityName || "-";

      const csvRow = [
        "", // Serial placeholder
        rawLocationId || "-",
        coordinates,
        device.id,
        amanahForExport,
        municipalityName,
        sensorReadingValue,
      ];

      const groupKey = amanahForExport || "Unknown";
      if (!rowsByAmanah[groupKey]) {
        rowsByAmanah[groupKey] = [];
      }
      rowsByAmanah[groupKey].push(csvRow);
      totalRows++;
    });

    const amanahCount = Object.keys(rowsByAmanah).length;
    Object.entries(rowsByAmanah).forEach(([amanahName, csvRows]) => {
      csvRows.forEach((row, index) => {
        row[0] = (index + 1).toString();
      });
      const filename = buildReportFileName(amanahName);
      downloadCsv(csvRows, filename);
    });

    toast({
      title: "CSV downloaded",
      description: `Exported ${totalRows} row${totalRows === 1 ? "" : "s"} across ${amanahCount} Amanah${
        amanahCount === 1 ? "" : "s"
      }.`,
    });
  };

  const handleGroupedCsvExport = () => {
    if (rows.length === 0) {
      toast({
        title: "No devices found",
        description: "There are no devices in the current view to export.",
      });
      return;
    }

    setExportingGroupedCsv(true);

    try {
      const rowsByAmanah: Record<string, string[][]> = {};
      let totalRows = 0;

      // Process rows same as handleCsvExport
      rows.forEach((row) => {
        const { device, inst, amanah } = row;
        const rawLocationId = inst?.locationId ? String(inst.locationId).trim() : "";
        let location: Location | null = null;
        if (rawLocationId) {
          location = locationMap.get(rawLocationId) ?? null;
          if (!location && locations.length > 0) {
            location =
              locations.find(
                (loc) =>
                  String(loc.id).trim() === rawLocationId ||
                  String(loc.locationId).trim() === rawLocationId
              ) ?? null;
          }
        }

        const instLat = parseCoordinate(inst?.latitude);
        const instLon = parseCoordinate(inst?.longitude);

        let coordinates = "-";
        if (SPECIAL_LOCATION_IDS.has(rawLocationId)) {
          if (instLat != null && instLon != null) {
            coordinates = formatCoordinates(instLat, instLon);
          } else if (location?.latitude != null && location?.longitude != null) {
            coordinates = formatCoordinates(location.latitude, location.longitude);
          }
        } else {
          if (location?.latitude != null && location?.longitude != null) {
            coordinates = formatCoordinates(location.latitude, location.longitude);
          } else if (instLat != null && instLon != null) {
            coordinates = `${formatCoordinates(instLat, instLon)} (user entered)`;
          }
        }

        const sensorReadingValue = inst?.sensorReading != null ? String(inst.sensorReading) : "-";
        const englishAmanahName = amanah || "-";
        const translatedAmanah = translateTeamNameToArabic(
          englishAmanahName === "-" ? null : englishAmanahName
        );
        const amanahForExport = translatedAmanah ?? englishAmanahName;
        const municipalityName = location?.municipalityName || "-";

        const csvRow = [
          "", // Serial placeholder
          rawLocationId || "-",
          coordinates,
          device.id,
          amanahForExport,
          municipalityName,
          sensorReadingValue,
        ];

        const groupKey = amanahForExport || "Unknown";
        if (!rowsByAmanah[groupKey]) {
          rowsByAmanah[groupKey] = [];
        }
        rowsByAmanah[groupKey].push(csvRow);
        totalRows++;
      });

      // Sort Amanahs alphabetically
      const sortedAmanahs = Object.keys(rowsByAmanah).sort();

      // Build single CSV with grouped data
      const headers = ["Serial No", "Location ID", "Coordinates", "Device ID", "Amanah", "Municipality", "Sensor Height"];
      const allCsvRows: string[][] = [headers];

      // Add each Amanah group
      sortedAmanahs.forEach((amanahName) => {
        const amanahRows = rowsByAmanah[amanahName];
        
        // Add numbered rows for this Amanah
        amanahRows.forEach((row, index) => {
          const numberedRow = [...row];
          numberedRow[0] = (index + 1).toString(); // Set serial number
          allCsvRows.push(numberedRow);
        });
      });

      // Generate CSV content
      const csvContent = allCsvRows
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
      const dateStr = format(new Date(), "yyyy-MM-dd");
      link.setAttribute("download", `All_Installations_Grouped_by_Amanah_${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "CSV downloaded",
        description: `Exported ${totalRows} row${totalRows !== 1 ? "s" : ""} grouped by ${sortedAmanahs.length} Amanah${sortedAmanahs.length !== 1 ? "s" : ""} in a single CSV file.`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: error.message || "An error occurred during export.",
      });
    } finally {
      setExportingGroupedCsv(false);
    }
  };

  if (!userProfile?.isAdmin && userProfile?.role !== "ministry") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-xl font-semibold mb-2">Access Denied</p>
            <p className="text-muted-foreground">Only ministry and administrators can view this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show loading state while data is being loaded
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading installation data...</p>
      </div>
    );
  }

  const teamNames = Array.from(new Set(teams.map((t) => (t as any).name))).sort();

  const extractStoragePath = (url: string): string | null => {
    if (!url) return null;
    if (!url.startsWith("http")) return url;
    const oIndex = url.indexOf("/o/");
    if (oIndex === -1) return null;
    const qIndex = url.indexOf("?", oIndex);
    const encodedPath = qIndex === -1 ? url.substring(oIndex + 3) : url.substring(oIndex + 3, qIndex);
    try {
      return decodeURIComponent(encodedPath);
    } catch (error) {
      console.error("Failed to decode storage path from URL:", url, error);
      return null;
    }
  };

  const getFreshDownloadURL = async (url: string): Promise<string> => {
    const path = extractStoragePath(url);
    if (!path) {
      return url;
    }
    try {
      const storageRef = ref(storage, path);
      return await getDownloadURL(storageRef);
    } catch (error) {
      console.error("Error retrieving download URL for", path, error);
      return url;
    }
  };

  const loadImageElement = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Image failed to load: ${url}`));
      img.src = url;
    });

  // Generate PDF report for a specific Amanah
  const generateReportForAmanah = async (amanahName: string, amanahRows: typeof rows, locationMapRef: Map<string, Location>) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const leftPanelWidth = 85; // Width for left panel (text boxes)
    const rightPanelWidth = pageWidth - leftPanelWidth - margin * 2 - 10; // Width for right panel (images)
    const leftPanelX = margin;
    const rightPanelX = leftPanelX + leftPanelWidth + 10;

    // Generate one page per device
    for (let i = 0; i < amanahRows.length; i++) {
      const row = amanahRows[i];
      const { device, inst } = row;

      // Add new page for each device (except first)
      if (i > 0) {
        doc.addPage();
      }

      let yPos = margin;

      // Get location data
      const locationId = inst?.locationId ? String(inst.locationId).trim() : "N/A";
      const location = locationMapRef.get(locationId);
      const latitude = location?.latitude ?? (inst?.latitude ?? null);
      const longitude = location?.longitude ?? (inst?.longitude ?? null);
      const sensorReading = inst?.sensorReading ?? null;

      // Header matching the report layout
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...TEXT_COLOR);
      doc.text(`LOCATION ${locationId}`, leftPanelX, yPos);
      yPos += 8;
      doc.setDrawColor(...PRIMARY_COLOR);
      doc.setLineWidth(1.2);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 12;

      // Left Panel - Top Box (Location Details)
      const boxY = yPos;
      const boxHeight = 40;
      
      // Draw box border
      doc.setDrawColor(...PRIMARY_COLOR);
      doc.setLineWidth(0.8);
      doc.rect(leftPanelX, boxY, leftPanelWidth, boxHeight);

      // Box content
      let textY = boxY + 9;
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...LABEL_COLOR);
      doc.text("LOCATION NO.", leftPanelX + 6, textY);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...TEXT_COLOR);
      doc.text(locationId, leftPanelX + 55, textY);
      textY += 8;

      doc.setFont("helvetica", "bold");
      doc.setTextColor(...LABEL_COLOR);
      doc.text("LATITUDE", leftPanelX + 6, textY);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...TEXT_COLOR);
      doc.text(latitude !== null ? latitude.toFixed(4) : "N/A", leftPanelX + 55, textY);
      textY += 8;

      doc.setFont("helvetica", "bold");
      doc.setTextColor(...LABEL_COLOR);
      doc.text("LONGITUDE", leftPanelX + 6, textY);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...TEXT_COLOR);
      doc.text(longitude !== null ? longitude.toFixed(4) : "N/A", leftPanelX + 55, textY);
      textY += 8;

      doc.setFont("helvetica", "bold");
      doc.setTextColor(...LABEL_COLOR);
      doc.text("SENSOR READING", leftPanelX + 6, textY);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...TEXT_COLOR);
      doc.text(sensorReading !== null ? `${sensorReading} cm` : "N/A", leftPanelX + 55, textY);

      // Left Panel - Bottom Box (Device Code)
      const bottomBoxY = boxY + boxHeight + 12;
      const bottomBoxHeight = 24;
      
      // Draw box border
      doc.setDrawColor(...PRIMARY_COLOR);
      doc.setLineWidth(0.8);
      doc.rect(leftPanelX, bottomBoxY, leftPanelWidth, bottomBoxHeight);

      // Box content
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...LABEL_COLOR);
      doc.text("DEVICE CODE", leftPanelX + 6, bottomBoxY + 10);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...PRIMARY_COLOR);
      doc.text(device.id, leftPanelX + 6, bottomBoxY + 18);
      doc.setTextColor(...TEXT_COLOR);

      // Right Panel - Device Image(s)
      const imageHeight = 140;
      const imageUrls = inst?.imageUrls || [];
      const imagesToInclude = imageUrls.length > 1 ? imageUrls.slice(0, 2) : imageUrls.slice(0, 1);

      const framePadding = 18;
      const imageFrameY = yPos;
      const isSingle = imagesToInclude.length === 1;
      const slotWidth = rightPanelWidth - framePadding * 2;
      const slotHeight = slotWidth * 0.75; // maintain 4:3 style box
      const slotGap = isSingle ? 0 : 18;
      const frameHeight = isSingle
        ? slotHeight + framePadding * 2
        : slotHeight * 2 + slotGap + framePadding * 2;
      const availableHeight = isSingle ? slotHeight : slotHeight * 2 + slotGap;
      const availableWidth = slotWidth;

      doc.setDrawColor(...PRIMARY_COLOR);
      doc.setLineWidth(0.8);
      doc.rect(rightPanelX, imageFrameY, rightPanelWidth, frameHeight);

      const imageAreaY = imageFrameY + framePadding;

      if (imagesToInclude.length > 0) {
        const multiple = !isSingle;

        for (let index = 0; index < imagesToInclude.length; index++) {
          const imageUrl = imagesToInclude[index];
          try {
            const freshUrl = await getFreshDownloadURL(imageUrl);
            const imgEl = await loadImageElement(freshUrl);

            const canvas = document.createElement('canvas');
            canvas.width = imgEl.naturalWidth;
            canvas.height = imgEl.naturalHeight;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
              throw new Error('Could not get canvas context');
            }

            ctx.drawImage(imgEl, 0, 0);

            const format = freshUrl.toLowerCase().includes('.png') ? 'PNG' : 'JPEG';
            const base64 = canvas.toDataURL(format === 'PNG' ? 'image/png' : 'image/jpeg', 0.95);

            let targetWidth = slotWidth;
            let targetHeight = slotHeight;
            const aspectRatio = imgEl.naturalWidth / imgEl.naturalHeight;

            if (aspectRatio >= slotWidth / slotHeight) {
              targetHeight = slotWidth / aspectRatio;
            } else {
              targetWidth = slotHeight * aspectRatio;
            }

            const slotX = rightPanelX + framePadding;
            const slotY = multiple
              ? imageAreaY + index * (slotHeight + slotGap)
              : imageAreaY;

            const offsetX = slotX + (slotWidth - targetWidth) / 2;
            const offsetY = slotY + (slotHeight - targetHeight) / 2;

            doc.addImage(base64, format, offsetX, offsetY, targetWidth, targetHeight);
          } catch (error) {
            console.error(`Error loading image for device ${device.id}:`, error);
            // Try jsPDF's direct URL loading as last resort
            try {
              const fallbackUrl = await getFreshDownloadURL(imageUrl);
              const format = fallbackUrl.toLowerCase().includes('.png') ? 'PNG' : 'JPEG';
              const slotX = rightPanelX + framePadding;
              const slotY = multiple ? imageAreaY + index * (slotHeight + slotGap) : imageAreaY;
              doc.addImage(
                fallbackUrl,
                format,
                slotX,
                slotY,
                slotWidth,
                slotHeight
              );
            } catch (pdfError) {
              // Placeholder if all methods fail
              doc.setFontSize(8);
              doc.setFont("helvetica", "italic");
              doc.text(
                "Image not available",
                rightPanelX + rightPanelWidth / 2,
                slotY + slotHeight / 2,
                { align: "center" }
              );
              doc.setFont("helvetica", "normal");
            }
          }
        }
      } else {
        // No images available
        doc.setFontSize(9);
        doc.setFont("helvetica", "italic");
        doc.text(
          "No images available",
          rightPanelX + rightPanelWidth / 2,
          imageAreaY + availableHeight / 2,
          { align: "center" }
        );
        doc.setFont("helvetica", "normal");
      }

      yPos = imageFrameY + frameHeight + 20;
    }

    // Save PDF
    const fileName = `${amanahName.replace(/[^a-z0-9]/gi, "_")}_Report.pdf`;
    doc.save(fileName);
  };

  // Generate reports for all filtered Amanahs
  const generateReports = async () => {
    if (rows.length === 0) {
      toast({
        variant: "destructive",
        title: "No Data",
        description: "No devices match the current filters to generate a report.",
      });
      return;
    }

    setGeneratingReport(true);

    try {
      // Group rows by Amanah
      const groupedByAmanah = rows.reduce((acc, row) => {
        const amanah = row.amanah || "Unknown";
        if (!acc[amanah]) {
          acc[amanah] = [];
        }
        acc[amanah].push(row);
        return acc;
      }, {} as Record<string, typeof rows>);

      // Generate report for each Amanah
      const amanahNames = Object.keys(groupedByAmanah);
      
      for (const amanahName of amanahNames) {
        await generateReportForAmanah(amanahName, groupedByAmanah[amanahName], locationMap);
        // Small delay between reports to avoid browser blocking
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      toast({
        title: "Reports Generated",
        description: `Successfully generated ${amanahNames.length} report(s).`,
      });
    } catch (error: any) {
      console.error("Error generating reports:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to generate reports.",
      });
    } finally {
      setGeneratingReport(false);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">All Devices</h1>
        <p className="text-muted-foreground mt-2">View and filter installed devices</p>
      </div>

      {/* Stats - Filter Banners */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className={`border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${activeFilter==='withServerData' ? 'ring-2 ring-green-400' : ''}`} onClick={() => setActiveFilter(activeFilter==='withServerData' ? 'all' : 'withServerData')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">With Server Data</p>
                <p className="text-3xl font-bold mt-1 text-green-600">
                  {withServerDataCount}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-green-100 dark:bg-green-950 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${activeFilter==='noServerData' ? 'ring-2 ring-orange-400' : ''}`} onClick={() => setActiveFilter(activeFilter==='noServerData' ? 'all' : 'noServerData')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">No Server Data</p>
                <p className="text-3xl font-bold mt-1 text-orange-600">
                  {noServerDataCount}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-orange-100 dark:bg-orange-950 flex items-center justify-center">
                <CloudOff className="h-6 w-6 text-orange-600 dark:text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters Section */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Team Filter */}
            <div className="space-y-2">
              <Label htmlFor="team-filter">Filter by Amanah</Label>
              <Select value={teamFilter} onValueChange={setTeamFilter}>
                <SelectTrigger id="team-filter" className="w-full"><SelectValue placeholder="All Teams" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Teams</SelectItem>
                  {teamNames.map((n) => (<SelectItem key={n} value={n}>{n}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Filter */}
            <div className="space-y-2">
              <Label htmlFor="date-filter">Installation Date</Label>
              <Input
                id="date-filter"
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              />
            </div>
          </div>

          {/* Clear Filters Button */}
          {(teamFilter !== "all" || activeFilter !== 'all' || dateFilter) && (
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setTeamFilter("all");
                  setActiveFilter('all');
                  setDateFilter("");
                }}
              >
                <X className="h-4 w-4 mr-2" />
                Clear All Filters
              </Button>
              <div className="flex flex-wrap gap-2">
                {teamFilter !== "all" && (
                  <Badge variant="secondary" className="text-xs">
                    Team: {teamFilter}
                  </Badge>
                )}
                {dateFilter && (
                  <Badge variant="secondary" className="text-xs">
                    Date: {format(new Date(dateFilter), "MMM d, yyyy")}
                  </Badge>
                )}
                {activeFilter !== 'all' && (
                  <Badge variant="secondary" className="text-xs">
                    {activeFilter === 'withServerData' ? 'With Server Data' : 'No Server Data'}
                  </Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border shadow-sm">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-2">
              <CardTitle className="text-xl md:text-2xl font-bold">
                Devices ({rows.length > displayLimit ? `${paginatedRows.length} of ` : ''}{rows.length})
              </CardTitle>
              {isFiltering && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:justify-end">
              <Button
                variant="outline"
                className="flex items-center gap-2 w-full sm:w-auto"
                onClick={handleCsvExport}
              >
                <FileDown className="h-4 w-4" />
                Download CSV
              </Button>
              <Button
                variant="outline"
                className="flex items-center gap-2 w-full sm:w-auto bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
                onClick={handleGroupedCsvExport}
                disabled={exportingGroupedCsv}
              >
                {exportingGroupedCsv ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <FileDown className="h-4 w-4" />
                    Grouped CSV by Amanah
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                className="flex items-center gap-2 w-full sm:w-auto bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                onClick={handleLocation9999Export}
                disabled={exporting9999}
              >
                {exporting9999 ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <FileDown className="h-4 w-4" />
                    Location 9999 CSV
                  </>
                )}
              </Button>
              <Button
                onClick={generateReports}
                disabled={generatingReport || rows.length === 0}
                className="flex items-center gap-2 w-full sm:w-auto"
              >
                {generatingReport ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    Generate Report(s)
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No devices match the current filters.</p>
            </div>
          ) : (
            <>
              <div className="rounded-md border overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[140px]">Device ID</TableHead>
                      <TableHead className="min-w-[120px]">Amanah</TableHead>
                      <TableHead className="min-w-[100px]">Location ID</TableHead>
                      <TableHead className="min-w-[120px]">Sensor Reading</TableHead>
                      <TableHead className="min-w-[100px]">Installation Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRows.map((row) => {
                    // Use pre-calculated values for fast rendering
                    const { device, inst, amanah, locationId, location, isSwapped, hasCoordinates } = row;
                    
                    return (
                      <TableRow key={device.id}>
                        <TableCell className="font-mono text-xs md:text-sm">{device.id}</TableCell>
                        <TableCell className="text-xs md:text-sm">{amanah}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="text-xs md:text-sm">{locationId || "-"}</span>
                            {hasCoordinates && (
                              <Badge variant="outline" className="text-[10px] w-fit">
                                {location!.latitude.toFixed(6)}, {location!.longitude.toFixed(6)}
                              </Badge>
                            )}
                            {isSwapped && (
                              <Badge variant="outline" className="text-[9px] w-fit bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-950/20 dark:text-gray-400 dark:border-gray-800">
                                Swapped
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs md:text-sm">{inst?.latestDisCm ?? "-"}</TableCell>
                        <TableCell className="text-xs md:text-sm">
                          {inst?.createdAt ? format(inst.createdAt, "MMM d, yyyy HH:mm") : "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            
            {/* Show More Button */}
            {rows.length > displayLimit && (
              <div className="mt-6 pt-6 text-center border-t-2 border-dashed bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4">
                <p className="text-sm text-muted-foreground mb-3 font-medium">
                  Showing {paginatedRows.length} of {rows.length} installations
                </p>
                <Button 
                  variant="default" 
                  size="lg" 
                  onClick={handleShowMore} 
                  className="min-w-[250px] font-semibold shadow-md"
                >
                  Show More ({rows.length - paginatedRows.length} remaining)
                </Button>
              </div>
            )}
          </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
