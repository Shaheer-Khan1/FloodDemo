import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Flag,
  Loader2,
  MapPin,
  Pencil,
  RefreshCw,
  Shuffle,
  X,
} from "lucide-react";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { applyFieldUpdates } from "@/lib/installation-field-history";

// ─── Amanah geographic bounds ────────────────────────────────────────────────

interface Bounds {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

const AMANAH_BOUNDS: Record<string, Bounds> = {
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

/** Arabic names keyed by amanah key — used for CSV export */
const AMANAH_ARABIC: Record<string, string> = {
  Albaha:          "أمانة منطقة الباحة",
  AlJouf:          "أمانة منطقة الجوف",
  Aseer:           "أمانة منطقة عسير",
  Dammam:          "أمانة المنطقة الشرقية",
  HafarAlBatin:    "أمانة محافظة حفر الباطن",
  Hail:            "أمانة منطقة حائل",
  Hessa:           "أمانة محافظة الاحساء",
  Jazan:           "أمانة منطقة جازان",
  Jeddah:          "أمانة محافظة جدة",
  Madina:          "أمانة منطقة المدينة المنورة",
  Makkah:          "أمانة العاصمة المقدسة",
  Najran:          "أمانة منطقة نجران",
  NorthernBorders: "أمانة منطقة الحدود الشمالية",
  Qassim:          "أمانة منطقة القصيم",
  Tabuk:           "أمانة منطقة تبوك",
  Taif:            "أمانة محافظة الطائف",
};

/** Human-readable display labels */
const AMANAH_LABELS: Record<string, string> = {
  Albaha:          "Al Bahah",
  AlJouf:          "Al Jouf",
  Aseer:           "Aseer (Asir)",
  Dammam:          "Dammam (Eastern Province)",
  HafarAlBatin:    "Hafar Al Batin",
  Hail:            "Ha'il",
  Hessa:           "Hessa (Al Ahsa)",
  Jazan:           "Jazan",
  Jeddah:          "Jeddah",
  Madina:          "Madina",
  Makkah:          "Makkah",
  Najran:          "Najran",
  NorthernBorders: "Northern Borders",
  Qassim:          "Qassim",
  Tabuk:           "Tabuk",
  Taif:            "Taif",
};

/**
 * Map normalised team-name fragments → canonical amanah key.
 * Keys are lower-cased, spaces collapsed to single space.
 */
const TEAM_NAME_TO_KEY: Record<string, string> = {
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

function resolveAmanahKey(teamName: string | undefined | null): string | null {
  if (!teamName) return null;
  // Strip common suffixes, collapse spaces, lowercase
  const cleaned = teamName
    .toLowerCase()
    .replace(/\s*(team|amanah|region|province|municipality|أمانة|منطقة|محافظة)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return TEAM_NAME_TO_KEY[cleaned] ?? TEAM_NAME_TO_KEY[teamName.toLowerCase().trim()] ?? null;
}

/** Extra degrees added to each edge of an amanah's bounding box */
const BOUNDS_TOLERANCE = 0.5;

function isWithinBounds(lat: number, lon: number, b: Bounds, tolerance = BOUNDS_TOLERANCE): boolean {
  return (
    lat >= b.latMin - tolerance &&
    lat <= b.latMax + tolerance &&
    lon >= b.lonMin - tolerance &&
    lon <= b.lonMax + tolerance
  );
}

// ─── random-coord helpers ─────────────────────────────────────────────────────

function randomInRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function randomCoordInBounds(b: Bounds) {
  return {
    lat: randomInRange(b.latMin, b.latMax),
    lon: randomInRange(b.lonMin, b.lonMax),
  };
}

// ─── types ───────────────────────────────────────────────────────────────────

interface NoCoordDevice {
  installationId: string;
  deviceId: string;
  teamId: string | null;
  teamName: string;
  amanahKey: string | null;
  amanahLabel: string;
  bounds: Bounds | null;
}

interface DuplicateDevice {
  installationId: string;
  deviceId: string;
  teamName: string;
  amanahKey: string | null;
  amanahLabel: string;
  bounds: Bounds | null;
  lat: number;
  lon: number;
  locationId: string | null;
  instLatitude: number | null;
  instLongitude: number | null;
}

interface DuplicateGroup {
  coordKey: string;
  lat: number;
  lon: number;
  devices: DuplicateDevice[];
}

/** Device opened in the edit-coordinates dialog */
interface EditTarget {
  installationId: string;
  deviceId: string;
  lat: number | null;
  lon: number | null;
  amanahKey: string | null;
  bounds: Bounds | null;
}

interface FlaggedInstallation {
  installationId: string;
  deviceId: string;
  teamId: string | null;
  teamName: string;
  amanahKey: string | null;
  amanahLabel: string;
  lat: number;
  lon: number;
  bounds: Bounds | null;
  alreadyFlagged: boolean;
  tags: string[];
  /** Firestore doc ID of the location document, if coords came from the locations collection */
  locationDocId: string | null;
  locationId: string | null;
  instLatitude: number | null;
  instLongitude: number | null;
}

const COORD_FLAG_TAG = "coordinate out of amanah bounds";

// ─── component ───────────────────────────────────────────────────────────────

export default function CoordinateFlag() {
  const { userProfile } = useAuth();
  const { toast } = useToast();

  const [tolerance, setTolerance] = useState(BOUNDS_TOLERANCE);
  const [loading, setLoading] = useState(false);
  const [flagged, setFlagged] = useState<FlaggedInstallation[]>([]);
  const [noAmanah, setNoAmanah] = useState<number>(0);
  const [noCoords, setNoCoords] = useState<number>(0);
  const [totalChecked, setTotalChecked] = useState<number>(0);
  const [scanned, setScanned] = useState(false);
  const [allScanned, setAllScanned] = useState<DuplicateDevice[]>([]);

  const [bulkFlagging, setBulkFlagging] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // no-coord devices
  const [noCoordDevices, setNoCoordDevices] = useState<NoCoordDevice[]>([]);
  const [selectedNoCoordIds, setSelectedNoCoordIds] = useState<Set<string>>(new Set());
  const [assigningCoords, setAssigningCoords] = useState(false);
  const [assignProgress, setAssignProgress] = useState(0);

  // reassign out-of-bounds violation coords
  const [reassigning, setReassigning] = useState(false);
  const [reassignProgress, setReassignProgress] = useState(0);

  // duplicate coordinate groups
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [resolvingDupes, setResolvingDupes] = useState(false);
  const [dupProgress, setDupProgress] = useState(0);

  // edit-coordinates dialog
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editLat, setEditLat] = useState("");
  const [editLon, setEditLon] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  if (!userProfile?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>Only admins can use this feature.</AlertDescription>
        </Alert>
      </div>
    );
  }

  // ── scan ─────────────────────────────────────────────────────────────────

  const handleScan = async () => {
    setLoading(true);
    setScanned(false);
    setFlagged([]);
    setSelectedIds(new Set());
    setNoCoordDevices([]);
    setSelectedNoCoordIds(new Set());
    setDuplicateGroups([]);

    try {
      // Load teams → id -> name map
      const teamsSnap = await getDocs(collection(db, "teams"));
      const teamMap: Record<string, string> = {};
      teamsSnap.forEach((d) => {
        const data = d.data();
        teamMap[d.id] = data.name ?? d.id;
      });

      // Load locations → locationId -> { lat, lon, docId } map
      // Same resolution logic as ministry-devices: doc ID and locationId field both used as keys
      const locSnap = await getDocs(collection(db, "locations"));
      const locationCoordMap = new Map<string, { lat: number; lon: number; docId: string }>();
      locSnap.forEach((d) => {
        const ld = d.data();
        const rawLat = ld.latitude;
        const rawLon = ld.longitude;
        const lat = rawLat != null ? parseFloat(String(rawLat)) : NaN;
        const lon = rawLon != null ? parseFloat(String(rawLon)) : NaN;
        if (isNaN(lat) || isNaN(lon)) return;
        const coord = { lat, lon, docId: d.id };
        // Map by document ID
        locationCoordMap.set(String(d.id).trim(), coord);
        // Also map without leading zeros for numeric IDs
        if (/^\d+$/.test(d.id)) {
          locationCoordMap.set(String(Number(d.id)), coord);
        }
        // Map by locationId field if present and different from doc ID
        if (ld.locationId && String(ld.locationId).trim() !== String(d.id).trim()) {
          const locIdKey = String(ld.locationId).trim();
          locationCoordMap.set(locIdKey, coord);
          if (/^\d+$/.test(locIdKey)) {
            locationCoordMap.set(String(Number(locIdKey)), coord);
          }
        }
      });

      // Load all installations
      const instSnap = await getDocs(collection(db, "installations"));
      console.log("[CoordFlag] installations fetched:", instSnap.size);
      console.log("[CoordFlag] locations map size:", locationCoordMap.size);
      // Log a sample of location keys so we can see what format they're in
      const sampleLocKeys = Array.from(locationCoordMap.keys()).slice(0, 5);
      console.log("[CoordFlag] sample location keys:", sampleLocKeys);

      let checkedCount = 0;
      let noAmanahCount = 0;
      const flaggedList: FlaggedInstallation[] = [];
      const noCoordList: NoCoordDevice[] = [];
      const allWithCoords: DuplicateDevice[] = [];
      let directCoordCount = 0;
      let locationFallbackCount = 0;
      let noCoordCount = 0;

      // Mirrors the coordinate priority used by the ministry CSV export:
      //   Special locationIds (9999, 999) → installation direct coords first
      //   Normal locationIds             → location collection coords first
      //   No locationId                  → installation direct coords
      const SPECIAL_LOC_IDS = new Set(["9999", "999"]);

      instSnap.forEach((d) => {
        const data = d.data();
        const rawLocationId = data.locationId ? String(data.locationId).trim() : null;

        const instLat = data.latitude != null ? parseFloat(String(data.latitude)) : NaN;
        const instLon = data.longitude != null ? parseFloat(String(data.longitude)) : NaN;

        const locCoord = rawLocationId
          ? (locationCoordMap.get(rawLocationId) ?? locationCoordMap.get(String(Number(rawLocationId))))
          : undefined;

        let lat: number;
        let lon: number;
        let coordSource = "direct";
        let locationDocId: string | null = null;

        if (rawLocationId && SPECIAL_LOC_IDS.has(rawLocationId)) {
          // Special location: prefer installation direct coords
          if (!isNaN(instLat) && !isNaN(instLon)) {
            lat = instLat; lon = instLon; coordSource = "direct";
          } else if (locCoord) {
            lat = locCoord.lat; lon = locCoord.lon; coordSource = "location";
            locationDocId = locCoord.docId;
          } else {
            lat = NaN; lon = NaN;
          }
        } else if (rawLocationId) {
          // Normal location: prefer location collection coords (same as ministry CSV)
          if (locCoord) {
            lat = locCoord.lat; lon = locCoord.lon; coordSource = "location";
            locationDocId = locCoord.docId;
          } else if (!isNaN(instLat) && !isNaN(instLon)) {
            lat = instLat; lon = instLon; coordSource = "direct";
          } else {
            lat = NaN; lon = NaN;
          }
        } else {
          // No locationId: use direct coords
          lat = instLat; lon = instLon; coordSource = "direct";
        }

        if (isNaN(lat) || isNaN(lon)) {
          noCoordCount++;
          const teamId: string | null = data.teamId ?? null;
          const teamName: string = teamId ? (teamMap[teamId] ?? teamId) : "";
          const amanahKey = resolveAmanahKey(teamName);
          noCoordList.push({
            installationId: d.id,
            deviceId: data.deviceId ?? d.id,
            teamId,
            teamName,
            amanahKey,
            amanahLabel: amanahKey ? (AMANAH_LABELS[amanahKey] ?? amanahKey) : "Unknown",
            bounds: amanahKey ? AMANAH_BOUNDS[amanahKey] : null,
          });
          return;
        }

        if (coordSource === "direct") directCoordCount++;
        else locationFallbackCount++;

        checkedCount++;
        const teamId: string | null = data.teamId ?? null;
        const teamName: string = teamId ? (teamMap[teamId] ?? teamId) : "";
        const amanahKey = resolveAmanahKey(teamName);
        const bounds = amanahKey ? AMANAH_BOUNDS[amanahKey] : null;

        // Track for duplicate detection regardless of amanah
        allWithCoords.push({
          installationId: d.id,
          deviceId: data.deviceId ?? d.id,
          teamName,
          amanahKey,
          amanahLabel: amanahKey ? (AMANAH_LABELS[amanahKey] ?? amanahKey) : "Unknown",
          bounds,
          lat,
          lon,
          locationId: rawLocationId,
          instLatitude: !isNaN(instLat) ? instLat : null,
          instLongitude: !isNaN(instLon) ? instLon : null,
        });

        if (!amanahKey) {
          noAmanahCount++;
          return;
        }

        if (!isWithinBounds(lat, lon, bounds!, tolerance)) {
          const tags: string[] = Array.isArray(data.tags) ? data.tags : [];
          flaggedList.push({
            installationId: d.id,
            deviceId: data.deviceId ?? d.id,
            teamId,
            teamName,
            amanahKey,
            amanahLabel: AMANAH_LABELS[amanahKey] ?? amanahKey,
            lat,
            lon,
            bounds,
            alreadyFlagged: tags.includes(COORD_FLAG_TAG),
            tags,
            locationDocId,
            locationId: rawLocationId,
            instLatitude: !isNaN(instLat) ? instLat : null,
            instLongitude: !isNaN(instLon) ? instLon : null,
          });
        }
      });

      console.log("[CoordFlag] direct coords:", directCoordCount, "| from locations:", locationFallbackCount, "| no coords:", noCoordCount);
      console.log("[CoordFlag] allWithCoords total:", allWithCoords.length);
      // Log first few to inspect their lat/lon values
      console.log("[CoordFlag] sample allWithCoords:", allWithCoords.slice(0, 5).map(d => ({ lat: d.lat, lon: d.lon, deviceId: d.deviceId })));

      // Check sample installation doc fields to understand data structure
      const sampleInst = instSnap.docs[0]?.data();
      if (sampleInst) {
        console.log("[CoordFlag] sample installation fields:", Object.keys(sampleInst));
        console.log("[CoordFlag] sample latitude:", sampleInst.latitude, "| longitude:", sampleInst.longitude, "| locationId:", sampleInst.locationId);
      }

      // Build duplicate groups — round to 6dp so floating-point noise doesn't split genuine dupes
      const coordMap = new Map<string, DuplicateDevice[]>();
      for (const device of allWithCoords) {
        const key = `${device.lat.toFixed(6)},${device.lon.toFixed(6)}`;
        if (!coordMap.has(key)) coordMap.set(key, []);
        coordMap.get(key)!.push(device);
      }
      const dupGroups: DuplicateGroup[] = [];
      for (const [key, devices] of coordMap) {
        if (devices.length >= 2) {
          const [latStr, lonStr] = key.split(",");
          dupGroups.push({ coordKey: key, lat: parseFloat(latStr), lon: parseFloat(lonStr), devices });
        }
      }
      // Sort largest group first
      dupGroups.sort((a, b) => b.devices.length - a.devices.length);
      console.log("[CoordFlag] duplicate groups found:", dupGroups.length, "| total dup devices:", dupGroups.reduce((s, g) => s + g.devices.length, 0));
      if (dupGroups.length > 0) console.log("[CoordFlag] top group:", dupGroups[0]);

      setTotalChecked(checkedCount);
      setNoAmanah(noAmanahCount);
      setNoCoords(noCoordList.length);
      setNoCoordDevices(noCoordList);
      setFlagged(flaggedList);
      setDuplicateGroups(dupGroups);
      setAllScanned(allWithCoords);
      // Pre-select all un-flagged items
      setSelectedIds(
        new Set(flaggedList.filter((f) => !f.alreadyFlagged).map((f) => f.installationId))
      );
      // Pre-select no-coord devices that have a known amanah
      setSelectedNoCoordIds(
        new Set(noCoordList.filter((d) => d.bounds !== null).map((d) => d.installationId))
      );
      setScanned(true);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Scan failed", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  // ── bulk flag / unflag ────────────────────────────────────────────────────

  const applyBulkFlag = async (flag: boolean) => {
    const toProcess = flagged.filter(
      (f) =>
        selectedIds.has(f.installationId) &&
        (flag ? !f.alreadyFlagged : f.alreadyFlagged)
    );
    if (!toProcess.length) {
      toast({ title: "Nothing to do", description: "Selection already matches desired state." });
      return;
    }

    setBulkFlagging(true);
    setBulkProgress(0);

    for (let i = 0; i < toProcess.length; i++) {
      const item = toProcess[i];
      try {
        await updateDoc(doc(db, "installations", item.installationId), {
          tags: flag
            ? arrayUnion(COORD_FLAG_TAG)
            : arrayRemove(COORD_FLAG_TAG),
          updatedAt: serverTimestamp(),
          flaggedReason: flag ? "Coordinates outside amanah geographic bounds" : null,
          status: flag ? "flagged" : "pending",
        });
      } catch {
        // continue
      }
      setBulkProgress(Math.round(((i + 1) / toProcess.length) * 100));
    }

    toast({
      title: flag ? "Flagged" : "Unflagged",
      description: `${toProcess.length} installation(s) updated.`,
    });
    setBulkFlagging(false);
    // Re-scan to refresh state
    await handleScan();
  };

  // ── reassign out-of-bounds violations to unique random coords within amanah ─

  const reassignViolationCoords = async () => {
    const toProcess = flagged.filter((f) => f.bounds !== null);
    if (!toProcess.length) {
      toast({ title: "Nothing to reassign", description: "No violations have a known Amanah to generate coordinates for." });
      return;
    }

    setReassigning(true);
    setReassignProgress(0);

    // Track used keys so every assigned point is unique at 6 dp
    const usedKeys = new Set<string>();
    const uniqueCoord = (bounds: Bounds) => {
      let lat: number, lon: number, key: string;
      let attempts = 0;
      do {
        ({ lat, lon } = randomCoordInBounds(bounds));
        key = `${lat.toFixed(6)},${lon.toFixed(6)}`;
        attempts++;
      } while (usedKeys.has(key) && attempts < 100);
      usedKeys.add(key);
      return { lat, lon };
    };

    // Strategy: set locationId = "9999" on every violation installation so the
    // scan (and ministry CSV) reads direct coords from the installation doc.
    // Then write unique in-bounds coords directly onto the installation doc.
    // This leaves shared location docs untouched and doesn't affect other devices.
    let successCount = 0;
    for (let i = 0; i < toProcess.length; i++) {
      const item = toProcess[i];
      const { lat, lon } = uniqueCoord(item.bounds!);
      try {
        const archiveAt = new Date();
        const payload: Record<string, unknown> = {
          updatedAt: serverTimestamp(),
          status: "pending",
          flaggedReason: null,
          tags: arrayRemove(COORD_FLAG_TAG),
        };
        applyFieldUpdates(
          payload,
          [
            { field: "locationId", oldValue: item.locationId, newValue: "9999" },
            { field: "latitude", oldValue: item.instLatitude, newValue: lat },
            { field: "longitude", oldValue: item.instLongitude, newValue: lon },
          ],
          archiveAt
        );
        await updateDoc(doc(db, "installations", item.installationId), payload);
        successCount++;
      } catch {
        // continue on individual failure
      }
      setReassignProgress(Math.round(((i + 1) / toProcess.length) * 100));
    }

    toast({
      title: "Coordinates reassigned",
      description: `${successCount} of ${toProcess.length} violation(s) detached from shared location and assigned unique in-bounds coords.`,
    });
    setReassigning(false);
    await handleScan();
  };

  // ── assign random coords to no-coord devices ─────────────────────────────

  const assignRandomCoords = async (ids: Set<string>) => {
    const toProcess = noCoordDevices.filter(
      (d) => ids.has(d.installationId) && d.bounds !== null
    );
    if (!toProcess.length) {
      toast({ title: "Nothing to assign", description: "Selected devices have no known Amanah bounds." });
      return;
    }

    setAssigningCoords(true);
    setAssignProgress(0);

    for (let i = 0; i < toProcess.length; i++) {
      const item = toProcess[i];
      const { lat, lon } = randomCoordInBounds(item.bounds!);
      try {
        const archiveAt = new Date();
        const payload: Record<string, unknown> = {
          updatedAt: serverTimestamp(),
          tags: ["coordinates assigned randomly within amanah bounds"],
        };
        applyFieldUpdates(
          payload,
          [
            { field: "latitude", oldValue: null, newValue: lat },
            { field: "longitude", oldValue: null, newValue: lon },
          ],
          archiveAt
        );
        await updateDoc(doc(db, "installations", item.installationId), payload);
      } catch {
        // continue
      }
      setAssignProgress(Math.round(((i + 1) / toProcess.length) * 100));
    }

    toast({
      title: "Coordinates assigned",
      description: `Random coordinates assigned to ${toProcess.length} device(s).`,
    });
    setAssigningCoords(false);
    await handleScan();
  };

  const toggleSelectNoCoord = (id: string) => {
    setSelectedNoCoordIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAllNoCoord = () =>
    setSelectedNoCoordIds(new Set(noCoordDevices.map((d) => d.installationId)));
  const selectNoneNoCoord = () => setSelectedNoCoordIds(new Set());
  const selectAssignableNoCoord = () =>
    setSelectedNoCoordIds(
      new Set(noCoordDevices.filter((d) => d.bounds !== null).map((d) => d.installationId))
    );

  // ── resolve duplicate groups ──────────────────────────────────────────────

  /**
   * For every device in the supplied groups, assign a unique random coordinate.
   * Devices with known Amanah bounds get a point inside those bounds.
   * Devices with unknown bounds get the shared coordinate ± a small jitter
   * (±0.002–0.010°, roughly 200 m – 1 km) so they're still geographically
   * plausible while being unique.
   */
  const resolveDuplicates = async (groups: DuplicateGroup[]) => {
    const allDevices = groups.flatMap((g) => g.devices);
    if (!allDevices.length) return;

    setResolvingDupes(true);
    setDupProgress(0);

    // Track used keys so every assigned point is unique at 6 dp
    const usedKeys = new Set<string>();
    const uniqueCoord = (base: { lat: number; lon: number }, bounds: Bounds | null) => {
      let lat: number, lon: number, key: string;
      let attempts = 0;
      do {
        if (bounds) {
          ({ lat, lon } = randomCoordInBounds(bounds));
        } else {
          // Jitter around the shared point when no amanah bounds available
          const jitter = () => (Math.random() * 0.008 + 0.002) * (Math.random() < 0.5 ? 1 : -1);
          lat = Math.max(-90, Math.min(90, base.lat + jitter()));
          lon = Math.max(-180, Math.min(180, base.lon + jitter()));
        }
        key = `${lat.toFixed(6)},${lon.toFixed(6)}`;
        attempts++;
      } while (usedKeys.has(key) && attempts < 100);
      usedKeys.add(key);
      return { lat, lon };
    };

    for (let i = 0; i < allDevices.length; i++) {
      const device = allDevices[i];
      const { lat, lon } = uniqueCoord({ lat: device.lat, lon: device.lon }, device.bounds);

      try {
        const archiveAt = new Date();
        const payload: Record<string, unknown> = {
          updatedAt: serverTimestamp(),
          tags: ["coordinates randomised to resolve duplicate"],
        };
        applyFieldUpdates(
          payload,
          [
            { field: "locationId", oldValue: device.locationId, newValue: "9999" },
            { field: "latitude", oldValue: device.instLatitude, newValue: lat },
            { field: "longitude", oldValue: device.instLongitude, newValue: lon },
          ],
          archiveAt
        );
        await updateDoc(doc(db, "installations", device.installationId), payload);
      } catch {
        // continue
      }
      setDupProgress(Math.round(((i + 1) / allDevices.length) * 100));
    }

    toast({
      title: "Duplicates resolved",
      description: `${allDevices.length} device(s) detached from shared location and assigned unique random coordinates.`,
    });
    setResolvingDupes(false);
    await handleScan();
  };

  // ── edit coordinates dialog ───────────────────────────────────────────────

  const openEdit = (target: EditTarget) => {
    setEditTarget(target);
    setEditLat(target.lat !== null ? String(target.lat) : "");
    setEditLon(target.lon !== null ? String(target.lon) : "");
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    const lat = parseFloat(editLat);
    const lon = parseFloat(editLon);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      toast({ variant: "destructive", title: "Invalid latitude", description: "Must be between -90 and 90." });
      return;
    }
    if (isNaN(lon) || lon < -180 || lon > 180) {
      toast({ variant: "destructive", title: "Invalid longitude", description: "Must be between -180 and 180." });
      return;
    }
    setEditSaving(true);
    try {
      const archiveAt = new Date();
      const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
      applyFieldUpdates(
        payload,
        [
          { field: "latitude", oldValue: editTarget.lat, newValue: lat },
          { field: "longitude", oldValue: editTarget.lon, newValue: lon },
        ],
        archiveAt
      );
      await updateDoc(doc(db, "installations", editTarget.installationId), payload);
      toast({ title: "Coordinates updated", description: `${editTarget.deviceId} → ${lat.toFixed(6)}, ${lon.toFixed(6)}` });
      setEditTarget(null);
      await handleScan();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Save failed", description: err.message });
    } finally {
      setEditSaving(false);
    }
  };

  const fillRandomForEdit = () => {
    if (!editTarget?.bounds) return;
    const { lat, lon } = randomCoordInBounds(editTarget.bounds);
    setEditLat(lat.toFixed(6));
    setEditLon(lon.toFixed(6));
  };

  // ── full scan CSV export (device ID, amanah, coordinates) ───────────────

  const exportAllCoordsCsv = () => {
    if (!allScanned.length) {
      toast({ title: "Nothing to export", description: "Run a scan first." });
      return;
    }
    const escape = (v: string | number) => {
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      ["Device ID", "الأمانة", "Latitude", "Longitude", "Coordinates"].map(escape).join(","),
      ...allScanned.map((d) => {
        const arabicAmanah = d.amanahKey
          ? (AMANAH_ARABIC[d.amanahKey] ?? d.amanahLabel ?? "غير معروف")
          : "غير معروف";
        return [
          `="${d.deviceId}"`,          // force text in Excel — prevents scientific notation
          arabicAmanah,
          d.lat.toFixed(6),
          d.lon.toFixed(6),
          `${d.lat.toFixed(6)}, ${d.lon.toFixed(6)}`,
        ].map(escape).join(",");
      }),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `all-device-coords-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── CSV export ───────────────────────────────────────────────────────────

  const exportCsv = (onlySelected = false) => {
    const rows = onlySelected
      ? flagged.filter((f) => selectedIds.has(f.installationId))
      : flagged;

    if (!rows.length) {
      toast({ title: "Nothing to export", description: "No rows match the current filter." });
      return;
    }

    const headers = [
      "Device ID",
      "Installation ID",
      "Amanah",
      "Team Name",
      "Actual Latitude",
      "Actual Longitude",
      "Bounds Lat Min",
      "Bounds Lat Max",
      "Bounds Lon Min",
      "Bounds Lon Max",
      "Tolerance (°)",
      "Status",
      "Google Maps Link",
    ];

    const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

    const lines = [
      headers.map(escape).join(","),
      ...rows.map((r) =>
        [
          r.deviceId,
          r.installationId,
          r.amanahLabel,
          r.teamName,
          r.lat,
          r.lon,
          r.bounds?.latMin ?? "",
          r.bounds?.latMax ?? "",
          r.bounds?.lonMin ?? "",
          r.bounds?.lonMax ?? "",
          tolerance,
          r.alreadyFlagged ? "Flagged" : "Out of bounds",
          `https://maps.google.com/?q=${r.lat},${r.lon}`,
        ]
          .map(escape)
          .join(",")
      ),
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `coordinate-violations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── selection helpers ─────────────────────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () =>
    setSelectedIds(new Set(flagged.map((f) => f.installationId)));
  const selectNone = () => setSelectedIds(new Set());
  const selectNew = () =>
    setSelectedIds(new Set(flagged.filter((f) => !f.alreadyFlagged).map((f) => f.installationId)));

  // ── helpers ───────────────────────────────────────────────────────────────

  const googleMapsUrl = (lat: number, lon: number) =>
    `https://maps.google.com/?q=${lat},${lon}`;

  const boundsStr = (b: Bounds) =>
    `${b.latMin}–${b.latMax}°N, ${b.lonMin}–${b.lonMax}°E`;

  const newCount = flagged.filter((f) => !f.alreadyFlagged).length;
  const alreadyCount = flagged.filter((f) => f.alreadyFlagged).length;
  const selectedCount = selectedIds.size;
  const selectedNoCoordCount = selectedNoCoordIds.size;
  const assignableNoCoordCount = noCoordDevices.filter((d) => d.bounds !== null).length;
  const dupDeviceCount = duplicateGroups.reduce((sum, g) => sum + g.devices.length, 0);

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Flag className="h-7 w-7 text-red-500" />
          Coordinate Bounds Check
        </h1>
        <p className="text-muted-foreground mt-1">
          Scans all installations and flags any whose GPS coordinates fall outside
          the expected geographic bounds for their Amanah.
        </p>
      </div>

      {/* Bounds reference card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Amanah Bounds Reference
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(AMANAH_BOUNDS).map(([key, b]) => (
              <div
                key={key}
                className="text-xs rounded-lg border bg-muted/40 px-3 py-2"
              >
                <p className="font-semibold">{AMANAH_LABELS[key]}</p>
                <p className="text-muted-foreground">
                  {b.latMin}–{b.latMax}°N
                </p>
                <p className="text-muted-foreground">
                  {b.lonMin}–{b.lonMax}°E
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tolerance + scan */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  Boundary tolerance
                </label>
                <Badge variant="secondary" className="tabular-nums">
                  ±{tolerance.toFixed(2)}°
                </Badge>
              </div>
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={tolerance}
                onChange={(e) => setTolerance(parseFloat(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0° (strict)</span>
                <span>0.5° (~55 km)</span>
                <span>1°</span>
                <span>2° (lenient)</span>
              </div>
            </div>
            <div className="flex flex-col items-start gap-2 sm:min-w-[200px]">
              <Button onClick={handleScan} disabled={loading} size="lg" className="w-full">
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {loading ? "Scanning…" : scanned ? "Re-scan" : "Scan All Installations"}
              </Button>
              {scanned && (
                <p className="text-xs text-muted-foreground text-center w-full">
                  {totalChecked.toLocaleString()} checked
                  {noCoords > 0 && ` · ${noCoords} no coords`}
                  {noAmanah > 0 && ` · ${noAmanah} unknown amanah`}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      {scanned && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="border-red-200 dark:border-red-900">
            <CardContent className="py-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-950 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{newCount}</p>
                <p className="text-xs text-muted-foreground">New violations</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-orange-200 dark:border-orange-900">
            <CardContent className="py-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-orange-100 dark:bg-orange-950 flex items-center justify-center flex-shrink-0">
                <Flag className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-orange-500">{alreadyCount}</p>
                <p className="text-xs text-muted-foreground">Already flagged</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-violet-200 dark:border-violet-900">
            <CardContent className="py-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-violet-100 dark:bg-violet-950 flex items-center justify-center flex-shrink-0">
                <Copy className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-violet-600">{dupDeviceCount}</p>
                <p className="text-xs text-muted-foreground">
                  Duplicate coords
                  {duplicateGroups.length > 0 && (
                    <span className="ml-1 opacity-70">({duplicateGroups.length} groups)</span>
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-200 dark:border-slate-700">
            <CardContent className="py-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                <MapPin className="h-5 w-5 text-slate-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-500">{noCoordDevices.length}</p>
                <p className="text-xs text-muted-foreground">No coordinates</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-950 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">
                  {totalChecked - flagged.length}
                </p>
                <p className="text-xs text-muted-foreground">Within bounds</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Results table */}
      {scanned && flagged.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                Out-of-Bounds Installations ({flagged.length})
              </CardTitle>
              <CardDescription>
                {selectedCount} selected · use the buttons below to flag or clear flags
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={selectNew}>
                Select New
              </Button>
              <Button variant="outline" size="sm" onClick={selectAll}>
                Select All
              </Button>
              <Button variant="outline" size="sm" onClick={selectNone}>
                Clear Selection
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportCsv(false)}
                className="border-green-400 text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/30"
              >
                <Download className="h-4 w-4 mr-1" />
                Export All CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportCsv(true)}
                disabled={selectedCount === 0}
                className="border-green-400 text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/30"
              >
                <Download className="h-4 w-4 mr-1" />
                Export Selected ({selectedCount})
              </Button>
            </div>
          </CardHeader>

          {bulkFlagging && (
            <div className="px-6 pb-2">
              <Progress value={bulkProgress} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1 text-right">
                {bulkProgress}%
              </p>
            </div>
          )}

          {reassigning && (
            <div className="px-6 pb-2">
              <Progress value={reassignProgress} className="h-2 [&>*]:bg-emerald-500" />
              <p className="text-xs text-muted-foreground mt-1 text-right">
                Reassigning coordinates… {reassignProgress}%
              </p>
            </div>
          )}

          {/* Bulk action bar */}
          <div className="px-6 pb-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={selectedCount === 0 || bulkFlagging || reassigning}
              onClick={() => applyBulkFlag(true)}
            >
              <Flag className="h-4 w-4 mr-1" />
              Flag Selected ({selectedCount})
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={selectedCount === 0 || bulkFlagging || reassigning}
              onClick={() => applyBulkFlag(false)}
            >
              <X className="h-4 w-4 mr-1" />
              Remove Flag ({selectedCount})
            </Button>
            <Button
              size="sm"
              disabled={bulkFlagging || reassigning || flagged.filter(f => f.bounds !== null).length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={reassignViolationCoords}
            >
              {reassigning ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Shuffle className="h-4 w-4 mr-1" />
              )}
              Reassign All to Valid Coords ({flagged.filter(f => f.bounds !== null).length})
            </Button>
          </div>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left w-8">
                      <input
                        type="checkbox"
                        checked={selectedCount === flagged.length && flagged.length > 0}
                        onChange={(e) => (e.target.checked ? selectAll() : selectNone())}
                        className="rounded"
                      />
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">Device ID</th>
                    <th className="px-4 py-3 text-left font-semibold">Amanah</th>
                    <th className="px-4 py-3 text-left font-semibold">Actual Coords</th>
                    <th className="px-4 py-3 text-left font-semibold">Expected Bounds</th>
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                    <th className="px-4 py-3 text-left font-semibold">Map</th>
                    <th className="px-4 py-3 text-left font-semibold">Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {flagged.map((item) => (
                    <tr
                      key={item.installationId}
                      className={
                        item.alreadyFlagged
                          ? "bg-orange-50 dark:bg-orange-950/20"
                          : "bg-red-50 dark:bg-red-950/20"
                      }
                    >
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.installationId)}
                          onChange={() => toggleSelect(item.installationId)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <p className="font-mono text-xs font-semibold">{item.deviceId}</p>
                        <p className="text-xs text-muted-foreground">{item.teamName}</p>
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant="outline" className="text-xs">
                          {item.amanahLabel}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">
                        <span
                          className={
                            item.bounds &&
                            (item.lat < item.bounds.latMin || item.lat > item.bounds.latMax)
                              ? "text-red-600 font-bold"
                              : ""
                          }
                        >
                          {item.lat.toFixed(6)}
                        </span>
                        {", "}
                        <span
                          className={
                            item.bounds &&
                            (item.lon < item.bounds.lonMin || item.lon > item.bounds.lonMax)
                              ? "text-red-600 font-bold"
                              : ""
                          }
                        >
                          {item.lon.toFixed(6)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {item.bounds ? boundsStr(item.bounds) : "—"}
                      </td>
                      <td className="px-4 py-2">
                        {item.alreadyFlagged ? (
                          <Badge variant="destructive" className="text-xs">
                            <Flag className="h-3 w-3 mr-1" />
                            Flagged
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-xs border-red-400 text-red-600"
                          >
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Out of bounds
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <a
                          href={googleMapsUrl(item.lat, item.lon)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Maps
                        </a>
                      </td>
                      <td className="px-4 py-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs gap-1 px-2"
                          onClick={() =>
                            openEdit({
                              installationId: item.installationId,
                              deviceId: item.deviceId,
                              lat: item.lat,
                              lon: item.lon,
                              amanahKey: item.amanahKey,
                              bounds: item.bounds,
                            })
                          }
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {scanned && flagged.length === 0 && (
        <Alert className="border-green-300 bg-green-50 dark:bg-green-950/30">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-700 dark:text-green-400 flex items-center justify-between flex-wrap gap-2">
            <span>All coordinates are within bounds</span>
            <Button
              size="sm"
              variant="outline"
              className="border-green-400 text-green-700 hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-950/30 h-7 text-xs"
              onClick={exportAllCoordsCsv}
            >
              <Download className="h-3 w-3 mr-1" />
              Export Device Coords CSV
            </Button>
          </AlertTitle>
          <AlertDescription className="text-green-700 dark:text-green-400">
            {totalChecked} installations were checked — none fall outside their Amanah's
            geographic area.
          </AlertDescription>
        </Alert>
      )}

      {scanned && flagged.length > 0 && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            className="border-green-400 text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/30"
            onClick={exportAllCoordsCsv}
          >
            <Download className="h-4 w-4 mr-1" />
            Export All Device Coords CSV ({allScanned.length})
          </Button>
        </div>
      )}

      {/* Duplicate coordinates section */}
      {scanned && duplicateGroups.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Copy className="h-5 w-5 text-violet-600" />
                Duplicate Coordinates ({duplicateGroups.length} groups · {dupDeviceCount} devices)
              </CardTitle>
              <CardDescription>
                Multiple devices share the exact same GPS point. Resolve groups by assigning each device a unique random coordinate within its Amanah bounds.
              </CardDescription>
            </div>
            <Button
              size="sm"
              disabled={resolvingDupes}
              onClick={() => resolveDuplicates(duplicateGroups)}
              className="bg-violet-600 hover:bg-violet-700 text-white shrink-0"
            >
              {resolvingDupes ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Shuffle className="h-4 w-4 mr-1" />
              )}
              Resolve All Groups
            </Button>
          </CardHeader>

          {resolvingDupes && (
            <div className="px-6 pb-2">
              <Progress value={dupProgress} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1 text-right">{dupProgress}%</p>
            </div>
          )}

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-semibold">Shared Coordinate</th>
                    <th className="px-4 py-3 text-left font-semibold">Device ID</th>
                    <th className="px-4 py-3 text-left font-semibold">Team</th>
                    <th className="px-4 py-3 text-left font-semibold">Amanah</th>
                    <th className="px-4 py-3 text-left font-semibold">Map</th>
                    <th className="px-4 py-3 text-left font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {duplicateGroups.map((group) =>
                    group.devices.map((device, idx) => (
                      <tr
                        key={device.installationId}
                        className={
                          idx === 0
                            ? "border-t-2 border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/10"
                            : "bg-violet-50/30 dark:bg-violet-950/5"
                        }
                      >
                        {/* Show coord + resolve button only on first row of each group */}
                        <td className="px-4 py-2 font-mono text-xs">
                          {idx === 0 ? (
                            <div className="flex flex-col gap-1.5">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs border-violet-400 text-violet-700 dark:text-violet-400 tabular-nums">
                                  {group.lat.toFixed(6)}, {group.lon.toFixed(6)}
                                </Badge>
                                <span className="text-muted-foreground">×{group.devices.length}</span>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-xs px-2 border-violet-400 text-violet-700 hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-950/30 w-fit"
                                disabled={resolvingDupes}
                                onClick={() => resolveDuplicates([group])}
                              >
                                <Shuffle className="h-3 w-3 mr-1" />
                                Resolve Group
                              </Button>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/40 text-xs pl-2">↳</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <p className="font-mono text-xs font-semibold">{device.deviceId}</p>
                          <p className="text-xs text-muted-foreground font-mono opacity-60">{device.installationId}</p>
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">
                          {device.teamName || "—"}
                        </td>
                        <td className="px-4 py-2">
                          {device.amanahKey ? (
                            <Badge variant="outline" className="text-xs">{device.amanahLabel}</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs border-slate-300 text-slate-400">Unknown</Badge>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <a
                            href={googleMapsUrl(device.lat, device.lon)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Maps
                          </a>
                        </td>
                        <td className="px-4 py-2 flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1 px-2 border-violet-400 text-violet-700 hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-950/30"
                            onClick={() =>
                              openEdit({
                                installationId: device.installationId,
                                deviceId: device.deviceId,
                                lat: device.lat,
                                lon: device.lon,
                                amanahKey: device.amanahKey,
                                bounds: device.bounds,
                              })
                            }
                          >
                            <Pencil className="h-3 w-3" />
                            Edit
                          </Button>
                          {device.bounds && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs gap-1 px-2 text-blue-600"
                              title="Assign random coordinate within Amanah bounds"
                              onClick={async () => {
                                const { lat, lon } = randomCoordInBounds(device.bounds!);
                                try {
                                  const archiveAt = new Date();
                                  const payload: Record<string, unknown> = {
                                    updatedAt: serverTimestamp(),
                                  };
                                  applyFieldUpdates(
                                    payload,
                                    [
                                      {
                                        field: "latitude",
                                        oldValue: device.instLatitude,
                                        newValue: lat,
                                      },
                                      {
                                        field: "longitude",
                                        oldValue: device.instLongitude,
                                        newValue: lon,
                                      },
                                    ],
                                    archiveAt
                                  );
                                  await updateDoc(doc(db, "installations", device.installationId), payload);
                                  toast({ title: "Random coord assigned", description: `${device.deviceId} → ${lat.toFixed(6)}, ${lon.toFixed(6)}` });
                                  await handleScan();
                                } catch (err: any) {
                                  toast({ variant: "destructive", title: "Failed", description: err.message });
                                }
                              }}
                            >
                              <Shuffle className="h-3 w-3" />
                              Random
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No-coordinates devices section */}
      {scanned && noCoordDevices.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-slate-400" />
                Devices with No Coordinates ({noCoordDevices.length})
              </CardTitle>
              <CardDescription>
                {selectedNoCoordCount} selected · {assignableNoCoordCount} have a known Amanah and can receive random coordinates
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={selectAssignableNoCoord}>
                Select Assignable
              </Button>
              <Button variant="outline" size="sm" onClick={selectAllNoCoord}>
                Select All
              </Button>
              <Button variant="outline" size="sm" onClick={selectNoneNoCoord}>
                Clear Selection
              </Button>
            </div>
          </CardHeader>

          {assigningCoords && (
            <div className="px-6 pb-2">
              <Progress value={assignProgress} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1 text-right">
                {assignProgress}%
              </p>
            </div>
          )}

          {/* Bulk assign action bar */}
          <div className="px-6 pb-4">
            <Button
              size="sm"
              disabled={selectedNoCoordCount === 0 || assigningCoords}
              onClick={() => assignRandomCoords(selectedNoCoordIds)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {assigningCoords ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Shuffle className="h-4 w-4 mr-1" />
              )}
              Assign Random Coords to Selected ({selectedNoCoordCount})
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Assigns a random GPS point within the device's Amanah bounding box. Only works for devices with a recognized Amanah.
            </p>
          </div>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left w-8">
                      <input
                        type="checkbox"
                        checked={
                          selectedNoCoordCount === noCoordDevices.length &&
                          noCoordDevices.length > 0
                        }
                        onChange={(e) =>
                          e.target.checked ? selectAllNoCoord() : selectNoneNoCoord()
                        }
                        className="rounded"
                      />
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">Device ID</th>
                    <th className="px-4 py-3 text-left font-semibold">Team</th>
                    <th className="px-4 py-3 text-left font-semibold">Amanah</th>
                    <th className="px-4 py-3 text-left font-semibold">Coord Range</th>
                    <th className="px-4 py-3 text-left font-semibold" colSpan={2}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {noCoordDevices.map((item) => (
                    <tr
                      key={item.installationId}
                      className="border-b last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={selectedNoCoordIds.has(item.installationId)}
                          onChange={() => toggleSelectNoCoord(item.installationId)}
                          disabled={item.bounds === null}
                          className="rounded disabled:opacity-40"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <p className="font-mono text-xs font-semibold">{item.deviceId}</p>
                        <p className="text-xs text-muted-foreground font-mono opacity-60">
                          {item.installationId}
                        </p>
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {item.teamName || "—"}
                      </td>
                      <td className="px-4 py-2">
                        {item.amanahKey ? (
                          <Badge variant="outline" className="text-xs">
                            {item.amanahLabel}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-xs border-slate-300 text-slate-400"
                          >
                            Unknown
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {item.bounds ? boundsStr(item.bounds) : "—"}
                      </td>
                      <td className="px-4 py-2">
                        {item.bounds ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-blue-400 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30"
                            disabled={assigningCoords}
                            onClick={() =>
                              assignRandomCoords(new Set([item.installationId]))
                            }
                          >
                            <Shuffle className="h-3 w-3 mr-1" />
                            Assign Random
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">No amanah known</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs gap-1 px-2"
                          onClick={() =>
                            openEdit({
                              installationId: item.installationId,
                              deviceId: item.deviceId,
                              lat: null,
                              lon: null,
                              amanahKey: item.amanahKey,
                              bounds: item.bounds,
                            })
                          }
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
      {/* ── Edit Coordinates Dialog ── */}
      <Dialog open={editTarget !== null} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Edit Coordinates
            </DialogTitle>
          </DialogHeader>

          {editTarget && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs font-mono">
                <span className="text-muted-foreground">Device: </span>
                <span className="font-semibold">{editTarget.deviceId}</span>
                {editTarget.lat !== null && (
                  <p className="text-muted-foreground mt-1">
                    Current: {editTarget.lat.toFixed(6)}, {editTarget.lon?.toFixed(6)}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-lat" className="text-xs">Latitude</Label>
                  <Input
                    id="edit-lat"
                    type="number"
                    step="any"
                    placeholder="e.g. 24.7136"
                    value={editLat}
                    onChange={(e) => setEditLat(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-lon" className="text-xs">Longitude</Label>
                  <Input
                    id="edit-lon"
                    type="number"
                    step="any"
                    placeholder="e.g. 46.6753"
                    value={editLon}
                    onChange={(e) => setEditLon(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>

              {editTarget.bounds && (
                <div className="space-y-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full text-xs border-blue-400 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30"
                    onClick={fillRandomForEdit}
                  >
                    <Shuffle className="h-3 w-3 mr-1" />
                    Fill Random within {AMANAH_LABELS[editTarget.amanahKey!] ?? editTarget.amanahKey}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    {boundsStr(editTarget.bounds)}
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm">Cancel</Button>
            </DialogClose>
            <Button size="sm" onClick={handleSaveEdit} disabled={editSaving}>
              {editSaving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
              Save Coordinates
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
