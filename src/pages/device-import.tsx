import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Upload, Download, CheckCircle2, XCircle, Loader2, FileSpreadsheet, AlertCircle } from "lucide-react";
import { collection, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

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

  const downloadTemplate = () => {
    const headers = ["Device ID", "Batch ID", "City of Dispatch", "Manufacturer", "Description"];
    const sampleData = [
      ["DEV001", "BATCH001", "New York", "Acme Corp", "Temperature Sensor"],
      ["DEV002", "BATCH001", "Los Angeles", "Acme Corp", "Humidity Sensor"],
      ["DEV003", "BATCH002", "Chicago", "TechFlow Inc", "Pressure Sensor"],
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
      description: "Use this template to format your device data.",
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Check file type
      const validTypes = ["text/csv", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
      if (!validTypes.includes(selectedFile.type) && !selectedFile.name.endsWith(".csv")) {
        toast({
          variant: "destructive",
          title: "Invalid File Type",
          description: "Please upload a CSV file.",
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

  const handleImport = async () => {
    if (!file || !userProfile) return;

    setImporting(true);
    setProgress(0);
    const result: ImportResult = { success: 0, failed: 0, errors: [] };

    try {
      const text = await file.text();
      const rows = parseCSV(text);

      if (rows.length < 2) {
        toast({
          variant: "destructive",
          title: "Import Failed",
          description: "CSV file must contain at least a header row and one data row.",
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

        if (row.length < 5) {
          result.failed++;
          result.errors.push(`Row ${i + 2}: Incomplete data (expected 5 columns, got ${row.length})`);
          continue;
        }

        const [deviceId, batchId, cityOfDispatch, manufacturer, description] = row;

        if (!deviceId || !batchId) {
          result.failed++;
          result.errors.push(`Row ${i + 2}: Device ID and Batch ID are required`);
          continue;
        }

        try {
          await setDoc(doc(db, "devices", deviceId), {
            id: deviceId,
            batchId: batchId || "",
            cityOfDispatch: cityOfDispatch || "",
            manufacturer: manufacturer || "",
            description: description || "",
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
        <p className="text-muted-foreground mt-2">Bulk import devices from CSV file</p>
      </div>

      {/* Instructions Card */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Import Instructions
          </CardTitle>
          <CardDescription>Follow these steps to import your devices</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Download the CSV template using the button below</li>
            <li>Fill in your device data (Device ID, Batch ID, City of Dispatch, Manufacturer, Description)</li>
            <li>Save the file as CSV format</li>
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
          <CardTitle>Upload CSV File</CardTitle>
          <CardDescription>Select a CSV file containing device data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Input
              type="file"
              accept=".csv"
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

