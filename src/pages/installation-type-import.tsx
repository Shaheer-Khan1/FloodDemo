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
  Tags,
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
import {
  parseInstallationTypeCode,
  type InstallationTypeLabel,
} from "@/lib/installation-type";

const norm = (s: string) => s.toLowerCase().replace(/[\s_\-\/\\()\[\]\.]/g, "");

const DEVICE_ID_PATTERNS = ["deviceuid", "deviceid", "devid"];
const TYPE_PATTERNS = ["type", "devicetype", "installationtype"];

function findColumn(headers: string[], patterns: string[]): string | null {
  for (const h of headers) {
    const n = norm(h);
    for (const p of patterns) {
      if (n === p) return h;
    }
  }
  for (const h of headers) {
    const n = norm(h);
    for (const p of patterns) {
      if (n.startsWith(p)) return h;
    }
  }
  for (const h of headers) {
    const n = norm(h);
    for (const p of patterns) {
      if (p.length >= 4 && n.includes(p)) return h;
    }
  }
  return null;
}

function normalizeDeviceId(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase();
}

interface ParsedRow {
  deviceId: string;
  type: InstallationTypeLabel;
  rawType: string;
}

interface PreviewRow extends ParsedRow {
  installationId: string | null;
  currentType: string | null;
  changed: boolean;
  notFound: boolean;
}

interface UpdateResult {
  updated: number;
  skipped: number;
  notFound: number;
  ignored: number;
}

export default function InstallationTypeImport() {
  const { userProfile } = useAuth();
  const { toast } = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [ignoredCount, setIgnoredCount] = useState(0);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<UpdateResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [detectedColumns, setDetectedColumns] = useState<{
    deviceId: string;
    type: string;
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

  const loadPreview = async (rows: ParsedRow[]) => {
    setLoadingPreview(true);
    setPreviewRows([]);

    try {
      const CHUNK = 30;
      const installationMap: Record<
        string,
        { id: string; type: string | null }
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
          const key = normalizeDeviceId(data.deviceId);
          if (!installationMap[key]) {
            installationMap[key] = {
              id: d.id,
              type: data.type != null ? String(data.type) : null,
            };
          }
        });
      }

      const preview: PreviewRow[] = rows.map((row) => {
        const existing = installationMap[row.deviceId];
        if (!existing) {
          return {
            ...row,
            installationId: null,
            currentType: null,
            changed: false,
            notFound: true,
          };
        }
        const changed = existing.type !== row.type;
        return {
          ...row,
          installationId: existing.id,
          currentType: existing.type,
          changed,
          notFound: false,
        };
      });

      setPreviewRows(preview);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Preview failed";
      toast({
        variant: "destructive",
        title: "Preview failed",
        description: message,
      });
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleFileParse = useCallback(async (selectedFile: File) => {
    setParsing(true);
    setParseError(null);
    setParsedRows([]);
    setPreviewRows([]);
    setResult(null);
    setDetectedColumns(null);
    setIgnoredCount(0);

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
      const deviceIdCol = findColumn(headers, DEVICE_ID_PATTERNS);
      const typeCol = findColumn(headers, TYPE_PATTERNS);

      if (!deviceIdCol) {
        setParseError(
          `Could not find a Device ID column. Tried: ${DEVICE_ID_PATTERNS.join(", ")}. Headers: ${headers.join(", ")}`
        );
        return;
      }
      if (!typeCol) {
        setParseError(
          `Could not find a Type column. Tried: ${TYPE_PATTERNS.join(", ")}. Headers: ${headers.join(", ")}`
        );
        return;
      }

      const parsed: ParsedRow[] = [];
      let ignored = 0;

      for (const row of rows) {
        const deviceId = normalizeDeviceId(row[deviceIdCol]);
        if (!deviceId) continue;

        const rawType = String(row[typeCol] ?? "").trim();
        const typeLabel = parseInstallationTypeCode(rawType);
        if (!typeLabel) {
          ignored++;
          continue;
        }

        parsed.push({ deviceId, type: typeLabel, rawType });
      }

      if (!parsed.length) {
        setParseError(
          `No importable rows found. ${ignored} row(s) ignored (Type empty or 1). ` +
            `Type 2 = Culvert, Type 3 = Waterway.`
        );
        setIgnoredCount(ignored);
        return;
      }

      setDetectedColumns({ deviceId: deviceIdCol, type: typeCol });
      setParsedRows(parsed);
      setIgnoredCount(ignored);

      toast({
        title: "File parsed",
        description: `${parsed.length} row(s) to import. ${ignored} ignored (Type 1 or empty). Loading preview…`,
      });

      await loadPreview(parsed);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to parse file";
      setParseError(message);
    } finally {
      setParsing(false);
    }
  }, []);

  const handleApplyUpdates = async () => {
    const toUpdate = previewRows.filter((r) => r.changed && !r.notFound);
    if (!toUpdate.length) {
      toast({ title: "Nothing to update", description: "All types already match." });
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
          type: row.type,
          updatedAt: serverTimestamp(),
        });
        updated++;
      } catch {
        failed++;
      }
      setProgress(Math.round(((i + 1) / toUpdate.length) * 100));
    }

    const skipped = previewRows.filter((r) => !r.changed && !r.notFound).length;
    const notFound = previewRows.filter((r) => r.notFound).length;

    setResult({
      updated,
      skipped: skipped + failed,
      notFound,
      ignored: ignoredCount,
    });
    setUpdating(false);
    await loadPreview(parsedRows);

    toast({
      title: "Update complete",
      description: `Updated type on ${updated} installation(s).`,
    });
  };

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) {
        setFile(f);
        handleFileParse(f);
      }
    },
    [handleFileParse]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      handleFileParse(f);
    }
  };

  const changedCount = previewRows.filter((r) => r.changed && !r.notFound).length;
  const sameCount = previewRows.filter((r) => !r.changed && !r.notFound).length;
  const notFoundCount = previewRows.filter((r) => r.notFound).length;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Installation Type Import</h1>
        <p className="text-muted-foreground mt-1">
          Upload a spreadsheet with Device ID and Type to set the installation{" "}
          <code className="text-xs bg-muted px-1 rounded">type</code> field.
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Type codes</AlertTitle>
        <AlertDescription>
          Rows with Type 1 or empty are skipped. Type 2 → Culvert, Type 3 → Waterway. Text labels
          &quot;Culvert&quot; / &quot;Waterway&quot; are also accepted.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Upload Spreadsheet
          </CardTitle>
          <CardDescription>Supported formats: .xlsx, .xls, .csv</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer hover:border-primary hover:bg-accent/30 transition-all"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => document.getElementById("type-import-file")?.click()}
          >
            <input
              id="type-import-file"
              type="file"
              accept=".xlsx,.xls,.csv"
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
              <Badge variant="secondary">Type → {detectedColumns.type}</Badge>
              {ignoredCount > 0 && (
                <Badge variant="outline">{ignoredCount} rows ignored (Type 1 or empty)</Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {loadingPreview && (
        <Card>
          <CardContent className="py-10 flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Matching devices to installations…</p>
          </CardContent>
        </Card>
      )}

      {previewRows.length > 0 && !loadingPreview && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="border-green-200">
              <CardContent className="py-4">
                <p className="text-2xl font-bold text-green-600">{changedCount}</p>
                <p className="text-xs text-muted-foreground">Will be updated</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-2xl font-bold">{sameCount}</p>
                <p className="text-xs text-muted-foreground">Already correct</p>
              </CardContent>
            </Card>
            <Card className="border-red-200">
              <CardContent className="py-4">
                <p className="text-2xl font-bold text-red-500">{notFoundCount}</p>
                <p className="text-xs text-muted-foreground">Not in installations DB</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-2xl font-bold text-muted-foreground">{ignoredCount}</p>
                <p className="text-xs text-muted-foreground">Ignored in file (Type 1/empty)</p>
              </CardContent>
            </Card>
          </div>

          {result && (
            <Alert className="border-green-300 bg-green-50 dark:bg-green-950/30">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-700">Update Complete</AlertTitle>
              <AlertDescription className="text-green-700">
                {result.updated} updated · {result.skipped} unchanged · {result.notFound}{" "}
                not found · {result.ignored} ignored in file
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap space-y-0">
              <div>
                <CardTitle>Preview — {previewRows.length} rows</CardTitle>
                <CardDescription>
                  Sets installation <code className="text-xs">type</code> to Culvert or Waterway.
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
                    <Tags className="h-4 w-4 mr-2" />
                  )}
                  Apply {changedCount} Update{changedCount !== 1 ? "s" : ""}
                </Button>
              </div>
            </CardHeader>

            {updating && (
              <div className="px-6 pb-4">
                <Progress value={progress} className="h-2" />
              </div>
            )}

            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                    <tr className="border-b">
                      <th className="text-left px-4 py-3 font-semibold">Device ID</th>
                      <th className="text-left px-4 py-3 font-semibold">File Type</th>
                      <th className="text-left px-4 py-3 font-semibold">Current Type</th>
                      <th className="text-left px-4 py-3 font-semibold">New Type</th>
                      <th className="text-left px-4 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, idx) => (
                      <tr
                        key={idx}
                        className={
                          row.notFound
                            ? "bg-red-50/80 dark:bg-red-950/20"
                            : row.changed
                              ? "bg-amber-50/80 dark:bg-amber-950/20"
                              : ""
                        }
                      >
                        <td className="px-4 py-2 font-mono text-xs">{row.deviceId}</td>
                        <td className="px-4 py-2 font-mono text-xs">{row.rawType}</td>
                        <td className="px-4 py-2 text-xs">{row.currentType ?? "—"}</td>
                        <td className="px-4 py-2 text-xs font-semibold">{row.type}</td>
                        <td className="px-4 py-2">
                          {row.notFound ? (
                            <Badge variant="destructive" className="text-xs">
                              Not found
                            </Badge>
                          ) : row.changed ? (
                            <Badge className="text-xs bg-amber-500">Will update</Badge>
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
        </>
      )}
    </div>
  );
}
