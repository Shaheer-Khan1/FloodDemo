import { useEffect, useMemo, useState, useCallback, useRef } from "react";

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
import { Checkbox } from "@/components/ui/checkbox";
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
import * as XLSX from "xlsx";

const storage = getStorage();
const PRIMARY_COLOR: [number, number, number] = [12, 91, 211];
const TEXT_COLOR: [number, number, number] = [33, 33, 33];
const LABEL_COLOR: [number, number, number] = [100, 106, 125];

const SPECIAL_LOCATION_IDS = new Set(["9999", "999"]);
const formatCoordinates = (latitude: number, longitude: number): string =>
  `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

// ─── Amanah geographic bounds (used to validate coordinates) ─────────────────

interface AmanahBounds {
  latMin: number; latMax: number;
  lonMin: number; lonMax: number;
}

const AMANAH_BOUNDS_MINISTRY: Record<string, AmanahBounds> = {
  Albaha:          { latMin: 19.80, latMax: 20.30, lonMin: 41.30, lonMax: 42.20 },
  AlJouf:          { latMin: 29.50, latMax: 31.00, lonMin: 37.00, lonMax: 40.00 },
  Aseer:           { latMin: 17.00, latMax: 20.00, lonMin: 41.00, lonMax: 44.00 },
  Dammam:          { latMin: 25.90, latMax: 27.00, lonMin: 49.50, lonMax: 51.00 },
  HafarAlBatin:    { latMin: 27.30, latMax: 28.20, lonMin: 44.50, lonMax: 46.00 },
  Hail:            { latMin: 26.50, latMax: 28.00, lonMin: 39.50, lonMax: 42.00 },
  Hessa:           { latMin: 24.00, latMax: 26.00, lonMin: 48.00, lonMax: 50.00 },
  Jazan:           { latMin: 16.30, latMax: 17.50, lonMin: 41.20, lonMax: 43.00 },
  Jeddah:          { latMin: 21.00, latMax: 22.00, lonMin: 38.50, lonMax: 40.00 },
  Madina:          { latMin: 23.50, latMax: 25.50, lonMin: 37.00, lonMax: 40.00 },
  Makkah:          { latMin: 20.50, latMax: 22.50, lonMin: 39.00, lonMax: 41.50 },
  Najran:          { latMin: 16.50, latMax: 18.50, lonMin: 44.00, lonMax: 47.00 },
  NorthernBorders: { latMin: 29.00, latMax: 32.00, lonMin: 37.00, lonMax: 42.00 },
  Qassim:          { latMin: 25.50, latMax: 27.50, lonMin: 42.50, lonMax: 45.50 },
  Tabuk:           { latMin: 27.00, latMax: 30.50, lonMin: 34.50, lonMax: 38.50 },
  Taif:            { latMin: 20.80, latMax: 22.30, lonMin: 40.50, lonMax: 42.00 },
};

const AMANAH_KEY_MAP: Record<string, string> = {
  "albaha": "Albaha", "al baha": "Albaha", "baha": "Albaha",
  "aljouf": "AlJouf", "al jouf": "AlJouf", "jouf": "AlJouf",
  "asir": "Aseer",   "aseer": "Aseer",
  "eastern province": "Dammam", "dammam": "Dammam",
  "hafr albatin": "HafarAlBatin", "hafar al batin": "HafarAlBatin",
  "hafaralbatin": "HafarAlBatin", "hafralbatin": "HafarAlBatin",
  "hail": "Hail",    "hael": "Hail",
  "al ahsa": "Hessa", "hessa": "Hessa", "alahsa": "Hessa",
  "jazan": "Jazan",  "jizan": "Jazan",
  "jeddah": "Jeddah","jiddah": "Jeddah",
  "madina": "Madina","madinah": "Madina", "medina": "Madina", "al madinah": "Madina",
  "makkah": "Makkah",
  "najran": "Najran",
  "northern borders": "NorthernBorders", "northern boarders": "NorthernBorders",
  "northernborders": "NorthernBorders",
  "qassim": "Qassim","al qassim": "Qassim","alqassim": "Qassim",
  "tabuk": "Tabuk",  "tabouk": "Tabuk",
  "taif": "Taif",    "altaif": "Taif", "al taif": "Taif",
};

/** 0.5° tolerance on each side of the bounding box */
const COORD_BOUNDS_TOLERANCE = 0.5;

function resolveAmanahKeyForMinistry(teamName: string | null | undefined): string | null {
  if (!teamName) return null;
  const cleaned = teamName
    .toLowerCase()
    .replace(/\s*(team|amanah|region|province|municipality|أمانة|منطقة|محافظة)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return AMANAH_KEY_MAP[cleaned] ?? AMANAH_KEY_MAP[teamName.toLowerCase().trim()] ?? null;
}

function isWithinAmanahBounds(lat: number, lon: number, b: AmanahBounds): boolean {
  return (
    lat >= b.latMin - COORD_BOUNDS_TOLERANCE &&
    lat <= b.latMax + COORD_BOUNDS_TOLERANCE &&
    lon >= b.lonMin - COORD_BOUNDS_TOLERANCE &&
    lon <= b.lonMax + COORD_BOUNDS_TOLERANCE
  );
}

/**
 * Resolve the best available coordinates for a device, validating against the
 * amanah's geographic bounding box when possible.
 *
 * Priority rules:
 *  - Special location IDs (9999/999): prefer installation coords, fall back to location
 *  - Regular locations             : prefer location coords,    fall back to installation
 *
 * After picking the primary candidate, if a valid amanah key exists the
 * coordinates are checked against its bounding box. If they fall outside, the
 * secondary source is tried instead. If neither source is within bounds, the
 * primary source is returned so data is never silently dropped.
 *
 * When `userCapturedOnly` is true, only installation GPS (captured at install)
 * is used — location-reference coordinates are ignored.
 */
function resolveCoords(
  rawLocationId: string,
  location: { latitude?: number | null; longitude?: number | null } | null | undefined,
  inst: { latitude?: number | string | null; longitude?: number | string | null } | null | undefined,
  amanahEnglishName: string | null | undefined,
  userCapturedOnly = false
): { lat: number; lon: number; outOfBounds: boolean } | null {
  const locLat = location?.latitude != null ? parseCoordinate(location.latitude) : null;
  const locLon = location?.longitude != null ? parseCoordinate(location.longitude) : null;
  const instLat = parseCoordinate(inst?.latitude);
  const instLon = parseCoordinate(inst?.longitude);

  if (userCapturedOnly) {
    if (instLat == null || instLon == null) return null;
    const amanahKey = resolveAmanahKeyForMinistry(amanahEnglishName);
    const bounds = amanahKey ? AMANAH_BOUNDS_MINISTRY[amanahKey] : null;
    const outOfBounds = bounds ? !isWithinAmanahBounds(instLat, instLon, bounds) : false;
    return { lat: instLat, lon: instLon, outOfBounds };
  }

  // Determine primary and secondary source based on location ID type
  let primary: { lat: number; lon: number } | null = null;
  let secondary: { lat: number; lon: number } | null = null;

  if (SPECIAL_LOCATION_IDS.has(rawLocationId)) {
    if (instLat != null && instLon != null) primary = { lat: instLat, lon: instLon };
    if (locLat != null && locLon != null) secondary = { lat: locLat, lon: locLon };
  } else {
    if (locLat != null && locLon != null) primary = { lat: locLat, lon: locLon };
    if (instLat != null && instLon != null) secondary = { lat: instLat, lon: instLon };
  }

  const amanahKey = resolveAmanahKeyForMinistry(amanahEnglishName);
  const bounds = amanahKey ? AMANAH_BOUNDS_MINISTRY[amanahKey] : null;

  if (!primary) {
    // Only secondary available — use it; check bounds if known
    if (!secondary) return null;
    const outOfBounds = bounds ? !isWithinAmanahBounds(secondary.lat, secondary.lon, bounds) : false;
    return { ...secondary, outOfBounds };
  }

  // Validate primary against amanah bounds
  if (bounds && !isWithinAmanahBounds(primary.lat, primary.lon, bounds)) {
    // Primary is outside bounds — try secondary
    if (secondary && isWithinAmanahBounds(secondary.lat, secondary.lon, bounds)) {
      return { ...secondary, outOfBounds: false };
    }
    // Neither is within bounds; return primary but flag it
    return { ...primary, outOfBounds: true };
  }

  return { ...primary, outOfBounds: false };
}
const buildReportFileName = (value: string): string => {
  const safeName = value
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w\u0600-\u06FF_-]/g, "")
    .replace(/_+/g, "_");
  const normalizedName = safeName || "Unknown";
  return `${normalizedName}_List_${format(new Date(), "yyyy-MM-dd")}.xlsx`;
};
const parseCoordinate = (value: number | string | null | undefined): number | null => {
  if (value == null) return null;
  const num = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isNaN(num) ? null : num;
};

/** Returns true when the string contains any Arabic / Arabic-Extended characters. */
const hasArabic = (text: string): boolean =>
  /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);

  /** Where a municipality value was resolved from for an export row. */
type MunicSource = "location_ref" | "amanah" | "none";

/**
 * Resolve the municipality to display for an export row.
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
  const [locationIdFilter, setLocationIdFilter] = useState<string>("");
  const [deviceUidsFilter, setDeviceUidsFilter] = useState<string>("");
  /** When filtering by device UIDs, use only installation GPS (not location DB). */
  const [useUserCapturedCoordsOnly, setUseUserCapturedCoordsOnly] = useState(false);

  const preferUserCapturedCoords =
    deviceUidsFilter.trim().length > 0 && useUserCapturedCoordsOnly;

  const deviceUidsWereEmpty = useRef(true);
  useEffect(() => {
    const hasUids = deviceUidsFilter.trim().length > 0;
    if (hasUids && deviceUidsWereEmpty.current) {
      setUseUserCapturedCoordsOnly(true);
    }
    deviceUidsWereEmpty.current = !hasUids;
  }, [deviceUidsFilter]);

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

    // Apply location ID filter (partial match)
    if (locationIdFilter.trim()) {
      const term = locationIdFilter.trim().toLowerCase();
      filtered = filtered.filter((row) =>
        String(row.locationId ?? row.inst?.locationId ?? "").toLowerCase().includes(term)
      );
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
  }, [allRows, activeFilter, teamFilter, debouncedDateFilter, lastXDevices, locationIdFilter, deviceUidsFilter]);
  
  // Paginate rows for performance
  const paginatedRows = useMemo(() => {
    return rows.slice(0, displayLimit);
  }, [rows, displayLimit]);
  
  // Reset display limit when filters change
  useEffect(() => {
    setDisplayLimit(500);
  }, [teamFilter, activeFilter, debouncedDateFilter, lastXDevices, locationIdFilter, deviceUidsFilter]);
  
  // Handle "Show More" button
  const handleShowMore = useCallback(() => {
    setDisplayLimit(prev => prev + 500);
  }, []);

  const downloadXlsx = (rowsData: string[][], filename: string, headers: string[], sheetName = "Export") => {
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rowsData]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.substring(0, 31) || "Export");
    XLSX.writeFile(workbook, filename);
  };

  // Helper function to apply date/time range filter for XLSX exports
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

      // Generate XLSX for each Amanah
      Object.entries(groupedByAmanah).forEach(([amanahName, amanahRows]) => {
        // Sort by installer name and device ID
        const sortedRows = [...amanahRows].sort((a, b) => {
          const nameA = a.inst.installedByName || "";
          const nameB = b.inst.installedByName || "";
          if (nameA !== nameB) return nameA.localeCompare(nameB);
          return a.device.id.localeCompare(b.device.id);
        });

        const headers = [
          "Serial No", "Location ID", "Coordinates", "Device ID", "Installer Name", "Amanah", "Municipality", "Sensor Height", "Type"
        ];

        const exportRows = sortedRows.map((row, index) => {
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
            inst.sensorReading != null ? inst.sensorReading.toString() : "-",
            inst?.type || ""
          ];
        });

        const dateStr = format(new Date(), "yyyy-MM-dd");
        const fileName = `Location_9999_${amanahName.replace(/[^a-z0-9]/gi, "_")}_${dateStr}.xlsx`;
        downloadXlsx(exportRows, fileName, headers, amanahName);
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
        "Serial No", "Location ID", "Device ID", "Installer Name", "Amanah", "Municipality", "Sensor Height", "Installation Date", "Type"
      ];

      let noLocMunicFromRef = 0;
      let noLocMunicFromAmanah = 0;

      const exportRows = sortedRows.map((row, index) => {
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
          inst.createdAt ? format(inst.createdAt, "yyyy-MM-dd HH:mm") : "-",
          inst?.type || ""
        ];
      });

      const dateStr = format(new Date(), "yyyy-MM-dd");
      const fileName = `Devices_No_Location_${dateStr}.xlsx`;
      downloadXlsx(exportRows, fileName, headers, "No Location");

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
    let outOfBoundsCount = 0;

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

      const englishAmanahName = amanah || "-";
      const amanahForExport = translateTeamNameToArabic(
        englishAmanahName === "-" ? null : englishAmanahName
      ) || englishAmanahName;

      const resolved = resolveCoords(rawLocationId, location, inst, amanah, preferUserCapturedCoords);
      const coordinates = resolved ? formatCoordinates(resolved.lat, resolved.lon) : "-";
      if (resolved?.outOfBounds) outOfBoundsCount++;

      const sensorReadingValue = inst?.sensorReading != null ? String(inst.sensorReading) : "-";

      const { value: municipalityName, source: municSource } = resolveMunicipality(location, amanahForExport);
      if (municSource === "location_ref") municFromRef++;
      else if (municSource === "amanah") municFromAmanah++;

      const exportRow = [
          "", // Serial placeholder
          rawLocationId || "-",
          coordinates,
          `="${device.id}"`, // Format as text to prevent Excel scientific notation
          amanahForExport,
          municipalityName,
          sensorReadingValue,
          inst?.type || "",
        ];

        const groupKey = amanahForExport || "Unknown";
        if (!rowsByAmanah[groupKey]) {
          rowsByAmanah[groupKey] = [];
        }
        rowsByAmanah[groupKey].push(exportRow);
        totalRows++;
      });

      const amanahCount = Object.keys(rowsByAmanah).length;
      const headers = ["Serial No", "Location ID", "Coordinates", "Device ID", "Amanah", "Municipality", "Sensor Height", "Type"];
    Object.entries(rowsByAmanah).forEach(([amanahName, exportRows]) => {
      exportRows.forEach((row, index) => {
        row[0] = (index + 1).toString();
      });
      const filename = buildReportFileName(amanahName);
      downloadXlsx(exportRows, filename, headers, amanahName);
    });

    toast({
      title: "Excel downloaded",
      description:
        `Exported ${totalRows} row${totalRows === 1 ? "" : "s"} across ${amanahCount} Amanah${amanahCount === 1 ? "" : "s"}. ` +
        `${preferUserCapturedCoords ? "Coordinates: installation GPS only. " : ""}` +
        `${outOfBoundsCount > 0 ? `⚠️ ${outOfBoundsCount} device${outOfBoundsCount === 1 ? "" : "s"} with out-of-bounds coordinates. ` : ""}` +
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
      let groupedOutOfBoundsCount = 0;

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

        const englishAmanahName = amanah || "-";
        const amanahForExport = translateTeamNameToArabic(
          englishAmanahName === "-" ? null : englishAmanahName
        ) || englishAmanahName;

        const resolved = resolveCoords(rawLocationId, location, inst, amanah, preferUserCapturedCoords);
        const coordinates = resolved ? formatCoordinates(resolved.lat, resolved.lon) : "-";
        if (resolved?.outOfBounds) groupedOutOfBoundsCount++;

        const sensorReadingValue = inst?.sensorReading != null ? String(inst.sensorReading) : "-";

        const { value: municipalityName, source: municSource } = resolveMunicipality(location, amanahForExport);
        if (municSource === "location_ref") groupedMunicFromRef++;
        else if (municSource === "amanah") groupedMunicFromAmanah++;

        const exportRow = [
          "", // Serial placeholder
          rawLocationId || "-",
          coordinates,
          `="${device.id}"`, // Format as text to prevent Excel scientific notation
          amanahForExport,
          municipalityName,
          sensorReadingValue,
          inst?.type || "",
        ];

        const groupKey = amanahForExport || "Unknown";
        if (!rowsByAmanah[groupKey]) {
          rowsByAmanah[groupKey] = [];
        }
        rowsByAmanah[groupKey].push(exportRow);
        totalRows++;
      });

      // Sort Amanahs alphabetically
      const sortedAmanahs = Object.keys(rowsByAmanah).sort();

      // Build single XLSX with grouped data
      const headers = ["Serial No", "Location ID", "Coordinates", "Device ID", "Amanah", "Municipality", "Sensor Height", "Type"];
      const allExportRows: string[][] = [];

      // Add each Amanah group
      sortedAmanahs.forEach((amanahName) => {
        const amanahRows = rowsByAmanah[amanahName];
        
        // Add numbered rows for this Amanah
        amanahRows.forEach((row, index) => {
          const numberedRow = [...row];
          numberedRow[0] = (index + 1).toString(); // Set serial number
          allExportRows.push(numberedRow);
        });
      });

      const dateStr = format(new Date(), "yyyy-MM-dd");
      downloadXlsx(allExportRows, `All_Installations_Grouped_by_Amanah_${dateStr}.xlsx`, headers, "Grouped Amanah");

      toast({
        title: "Excel downloaded",
        description:
          `Exported ${totalRows} row${totalRows !== 1 ? "s" : ""} grouped by ${sortedAmanahs.length} Amanah${sortedAmanahs.length !== 1 ? "s" : ""}. ` +
          `${preferUserCapturedCoords ? "Coordinates: installation GPS only. " : ""}` +
          `${groupedOutOfBoundsCount > 0 ? `⚠️ ${groupedOutOfBoundsCount} device${groupedOutOfBoundsCount === 1 ? "" : "s"} with out-of-bounds coordinates. ` : ""}` +
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

  /**
   * Fetches raw image bytes with a timeout guard so a single slow/hanging
   * request can't stall an entire batch. This hits the stored URL directly —
   * no Firebase Storage SDK round-trip needed, since imageUrls already
   * contain valid, non-expiring download tokens. That extra round-trip
   * (getDownloadURL per image) was the single biggest bottleneck when
   * generating reports for Amanahs with thousands of images.
   */
  /**
   * Fetches raw image bytes with a STALL-based timeout rather than a fixed
   * total deadline: the abort timer resets every time a chunk of data
   * arrives, so a large photo on a busy connection can take as long as it
   * needs — we only give up if the connection goes silent for `stallMs`.
   * (A fixed total timeout caused mass AbortErrors when many parallel
   * downloads shared limited bandwidth and each one slowed down.)
   */
  const fetchImageBlobOnce = async (url: string, stallMs: number): Promise<Blob> => {
    const controller = new AbortController();
    let timer = setTimeout(() => controller.abort(), stallMs);
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => controller.abort(), stallMs);
    };

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      if (!response.body) {
        resetTimer();
        return await response.blob();
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      resetTimer();
      // Read chunk by chunk; each received chunk proves the connection is alive
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
        resetTimer();
      }
      return new Blob(chunks, { type: response.headers.get("content-type") || "image/jpeg" });
    } finally {
      clearTimeout(timer);
    }
  };

  /**
   * Fetches raw image bytes with retries + backoff for transient failures.
   */
  const fetchImageBlob = async (url: string, stallMs = 20000, retries = 2): Promise<Blob> => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fetchImageBlobOnce(url, stallMs);
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        }
      }
    }
    throw lastError;
  };

  const loadImageElementFromBlob = (blob: Blob): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Image failed to decode"));
      };
      img.src = objectUrl;
    });

  /**
   * Decodes a Blob into a drawable image source, preferring createImageBitmap
   * (decodes off the main thread where supported) and falling back to an
   * <img> element for browsers/formats that don't support it.
   */
  const decodeImageBlob = async (
    blob: Blob
  ): Promise<{ drawable: ImageBitmap | HTMLImageElement; width: number; height: number }> => {
    if (typeof createImageBitmap === "function") {
      try {
        const bitmap = await createImageBitmap(blob);
        return { drawable: bitmap, width: bitmap.width, height: bitmap.height };
      } catch {
        // fall through to <img> decode below
      }
    }
    const imgEl = await loadImageElementFromBlob(blob);
    return { drawable: imgEl, width: imgEl.naturalWidth, height: imgEl.naturalHeight };
  };

  /**
   * Encodes a scaled-down copy of an image to JPEG bytes, preferring
   * OffscreenCanvas.convertToBlob (async, encodes off the main thread in
   * modern browsers) over the synchronous canvas.toDataURL path.
   */
  const encodeScaledJpeg = async (
    drawable: ImageBitmap | HTMLImageElement,
    w: number,
    h: number
  ): Promise<Uint8Array | null> => {
    if (typeof OffscreenCanvas === "function") {
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(drawable as CanvasImageSource, 0, 0, w, h);
        const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.82 });
        return new Uint8Array(await blob.arrayBuffer());
      }
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(drawable as CanvasImageSource, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82)
    );
    if (!blob) return null;
    return new Uint8Array(await blob.arrayBuffer());
  };

  /**
   * Fetches an image and returns raw bytes ready for jsPDF embedding.
   *
   * Fast path: if the downloaded file is already a JPEG/PNG whose longest
   * side is within MAX_IMG_PX, the original bytes are used as-is — no
   * canvas redraw, no re-encode. Only oversized photos get downscaled and
   * re-encoded (via OffscreenCanvas where available). Passing Uint8Array to
   * jsPDF also skips base64 entirely, which is faster and uses ~33% less
   * memory than data-URL strings.
   *
   * URL resolution: hits the stored download URL directly; only falls back
   * to a fresh Storage SDK URL if the direct fetch fails.
   * Returns null on failure so the caller can fall back gracefully.
   */
  const MAX_IMG_PX = 2000;
  type PdfImageData = { data: Uint8Array; format: "PNG" | "JPEG"; width: number; height: number };
  const fetchImagePdfData = async (url: string): Promise<PdfImageData | null> => {
    let blob: Blob;
    try {
      blob = await fetchImageBlob(url);
    } catch {
      try {
        const freshUrl = await getFreshDownloadURL(url);
        blob = await fetchImageBlob(freshUrl);
      } catch (error) {
        console.error("Failed to fetch image:", url, error);
        return null;
      }
    }

    try {
      const { drawable, width: rawW, height: rawH } = await decodeImageBlob(blob);
      const mime = (blob.type || "").toLowerCase();
      const isJpeg = mime.includes("jpeg") || mime.includes("jpg");
      const isPng = mime.includes("png");

      // Fast path: original bytes are directly embeddable, skip re-encode
      if ((isJpeg || isPng) && rawW <= MAX_IMG_PX && rawH <= MAX_IMG_PX) {
        if (typeof (drawable as ImageBitmap).close === "function") {
          (drawable as ImageBitmap).close();
        }
        return {
          data: new Uint8Array(await blob.arrayBuffer()),
          format: isPng ? "PNG" : "JPEG",
          width: rawW,
          height: rawH,
        };
      }

      // Oversized (or exotic format): downscale and re-encode as JPEG
      const scale = Math.min(1, MAX_IMG_PX / Math.max(rawW, rawH));
      const w = Math.max(1, Math.round(rawW * scale));
      const h = Math.max(1, Math.round(rawH * scale));
      const data = await encodeScaledJpeg(drawable, w, h);
      if (typeof (drawable as ImageBitmap).close === "function") {
        (drawable as ImageBitmap).close();
      }
      if (!data) return null;
      return { data, format: "JPEG", width: w, height: h };
    } catch (error) {
      console.error("Failed to decode image:", url, error);
      return null;
    }
  };

  /**
   * Pre-fetches all images for the given rows using a bounded worker pool
   * (instead of fixed-size sequential batches). Each worker grabs the next
   * URL as soon as it's free, so a handful of slow images no longer stall
   * the whole queue waiting for the slowest item in a batch — this is
   * dramatically faster for Amanahs with thousands of images.
   * Returns a Map<originalUrl, PdfImageData> used as a cache during PDF generation
   * so each image is only downloaded once regardless of how many reports reference it.
   * Calls onProgress(fetched, total) after every individual image resolves.
   */
  const prefetchImagesInBatches = async (
    targetRows: typeof rows,
    concurrency = 12,
    onProgress?: (fetched: number, total: number) => void
  ): Promise<Map<string, PdfImageData>> => {
    const cache = new Map<string, PdfImageData>();

    // Collect unique URLs — ALL images for every device are included
    const allUrls = new Set<string>();
    for (const row of targetRows) {
      const imageUrls: string[] = row.inst?.imageUrls || [];
      imageUrls.forEach((u) => allUrls.add(u));
    }

    const urlArray = Array.from(allUrls);
    const total = urlArray.length;
    let fetched = 0;
    let nextIndex = 0;

    const worker = async () => {
      while (nextIndex < urlArray.length) {
        const currentIndex = nextIndex++;
        const url = urlArray[currentIndex];
        const result = await fetchImagePdfData(url);
        if (result) {
          cache.set(url, result);
        }
        fetched++;
        onProgress?.(fetched, total);
      }
    };

    const workerCount = Math.min(concurrency, Math.max(urlArray.length, 1));
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

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
  type ReportIssueReason = "device_not_found" | "no_images" | "image_load_failed" | "page_error";
  type ReportIssue = { deviceId: string; reason: ReportIssueReason };

  const drawImagePlaceholder = (
    doc: jsPDF,
    centerX: number,
    centerY: number,
    message: string
  ) => {
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.text(message, centerX, centerY, { align: "center" });
    doc.setFont("helvetica", "normal");
  };

  const generateReportForAmanah = async (
    amanahName: string,
    amanahRows: typeof rows,
    locationMapRef: Map<string, Location>,
    imageCache: Map<string, PdfImageData> = new Map(),
    deviceLookup: Map<string, Device> = new Map()
  ): Promise<{ issues: ReportIssue[]; pagesGenerated: number }> => {
    const issues: ReportIssue[] = [];
    const margin = 10;
    const HEADER_BAR_COLOR: [number, number, number] = [17, 34, 64];
    const BADGE_COLOR: [number, number, number] = [8, 178, 196];
    const GPS_BAR_COLOR: [number, number, number] = [240, 241, 244];
    let pagesGenerated = 0;

    // jsPDF builds each document by joining an internal array of strings — once
    // the embedded image data for a single document gets too large, that join
    // blows past the JS engine's max string length and throws
    // "RangeError: Invalid string length". Amanahs with thousands of large
    // photos can easily exceed this, so we track the embedded data size as we
    // go and split into multiple PDF files ("_Part1", "_Part2", ...) once a
    // document gets close to the limit — keeping every file safely small
    // while still allowing full-size images.
    const MAX_DOC_IMAGE_BYTES = 300_000_000;
    const completedDocs: jsPDF[] = [];
    let doc = new jsPDF();
    let pageWidth = doc.internal.pageSize.getWidth();
    let pageHeight = doc.internal.pageSize.getHeight();
    let contentX = margin;
    let contentWidth = pageWidth - margin * 2;
    let pagesInCurrentDoc = 0;
    let currentDocImageBytes = 0;

    for (let i = 0; i < amanahRows.length; i++) {
      const row = amanahRows[i];
      const { device, inst } = row;
      const deviceId = device?.id || inst?.deviceId || "unknown";
      const deviceMissingFromMaster = !deviceLookup.has(deviceId);

      try {
        if (deviceMissingFromMaster) {
          issues.push({ deviceId, reason: "device_not_found" });
        }

        const locationId = inst?.locationId ? String(inst.locationId).trim() : "N/A";
        const location = locationMapRef.get(locationId);
        const resolved = resolveCoords(locationId, location, inst, row.amanah, preferUserCapturedCoords);
        const latitude = resolved?.lat ?? null;
        const longitude = resolved?.lon ?? null;
        const sensorReading = inst?.sensorReading ?? null;

        const englishAmanahName = row.amanah && row.amanah !== "-" ? row.amanah : null;
        const amanahDisplay = translateTeamNameToArabic(englishAmanahName) || row.amanah || "N/A";
        const installerName = inst?.installedByName || "N/A";
        const installDate = inst?.createdAt ? format(inst.createdAt, "yyyy-MM-dd HH:mm") : "N/A";

        // ALL of the device's images are included, up to 2 per page (kept
        // large); devices with more than 2 photos get continuation pages.
        const imagesToInclude: string[] = inst?.imageUrls || [];
        const IMAGES_PER_PAGE = 2;
        const pageChunks: string[][] = [];
        if (imagesToInclude.length === 0) {
          issues.push({ deviceId, reason: "no_images" });
          pageChunks.push([]);
        } else {
          for (let c = 0; c < imagesToInclude.length; c += IMAGES_PER_PAGE) {
            pageChunks.push(imagesToInclude.slice(c, c + IMAGES_PER_PAGE));
          }
        }

        let loadedCount = 0;

        for (let pageIdx = 0; pageIdx < pageChunks.length; pageIdx++) {
          const chunk = pageChunks[pageIdx];

          if (pagesInCurrentDoc > 0 && currentDocImageBytes > MAX_DOC_IMAGE_BYTES) {
            completedDocs.push(doc);
            doc = new jsPDF();
            pageWidth = doc.internal.pageSize.getWidth();
            pageHeight = doc.internal.pageSize.getHeight();
            contentX = margin;
            contentWidth = pageWidth - margin * 2;
            pagesInCurrentDoc = 0;
            currentDocImageBytes = 0;
          }

          if (pagesInCurrentDoc > 0) {
            doc.addPage();
          }
          pagesInCurrentDoc++;
          pagesGenerated++;

          // --- Header bar: index badge + device ID (large, full width) ---
          const headerY = margin;
          const headerH = 16;
          doc.setFillColor(...HEADER_BAR_COLOR);
          doc.rect(contentX, headerY, contentWidth, headerH, "F");

          const badgeW = 16;
          const badgeH = headerH;
          doc.setFillColor(...BADGE_COLOR);
          doc.rect(contentX, headerY, badgeW, badgeH, "F");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.setTextColor(255, 255, 255);
          doc.text(`#${i + 1}`, contentX + badgeW / 2, headerY + badgeH / 2 + 1.5, { align: "center" });

          doc.setFontSize(13);
          doc.text(deviceId, contentX + badgeW + 6, headerY + badgeH / 2 + 1.5);

          if (pageChunks.length > 1) {
            doc.setFontSize(9);
            doc.text(`Photos ${pageIdx + 1}/${pageChunks.length}`, contentX + contentWidth - 4, headerY + badgeH / 2 + 1.5, { align: "right" });
          }

          // --- GPS bar ---
          const gpsY = headerY + headerH;
          const gpsH = 10;
          doc.setFillColor(...GPS_BAR_COLOR);
          doc.setDrawColor(210, 212, 218);
          doc.setLineWidth(0.3);
          doc.rect(contentX, gpsY, contentWidth, gpsH, "FD");

          const gpsTextY = gpsY + gpsH / 2 + 1.2;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.setTextColor(...BADGE_COLOR);
          doc.text("GPS:", contentX + 4, gpsTextY);

          const hasCoords = latitude !== null && longitude !== null;
          doc.setTextColor(...TEXT_COLOR);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9.5);
          doc.text(
            hasCoords ? `${latitude!.toFixed(6)}\u00B0 N,  ${longitude!.toFixed(6)}\u00B0 E` : "N/A",
            contentX + 16,
            gpsTextY
          );

          if (hasCoords) {
            const mapsUrl = `https://maps.google.com/?q=${latitude},${longitude}`;
            const mapsLabel = `maps.google.com/?q=${latitude!.toFixed(6)},${longitude!.toFixed(6)}`;
            doc.setFont("helvetica", "italic");
            doc.setFontSize(8);
            doc.setTextColor(110, 116, 130);
            doc.textWithLink(mapsLabel, contentX + contentWidth - 4, gpsTextY, { url: mapsUrl, align: "right" });
            doc.setFont("helvetica", "normal");
          }

          // --- Details strip: compact two-row grid ---
          const detailY = gpsY + gpsH + 2;
          const detailH = 16;
          doc.setDrawColor(...PRIMARY_COLOR);
          doc.setLineWidth(0.5);
          doc.rect(contentX, detailY, contentWidth, detailH);

          const DETAIL_FIELDS: { label: string; value: string }[] = [
            { label: "LOCATION NO.", value: locationId },
            { label: "SENSOR HEIGHT", value: sensorReading !== null ? `${sensorReading} cm` : "N/A" },
            { label: "AMANAH", value: amanahDisplay },
            { label: "INSTALLER", value: installerName },
            { label: "INSTALL DATE", value: installDate },
          ];
          const colWidth = contentWidth / 3;
          const rowH = detailH / 2;
          DETAIL_FIELDS.forEach((field, idx) => {
            const col = idx % 3;
            const rowNum = Math.floor(idx / 3);
            const cellX = contentX + col * colWidth;
            const cellY = detailY + rowNum * rowH;
            const labelX = cellX + 3;
            const labelBaselineY = cellY + rowH / 2 - 1.5;
            const valueBaselineY = cellY + rowH / 2 + 3.5;
            doc.setFont("helvetica", "bold");
            doc.setFontSize(6.5);
            doc.setTextColor(...LABEL_COLOR);
            doc.text(field.label, labelX, labelBaselineY);
            addPdfText(doc, field.value, labelX, valueBaselineY, 7.5, TEXT_COLOR, colWidth - 6);
          });
          doc.setTextColor(...TEXT_COLOR);

          // --- Image area: takes up nearly the entire remaining page ---
          const imageAreaY = detailY + detailH + 4;
          const imageAreaBottom = pageHeight - margin;
          const availableHeight = imageAreaBottom - imageAreaY;
          const isSingle = chunk.length === 1;
          const slotGap = isSingle ? 0 : 4;
          const slotCount = Math.max(chunk.length, 1);
          const slotHeight = slotCount === 1 ? availableHeight : (availableHeight - slotGap * (slotCount - 1)) / slotCount;
          const slotWidth = contentWidth;

          doc.setDrawColor(...PRIMARY_COLOR);
          doc.setLineWidth(0.5);
          doc.rect(contentX, imageAreaY, contentWidth, availableHeight);

          if (chunk.length === 0) {
            drawImagePlaceholder(
              doc,
              contentX + contentWidth / 2,
              imageAreaY + availableHeight / 2,
              "No images available"
            );
            continue;
          }

          for (let index = 0; index < chunk.length; index++) {
            const imageUrl = chunk[index];
            const slotX = contentX;
            const slotY = imageAreaY + index * (slotHeight + slotGap);
            const slotCenterX = slotX + slotWidth / 2;
            const slotCenterY = slotY + slotHeight / 2;

            let imageDrawn = false;

            try {
              const image = imageCache.get(imageUrl) ?? (await fetchImagePdfData(imageUrl));

              if (image) {
                const aspectRatio = image.width / image.height;
                let targetWidth = slotWidth;
                let targetHeight = slotHeight;
                if (aspectRatio >= slotWidth / slotHeight) {
                  targetHeight = slotWidth / aspectRatio;
                } else {
                  targetWidth = slotHeight * aspectRatio;
                }

                const offsetX = slotX + (slotWidth - targetWidth) / 2;
                const offsetY = slotY + (slotHeight - targetHeight) / 2;
                doc.addImage(image.data, image.format, offsetX, offsetY, targetWidth, targetHeight);
                currentDocImageBytes += image.data.byteLength;
                imageDrawn = true;
                loadedCount++;
              }
            } catch (error) {
              console.error(`Error loading image for device ${deviceId}:`, error);
            }

            if (!imageDrawn) {
              drawImagePlaceholder(doc, slotCenterX, slotCenterY, "Image not available");
            }
          }
        }

        if (imagesToInclude.length > 0 && loadedCount === 0) {
          issues.push({ deviceId, reason: "image_load_failed" });
        }
      } catch (error) {
        console.error(`Error generating PDF page for device ${deviceId}:`, error);
        issues.push({ deviceId, reason: "page_error" });
      }
    }

    if (pagesInCurrentDoc > 0) {
      completedDocs.push(doc);
    }

    const baseName = amanahName.replace(/[^a-z0-9]/gi, "_");
    for (let partIdx = 0; partIdx < completedDocs.length; partIdx++) {
      const fileName = completedDocs.length > 1
        ? `${baseName}_Report_Part${partIdx + 1}.pdf`
        : `${baseName}_Report.pdf`;
      completedDocs[partIdx].save(fileName);
      // Small delay between triggered downloads so browsers don't block/drop them
      if (partIdx < completedDocs.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    return { issues, pagesGenerated };
  };

  const formatReportIssuesToast = (issues: ReportIssue[], reportsGenerated: number) => {
    const uniqueDevices = new Set(issues.map((issue) => issue.deviceId));
    const noImages = issues.filter((issue) => issue.reason === "no_images");
    const imageFailed = issues.filter((issue) => issue.reason === "image_load_failed");
    const deviceNotFound = issues.filter((issue) => issue.reason === "device_not_found");
    const pageErrors = issues.filter((issue) => issue.reason === "page_error");

    const sampleIds = (list: ReportIssue[], limit = 3) =>
      Array.from(new Set(list.map((issue) => issue.deviceId))).slice(0, limit).join(", ");

    const parts = [`Generated ${reportsGenerated} report${reportsGenerated === 1 ? "" : "s"}.`];

    if (noImages.length > 0) {
      parts.push(
        `${noImages.length} device${noImages.length === 1 ? "" : "s"} with no images` +
          (sampleIds(noImages) ? ` (e.g. ${sampleIds(noImages)})` : "") +
          "."
      );
    }
    if (imageFailed.length > 0) {
      parts.push(
        `${imageFailed.length} device${imageFailed.length === 1 ? "" : "s"} with image load errors` +
          (sampleIds(imageFailed) ? ` (e.g. ${sampleIds(imageFailed)})` : "") +
          "."
      );
    }
    if (deviceNotFound.length > 0) {
      parts.push(
        `${deviceNotFound.length} device${deviceNotFound.length === 1 ? "" : "s"} not in master list` +
          (sampleIds(deviceNotFound) ? ` (e.g. ${sampleIds(deviceNotFound)})` : "") +
          "."
      );
    }
    if (pageErrors.length > 0) {
      parts.push(
        `${pageErrors.length} device${pageErrors.length === 1 ? "" : "s"} had page errors` +
          (sampleIds(pageErrors) ? ` (e.g. ${sampleIds(pageErrors)})` : "") +
          "."
      );
    }

    if (uniqueDevices.size === 0) {
      return parts.join(" ");
    }

    return parts.join(" ");
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
      const allIssues: ReportIssue[] = [];
      let reportsGenerated = 0;

      // Count total images upfront so the progress bar has a denominator
      const totalImages = rows.reduce((sum, row) => {
        return sum + (row.inst?.imageUrls?.length || 0);
      }, 0);

      // When device UIDs are selected line-by-line, generate ONE combined report
      if (deviceUidsFilter.trim()) {
        setReportProgress({ phase: "fetching", fetched: 0, totalImages, amanahIndex: 0, amanahTotal: 1, amanahName: "" });

        const imageCache = await prefetchImagesInBatches(rows, 12, (fetched) => {
          setReportProgress((prev) => prev ? { ...prev, fetched } : null);
        });

        const reportLabel = `Selected_Devices_${format(new Date(), "yyyy-MM-dd")}`;
        setReportProgress({ phase: "building", fetched: imageCache.size, totalImages, amanahIndex: 1, amanahTotal: 1, amanahName: reportLabel });
        const result = await generateReportForAmanah(reportLabel, rows, locationMap, imageCache, deviceMap);
        allIssues.push(...result.issues);
        reportsGenerated = 1;

        toast({
          title: "Report Generated",
          description: formatReportIssuesToast(allIssues, reportsGenerated),
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

      const imageCache = await prefetchImagesInBatches(rows, 12, (fetched) => {
        setReportProgress((prev) => prev ? { ...prev, fetched } : null);
      });

      for (let idx = 0; idx < amanahNames.length; idx++) {
        const amanahName = amanahNames[idx];
        setReportProgress({ phase: "building", fetched: imageCache.size, totalImages, amanahIndex: idx + 1, amanahTotal: amanahNames.length, amanahName });
        try {
          const result = await generateReportForAmanah(
            amanahName,
            groupedByAmanah[amanahName],
            locationMap,
            imageCache,
            deviceMap
          );
          allIssues.push(...result.issues);
          reportsGenerated++;
        } catch (error) {
          console.error(`Error generating report for ${amanahName}:`, error);
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      toast({
        title: reportsGenerated > 0 ? "Reports Generated" : "Report Generation Incomplete",
        variant: reportsGenerated > 0 ? "default" : "destructive",
        description: reportsGenerated > 0
          ? formatReportIssuesToast(allIssues, reportsGenerated)
          : "No reports could be generated. Check the console for details.",
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

            {/* Location ID Filter */}
            <div className="space-y-2">
              <Label htmlFor="location-id-filter">Location ID</Label>
              <Input
                id="location-id-filter"
                placeholder="Search location ID..."
                value={locationIdFilter}
                onChange={(e) => setLocationIdFilter(e.target.value)}
                className="font-mono"
              />
            </div>

            {/* From Date/Time Filter for Excel Export */}
            <div className="space-y-2">
              <Label htmlFor="from-datetime">From Date/Time (Excel)</Label>
              <Input
                id="from-datetime"
                type="datetime-local"
                value={fromDateTime}
                onChange={(e) => setFromDateTime(e.target.value)}
                placeholder="Start date/time"
              />
            </div>

            {/* To Date/Time Filter for Excel Export */}
            <div className="space-y-2">
              <Label htmlFor="to-datetime">To Date/Time (Excel)</Label>
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
              {deviceUidsFilter.trim() && (
                <div className="flex items-start gap-3 rounded-md border bg-muted/40 p-3">
                  <Checkbox
                    id="user-captured-coords-only"
                    checked={useUserCapturedCoordsOnly}
                    onCheckedChange={(checked) =>
                      setUseUserCapturedCoordsOnly(checked === true)
                    }
                  />
                  <div className="space-y-1 leading-none">
                    <Label
                      htmlFor="user-captured-coords-only"
                      className="text-sm font-medium cursor-pointer"
                    >
                      Use installation GPS only
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Excel and PDF exports use coordinates captured on the device at install time,
                      not the location reference database.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Clear Filters Button */}
          {(teamFilter !== "all" || activeFilter !== 'all' || dateFilter || locationIdFilter.trim() || fromDateTime || toDateTime || lastXDevices !== "" || deviceUidsFilter.trim()) && (
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
                  setLocationIdFilter("");
                  setDeviceUidsFilter("");
                  setUseUserCapturedCoordsOnly(false);
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
                {locationIdFilter.trim() && (
                  <Badge variant="secondary" className="text-xs bg-teal-100 text-teal-800 border-teal-200">
                    Location ID: {locationIdFilter.trim()}
                  </Badge>
                )}
                {activeFilter !== 'all' && (
                  <Badge variant="secondary" className="text-xs">
                    {activeFilter === 'withServerData' ? 'With Server Data' : 'No Server Data'}
                  </Badge>
                )}
                {fromDateTime && (
                  <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 border-green-200">
                    Excel From: {format(new Date(fromDateTime), "MMM d, yyyy HH:mm")}
                  </Badge>
                )}
                {toDateTime && (
                  <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 border-green-200">
                    Excel To: {format(new Date(toDateTime), "MMM d, yyyy HH:mm")}
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
                {preferUserCapturedCoords && (
                  <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800 border-amber-200">
                    Installation GPS only
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
                Download Excel
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
                    Grouped Excel by Amanah
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
                    Location 9999 Excel
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
                    No Location Excel
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
