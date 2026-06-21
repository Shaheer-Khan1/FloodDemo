import { useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  CheckCircle2,
  XCircle,
  Loader2,
  FileSpreadsheet,
  AlertCircle,
  MapPin,
  RefreshCw,
  Info,
  History,
} from "lucide-react";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import * as XLSX from "xlsx";
import { Link } from "wouter";
import {
  BULK_UPDATE_RECENT_DAYS,
  BULK_UPDATE_TAG,
  firestoreToDate,
  wasRecentlyEdited,
} from "@/lib/bulk-update";
import { applyFieldUpdates } from "@/lib/installation-field-history";

// ─── helpers ────────────────────────────────────────────────────────────────

/** Normalize a header string for fuzzy matching */
const norm = (s: string) => s.toLowerCase().replace(/[\s_\-\/\\()\[\]\.]/g, "");

/** Candidate patterns for Device ID column — ordered by specificity */
const DEVICE_ID_PATTERNS = [
  "deviceuid", "deviceid", "devid",
];

/** Candidate patterns for Location ID column */
const LOCATION_ID_PATTERNS = [
  "locationid", "locationno", "locationnumber", "locid", "locno",
];

/** Candidate patterns for latitude column — ordered by specificity */
const LAT_PATTERNS = [
  "latitude", "gpslat", "lat", "ycoord",
];

/** Candidate patterns for longitude column — ordered by specificity */
const LON_PATTERNS = [
  "longitude", "gpslon", "gpslong", "long", "lng", "lon", "xcoord",
];

/**
 * Patterns for a single combined "lat,lon" column.
 * Intentionally excludes generic words like "location" that may appear
 * in unrelated columns (e.g. "Location ID").
 */
const COORD_COMBINED_PATTERNS = [
  "coordinates", "coordinate", "coords", "coord",
  "gps", "gpscoords", "latlon", "latlng",
];

/**
 * Find a column header that matches one of the given patterns.
 * Exact matches are preferred over substring matches.
 */
function findColumn(headers: string[], patterns: string[]): string | null {
  // Pass 1 – exact match
  for (const h of headers) {
    const n = norm(h);
    for (const p of patterns) {
      if (n === p) return h;
    }
  }
  // Pass 2 – prefix match (normalised header starts with pattern)
  for (const h of headers) {
    const n = norm(h);
    for (const p of patterns) {
      if (n.startsWith(p)) return h;
    }
  }
  // Pass 3 – substring match (last resort)
  for (const h of headers) {
    const n = norm(h);
    for (const p of patterns) {
      // Only accept if pattern is reasonably long (≥4 chars) to avoid false
      // positives like "lon" inside "location".
      if (p.length >= 4 && n.includes(p)) return h;
    }
  }
  return null;
}

function parseCoord(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = parseFloat(String(val).replace(/[^\d.\-]/g, ""));
  return isNaN(n) ? null : n;
}

function parseCombined(val: unknown): { lat: number; lon: number } | null {
  if (!val) return null;
  const str = String(val).trim();
  // Match two decimal numbers separated by comma, semicolon, or whitespace
  const match = str.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (match) {
    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);
    // Sanity-check: valid coordinate ranges
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return { lat, lon };
    }
  }
  return null;
}

/** Returns true if a number looks like it could be a latitude (-90..90) */
function isValidLat(n: number) { return n >= -90 && n <= 90; }
/** Returns true if a number looks like it could be a longitude (-180..180) */
function isValidLon(n: number) { return n >= -180 && n <= 180; }

// ─── types ───────────────────────────────────────────────────────────────────

interface ParsedRow {
  deviceId: string;
  lat?: number;
  lon?: number;
  locationId?: string;
}

interface PreviewRow extends ParsedRow {
  currentLat: number | null;
  currentLon: number | null;
  currentLocationId: string | null;
  installationId: string | null;
  coordsChanged: boolean;
  locationIdChanged: boolean;
  bulkEditedRecently: boolean;
  lastBulkEditAt: Date | null;
  notFound: boolean;
}

interface UpdateResult {
  updated: number;
  skipped: number;
  skippedRecentEdits: number;
  notFound: number;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function CoordinateUpdate() {
  const { userProfile } = useAuth();
  const { toast } = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<UpdateResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [detectedColumns, setDetectedColumns] = useState<{
    deviceId: string;
    lat: string;
    lon: string;
    locationId: string | null;
  } | null>(null);
  const [updateCoordinates, setUpdateCoordinates] = useState(true);
  const [updateLocationId, setUpdateLocationId] = useState(false);
  /** Skip rows recently edited in the last 3 days (default on) */
  const [skipRecentlyBulkEdited, setSkipRecentlyBulkEdited] = useState(true);

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

  // ── parse file ────────────────────────────────────────────────────────────

  const handleFileParse = useCallback(async (selectedFile: File) => {
    setParsing(true);
    setParseError(null);
    setParsedRows([]);
    setPreviewRows([]);
    setResult(null);
    setDetectedColumns(null);

    try {
      const buffer = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
        defval: "",
      });

      if (!rows.length) {
        setParseError("The sheet appears to be empty.");
        return;
      }

      const headers = Object.keys(rows[0]);

      // Detect Device ID column
      const deviceIdCol = findColumn(headers, DEVICE_ID_PATTERNS);
      if (!deviceIdCol) {
        setParseError(
          `Could not find a Device ID column. Tried patterns: ${DEVICE_ID_PATTERNS.join(", ")}. ` +
            `Your headers are: ${headers.join(", ")}`
        );
        return;
      }

      // Detect coordinate columns
      const latCol = findColumn(headers, LAT_PATTERNS);
      const lonCol = findColumn(headers, LON_PATTERNS);
      const combinedCol = findColumn(headers, COORD_COMBINED_PATTERNS);
      const locationIdCol = findColumn(headers, LOCATION_ID_PATTERNS);

      const hasCoordColumns = !!(latCol || lonCol || combinedCol);
      if (!hasCoordColumns && !locationIdCol) {
        setParseError(
          `Could not find coordinate or Location ID columns. ` +
            `Tried location ID patterns: ${LOCATION_ID_PATTERNS.join(", ")}; ` +
            `lat patterns: ${LAT_PATTERNS.join(", ")}; ` +
            `lon patterns: ${LON_PATTERNS.join(", ")}; ` +
            `combined patterns: ${COORD_COMBINED_PATTERNS.join(", ")}. ` +
            `Your headers are: ${headers.join(", ")}`
        );
        return;
      }

      const parsed: ParsedRow[] = [];
      const skippedIds: string[] = [];

      for (const row of rows) {
        const deviceId = String(row[deviceIdCol!] ?? "").trim();
        if (!deviceId) continue;

        let lat: number | null = null;
        let lon: number | null = null;

        // Try combined column (e.g. "Coordinates" = "24.86, 67.00")
        if (combinedCol) {
          const c = parseCombined(row[combinedCol]);
          if (c) { lat = c.lat; lon = c.lon; }
        }

        // Try separate lat/lon columns if combined didn't work
        if ((lat === null || lon === null) && latCol && lonCol) {
          const rawLat = parseCoord(row[latCol]);
          const rawLon = parseCoord(row[lonCol]);
          // Validate ranges so that "Location ID" values like 9999 are rejected
          if (rawLat !== null && rawLon !== null && isValidLat(rawLat) && isValidLon(rawLon)) {
            lat = rawLat;
            lon = rawLon;
          }
        }

        const locationId = locationIdCol
          ? String(row[locationIdCol] ?? "").trim()
          : "";
        const hasCoords = lat !== null && lon !== null;
        const hasLocationId = locationId.length > 0;

        if (!hasCoords && !hasLocationId) {
          skippedIds.push(deviceId);
          continue;
        }

        const entry: ParsedRow = { deviceId };
        if (hasCoords) {
          entry.lat = lat!;
          entry.lon = lon!;
        }
        if (hasLocationId) {
          entry.locationId = locationId;
        }
        parsed.push(entry);
      }

      if (!parsed.length) {
        const hints: string[] = [];
        hints.push(`Detected columns → Device ID: "${deviceIdCol}"`);
        if (locationIdCol) hints.push(`Location ID: "${locationIdCol}"`);
        if (combinedCol) hints.push(`Combined coords: "${combinedCol}"`);
        if (latCol) hints.push(`Lat: "${latCol}"`);
        if (lonCol) hints.push(`Lon: "${lonCol}"`);
        setParseError(
          `No valid rows found. ${skippedIds.length} rows were skipped due to missing coordinates and Location ID.\n` +
          hints.join(" | ") + "\n" +
          `All headers: ${headers.join(", ")}`
        );
        return;
      }

      setDetectedColumns({
        deviceId: deviceIdCol!,
        lat: latCol || combinedCol || "",
        lon: lonCol || combinedCol || "",
        locationId: locationIdCol,
      });
      setParsedRows(parsed);

      toast({
        title: "File parsed",
        description: `Found ${parsed.length} rows. Fetching current data from database…`,
      });

      // Immediately load preview
      await loadPreview(parsed);
    } catch (err: any) {
      setParseError(`Failed to parse file: ${err.message}`);
    } finally {
      setParsing(false);
    }
  }, []);

  // ── load preview (compare with DB) ────────────────────────────────────────

  const loadPreview = async (rows: ParsedRow[]) => {
    setLoadingPreview(true);
    setPreviewRows([]);

    try {
      // Fetch installations for all device IDs in chunks of 30 (Firestore 'in' limit)
      const CHUNK = 30;
      const installationMap: Record<
        string,
        {
          id: string;
          lat: number | null;
          lon: number | null;
          locationId: string | null;
          updatedAt: unknown;
          tags: string[];
        }
      > = {};

      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK).map((r) => r.deviceId);
        const q = query(
          collection(db, "installations"),
          where("deviceId", "in", chunk)
        );
        const snap = await getDocs(q);
        snap.forEach((d) => {
          const data = d.data();
          installationMap[data.deviceId] = {
            id: d.id,
            lat: data.latitude ?? null,
            lon: data.longitude ?? null,
            locationId: data.locationId != null ? String(data.locationId).trim() : null,
            updatedAt: data.updatedAt,
            tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
          };
        });
      }

      const preview: PreviewRow[] = rows.map((row) => {
        const existing = installationMap[row.deviceId];
        if (!existing) {
          return {
            ...row,
            currentLat: null,
            currentLon: null,
            currentLocationId: null,
            installationId: null,
            coordsChanged: false,
            locationIdChanged: false,
            bulkEditedRecently: false,
            lastBulkEditAt: null,
            notFound: true,
          };
        }

        const bulkEditedRecently = wasRecentlyEdited(existing.updatedAt, existing.tags);
        const lastBulkEditAt = bulkEditedRecently
          ? firestoreToDate(existing.updatedAt)
          : null;

        let coordsChanged = false;
        if (row.lat != null && row.lon != null) {
          const latChanged =
            existing.lat === null ||
            Math.abs(existing.lat - row.lat) > 0.000001;
          const lonChanged =
            existing.lon === null ||
            Math.abs(existing.lon - row.lon) > 0.000001;
          coordsChanged = latChanged || lonChanged;
        }

        let locationIdChanged = false;
        if (row.locationId != null && row.locationId !== "") {
          const current = existing.locationId ?? "";
          locationIdChanged = current !== row.locationId.trim();
        }

        return {
          ...row,
          currentLat: existing.lat,
          currentLon: existing.lon,
          currentLocationId: existing.locationId,
          installationId: existing.id,
          coordsChanged,
          locationIdChanged,
          bulkEditedRecently,
          lastBulkEditAt,
          notFound: false,
        };
      });

      setPreviewRows(preview);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Preview failed",
        description: err.message,
      });
    } finally {
      setLoadingPreview(false);
    }
  };

  // ── apply updates ─────────────────────────────────────────────────────────

  const rowHasPendingChanges = (r: PreviewRow) =>
    !r.notFound &&
    ((updateCoordinates && r.coordsChanged && r.lat != null && r.lon != null) ||
      (updateLocationId && r.locationIdChanged && r.locationId != null));

  const rowBlockedByRecentBulkEdit = (r: PreviewRow) =>
    skipRecentlyBulkEdited && r.bulkEditedRecently && rowHasPendingChanges(r);

  const rowWillUpdate = (r: PreviewRow) =>
    rowHasPendingChanges(r) && !rowBlockedByRecentBulkEdit(r);

  const handleApplyUpdates = async () => {
    if (!updateCoordinates && !updateLocationId) {
      toast({
        variant: "destructive",
        title: "Nothing selected",
        description: "Choose at least one field to update (coordinates or Location ID).",
      });
      return;
    }

    const toUpdate = previewRows.filter(rowWillUpdate);
    if (!toUpdate.length) {
      toast({
        title: "Nothing to update",
        description: "All selected fields already match the database.",
      });
      return;
    }

    setUpdating(true);
    setProgress(0);
    let updated = 0;
    let failed = 0;

    const tagParts: string[] = [];
    if (updateCoordinates) tagParts.push("coordinates");
    if (updateLocationId) tagParts.push("location ID");
    const tagLabel = `${tagParts.join(" and ")} updated via bulk import`;

    for (let i = 0; i < toUpdate.length; i++) {
      const row = toUpdate[i];
      try {
        const archiveAt = new Date();
        const payload: Record<string, unknown> = {
          updatedAt: serverTimestamp(),
          tags: arrayUnion(tagLabel, BULK_UPDATE_TAG),
        };
        const fieldChanges: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];
        if (updateCoordinates && row.coordsChanged && row.lat != null && row.lon != null) {
          fieldChanges.push(
            { field: "latitude", oldValue: row.currentLat, newValue: row.lat },
            { field: "longitude", oldValue: row.currentLon, newValue: row.lon }
          );
        }
        if (updateLocationId && row.locationIdChanged && row.locationId) {
          fieldChanges.push({
            field: "locationId",
            oldValue: row.currentLocationId,
            newValue: row.locationId.trim(),
          });
        }
        applyFieldUpdates(payload, fieldChanges, archiveAt);
        await updateDoc(doc(db, "installations", row.installationId!), payload);
        updated++;
      } catch {
        failed++;
      }
      setProgress(Math.round(((i + 1) / toUpdate.length) * 100));
    }

    const skipped = previewRows.filter(
      (r) => !rowWillUpdate(r) && !r.notFound && !rowBlockedByRecentBulkEdit(r)
    ).length;
    const skippedRecentEdits = previewRows.filter(rowBlockedByRecentBulkEdit).length;
    const notFound = previewRows.filter((r) => r.notFound).length;

    setResult({ updated, skipped: skipped + failed, skippedRecentEdits, notFound });
    setUpdating(false);

    // Refresh preview to reflect new "current" values
    await loadPreview(parsedRows);

    toast({
      title: "Update complete",
      description: `Updated ${updated} installation(s).`,
    });
  };

  // ── drag & drop ───────────────────────────────────────────────────────────

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) { setFile(f); handleFileParse(f); }
    },
    [handleFileParse]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); handleFileParse(f); }
  };

  // ── stats ─────────────────────────────────────────────────────────────────

  const changedCount = previewRows.filter(rowWillUpdate).length;
  const sameCount = previewRows.filter((r) => !rowWillUpdate(r) && !r.notFound).length;
  const notFoundCount = previewRows.filter((r) => r.notFound).length;
  const coordsUpdateCount = previewRows.filter(
    (r) => !r.notFound && updateCoordinates && r.coordsChanged && r.lat != null && r.lon != null
  ).length;
  const locationIdUpdateCount = previewRows.filter(
    (r) => !r.notFound && updateLocationId && r.locationIdChanged && r.locationId
  ).length;
  const recentEditBlockCount = previewRows.filter(rowBlockedByRecentBulkEdit).length;

  const canApply = updateCoordinates || updateLocationId;

  const showCoordColumns = previewRows.some((r) => r.lat != null && r.lon != null);
  const showLocationIdColumns = previewRows.some((r) => r.locationId != null);

  const renderRowStatus = (row: PreviewRow) => {
    if (row.notFound) {
      return (
        <Badge variant="destructive" className="text-xs">
          Not found
        </Badge>
      );
    }
    if (rowBlockedByRecentBulkEdit(row)) {
      return (
        <Badge variant="outline" className="text-xs border-amber-400 text-amber-800 bg-amber-50">
          Skipped — edited in last {BULK_UPDATE_RECENT_DAYS}d
        </Badge>
      );
    }
    const willCoord =
      updateCoordinates && row.coordsChanged && row.lat != null && row.lon != null;
    const willLoc =
      updateLocationId && row.locationIdChanged && row.locationId;
    if (willCoord && willLoc) {
      return (
        <Badge className="text-xs bg-amber-500 hover:bg-amber-600">
          Coords + Location ID
        </Badge>
      );
    }
    if (willCoord) {
      return (
        <Badge className="text-xs bg-amber-500 hover:bg-amber-600">
          Coordinates
        </Badge>
      );
    }
    if (willLoc) {
      return (
        <Badge className="text-xs bg-amber-500 hover:bg-amber-600">
          Location ID
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="text-xs">
        No change
      </Badge>
    );
  };

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Bulk Installation Update</h1>
        <p className="text-muted-foreground mt-1">
          Upload a spreadsheet with Device ID and coordinates, Location ID, or both.
          Choose which fields to apply before running the update.
        </p>
      </div>

      {/* Info card */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Auto-detection</AlertTitle>
        <AlertDescription>
          Detects Device ID (e.g. "Device UID"), Location ID (e.g. "Location ID",
          "Location No"), and coordinates (e.g. "Latitude"/"Longitude", or combined
          "Coordinates" like "24.8607,67.0011"). Each row needs at least coordinates
          or a Location ID in the file.
        </AlertDescription>
      </Alert>

      {/* What to update */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fields to update</CardTitle>
          <CardDescription>
            Select one or both. Only checked fields are written to installations.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row gap-6">
          <div className="flex items-start gap-3">
            <Checkbox
              id="update-coordinates"
              checked={updateCoordinates}
              onCheckedChange={(checked) => {
                if (checked !== true && !updateLocationId) {
                  toast({
                    variant: "destructive",
                    title: "Select at least one field",
                    description: "Enable Location ID update or keep coordinates selected.",
                  });
                  return;
                }
                setUpdateCoordinates(checked === true);
              }}
            />
            <div className="space-y-0.5">
              <Label htmlFor="update-coordinates" className="font-medium cursor-pointer">
                Coordinates (latitude / longitude)
              </Label>
              <p className="text-xs text-muted-foreground">
                Update installation GPS from the spreadsheet
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox
              id="update-location-id"
              checked={updateLocationId}
              onCheckedChange={(checked) => {
                if (checked !== true && !updateCoordinates) {
                  toast({
                    variant: "destructive",
                    title: "Select at least one field",
                    description: "Enable coordinates update or keep Location ID selected.",
                  });
                  return;
                }
                setUpdateLocationId(checked === true);
              }}
            />
            <div className="space-y-0.5">
              <Label htmlFor="update-location-id" className="font-medium cursor-pointer">
                Location ID
              </Label>
              <p className="text-xs text-muted-foreground">
                Update installation location reference from the spreadsheet
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 pt-2 border-t">
            <Checkbox
              id="skip-recent-bulk-edited"
              checked={skipRecentlyBulkEdited}
              onCheckedChange={(checked) => setSkipRecentlyBulkEdited(checked === true)}
            />
            <div className="space-y-0.5">
              <Label htmlFor="skip-recent-bulk-edited" className="font-medium cursor-pointer">
                Skip installations edited in the last {BULK_UPDATE_RECENT_DAYS} days
              </Label>
              <p className="text-xs text-muted-foreground">
                Skips rows recently changed via bulk update or verifier edits on the
                verification screen.{" "}
                <Link href="/bulk-update-recent" className="text-primary underline-offset-2 hover:underline">
                  View recent edits
                </Link>
              </p>
            </div>
          </div>
          </div>
        </CardContent>
      </Card>

      {/* Upload card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Upload Spreadsheet
          </CardTitle>
          <CardDescription>
            Supported formats: .xlsx, .xls, .csv, .ods
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer hover:border-primary hover:bg-accent/30 transition-all"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => document.getElementById("coord-file-input")?.click()}
          >
            <input
              id="coord-file-input"
              type="file"
              accept=".xlsx,.xls,.csv,.ods"
              className="hidden"
              onChange={handleFileChange}
            />
            {parsing ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-muted-foreground">Parsing file…</p>
              </div>
            ) : file ? (
              <div className="flex flex-col items-center gap-3">
                <FileSpreadsheet className="h-10 w-10 text-primary" />
                <p className="font-semibold">{file.name}</p>
                <p className="text-sm text-muted-foreground">
                  Click or drop another file to replace
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Upload className="h-10 w-10 text-muted-foreground" />
                <p className="font-medium">Drop your file here or click to browse</p>
                <p className="text-sm text-muted-foreground">
                  Excel, CSV, or ODS spreadsheets accepted
                </p>
              </div>
            )}
          </div>

          {parseError && (
            <Alert variant="destructive" className="mt-4">
              <XCircle className="h-4 w-4" />
              <AlertTitle>Parse Error</AlertTitle>
              <AlertDescription className="whitespace-pre-wrap text-sm">
                {parseError}
              </AlertDescription>
            </Alert>
          )}

          {detectedColumns && (
            <div className="mt-4 p-3 rounded-lg bg-muted/50 text-sm flex flex-wrap gap-4">
              <span className="text-muted-foreground">Detected columns:</span>
              <Badge variant="secondary">Device ID → {detectedColumns.deviceId}</Badge>
              {detectedColumns.locationId && (
                <Badge variant="secondary">Location ID → {detectedColumns.locationId}</Badge>
              )}
              {detectedColumns.lat && (
                <Badge variant="secondary">Latitude → {detectedColumns.lat}</Badge>
              )}
              {detectedColumns.lon && (
                <Badge variant="secondary">Longitude → {detectedColumns.lon}</Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview / loading */}
      {loadingPreview && (
        <Card>
          <CardContent className="py-10 flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">
              Fetching current coordinates from database…
            </p>
          </CardContent>
        </Card>
      )}

      {/* Stats row */}
      {previewRows.length > 0 && !loadingPreview && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <Card className="border-green-200 dark:border-green-900">
            <CardContent className="py-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-950 flex items-center justify-center">
                <MapPin className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{changedCount}</p>
                <p className="text-xs text-muted-foreground">Will be updated</p>
                {changedCount > 0 && (updateCoordinates || updateLocationId) && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                    {updateCoordinates && coordsUpdateCount > 0
                      ? `${coordsUpdateCount} coord${coordsUpdateCount !== 1 ? "s" : ""}`
                      : null}
                    {updateCoordinates &&
                      updateLocationId &&
                      coordsUpdateCount > 0 &&
                      locationIdUpdateCount > 0 &&
                      " · "}
                    {updateLocationId && locationIdUpdateCount > 0
                      ? `${locationIdUpdateCount} location ID`
                      : null}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-200 dark:border-slate-700">
            <CardContent className="py-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-slate-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{sameCount}</p>
                <p className="text-xs text-muted-foreground">Already up to date</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-amber-200 dark:border-amber-900">
            <CardContent className="py-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
                <History className="h-5 w-5 text-amber-700" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-700">{recentEditBlockCount}</p>
                <p className="text-xs text-muted-foreground">Skipped (recent edit)</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-red-200 dark:border-red-900">
            <CardContent className="py-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-950 flex items-center justify-center">
                <XCircle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-500">{notFoundCount}</p>
                <p className="text-xs text-muted-foreground">Not in installations DB</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Result banner */}
      {result && (
        <Alert className="border-green-300 bg-green-50 dark:bg-green-950/30">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-700 dark:text-green-400">
            Update Complete
          </AlertTitle>
          <AlertDescription className="text-green-700 dark:text-green-400">
            {result.updated} updated · {result.skipped} already matched
            {result.skippedRecentEdits > 0
              ? ` · ${result.skippedRecentEdits} skipped (recently edited in last ${BULK_UPDATE_RECENT_DAYS}d)`
              : ""}{" "}
            · {result.notFound} not found
          </AlertDescription>
        </Alert>
      )}

      {/* Preview table + apply button */}
      {previewRows.length > 0 && !loadingPreview && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap space-y-0">
            <div>
              <CardTitle>Preview — {previewRows.length} rows</CardTitle>
              <CardDescription>
                Highlighted rows will receive updates for the fields you selected above.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadPreview(parsedRows)}
                disabled={loadingPreview}
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
              <Button
                onClick={handleApplyUpdates}
                disabled={updating || !canApply || changedCount === 0}
                size="sm"
              >
                {updating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <MapPin className="h-4 w-4 mr-2" />
                )}
                Apply {changedCount} Update{changedCount !== 1 ? "s" : ""}
              </Button>
            </div>
          </CardHeader>

          {updating && (
            <div className="px-6 pb-4">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1 text-right">
                {progress}%
              </p>
            </div>
          )}

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-3 font-semibold">Device ID</th>
                    {showLocationIdColumns && (
                      <>
                        <th className="text-left px-4 py-3 font-semibold">Current Location ID</th>
                        <th className="text-left px-4 py-3 font-semibold">New Location ID</th>
                      </>
                    )}
                    {showCoordColumns && (
                      <>
                        <th className="text-left px-4 py-3 font-semibold">Current Lat</th>
                        <th className="text-left px-4 py-3 font-semibold">Current Lon</th>
                        <th className="text-left px-4 py-3 font-semibold">New Lat</th>
                        <th className="text-left px-4 py-3 font-semibold">New Lon</th>
                      </>
                    )}
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, idx) => (
                    <tr
                      key={idx}
                      className={
                        row.notFound
                          ? "bg-red-50 dark:bg-red-950/20 opacity-60"
                          : rowBlockedByRecentBulkEdit(row)
                          ? "bg-orange-50 dark:bg-orange-950/20"
                          : rowWillUpdate(row)
                          ? "bg-amber-50 dark:bg-amber-950/20"
                          : ""
                      }
                    >
                      <td className="px-4 py-2 font-mono text-xs">
                        {row.deviceId}
                      </td>
                      {showLocationIdColumns && (
                        <>
                          <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                            {row.currentLocationId ?? "—"}
                          </td>
                          <td className="px-4 py-2 font-mono text-xs font-semibold">
                            {row.locationId ?? "—"}
                          </td>
                        </>
                      )}
                      {showCoordColumns && (
                        <>
                          <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                            {row.currentLat?.toFixed(6) ?? "—"}
                          </td>
                          <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                            {row.currentLon?.toFixed(6) ?? "—"}
                          </td>
                          <td className="px-4 py-2 font-mono text-xs font-semibold">
                            {row.lat != null ? row.lat.toFixed(6) : "—"}
                          </td>
                          <td className="px-4 py-2 font-mono text-xs font-semibold">
                            {row.lon != null ? row.lon.toFixed(6) : "—"}
                          </td>
                        </>
                      )}
                      <td className="px-4 py-2">{renderRowStatus(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

