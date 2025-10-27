import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Upload, Download, CheckCircle2, XCircle, Loader2, Package, AlertCircle } from "lucide-react";
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import * as XLSX from 'xlsx';

interface ImportResult {
  success: number;
  failed: number;
  notFound: number;
  errors: string[];
}

export default function BoxImport() {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState(0);

  const downloadTemplate = () => {
    const csvContent = `Box,No,Serial ID (Full)
1,1,SNNEP312045H0105J25007685CEFD507B1EBDA3DELDYGCDK-85CEFD507B1EBDA3
1,2,SNNEP312045H0105J250071C53604506914FC9BDELDYGCDK-C53604506914FC9B
2,1,SNNEP312045H0106J2500ED36D86B2E8120F6CDDELDYGCDK-36D86B2E8120F6CD`;

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "box_numbers_template.csv";
    a.click();
    window.URL.revokeObjectURL(url);

    toast({
      title: "Template Downloaded",
      description: "Use this template to format your box number data.",
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
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
      const matches = line.match(/(".*?"|[^,\t]+)(?=\s*[,\t]|\s*$)/g);
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
          
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
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
    const result: ImportResult = { success: 0, failed: 0, notFound: 0, errors: [] };

    try {
      let rows: string[][];
      
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

      // Filter out header rows (rows that contain "Box" in the first column)
      const dataRows = rows.filter((row, index) => {
        if (index === 0) return false; // Skip first row (header)
        const firstCol = row[0]?.toString().trim().toLowerCase();
        return firstCol !== "box" && firstCol !== ""; // Skip "Box" headers and empty rows
      });
      
      const totalRows = dataRows.length;

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const [boxNumber, , serialIdFull] = row;

        if (!boxNumber || !serialIdFull) {
          result.failed++;
          result.errors.push(`Row ${i + 2}: Missing box number or serial ID`);
          continue;
        }

        try {
          // Extract the device serial ID (before the dash)
          const deviceSerialId = serialIdFull.split('-')[0].trim();

          // Find the device by serial ID
          const devicesRef = collection(db, "devices");
          const q = query(devicesRef, where("deviceSerialId", "==", deviceSerialId));
          const querySnapshot = await getDocs(q);

          if (querySnapshot.empty) {
            result.notFound++;
            result.errors.push(`Row ${i + 2}: Device not found with serial ID: ${deviceSerialId.substring(0, 30)}...`);
          } else {
            // Update the device with box number
            const deviceDoc = querySnapshot.docs[0];
            await updateDoc(doc(db, "devices", deviceDoc.id), {
              boxNumber: boxNumber.toString(),
              updatedAt: serverTimestamp(),
            });
            result.success++;
          }
        } catch (error: any) {
          result.failed++;
          result.errors.push(`Row ${i + 2}: ${error.message}`);
        }

        setProgress(Math.round(((i + 1) / totalRows) * 100));
      }

      setImportResult(result);
      toast({
        title: "Import Complete",
        description: `Successfully updated ${result.success} device(s). ${result.notFound} not found. ${result.failed} failed.`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Import Failed",
        description: error.message || "An unexpected error occurred.",
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
            <p className="text-muted-foreground">Only administrators can import box numbers.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
          Box Number Import
        </h1>
        <p className="text-muted-foreground mt-2">Update devices with their box numbers</p>
      </div>

      {/* Instructions Card */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Import Instructions
          </CardTitle>
          <CardDescription>
            Supports both CSV and Excel (.xlsx) formats - Upload your file directly!
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Download the CSV template using the button below</li>
            <li>Fill in your box number data with the required columns:
              <ul className="list-disc list-inside ml-4 mt-1 text-xs text-muted-foreground">
                <li>Box - Box number</li>
                <li>No - Sequential number within box (optional, for reference)</li>
                <li>Serial ID (Full) - Complete device serial ID from the device label</li>
              </ul>
            </li>
            <li>The file can contain multiple "Box" header rows - they will be automatically skipped</li>
            <li>Save the file as CSV or keep it as Excel (.xlsx) format</li>
            <li>Upload the file and click "Import Box Numbers"</li>
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
          <CardDescription>Select a CSV or Excel (.xlsx) file containing box number data</CardDescription>
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
                <Package className="h-4 w-4" />
                <span>{file.name}</span>
                <Badge variant="secondary">{(file.size / 1024).toFixed(2)} KB</Badge>
              </div>
            )}
          </div>

          {importing && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Importing... {progress}%</span>
              </div>
              <Progress value={progress} className="w-full" />
            </div>
          )}

          <Button 
            onClick={handleImport} 
            disabled={!file || importing}
            className="w-full"
          >
            <Upload className="h-4 w-4 mr-2" />
            {importing ? "Importing..." : "Import Box Numbers"}
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
                <div>
                  <p className="text-2xl font-bold text-green-600">{importResult.success}</p>
                  <p className="text-sm text-green-600/80">Updated</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <AlertCircle className="h-8 w-8 text-yellow-600" />
                <div>
                  <p className="text-2xl font-bold text-yellow-600">{importResult.notFound}</p>
                  <p className="text-sm text-yellow-600/80">Not Found</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800">
                <XCircle className="h-8 w-8 text-red-600" />
                <div>
                  <p className="text-2xl font-bold text-red-600">{importResult.failed}</p>
                  <p className="text-sm text-red-600/80">Failed</p>
                </div>
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Errors Encountered</AlertTitle>
                <AlertDescription>
                  <div className="mt-2 max-h-60 overflow-y-auto space-y-1">
                    {importResult.errors.slice(0, 20).map((error, index) => (
                      <div key={index} className="text-xs font-mono">
                        {error}
                      </div>
                    ))}
                    {importResult.errors.length > 20 && (
                      <div className="text-xs italic">
                        ... and {importResult.errors.length - 20} more errors
                      </div>
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

