import { useCallback, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  MapPin,
  RefreshCw,
  Upload,
  XCircle,
} from "lucide-react";
import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import * as XLSX from "xlsx";

// ─── column detection ────────────────────────────────────────────────────────

const norm = (s: string) => s.toLowerCase().replace(/[\s_\-\/\\()\[\]\.]/g, "");

const SERIAL_PATTERNS = ["serial", "locationid", "locid", "id", "رقم", "تسلسل"];
const MUNIC_PATTERNS  = ["البلدية", "municipality", "municipalityname", "baladia", "بلدية", "baldia", "munic"];

function findCol(headers: string[], patterns: string[]): number {
  // Exact match first
  for (let i = 0; i < headers.length; i++) {
    const n = norm(headers[i]);
    if (patterns.some((p) => n === norm(p))) return i;
  }
  // Then prefix / substring
  for (let i = 0; i < headers.length; i++) {
    const n = norm(headers[i]);
    if (patterns.some((p) => n.startsWith(norm(p)) || n.includes(norm(p)))) return i;
  }
  return -1;
}

// ─── xlsx / csv parsing ───────────────────────────────────────────────────────

function parseSheet(file: File): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" });
        resolve(data as string[][]);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsBinaryString(file);
  });
}

// ─── types ───────────────────────────────────────────────────────────────────

interface ParsedRow {
  serial: string;
  municipality: string;
}

interface UploadResult {
  updated: number;
  failed: number;
  errors: string[];
}

// ─── component ───────────────────────────────────────────────────────────────

export default function MunicipalityImport() {
  const { userProfile } = useAuth();
  const { toast } = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [detectedCols, setDetectedCols] = useState<{ serial: string; municipality: string } | null>(null);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);

  const [downloading, setDownloading] = useState(false);

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

  // ── parse ─────────────────────────────────────────────────────────────────

  const parseFile = useCallback(async (f: File) => {
    setParsing(true);
    setParseError(null);
    setRows([]);
    setDetectedCols(null);
    setResult(null);

    try {
      const rawRows = await parseSheet(f);
      if (rawRows.length < 2) {
        setParseError("File must have a header row and at least one data row.");
        return;
      }

      const headers = rawRows[0].map((h) => String(h ?? "").trim());
      const serialIdx = findCol(headers, SERIAL_PATTERNS);
      const municIdx  = findCol(headers, MUNIC_PATTERNS);

      if (serialIdx === -1) {
        setParseError(
          `Could not find a Serial / Location ID column.\n` +
          `Headers found: ${headers.join(", ")}`
        );
        return;
      }
      if (municIdx === -1) {
        setParseError(
          `Could not find a municipality (البلدية) column.\n` +
          `Headers found: ${headers.join(", ")}`
        );
        return;
      }

      const parsed: ParsedRow[] = [];
      for (let i = 1; i < rawRows.length; i++) {
        const row = rawRows[i];
        const serial = String(row[serialIdx] ?? "").trim();
        if (!serial) continue;
        parsed.push({
          serial,
          municipality: String(row[municIdx] ?? "").trim(),
        });
      }

      if (!parsed.length) {
        setParseError("No valid rows found after parsing.");
        return;
      }

      setDetectedCols({ serial: headers[serialIdx], municipality: headers[municIdx] });
      setRows(parsed);
      toast({ title: "File parsed", description: `${parsed.length} rows ready to import.` });
    } catch (err: any) {
      setParseError(`Failed to parse file: ${err.message}`);
    } finally {
      setParsing(false);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); parseFile(f); }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) { setFile(f); parseFile(f); }
    },
    [parseFile]
  );

  // ── upload ────────────────────────────────────────────────────────────────

  const handleUpload = async () => {
    if (!rows.length) return;
    setUploading(true);
    setProgress(0);
    const res: UploadResult = { updated: 0, failed: 0, errors: [] };

    const BATCH_SIZE = 499; // Firestore limit is 500
    let batch = writeBatch(db);
    let batchCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const { serial, municipality } = rows[i];
      try {
        batch.set(
          doc(db, "locations", serial),
          { municipalityName: municipality || null, updatedAt: serverTimestamp() },
          { merge: true }
        );
        batchCount++;
        res.updated++;
      } catch (err: any) {
        res.failed++;
        res.errors.push(`Row ${i + 2}: ${err.message}`);
      }

      if (batchCount >= BATCH_SIZE) {
        await batch.commit();
        batchCount = 0;
        batch = writeBatch(db);
      }

      setProgress(Math.round(((i + 1) / rows.length) * 100));
    }

    if (batchCount > 0) await batch.commit();

    setResult(res);
    setUploading(false);
    toast({
      title: "Import complete",
      description: `${res.updated} location(s) updated.`,
    });
  };

  // ── download current mapping ──────────────────────────────────────────────

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const snap = await getDocs(collection(db, "locations"));
      const csvRows: string[][] = [["Serial", "البلدية"]];
      snap.docs.forEach((d) => {
        const data = d.data();
        csvRows.push([d.id, data.municipalityName ?? ""]);
      });

      const ws  = XLSX.utils.aoa_to_sheet(csvRows);
      const wb  = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Municipalities");
      XLSX.writeFile(wb, `municipality-mapping-${new Date().toISOString().slice(0, 10)}.xlsx`);

      toast({ title: "Downloaded", description: `${snap.docs.length} location(s) exported.` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Download failed", description: err.message });
    } finally {
      setDownloading(false);
    }
  };

  // ── derived ───────────────────────────────────────────────────────────────

  const withMunic  = rows.filter((r) => r.municipality).length;
  const missingMunic = rows.length - withMunic;

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <MapPin className="h-7 w-7 text-blue-600" />
            Municipality Import
          </h1>
          <p className="text-muted-foreground mt-1">
            Upload a spreadsheet mapping Serial (Location ID) → البلدية (municipality).
            Each row is upserted into the <code className="text-xs bg-muted px-1 rounded">locations</code> collection.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleDownload}
          disabled={downloading}
          className="shrink-0"
        >
          {downloading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          Export Current Mapping
        </Button>
      </div>

      {/* Format reference */}
      <Alert>
        <FileSpreadsheet className="h-4 w-4" />
        <AlertTitle>Expected format</AlertTitle>
        <AlertDescription>
          The file must have two columns — <strong>Serial</strong> (or Location&nbsp;ID / رقم)
          and <strong>البلدية</strong> (or Municipality / Baladia). Column order does not matter
          and the detection is case-insensitive.
          <div className="mt-3 rounded-md border overflow-hidden text-xs font-mono">
            <table className="w-full">
              <thead className="bg-muted/70">
                <tr>
                  <th className="px-3 py-1.5 text-left border-r">Serial</th>
                  <th className="px-3 py-1.5 text-left">البلدية</th>
                </tr>
              </thead>
              <tbody>
                {["الاحساء", "الاحساء", "الرياض"].map((m, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-1 border-r">{i + 1}</td>
                    <td className="px-3 py-1">{m}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AlertDescription>
      </Alert>

      {/* Upload zone */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Spreadsheet
          </CardTitle>
          <CardDescription>Supported formats: .xlsx, .xls, .csv</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer hover:border-primary hover:bg-accent/30 transition-all"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => document.getElementById("munic-file-input")?.click()}
          >
            <input
              id="munic-file-input"
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
                <p className="text-sm text-muted-foreground">Click or drop another file to replace</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Upload className="h-10 w-10 text-muted-foreground" />
                <p className="font-medium">Drop your file here or click to browse</p>
                <p className="text-sm text-muted-foreground">Excel or CSV spreadsheets accepted</p>
              </div>
            )}
          </div>

          {parseError && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertTitle>Parse Error</AlertTitle>
              <AlertDescription className="whitespace-pre-wrap text-sm">{parseError}</AlertDescription>
            </Alert>
          )}

          {detectedCols && (
            <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-muted/50 text-sm">
              <span className="text-muted-foreground">Detected columns:</span>
              <Badge variant="secondary">Serial → {detectedCols.serial}</Badge>
              <Badge variant="secondary">Municipality → {detectedCols.municipality}</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      {rows.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="border-blue-200 dark:border-blue-900">
            <CardContent className="py-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center flex-shrink-0">
                <FileSpreadsheet className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-600">{rows.length}</p>
                <p className="text-xs text-muted-foreground">Total rows</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-green-200 dark:border-green-900">
            <CardContent className="py-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-950 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{withMunic}</p>
                <p className="text-xs text-muted-foreground">With municipality</p>
              </div>
            </CardContent>
          </Card>
          <Card className={missingMunic > 0 ? "border-amber-200 dark:border-amber-900" : ""}>
            <CardContent className="py-4 flex items-center gap-4">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${missingMunic > 0 ? "bg-amber-100 dark:bg-amber-950" : "bg-muted"}`}>
                <XCircle className={`h-5 w-5 ${missingMunic > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
              </div>
              <div>
                <p className={`text-2xl font-bold ${missingMunic > 0 ? "text-amber-500" : ""}`}>{missingMunic}</p>
                <p className="text-xs text-muted-foreground">Missing municipality</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Result banner */}
      {result && (
        <Alert className="border-green-300 bg-green-50 dark:bg-green-950/30">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-700 dark:text-green-400">Import Complete</AlertTitle>
          <AlertDescription className="text-green-700 dark:text-green-400">
            {result.updated} location(s) updated
            {result.failed > 0 && ` · ${result.failed} failed`}
          </AlertDescription>
          {result.errors.length > 0 && (
            <ul className="mt-2 text-xs text-red-600 dark:text-red-400 space-y-0.5 list-disc list-inside">
              {result.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
              {result.errors.length > 10 && <li>…and {result.errors.length - 10} more</li>}
            </ul>
          )}
        </Alert>
      )}

      {/* Preview table + action */}
      {rows.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap space-y-0">
            <div>
              <CardTitle>Preview — {rows.length} rows</CardTitle>
              <CardDescription>
                Each row will create or update a document in the{" "}
                <code className="text-xs bg-muted px-1 rounded">locations</code> collection
                with the given <code className="text-xs bg-muted px-1 rounded">municipalityName</code>.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => file && parseFile(file)}
                disabled={parsing || uploading}
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Re-parse
              </Button>
              <Button
                onClick={handleUpload}
                disabled={uploading || rows.length === 0}
                size="sm"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Import {rows.length} Row{rows.length !== 1 ? "s" : ""}
              </Button>
            </div>
          </CardHeader>

          {uploading && (
            <div className="px-6 pb-4">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1 text-right">{progress}%</p>
            </div>
          )}

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-semibold w-16">#</th>
                    <th className="px-4 py-3 text-left font-semibold">Serial (Location ID)</th>
                    <th className="px-4 py-3 text-left font-semibold">البلدية (Municipality)</th>
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 200).map((row, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2 text-xs text-muted-foreground">{i + 1}</td>
                      <td className="px-4 py-2 font-mono text-xs font-semibold">{row.serial}</td>
                      <td className="px-4 py-2 text-sm" dir="rtl">{row.municipality || <span className="text-muted-foreground italic">—</span>}</td>
                      <td className="px-4 py-2">
                        {row.municipality ? (
                          <Badge variant="secondary" className="text-xs">Ready</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs border-amber-400 text-amber-600">
                            Will clear municipality
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                  {rows.length > 200 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-center text-sm text-muted-foreground">
                        …and {rows.length - 200} more rows (all will be imported)
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
