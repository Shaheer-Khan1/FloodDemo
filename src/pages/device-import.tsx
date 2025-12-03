import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Upload, Download, CheckCircle2, XCircle, Loader2, FileSpreadsheet, AlertCircle } from "lucide-react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import * as XLSX from 'xlsx';
import type { Team } from "@/lib/types";

interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

export default function DeviceImport() {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Reserved for future enhancements
  }, []);

  const downloadTemplate = () => {
    const headers = [
      "PRODUCT COUNT",
      "TIMESTAMP",
      "PRODUCT ID",
      "DEVICE SERIAL ID",
      "DEVICE UID",
      "DEVICE IMEI",
      "ICCID",
      "ORIGINAL BOX CODE",
    ];
    const sampleData = [
      [
        "1",
        "2025-10-04  11:40:39",
        "BBNGJV2I",
        "SNNEP312045H0104J25000163F915135DD44169DELDYGCDK",
        "63F915135DD44169",
        "868927087312836",
        "89966098241131297102",
        "BOX-A-001",
      ],
      [
        "2",
        "2025-10-04  11:49:29",
        "BBNGJV2I",
        "SNNEP312045H0104J250002B8A5027D6B68E1CEDELDYGCDK",
        "B8A5027D6B68E1CE",
        "868927087312893",
        "89966098241131297136",
        "BOX-A-001",
      ],
      [
        "3",
        "2025-10-04  12:03:19",
        "BBNGJV2I",
        "SNNEP312045H0104J250003EE040E85BCB40FFCDELDYGCDK",
        "EE040E85BCB40FFC",
        "868927087294646",
        "89966098241131297144",
        "BOX-A-002",
      ],
    ];

    const csvContent = [
      headers.join(","),
      ...sampleData.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "device_import_template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    toast({
      title: "Template Downloaded",
      description: "Use this template to format your device data, including ORIGINAL BOX CODE.",
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Check file type
      const validTypes = ["text/csv", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
      const isValidExtension = selectedFile.name.endsWith(".csv") || selectedFile.name.endsWith(".xlsx") || selectedFile.name.endsWith(".xls");
      
      if (!validTypes.includes(selectedFile.type) && !isValidExtension) {
        toast({
          variant: "destructive",
          title: "Invalid File Type",
          description: "Please upload a CSV or Excel (.xlsx) file.",
        });
        return;
      }
      setFile(selectedFile);
      setImportResult(null);
    }
  };

  const parseCSV = (text: string): string[][] => {
    const lines = text.split("\n").filter(line => line.trim());
    return lines.map(line => {
      const matches = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g);
      return matches ? matches.map(cell => cell.replace(/^"|"$/g, "").trim()) : [];
    });
  };

  const parseExcel = async (file: File): Promise<string[][]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          
          // Get first sheet
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          // Convert to array of arrays
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];
          
          resolve(jsonData);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsBinaryString(file);
    });
  };

  const handleImport = async () => {
    if (!file || !userProfile) return;

    setImporting(true);
    setProgress(0);
    const result: ImportResult = { success: 0, failed: 0, errors: [] };

    try {
      let rows: string[][];
      
      // Check file type and parse accordingly
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        rows = await parseExcel(file);
      } else {
        const text = await file.text();
        rows = parseCSV(text);
      }

      if (rows.length < 2) {
        toast({
          variant: "destructive",
          title: "Import Failed",
          description: "File must contain at least a header row and one data row.",
        });
        setImporting(false);
        return;
      }

      // Skip header row
      const dataRows = rows.slice(1);
      const totalRows = dataRows.length;

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        setProgress(Math.round(((i + 1) / totalRows) * 100));

        // Detect format with ORIGINAL BOX CODE (8 columns) and support older formats as best-effort
        let productId, deviceSerialId, deviceUid, deviceImei, iccid, timestamp, productCount, originalBoxCode;

        if (row.length >= 8) {
          // Format: PRODUCT COUNT, TIMESTAMP, PRODUCT ID, DEVICE SERIAL ID,
          //         DEVICE UID, DEVICE IMEI, ICCID, ORIGINAL BOX CODE
          [productCount, timestamp, productId, deviceSerialId, deviceUid, deviceImei, iccid, originalBoxCode] = row;
        } else if (row.length >= 7) {
          [productCount, timestamp, productId, deviceSerialId, deviceUid, deviceImei, iccid] = row;
        } else if (row.length >= 5) {
          // Format 2: PRODUCT ID, DEVICE SERIAL ID, DEVICE UID, DEVICE IMEI, ICCID
          [productId, deviceSerialId, deviceUid, deviceImei, iccid] = row;
          productCount = "";
          timestamp = new Date().toISOString();
        } else {
          result.failed++;
          result.errors.push(`Row ${i + 2}: Incomplete data (expected at least 5 columns, got ${row.length})`);
          continue;
        }

        if (!deviceUid || !productId) {
          result.failed++;
          result.errors.push(`Row ${i + 2}: DEVICE UID and PRODUCT ID are required`);
          continue;
        }

        if (!originalBoxCode) {
          result.failed++;
          result.errors.push(`Row ${i + 2}: ORIGINAL BOX CODE is required in the import file`);
          continue;
        }

        try {
          await setDoc(doc(db, "devices", deviceUid), {
            id: deviceUid,
            productId: productId || "",
            deviceSerialId: deviceSerialId || "",
            deviceImei: deviceImei || "",
            iccid: iccid || "",
            timestamp: timestamp || "",
            // Only store original box code at admin import time.
            boxCode: originalBoxCode || "",
            status: "pending",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          result.success++;
        } catch (error) {
          result.failed++;
          result.errors.push(`Row ${i + 2}: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }

      setImportResult(result);
      toast({
        title: "Import Complete",
        description: `Successfully imported ${result.success} devices. ${result.failed} failed.`,
        variant: result.failed > 0 ? "destructive" : "default",
      });

      if (result.success > 0) {
        setFile(null);
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Import Failed",
        description: error instanceof Error ? error.message : "An error occurred during import.",
      });
    } finally {
      setImporting(false);
      setProgress(0);
    }
  };

  if (!userProfile?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">Only administrators can import devices.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
          Device Import
        </h1>
        <p className="text-muted-foreground mt-2">
          Bulk import devices from a CSV/Excel file, including their <span className="font-semibold">ORIGINAL BOX CODE</span>.
        </p>
      </div>

      {/* Instructions Card */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Import Instructions
          </CardTitle>
          <CardDescription>
            Supports both CSV and Excel (.xlsx) formats - Upload your file directly!
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Download the CSV template using the button below</li>
            <li>Fill in your device data with the required columns:
              <ul className="list-disc list-inside ml-4 mt-1 text-xs text-muted-foreground">
                <li>PRODUCT COUNT - Sequential number</li>
                <li>TIMESTAMP - Import date/time</li>
                <li>PRODUCT ID - Product identifier</li>
                <li>DEVICE SERIAL ID - Full serial number</li>
                <li>DEVICE UID - Unique identifier (primary key)</li>
                <li>DEVICE IMEI - IMEI number</li>
                <li>ICCID - SIM card identifier</li>
                <li className="font-semibold text-amber-700 dark:text-amber-400">
                  ORIGINAL BOX CODE - Original box code provided in the manufacturer/master list (required)
                </li>
              </ul>
            </li>
            <li>Save the file as CSV or keep it as Excel (.xlsx) format</li>
            <li>Upload the file and click "Import Devices"</li>
          </ol>

          <Button onClick={downloadTemplate} variant="outline" className="w-full sm:w-auto">
            <Download className="h-4 w-4 mr-2" />
            Download CSV Template
          </Button>
        </CardContent>
      </Card>

      {/* Upload Card */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle>Upload File</CardTitle>
          <CardDescription>
            Upload a CSV or Excel (.xlsx) file containing device data, including ORIGINAL BOX CODE.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileChange}
              disabled={importing}
              className="cursor-pointer"
            />
            {file && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileSpreadsheet className="h-4 w-4" />
                <span>{file.name}</span>
                <Badge variant="secondary">{(file.size / 1024).toFixed(2)} KB</Badge>
              </div>
            )}
          </div>

          {importing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Importing devices...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          <Button 
            onClick={handleImport} 
            disabled={!file || importing} 
            className="w-full"
          >
            {importing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Import Devices
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Results Card */}
      {importResult && (
        <Card className="border shadow-sm">
          <CardHeader>
            <CardTitle>Import Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
                <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Success</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-500">
                    {importResult.success}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800">
                <XCircle className="h-8 w-8 text-red-600 dark:text-red-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Failed</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-500">
                    {importResult.failed}
                  </p>
                </div>
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Import Errors</AlertTitle>
                <AlertDescription>
                  <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
                    {importResult.errors.slice(0, 10).map((error, index) => (
                      <p key={index} className="text-xs font-mono">
                        {error}
                      </p>
                    ))}
                    {importResult.errors.length > 10 && (
                      <p className="text-xs italic">
                        ... and {importResult.errors.length - 10} more errors
                      </p>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

