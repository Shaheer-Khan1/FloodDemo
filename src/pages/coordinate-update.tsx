import { useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import * as XLSX from "xlsx";

// ─── helpers ────────────────────────────────────────────────────────────────

/** Normalize a header string for fuzzy matching */
const norm = (s: string) => s.toLowerCase().replace(/[\s_\-\/\\()\[\]\.]/g, "");

/** Candidate patterns for Device ID column — ordered by specificity */
const DEVICE_ID_PATTERNS = [
  "deviceuid", "deviceid", "devid",
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
  lat: number;
  lon: number;
}

interface PreviewRow extends ParsedRow {
  currentLat: number | null;
  currentLon: number | null;
  installationId: string | null;
  changed: boolean;
  notFound: boolean;
}

interface UpdateResult {
  updated: number;
  skipped: number;
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
  } | null>(null);

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

      if (!latCol && !lonCol && !combinedCol) {
        setParseError(
          `Could not find coordinate columns. Tried lat patterns: ${LAT_PATTERNS.join(", ")}; ` +
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

        if (lat === null || lon === null) {
          skippedIds.push(deviceId);
          continue;
        }

        parsed.push({ deviceId, lat, lon });
      }

      if (!parsed.length) {
        const hints: string[] = [];
        hints.push(`Detected columns → Device ID: "${deviceIdCol}"`);
        if (combinedCol) hints.push(`Combined coords: "${combinedCol}"`);
        if (latCol) hints.push(`Lat: "${latCol}"`);
        if (lonCol) hints.push(`Lon: "${lonCol}"`);
        setParseError(
          `No valid rows found. ${skippedIds.length} rows were skipped due to missing or out-of-range coordinates.\n` +
          hints.join(" | ") + "\n" +
          `All headers: ${headers.join(", ")}`
        );
        return;
      }

      setDetectedColumns({
        deviceId: deviceIdCol!,
        lat: latCol || combinedCol || "",
        lon: lonCol || combinedCol || "",
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
        { id: string; lat: number | null; lon: number | null }
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
            installationId: null,
            changed: false,
            notFound: true,
          };
        }
        const latChanged =
          existing.lat === null ||
          Math.abs(existing.lat - row.lat) > 0.000001;
        const lonChanged =
          existing.lon === null ||
          Math.abs(existing.lon - row.lon) > 0.000001;
        return {
          ...row,
          currentLat: existing.lat,
          currentLon: existing.lon,
          installationId: existing.id,
          changed: latChanged || lonChanged,
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

  const handleApplyUpdates = async () => {
    const toUpdate = previewRows.filter((r) => r.changed && !r.notFound);
    if (!toUpdate.length) {
      toast({ title: "Nothing to update", description: "All coordinates already match." });
      return;
    }

    setUpdating(true);
    setProgress(0);
    let updated = 0;
    let failed = 0;

    for (let i = 0; i < toUpdate.length; i++) {
      const row = toUpdate[i];
      try {
        await updateDoc(doc(db, "installations", row.installationId!), {
          latitude: row.lat,
          longitude: row.lon,
          updatedAt: serverTimestamp(),
          tags: ["coordinates updated via bulk import"],
        });
        updated++;
      } catch {
        failed++;
      }
      setProgress(Math.round(((i + 1) / toUpdate.length) * 100));
    }

    const skipped = previewRows.filter((r) => !r.changed && !r.notFound).length;
    const notFound = previewRows.filter((r) => r.notFound).length;

    setResult({ updated, skipped: skipped + failed, notFound });
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

  const changedCount = previewRows.filter((r) => r.changed && !r.notFound).length;
  const sameCount = previewRows.filter((r) => !r.changed && !r.notFound).length;
  const notFoundCount = previewRows.filter((r) => r.notFound).length;

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Bulk Coordinate Update</h1>
        <p className="text-muted-foreground mt-1">
          Upload any spreadsheet containing a Device ID column and coordinate
          columns. Coordinates that differ from the database will be updated.
        </p>
      </div>

      {/* Info card */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Auto-detection</AlertTitle>
        <AlertDescription>
          The tool automatically detects Device ID columns (e.g. "Device UID",
          "deviceId") and coordinate columns (e.g. "Latitude"/"Longitude",
          "Lat"/"Lon", or a combined "Coordinates" / "GPS" column like
          "24.8607,67.0011").
        </AlertDescription>
      </Alert>

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
              <Badge variant="secondary">Latitude → {detectedColumns.lat}</Badge>
              <Badge variant="secondary">Longitude → {detectedColumns.lon}</Badge>
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
        <div className="grid grid-cols-3 gap-4">
          <Card className="border-green-200 dark:border-green-900">
            <CardContent className="py-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-950 flex items-center justify-center">
                <MapPin className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{changedCount}</p>
                <p className="text-xs text-muted-foreground">Will be updated</p>
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
            {result.updated} updated · {result.skipped} already matched · {result.notFound} not found
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
                Highlighted rows have coordinate differences and will be updated.
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
                disabled={updating || changedCount === 0}
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
                    <th className="text-left px-4 py-3 font-semibold">Current Lat</th>
                    <th className="text-left px-4 py-3 font-semibold">Current Lon</th>
                    <th className="text-left px-4 py-3 font-semibold">New Lat</th>
                    <th className="text-left px-4 py-3 font-semibold">New Lon</th>
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
                          : row.changed
                          ? "bg-amber-50 dark:bg-amber-950/20"
                          : ""
                      }
                    >
                      <td className="px-4 py-2 font-mono text-xs">
                        {row.deviceId}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                        {row.currentLat?.toFixed(6) ?? "—"}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                        {row.currentLon?.toFixed(6) ?? "—"}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs font-semibold">
                        {row.lat.toFixed(6)}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs font-semibold">
                        {row.lon.toFixed(6)}
                      </td>
                      <td className="px-4 py-2">
                        {row.notFound ? (
                          <Badge variant="destructive" className="text-xs">
                            Not found
                          </Badge>
                        ) : row.changed ? (
                          <Badge className="text-xs bg-amber-500 hover:bg-amber-600">
                            Will update
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            No change
                          </Badge>
                        )}
                      </td>
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
