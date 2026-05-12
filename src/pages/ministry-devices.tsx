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
import { Textarea } from "@/components/ui/textarea";
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

/** Returns true when the string contains any Arabic / Arabic-Extended characters. */
const hasArabic = (text: string): boolean =>
  /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);

/** Where a municipality value was resolved from for a given CSV row. */
type MunicSource = "location_ref" | "amanah" | "none";

/**
 * Resolve the municipality to display for a CSV row.
 *
 * Priority:
 *   1. `locations/{locationId}.municipalityName`  → source = "location_ref"
 *   2. Arabic amanah / team name fallback          → source = "amanah"
 *   3. Neither available                           → source = "none"
 */
function resolveMunicipality(
  location: Location | null | undefined,
  amanahFallback: string
): { value: string; source: MunicSource } {
  if (location?.municipalityName) {
    return { value: location.municipalityName, source: "location_ref" };
  }
  const fallback = amanahFallback && amanahFallback !== "-" ? amanahFallback : "";
  if (fallback) {
    return { value: fallback, source: "amanah" };
  }
  return { value: "-", source: "none" };
}

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
  latitude: number | null;
  longitude: number | null;
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
  const [reportProgress, setReportProgress] = useState<{
    phase: "fetching" | "building";
    fetched: number;
    totalImages: number;
    amanahIndex: number;
    amanahTotal: number;
    amanahName: string;
  } | null>(null);
  const [exporting9999, setExporting9999] = useState(false);
  const [exportingGroupedCsv, setExportingGroupedCsv] = useState(false);
  const [exportingNoLocation, setExportingNoLocation] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(500);
  const [loading, setLoading] = useState(true);
  const [fromDateTime, setFromDateTime] = useState("");
  const [toDateTime, setToDateTime] = useState("");
  const [lastXDevices, setLastXDevices] = useState<number | "">("");
  const [deviceUidsFilter, setDeviceUidsFilter] = useState<string>("");
  
  // Debounce filters for smooth performance
  const debouncedDateFilter = useDebounce(dateFilter, 300);
  const [isFiltering, setIsFiltering] = useState(false);
  
  // Track loading state for initial data — installations are the source of truth
  useEffect(() => {
    if (installations.length > 0) {
      setLoading(false);
    }
  }, [installations.length]);
  
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
      // Keep docs that have valid coordinates OR a municipality name so that
      // municipality-import-only documents are still available for CSV lookup.
      }).filter(loc =>
        (loc.latitude != null && !isNaN(loc.latitude) && loc.longitude != null && !isNaN(loc.longitude)) ||
        !!loc.municipalityName
      );
      
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

  // Build a device lookup map for O(1) access
  const deviceMap = useMemo(() => {
    const map = new Map<string, Device>();
    devices.forEach(d => map.set(d.id, d));
    return map;
  }, [devices]);

  // Create rows with installation data and calculated metrics.
  // Iterates installations (not devices) so devices that have installations
  // but are missing from the devices master list still appear.
  const allRows = useMemo(() => {
    return Array.from(installationsByDevice.values())
      .map((inst) => {
        // Use device from master list if available, otherwise create a minimal stub
        const d: Device = deviceMap.get(inst.deviceId) ?? ({ id: inst.deviceId } as Device);

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
          location = locationMap.get(locationId) ?? null;
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
      });
  }, [deviceMap, installationsByDevice, teamIdToName, locationMap, locations]);

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

    // Apply device UIDs filter (line-by-line, supports partial matching)
    if (deviceUidsFilter.trim()) {
      const deviceUidsList = deviceUidsFilter
        .split('\n')
        .map(uid => uid.trim().toUpperCase())
        .filter(uid => uid.length > 0);

      if (deviceUidsList.length > 0) {
        filtered = filtered.filter(row =>
          deviceUidsList.some(uid => (row.device.id?.toUpperCase() || '').includes(uid))
        );
      }
    }

    // Sort by installation time, latest on top
    filtered.sort((a, b) => {
      const aTime = a.inst.createdAt?.getTime() || 0;
      const bTime = b.inst.createdAt?.getTime() || 0;
      return bTime - aTime; // newest first
    });

    // Limit to last X devices by installation date (after all other filters + sort)
    if (lastXDevices !== "" && lastXDevices > 0) {
      filtered = filtered.slice(0, lastXDevices);
    }

    return filtered;
  }, [allRows, activeFilter, teamFilter, debouncedDateFilter, lastXDevices, deviceUidsFilter]);
  
  // Paginate rows for performance
  const paginatedRows = useMemo(() => {
    return rows.slice(0, displayLimit);
  }, [rows, displayLimit]);
  
  // Reset display limit when filters change
  useEffect(() => {
    setDisplayLimit(500);
  }, [teamFilter, activeFilter, debouncedDateFilter, lastXDevices, deviceUidsFilter]);
  
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

  // Helper function to apply date/time range filter for CSV exports
  const getDateFilteredRows = (rowsToFilter: typeof rows) => {
    // If no date filters are set, return all rows
    if (!fromDateTime && !toDateTime) {
      return rowsToFilter;
    }

    // Validate date range if both are set
    if (fromDateTime && toDateTime) {
      const fromDate = new Date(fromDateTime);
      const toDate = new Date(toDateTime);
      
      if (fromDate >= toDate) {
        toast({
          variant: "destructive",
          title: "Invalid Date Range",
          description: "From date/time must be before To date/time.",
        });
        return rowsToFilter;
      }
    }

    // Apply filter
    return rowsToFilter.filter(row => {
      if (!row.inst.createdAt) return false;
      const createdAt = row.inst.createdAt;
      
      if (fromDateTime && toDateTime) {
        const fromDate = new Date(fromDateTime);
        const toDate = new Date(toDateTime);
        return createdAt >= fromDate && createdAt <= toDate;
      } else if (fromDateTime) {
        const fromDate = new Date(fromDateTime);
        return createdAt >= fromDate;
      } else if (toDateTime) {
        const toDate = new Date(toDateTime);
        return createdAt <= toDate;
      }
      
      return true;
    });
  };

  const handleLocation9999Export = () => {
    setExporting9999(true);
    
    try {
      // Filter for location 9999 only from all installations
      let location9999Installations = allRows.filter(row => {
        const locationId = row.inst?.locationId ? String(row.inst.locationId).trim() : "";
        return locationId === "9999";
      });

      // Apply date/time filter
      location9999Installations = getDateFilteredRows(location9999Installations);

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
        const englishAmanahName = row.amanah || "Unknown";
        const amanahName = translateTeamNameToArabic(
          englishAmanahName === "Unknown" ? null : englishAmanahName
        ) || englishAmanahName;
        
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
          
          const englishAmanahName = row.amanah || "-";
          const amanahForExport = translateTeamNameToArabic(
            englishAmanahName === "-" ? null : englishAmanahName
          ) || englishAmanahName;
          
          return [
            (index + 1).toString(),
            locationId || "-",
            coordinates,
            `="${device.id}"`, // Format as text to prevent Excel scientific notation
            inst.installedByName || "-",
            amanahForExport,
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

  const handleNoLocationExport = () => {
    setExportingNoLocation(true);
    
    try {
      // Filter for installations with no location data (missing coordinates)
      let noLocationInstallations = allRows.filter(row => {
        const { inst } = row;
        const locationId = inst?.locationId ? String(inst.locationId).trim() : "";
        const location = locationMap.get(locationId);
        
        // Check if coordinates are missing
        let hasCoordinates = false;
        
        // For special location IDs like 9999, check installation coordinates
        if (SPECIAL_LOCATION_IDS.has(locationId)) {
          hasCoordinates = inst?.latitude != null && inst?.longitude != null;
        } else {
          // For regular locations, check location database first, then installation
          if (location?.latitude != null && location?.longitude != null) {
            hasCoordinates = true;
          } else if (inst?.latitude != null && inst?.longitude != null) {
            hasCoordinates = true;
          }
        }
        
        return !hasCoordinates; // Return true if no coordinates
      });

      // Apply date/time filter
      noLocationInstallations = getDateFilteredRows(noLocationInstallations);

      if (noLocationInstallations.length === 0) {
        toast({
          title: "No Devices Without Location",
          description: "All devices have location data.",
        });
        setExportingNoLocation(false);
        return;
      }

      // Sort by team/amanah and device ID
      const sortedRows = [...noLocationInstallations].sort((a, b) => {
        const amanahA = a.amanah || "Unknown";
        const amanahB = b.amanah || "Unknown";
        if (amanahA !== amanahB) return amanahA.localeCompare(amanahB);
        return a.device.id.localeCompare(b.device.id);
      });

      const headers = [
        "Serial No", "Location ID", "Device ID", "Installer Name", "Amanah", "Municipality", "Sensor Height", "Installation Date"
      ];

      let noLocMunicFromRef = 0;
      let noLocMunicFromAmanah = 0;

      const csvRows = sortedRows.map((row, index) => {
        const { device, inst } = row;
        const locationId = inst?.locationId ? String(inst.locationId).trim() : "";
        let location = locationMap.get(locationId) ?? null;
        if (!location && locationId && locations.length > 0) {
          location = locations.find(
            (loc) => String(loc.id).trim() === locationId || String(loc.locationId).trim() === locationId
          ) ?? null;
        }
        const englishAmanahName = row.amanah || "-";
        const amanahForExport = translateTeamNameToArabic(
          englishAmanahName === "-" ? null : englishAmanahName
        ) || englishAmanahName;

        const { value: municipalityName, source: municSource } = resolveMunicipality(location, amanahForExport);
        if (municSource === "location_ref") noLocMunicFromRef++;
        else if (municSource === "amanah") noLocMunicFromAmanah++;

        return [
          (index + 1).toString(),
          locationId || "-",
          `="${device.id}"`, // Format as text to prevent Excel scientific notation
          inst.installedByName || "-",
          amanahForExport,
          municipalityName,
          inst.sensorReading != null ? inst.sensorReading.toString() : "-",
          inst.createdAt ? format(inst.createdAt, "yyyy-MM-dd HH:mm") : "-"
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
      const fileName = `Devices_No_Location_${dateStr}.csv`;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Export Complete",
        description:
          `Exported ${noLocationInstallations.length} device(s) without location data. ` +
          `Municipality: ${noLocMunicFromRef} from location reference, ${noLocMunicFromAmanah} from Amanah name.`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: error.message || "An error occurred during export.",
      });
    } finally {
      setExportingNoLocation(false);
    }
  };

  const handleCsvExport = () => {
    const filteredRows = getDateFilteredRows(rows);
    
    if (filteredRows.length === 0) {
      toast({
        title: "No devices found",
        description: "There are no devices in the current view to export.",
      });
      return;
    }

    const rowsByAmanah: Record<string, string[][]> = {};
    let totalRows = 0;
    let municFromRef = 0;
    let municFromAmanah = 0;

    filteredRows.forEach((row) => {
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
          coordinates = formatCoordinates(instLat, instLon);
        }
      }

      const sensorReadingValue = inst?.sensorReading != null ? String(inst.sensorReading) : "-";
      const englishAmanahName = amanah || "-";
      const amanahForExport = translateTeamNameToArabic(
        englishAmanahName === "-" ? null : englishAmanahName
      ) || englishAmanahName;

      const { value: municipalityName, source: municSource } = resolveMunicipality(location, amanahForExport);
      if (municSource === "location_ref") municFromRef++;
      else if (municSource === "amanah") municFromAmanah++;

      const csvRow = [
        "", // Serial placeholder
        rawLocationId || "-",
        coordinates,
        `="${device.id}"`, // Format as text to prevent Excel scientific notation
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
      description:
        `Exported ${totalRows} row${totalRows === 1 ? "" : "s"} across ${amanahCount} Amanah${amanahCount === 1 ? "" : "s"}. ` +
        `Municipality: ${municFromRef} from location reference, ${municFromAmanah} from Amanah name.`,
    });
  };

  const handleGroupedCsvExport = () => {
    const filteredRows = getDateFilteredRows(rows);
    
    if (filteredRows.length === 0) {
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
      let groupedMunicFromRef = 0;
      let groupedMunicFromAmanah = 0;

      // Process filtered rows
      filteredRows.forEach((row) => {
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
            coordinates = formatCoordinates(instLat, instLon);
          }
        }

        const sensorReadingValue = inst?.sensorReading != null ? String(inst.sensorReading) : "-";
        const englishAmanahName = amanah || "-";
        const amanahForExport = translateTeamNameToArabic(
          englishAmanahName === "-" ? null : englishAmanahName
        ) || englishAmanahName;

        const { value: municipalityName, source: municSource } = resolveMunicipality(location, amanahForExport);
        if (municSource === "location_ref") groupedMunicFromRef++;
        else if (municSource === "amanah") groupedMunicFromAmanah++;

        const csvRow = [
          "", // Serial placeholder
          rawLocationId || "-",
          coordinates,
          `="${device.id}"`, // Format as text to prevent Excel scientific notation
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
        description:
          `Exported ${totalRows} row${totalRows !== 1 ? "s" : ""} grouped by ${sortedAmanahs.length} Amanah${sortedAmanahs.length !== 1 ? "s" : ""}. ` +
          `Municipality: ${groupedMunicFromRef} from location reference, ${groupedMunicFromAmanah} from Amanah name.`,
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

  /**
   * Converts a single image URL to a downsampled base64 data URL (fetch + canvas).
   * Images are scaled so the longest side is at most MAX_IMG_PX pixels — this keeps
   * the base64 string well within JavaScript's string-length limit while still
   * producing crisp output at PDF print resolution.
   * Returns null on failure so the caller can fall back gracefully.
   */
  const MAX_IMG_PX = 1600;
  const fetchImageAsBase64 = async (
    url: string
  ): Promise<{ base64: string; format: "PNG" | "JPEG"; width: number; height: number } | null> => {
    try {
      const freshUrl = await getFreshDownloadURL(url);
      const imgEl = await loadImageElement(freshUrl);

      let w = imgEl.naturalWidth;
      let h = imgEl.naturalHeight;

      // Downsample if larger than the cap to avoid RangeError on very large photos
      if (w > MAX_IMG_PX || h > MAX_IMG_PX) {
        const scale = MAX_IMG_PX / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(imgEl, 0, 0, w, h);
      const format: "PNG" | "JPEG" = freshUrl.toLowerCase().includes(".png") ? "PNG" : "JPEG";
      // Use 0.85 JPEG quality — visually identical in a PDF, ~40% smaller base64
      const base64 = canvas.toDataURL(format === "PNG" ? "image/png" : "image/jpeg", 0.85);
      return { base64, format, width: w, height: h };
    } catch {
      return null;
    }
  };

  /**
   * Pre-fetches all images for the given rows in parallel batches.
   * Returns a Map<originalUrl, {base64, format}> used as a cache during PDF generation
   * so each image is only downloaded once regardless of how many reports reference it.
   * Calls onProgress(fetched, total) after every individual image resolves.
   */
  const prefetchImagesInBatches = async (
    targetRows: typeof rows,
    batchSize = 100,
    onProgress?: (fetched: number, total: number) => void
  ): Promise<Map<string, { base64: string; format: "PNG" | "JPEG"; width: number; height: number }>> => {
    const cache = new Map<string, { base64: string; format: "PNG" | "JPEG"; width: number; height: number }>();

    // Collect unique URLs (at most 2 per device, same slice used later in PDF)
    const allUrls = new Set<string>();
    for (const row of targetRows) {
      const imageUrls: string[] = row.inst?.imageUrls || [];
      const toFetch = imageUrls.length > 1 ? imageUrls.slice(0, 2) : imageUrls.slice(0, 1);
      toFetch.forEach((u) => allUrls.add(u));
    }

    const urlArray = Array.from(allUrls);
    const total = urlArray.length;
    let fetched = 0;

    for (let i = 0; i < urlArray.length; i += batchSize) {
      const batch = urlArray.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (url) => {
          const result = await fetchImageAsBase64(url);
          fetched++;
          onProgress?.(fetched, total);
          return { url, result };
        })
      );

      for (const settled of results) {
        if (settled.status === "fulfilled" && settled.value.result) {
          cache.set(settled.value.url, settled.value.result);
        }
      }
    }

    return cache;
  };

  /**
   * Draw text onto the jsPDF doc at (x, baselineY).
   * For Arabic/RTL text the browser canvas is used so glyphs render correctly;
   * Latin text falls through to the normal jsPDF text path.
   */
  const addPdfText = (
    doc: jsPDF,
    text: string,
    x: number,
    baselineY: number,
    fontSizePt: number,
    color: [number, number, number],
    maxWidthMm: number
  ) => {
    if (!hasArabic(text)) {
      doc.setFontSize(fontSizePt);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...color);
      const truncated = doc.splitTextToSize(text, maxWidthMm)[0] as string;
      doc.text(truncated, x, baselineY);
      return;
    }
    // Arabic: render via canvas so the browser handles shaping + RTL
    const SCALE = 3;                   // supersample for crisp output
    const MM_PX = 3.779528;            // mm → px at 96 dpi
    const pxFont = fontSizePt * 1.3333 * SCALE;
    const pxW = Math.ceil(maxWidthMm * MM_PX * SCALE);
    const pxH = Math.ceil(pxFont * 2);
    const canvas = document.createElement("canvas");
    canvas.width = pxW;
    canvas.height = pxH;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pxW, pxH);
    ctx.font = `${pxFont}px 'Segoe UI', Arial, sans-serif`;
    ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(text, pxW - 4, pxH / 2);
    const mmW = maxWidthMm;
    const mmH = pxH / (MM_PX * SCALE);
    // Place image so its visual baseline aligns with baselineY
    const imgTop = baselineY - mmH * 0.65;
    doc.addImage(canvas.toDataURL("image/png"), "PNG", x, imgTop, mmW, mmH);
  };

  // Generate PDF report for a specific Amanah
  const generateReportForAmanah = async (
    amanahName: string,
    amanahRows: typeof rows,
    locationMapRef: Map<string, Location>,
    imageCache: Map<string, { base64: string; format: "PNG" | "JPEG"; width: number; height: number }> = new Map()
  ) => {
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

      // Resolve amanah / municipality for PDF (same logic as CSV)
      const englishAmanahName = row.amanah && row.amanah !== "-" ? row.amanah : null;
      const amanahDisplay = translateTeamNameToArabic(englishAmanahName) || row.amanah || "N/A";
      const { value: municipalityDisplay } = resolveMunicipality(location ?? null, amanahDisplay);
      const installerName = inst?.installedByName || "N/A";
      const installDate = inst?.createdAt ? format(inst.createdAt, "yyyy-MM-dd HH:mm") : "N/A";

      // Header
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...TEXT_COLOR);
      doc.text(`LOCATION ${locationId}`, leftPanelX, yPos);
      yPos += 8;
      doc.setDrawColor(...PRIMARY_COLOR);
      doc.setLineWidth(1.2);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 12;

      // Left Panel – Details Box
      // Rows: Location No, Latitude, Longitude, Sensor Reading, Amanah, Municipality, Installer, Install Date
      const FIELD_H = 8;
      const FIELDS = [
        { label: "LOCATION NO.", value: locationId },
        { label: "LATITUDE",     value: latitude !== null ? latitude.toFixed(6) : "N/A" },
        { label: "LONGITUDE",    value: longitude !== null ? longitude.toFixed(6) : "N/A" },
        { label: "SENSOR HEIGHT",value: sensorReading !== null ? `${sensorReading} cm` : "N/A" },
        { label: "AMANAH",       value: amanahDisplay },
        { label: "INSTALLER",    value: installerName },
        { label: "INSTALL DATE", value: installDate },
      ];
      const boxPadTop = 7;
      const boxPadBottom = 5;
      const boxY = yPos;
      const boxHeight = boxPadTop + FIELDS.length * FIELD_H + boxPadBottom;

      doc.setDrawColor(...PRIMARY_COLOR);
      doc.setLineWidth(0.8);
      doc.rect(leftPanelX, boxY, leftPanelWidth, boxHeight);

      let textY = boxY + boxPadTop + 2;
      const labelX = leftPanelX + 4;
      const valueX = leftPanelX + 46;
      const maxValueWidth = leftPanelWidth - 46 - 4;

      for (const field of FIELDS) {
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...LABEL_COLOR);
        doc.text(field.label, labelX, textY);
        // addPdfText handles Arabic via canvas and Latin via normal jsPDF path
        addPdfText(doc, field.value, valueX, textY, 7.5, TEXT_COLOR, maxValueWidth);
        textY += FIELD_H;
      }

      // Left Panel – Device Code Box
      const bottomBoxY = boxY + boxHeight + 10;
      const bottomBoxHeight = 24;

      doc.setDrawColor(...PRIMARY_COLOR);
      doc.setLineWidth(0.8);
      doc.rect(leftPanelX, bottomBoxY, leftPanelWidth, bottomBoxHeight);

      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...LABEL_COLOR);
      doc.text("DEVICE CODE", leftPanelX + 6, bottomBoxY + 9);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
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
          const slotX = rightPanelX + framePadding;
          const slotY = multiple ? imageAreaY + index * (slotHeight + slotGap) : imageAreaY;

          try {
            // Use pre-fetched cache first; fall back to live fetch if not cached
            const cached = imageCache.get(imageUrl);
            let base64: string;
            let format: "PNG" | "JPEG";
            let aspectRatio: number;

            if (cached) {
              base64 = cached.base64;
              format = cached.format;
              aspectRatio = cached.width / cached.height;
            } else {
              const fetched = await fetchImageAsBase64(imageUrl);
              if (!fetched) throw new Error("Image fetch returned null");
              base64 = fetched.base64;
              format = fetched.format;
              aspectRatio = fetched.width / fetched.height;
            }

            let targetWidth = slotWidth;
            let targetHeight = slotHeight;
            if (aspectRatio >= slotWidth / slotHeight) {
              targetHeight = slotWidth / aspectRatio;
            } else {
              targetWidth = slotHeight * aspectRatio;
            }

            const offsetX = slotX + (slotWidth - targetWidth) / 2;
            const offsetY = slotY + (slotHeight - targetHeight) / 2;
            doc.addImage(base64, format, offsetX, offsetY, targetWidth, targetHeight);
          } catch (error) {
            console.error(`Error loading image for device ${device.id}:`, error);
            // Last-resort: ask jsPDF to load the URL directly
            try {
              const fallbackUrl = await getFreshDownloadURL(imageUrl);
              const format = fallbackUrl.toLowerCase().includes(".png") ? "PNG" : "JPEG";
              doc.addImage(fallbackUrl, format, slotX, slotY, slotWidth, slotHeight);
            } catch {
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

  // Generate reports for all filtered Amanahs (or a single combined report when UIDs are selected)
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
    setReportProgress({ phase: "fetching", fetched: 0, totalImages: 0, amanahIndex: 0, amanahTotal: 0, amanahName: "" });

    try {
      // Count total images upfront so the progress bar has a denominator
      const totalImages = rows.reduce((sum, row) => {
        const urls: string[] = row.inst?.imageUrls || [];
        return sum + (urls.length > 1 ? 2 : urls.length > 0 ? 1 : 0);
      }, 0);

      // When device UIDs are selected line-by-line, generate ONE combined report
      if (deviceUidsFilter.trim()) {
        setReportProgress({ phase: "fetching", fetched: 0, totalImages, amanahIndex: 0, amanahTotal: 1, amanahName: "" });

        const imageCache = await prefetchImagesInBatches(rows, 100, (fetched) => {
          setReportProgress((prev) => prev ? { ...prev, fetched } : null);
        });

        const reportLabel = `Selected_Devices_${format(new Date(), "yyyy-MM-dd")}`;
        setReportProgress({ phase: "building", fetched: imageCache.size, totalImages, amanahIndex: 1, amanahTotal: 1, amanahName: reportLabel });
        await generateReportForAmanah(reportLabel, rows, locationMap, imageCache);

        toast({
          title: "Report Generated",
          description: `Generated 1 combined report for ${rows.length} selected device(s).`,
        });
        return;
      }

      // Default: group rows by Amanah and generate one PDF per Amanah
      const groupedByAmanah = rows.reduce((acc, row) => {
        const englishAmanahName = row.amanah || "Unknown";
        const amanah = translateTeamNameToArabic(
          englishAmanahName === "Unknown" ? null : englishAmanahName
        ) || englishAmanahName;
        
        if (!acc[amanah]) {
          acc[amanah] = [];
        }
        acc[amanah].push(row);
        return acc;
      }, {} as Record<string, typeof rows>);

      const amanahNames = Object.keys(groupedByAmanah);

      setReportProgress({ phase: "fetching", fetched: 0, totalImages, amanahIndex: 0, amanahTotal: amanahNames.length, amanahName: "" });

      // Pre-fetch all images in parallel batches of 100 before PDF generation
      const imageCache = await prefetchImagesInBatches(rows, 100, (fetched) => {
        setReportProgress((prev) => prev ? { ...prev, fetched } : null);
      });

      // Generate report for each Amanah (images already in cache — no per-device network wait)
      for (let idx = 0; idx < amanahNames.length; idx++) {
        const amanahName = amanahNames[idx];
        setReportProgress({ phase: "building", fetched: imageCache.size, totalImages, amanahIndex: idx + 1, amanahTotal: amanahNames.length, amanahName });
        await generateReportForAmanah(amanahName, groupedByAmanah[amanahName], locationMap, imageCache);
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
      setReportProgress(null);
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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

            {/* From Date/Time Filter for CSV Export */}
            <div className="space-y-2">
              <Label htmlFor="from-datetime">From Date/Time (CSV)</Label>
              <Input
                id="from-datetime"
                type="datetime-local"
                value={fromDateTime}
                onChange={(e) => setFromDateTime(e.target.value)}
                placeholder="Start date/time"
              />
            </div>

            {/* To Date/Time Filter for CSV Export */}
            <div className="space-y-2">
              <Label htmlFor="to-datetime">To Date/Time (CSV)</Label>
              <Input
                id="to-datetime"
                type="datetime-local"
                value={toDateTime}
                onChange={(e) => setToDateTime(e.target.value)}
                placeholder="End date/time"
              />
            </div>

            {/* Last X Devices Filter */}
            <div className="space-y-2">
              <Label htmlFor="last-x-devices">Last X Devices</Label>
              <Input
                id="last-x-devices"
                type="number"
                min={1}
                value={lastXDevices}
                onChange={(e) => {
                  const val = e.target.value;
                  setLastXDevices(val === "" ? "" : Math.max(1, parseInt(val, 10)));
                }}
                placeholder="e.g. 50"
              />
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
                placeholder="Enter device UIDs or partial IDs, one per line (e.g., E75832989D048709 or just E7583)"
                value={deviceUidsFilter}
                onChange={(e) => setDeviceUidsFilter(e.target.value)}
                className="font-mono text-sm h-24 resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Enter device UIDs or partial matches (one per line) to show matching devices. Supports partial matching. Leave empty to show all devices.
              </p>
            </div>
          </div>

          {/* Clear Filters Button */}
          {(teamFilter !== "all" || activeFilter !== 'all' || dateFilter || fromDateTime || toDateTime || lastXDevices !== "" || deviceUidsFilter.trim()) && (
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setTeamFilter("all");
                  setActiveFilter('all');
                  setDateFilter("");
                  setFromDateTime("");
                  setToDateTime("");
                  setLastXDevices("");
                  setDeviceUidsFilter("");
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
                {fromDateTime && (
                  <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 border-green-200">
                    CSV From: {format(new Date(fromDateTime), "MMM d, yyyy HH:mm")}
                  </Badge>
                )}
                {toDateTime && (
                  <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 border-green-200">
                    CSV To: {format(new Date(toDateTime), "MMM d, yyyy HH:mm")}
                  </Badge>
                )}
                {lastXDevices !== "" && (
                  <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 border-blue-200">
                    Last {lastXDevices} devices
                  </Badge>
                )}
                {deviceUidsFilter.trim() && (
                  <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700 border-purple-200">
                    {deviceUidsFilter.split('\n').filter(uid => uid.trim()).length} Device UID{deviceUidsFilter.split('\n').filter(uid => uid.trim()).length !== 1 ? 's' : ''} filtered
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
                variant="outline"
                className="flex items-center gap-2 w-full sm:w-auto bg-red-50 hover:bg-red-100 text-red-700 border-red-200"
                onClick={handleNoLocationExport}
                disabled={exportingNoLocation}
              >
                {exportingNoLocation ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <FileDown className="h-4 w-4" />
                    No Location CSV
                  </>
                )}
              </Button>
              <div className="flex flex-col items-stretch gap-1 w-full sm:w-auto">
                <Button
                  onClick={generateReports}
                  disabled={generatingReport || rows.length === 0}
                  className="flex items-center gap-2 w-full"
                >
                  {generatingReport && reportProgress ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                      {reportProgress.phase === "fetching" ? (
                        <span className="truncate">
                          Fetching images&nbsp;
                          {reportProgress.fetched}&nbsp;/&nbsp;{reportProgress.totalImages}
                        </span>
                      ) : (
                        <span className="truncate">
                          Building PDF&nbsp;
                          {reportProgress.amanahIndex}&nbsp;/&nbsp;{reportProgress.amanahTotal}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4" />
                      Generate Report(s)
                    </>
                  )}
                </Button>
                {generatingReport && reportProgress && (
                  <div className="w-full space-y-0.5">
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-200"
                        style={{
                          width: reportProgress.phase === "fetching"
                            ? reportProgress.totalImages > 0
                              ? `${Math.round((reportProgress.fetched / reportProgress.totalImages) * 100)}%`
                              : "5%"
                            : reportProgress.amanahTotal > 0
                              ? `${Math.round((reportProgress.amanahIndex / reportProgress.amanahTotal) * 100)}%`
                              : "5%",
                        }}
                      />
                    </div>
                    {reportProgress.phase === "building" && reportProgress.amanahName && (
                      <p className="text-xs text-muted-foreground truncate text-center">
                        {reportProgress.amanahName}
                      </p>
                    )}
                  </div>
                )}
              </div>
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
                                {location!.latitude!.toFixed(6)}, {location!.longitude!.toFixed(6)}
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
