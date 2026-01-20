import { useState } from 'react';
import { Upload, Download, Loader2, AlertCircle, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

interface DeviceResult {
  deviceId: string;
  latitude: string;
  longitude: string;
  installerName: string;
  googleMapsLink: string;
  status: 'found' | 'not_found' | 'no_coordinates';
}

export default function BulkDeviceLookup() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<DeviceResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const fileExtension = selectedFile.name.split('.').pop()?.toLowerCase();
      if (!['xlsx', 'xls', 'csv'].includes(fileExtension || '')) {
        setError('Please upload an Excel file (.xlsx, .xls) or CSV file');
        setFile(null);
        return;
      }
      setFile(selectedFile);
      setError(null);
      setResults([]);
    }
  };

  const parseExcelFile = async (file: File): Promise<string[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json<any>(firstSheet, { header: 1 });
          
          // Extract device IDs from first column, skip header row
          const deviceIds: string[] = [];
          for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (row && row[0]) {
              const deviceId = String(row[0]).trim();
              if (deviceId) {
                deviceIds.push(deviceId);
              }
            }
          }
          
          console.log(`📋 Parsed ${deviceIds.length} device IDs from Excel`);
          resolve(deviceIds);
        } catch (err) {
          reject(err);
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsBinaryString(file);
    });
  };

  const lookupDevices = async (deviceIds: string[]) => {
    console.log(`🔍 Looking up ${deviceIds.length} devices...`);
    const results: DeviceResult[] = [];
    
    for (let i = 0; i < deviceIds.length; i++) {
      const deviceId = deviceIds[i];
      setProgress(Math.round(((i + 1) / deviceIds.length) * 100));
      
      try {
        // Query installations by deviceId
        const q = query(
          collection(db, 'installations'),
          where('deviceId', '==', deviceId)
        );
        
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
          results.push({
            deviceId,
            latitude: 'N/A',
            longitude: 'N/A',
            installerName: 'N/A',
            googleMapsLink: 'N/A',
            status: 'not_found'
          });
        } else {
          // Get the first installation (in case of duplicates)
          const installation = snapshot.docs[0].data();
          const lat = installation.latitude;
          const lng = installation.longitude;
          
          if (lat && lng) {
            const googleMapsLink = `https://www.google.com/maps?q=${lat},${lng}`;
            results.push({
              deviceId,
              latitude: String(lat),
              longitude: String(lng),
              installerName: installation.installedByName || installation.installerName || 'Unknown',
              googleMapsLink,
              status: 'found'
            });
          } else {
            results.push({
              deviceId,
              latitude: 'N/A',
              longitude: 'N/A',
              installerName: installation.installedByName || installation.installerName || 'Unknown',
              googleMapsLink: 'N/A',
              status: 'no_coordinates'
            });
          }
        }
      } catch (err) {
        console.error(`Error looking up device ${deviceId}:`, err);
        results.push({
          deviceId,
          latitude: 'ERROR',
          longitude: 'ERROR',
          installerName: 'ERROR',
          googleMapsLink: 'ERROR',
          status: 'not_found'
        });
      }
    }
    
    return results;
  };

  const handleProcess = async () => {
    if (!file) {
      toast({
        variant: 'destructive',
        title: 'No File Selected',
        description: 'Please select an Excel file to process'
      });
      return;
    }

    setLoading(true);
    setError(null);
    setProgress(0);

    try {
      // Parse Excel file
      const deviceIds = await parseExcelFile(file);
      
      if (deviceIds.length === 0) {
        throw new Error('No device IDs found in the file. Make sure device IDs are in the first column.');
      }

      toast({
        title: 'Processing',
        description: `Looking up ${deviceIds.length} devices...`
      });

      // Lookup devices
      const deviceResults = await lookupDevices(deviceIds);
      setResults(deviceResults);

      const foundCount = deviceResults.filter(r => r.status === 'found').length;
      toast({
        title: 'Lookup Complete',
        description: `Found ${foundCount} out of ${deviceIds.length} devices with coordinates`
      });
    } catch (err) {
      console.error('❌ Processing failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to process file');
      toast({
        variant: 'destructive',
        title: 'Processing Failed',
        description: err instanceof Error ? err.message : 'Failed to process file'
      });
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  const handleExport = () => {
    if (results.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Results',
        description: 'Please process a file first'
      });
      return;
    }

    // Create worksheet data
    const wsData = [
      ['Device ID', 'Latitude', 'Longitude', 'Installer Name', 'Google Maps Link'],
      ...results.map(r => [
        r.deviceId,
        r.latitude,
        r.longitude,
        r.installerName,
        r.googleMapsLink
      ])
    ];

    // Create workbook
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Device Locations');

    // Set column widths
    ws['!cols'] = [
      { wch: 15 }, // Device ID
      { wch: 15 }, // Latitude
      { wch: 15 }, // Longitude
      { wch: 20 }, // Installer Name
      { wch: 50 }  // Google Maps Link
    ];

    // Export
    XLSX.writeFile(wb, `device_locations_${Date.now()}.xlsx`);

    toast({
      title: 'Export Complete',
      description: `Exported ${results.length} devices to Excel`
    });
  };

  const stats = {
    total: results.length,
    found: results.filter(r => r.status === 'found').length,
    notFound: results.filter(r => r.status === 'not_found').length,
    noCoordinates: results.filter(r => r.status === 'no_coordinates').length
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Bulk Device Lookup</h1>
        <p className="text-muted-foreground mt-1">
          Upload an Excel file with device IDs to get locations and installer information
        </p>
      </div>

      {/* Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Device IDs</CardTitle>
          <CardDescription>
            Excel file (.xlsx, .xls) or CSV with device IDs in the first column (header row will be skipped)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="block w-full text-sm text-slate-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-md file:border-0
                  file:text-sm file:font-semibold
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100"
                disabled={loading}
              />
            </div>
            <Button
              onClick={handleProcess}
              disabled={!file || loading}
              className="min-w-[120px]"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Process
                </>
              )}
            </Button>
          </div>

          {file && !loading && (
            <Alert>
              <FileSpreadsheet className="h-4 w-4" />
              <AlertDescription>
                Selected: <strong>{file.name}</strong>
              </AlertDescription>
            </Alert>
          )}

          {loading && (
            <div className="space-y-2">
              <Progress value={progress} />
              <p className="text-sm text-muted-foreground text-center">
                Processing... {progress}%
              </p>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Results Card */}
      {results.length > 0 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Results Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 border rounded-lg">
                  <div className="text-2xl font-bold">{stats.total}</div>
                  <div className="text-sm text-muted-foreground">Total Devices</div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{stats.found}</div>
                  <div className="text-sm text-muted-foreground">Found with Coordinates</div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">{stats.noCoordinates}</div>
                  <div className="text-sm text-muted-foreground">Found (No Coordinates)</div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{stats.notFound}</div>
                  <div className="text-sm text-muted-foreground">Not Found</div>
                </div>
              </div>

              <div className="mt-4">
                <Button onClick={handleExport} className="w-full">
                  <Download className="mr-2 h-4 w-4" />
                  Export Results to Excel
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Preview Table */}
          <Card>
            <CardHeader>
              <CardTitle>Results Preview (First 50)</CardTitle>
              <CardDescription>
                Download the Excel file to see all results
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-2 text-left font-medium">Device ID</th>
                      <th className="p-2 text-left font-medium">Latitude</th>
                      <th className="p-2 text-left font-medium">Longitude</th>
                      <th className="p-2 text-left font-medium">Installer</th>
                      <th className="p-2 text-left font-medium">Status</th>
                      <th className="p-2 text-left font-medium">Maps</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.slice(0, 50).map((result, index) => (
                      <tr key={index} className="border-t">
                        <td className="p-2 font-mono text-xs">{result.deviceId}</td>
                        <td className="p-2">{result.latitude}</td>
                        <td className="p-2">{result.longitude}</td>
                        <td className="p-2">{result.installerName}</td>
                        <td className="p-2">
                          <Badge variant={
                            result.status === 'found' ? 'default' :
                            result.status === 'no_coordinates' ? 'secondary' : 'destructive'
                          }>
                            {result.status === 'found' ? (
                              <><CheckCircle2 className="h-3 w-3 mr-1" />Found</>
                            ) : result.status === 'no_coordinates' ? (
                              <>No Coords</>
                            ) : (
                              <>Not Found</>
                            )}
                          </Badge>
                        </td>
                        <td className="p-2">
                          {result.googleMapsLink !== 'N/A' && result.googleMapsLink !== 'ERROR' ? (
                            <a 
                              href={result.googleMapsLink} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline text-xs"
                            >
                              Open Map
                            </a>
                          ) : (
                            <span className="text-muted-foreground text-xs">N/A</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {results.length > 50 && (
                <p className="text-sm text-muted-foreground mt-2 text-center">
                  Showing 50 of {results.length} results. Export to see all.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

