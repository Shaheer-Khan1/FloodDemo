import { useState } from 'react';
import { Upload, Download, Loader2, AlertCircle, FileSpreadsheet, MapPin } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

interface DeviceLookupResult {
  deviceId: string;
  found: boolean;
  installerName?: string;
  latitude?: number;
  longitude?: number;
  googleMapsLink?: string;
  error?: string;
}

export default function AdminDeviceLookup() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DeviceLookupResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    console.log('📄 File selected:', file.name);
    setLoading(true);
    setError(null);
    setResults([]);

    try {
      // Read Excel file
      console.log('📖 Reading Excel file...');
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      console.log('✅ Excel file parsed:', jsonData.length, 'rows');

      // Extract device IDs (assume first column, skip header if present)
      const deviceIds: string[] = [];
      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (row && row[0]) {
          const deviceId = String(row[0]).trim();
          // Skip if it looks like a header
          if (deviceId && deviceId.toLowerCase() !== 'device id' && deviceId.toLowerCase() !== 'deviceid') {
            deviceIds.push(deviceId);
          }
        }
      }

      console.log('🔍 Found', deviceIds.length, 'device IDs to lookup');

      if (deviceIds.length === 0) {
        setError('No device IDs found in the Excel file. Make sure device IDs are in the first column.');
        toast({
          variant: 'destructive',
          title: 'No Device IDs Found',
          description: 'Please check your Excel file format.'
        });
        setLoading(false);
        return;
      }

      toast({
        title: 'Processing',
        description: `Looking up ${deviceIds.length} device(s)...`
      });

      // Fetch all installations
      console.log('📥 Fetching installations from Firestore...');
      const installationsSnapshot = await getDocs(collection(db, 'installations'));
      console.log(`✅ Fetched ${installationsSnapshot.size} installations`);

      // Create a map for quick lookup
      const installationsMap = new Map<string, any>();
      installationsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.deviceId) {
          // Store the latest installation for each device (in case of duplicates)
          if (!installationsMap.has(data.deviceId) || 
              (data.createdAt && installationsMap.get(data.deviceId).createdAt < data.createdAt)) {
            installationsMap.set(data.deviceId, {
              ...data,
              id: doc.id
            });
          }
        }
      });

      // Fetch locations for coordinate lookup
      console.log('📍 Fetching locations...');
      const locationsMap = new Map<string, any>();
      try {
        const locationsSnapshot = await getDocs(collection(db, 'locations'));
        locationsSnapshot.docs.forEach(doc => {
          const data = doc.data();
          locationsMap.set(doc.id, {
            latitude: data.latitude,
            longitude: data.longitude
          });
        });
        console.log(`✅ Fetched ${locationsMap.size} locations`);
      } catch (err) {
        console.warn('⚠️ Could not fetch locations:', err);
      }

      // Process each device ID
      const lookupResults: DeviceLookupResult[] = [];

      for (const deviceId of deviceIds) {
        const installation = installationsMap.get(deviceId);

        if (!installation) {
          lookupResults.push({
            deviceId,
            found: false,
            error: 'Device not found in installations'
          });
          continue;
        }

        // Get coordinates (prefer location relation, fallback to user-entered)
        let latitude: number | undefined;
        let longitude: number | undefined;

        if (installation.locationId && locationsMap.has(installation.locationId)) {
          const location = locationsMap.get(installation.locationId);
          latitude = location.latitude;
          longitude = location.longitude;
        } else if (installation.latitude && installation.longitude) {
          latitude = installation.latitude;
          longitude = installation.longitude;
        }

        // Create Google Maps link
        const googleMapsLink = (latitude && longitude)
          ? `https://www.google.com/maps?q=${latitude},${longitude}`
          : undefined;

        lookupResults.push({
          deviceId,
          found: true,
          installerName: installation.installedByName || installation.installerName || 'Unknown',
          latitude,
          longitude,
          googleMapsLink
        });
      }

      console.log('✅ Lookup complete:', {
        total: lookupResults.length,
        found: lookupResults.filter(r => r.found).length,
        notFound: lookupResults.filter(r => !r.found).length
      });

      setResults(lookupResults);

      toast({
        title: 'Lookup Complete',
        description: `Found ${lookupResults.filter(r => r.found).length} of ${deviceIds.length} device(s)`
      });

    } catch (err) {
      console.error('❌ Error processing file:', err);
      setError(err instanceof Error ? err.message : 'Failed to process file');
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to process file'
      });
    } finally {
      setLoading(false);
      // Reset file input
      event.target.value = '';
    }
  };

  const handleExportExcel = () => {
    if (results.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Data',
        description: 'Please upload a file first'
      });
      return;
    }

    console.log('📥 Generating Excel file...');

    try {
      // Prepare data for Excel
      const excelData = results.map(result => ({
        'Device ID': result.deviceId,
        'Found': result.found ? 'Yes' : 'No',
        'Installer Name': result.installerName || 'N/A',
        'Latitude': result.latitude || 'N/A',
        'Longitude': result.longitude || 'N/A',
        'Google Maps Link': result.googleMapsLink || 'N/A',
        'Error': result.error || ''
      }));

      // Create workbook and worksheet
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Device Lookup');

      // Set column widths
      worksheet['!cols'] = [
        { wch: 15 }, // Device ID
        { wch: 10 }, // Found
        { wch: 25 }, // Installer Name
        { wch: 12 }, // Latitude
        { wch: 12 }, // Longitude
        { wch: 50 }, // Google Maps Link
        { wch: 30 }  // Error
      ];

      // Generate Excel file
      XLSX.writeFile(workbook, `device_lookup_results_${Date.now()}.xlsx`);

      console.log('✅ Excel file generated successfully');

      toast({
        title: 'Export Complete',
        description: `Exported ${results.length} device(s) to Excel`
      });

    } catch (err) {
      console.error('❌ Export failed:', err);
      toast({
        variant: 'destructive',
        title: 'Export Failed',
        description: err instanceof Error ? err.message : 'Failed to export Excel'
      });
    }
  };

  const foundCount = results.filter(r => r.found).length;
  const notFoundCount = results.filter(r => !r.found).length;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Bulk Device Lookup</h1>
        <p className="text-muted-foreground mt-1">
          Upload an Excel file with device IDs to get location and installer information
        </p>
      </div>

      {/* Instructions Card */}
      <Card>
        <CardHeader>
          <CardTitle>Instructions</CardTitle>
          <CardDescription>How to use this tool</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="bg-primary/10 rounded-full p-2">
              <span className="text-primary font-bold">1</span>
            </div>
            <div>
              <p className="font-medium">Prepare your Excel file</p>
              <p className="text-sm text-muted-foreground">
                Create an Excel file with device IDs in the first column (one device ID per row)
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="bg-primary/10 rounded-full p-2">
              <span className="text-primary font-bold">2</span>
            </div>
            <div>
              <p className="font-medium">Upload the file</p>
              <p className="text-sm text-muted-foreground">
                Click "Upload Excel File" button and select your file
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="bg-primary/10 rounded-full p-2">
              <span className="text-primary font-bold">3</span>
            </div>
            <div>
              <p className="font-medium">Download results</p>
              <p className="text-sm text-muted-foreground">
                Click "Export Results to Excel" to download a file with locations, installer names, and Google Maps links
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Excel File</CardTitle>
          <CardDescription>
            File should contain device IDs in the first column
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-3">
            <Button
              onClick={() => document.getElementById('file-upload')?.click()}
              disabled={loading}
              className="flex-1"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Excel File
                </>
              )}
            </Button>
            <input
              id="file-upload"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              className="hidden"
            />

            {results.length > 0 && (
              <Button
                onClick={handleExportExcel}
                variant="outline"
                className="flex-1"
              >
                <Download className="mr-2 h-4 w-4" />
                Export Results to Excel
              </Button>
            )}
          </div>

          {results.length > 0 && (
            <div className="flex gap-3">
              <div className="flex-1 p-4 border rounded-lg">
                <div className="text-2xl font-bold">{results.length}</div>
                <div className="text-sm text-muted-foreground">Total Devices</div>
              </div>
              <div className="flex-1 p-4 border rounded-lg">
                <div className="text-2xl font-bold text-green-600">{foundCount}</div>
                <div className="text-sm text-muted-foreground">Found</div>
              </div>
              <div className="flex-1 p-4 border rounded-lg">
                <div className="text-2xl font-bold text-orange-600">{notFoundCount}</div>
                <div className="text-sm text-muted-foreground">Not Found</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results Table */}
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Lookup Results</CardTitle>
            <CardDescription>
              Preview of device information (scroll to see all columns)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Installer Name</TableHead>
                    <TableHead>Coordinates</TableHead>
                    <TableHead>Google Maps</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((result, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-mono">{result.deviceId}</TableCell>
                      <TableCell>
                        {result.found ? (
                          <Badge variant="default">Found</Badge>
                        ) : (
                          <Badge variant="destructive">Not Found</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {result.installerName || (
                          <span className="text-muted-foreground">N/A</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {result.latitude && result.longitude ? (
                          <div className="space-y-1">
                            <div>Lat: {result.latitude}</div>
                            <div>Lng: {result.longitude}</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">No coordinates</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {result.googleMapsLink ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(result.googleMapsLink, '_blank')}
                          >
                            <MapPin className="mr-2 h-4 w-4" />
                            Open in Maps
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-sm">N/A</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

