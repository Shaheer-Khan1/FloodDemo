import { useState, useEffect } from 'react';
import { Download, Filter, Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

interface DeviceData {
  deviceId: string;
  installerName: string;
  latitude: string | number;
  longitude: string | number;
  coordinateSource: string;
  locationId: string;
  hasServerData: boolean;
  variance: string;
  userReading: number | null;
  serverReading: number | null;
  dataPointsCount: number;
  status: string;
  installationDate: string;
  teamId?: string;
  teamName?: string;
}

interface DeviceStats {
  totalDevices: number;
  devicesWithData: number;
  devicesWithoutData: number;
  devicesWithoutDataList: string[];
}

interface Team {
  id: string;
  name: string;
}

export default function AdminDeviceFilter() {
  const [variance, setVariance] = useState('');
  const [readings, setReadings] = useState('');
  const [noServerData, setNoServerData] = useState(false);
  const [teamId, setTeamId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<DeviceData[]>([]);
  const [stats, setStats] = useState<DeviceStats | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const { toast } = useToast();

  // Fetch teams on component mount
  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const teamsSnapshot = await getDocs(collection(db, 'teams'));
        const teamsData = teamsSnapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || 'Unnamed Team'
        }));
        setTeams(teamsData);
      } catch (err) {
        console.error('Failed to fetch teams:', err);
      }
    };

    fetchTeams();
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const installationsSnapshot = await getDocs(collection(db, 'installations'));
      const uniqueDevices = new Set<string>();
      const devicesWithServerData = new Set<string>();
      
      installationsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.deviceId) {
          uniqueDevices.add(data.deviceId);
          // Check if device has server data (latestDisCm)
          if (data.latestDisCm != null) {
            devicesWithServerData.add(data.deviceId);
          }
        }
      });

      console.log(`Stats: Total ${uniqueDevices.size} devices, ${devicesWithServerData.size} with server data`);

      setStats({
        totalDevices: uniqueDevices.size,
        devicesWithData: devicesWithServerData.size,
        devicesWithoutData: uniqueDevices.size - devicesWithServerData.size,
        devicesWithoutDataList: []
      });
    } catch (err) {
      console.error('Failed to fetch device stats:', err);
    }
  };

  const handleFilter = async () => {
    setLoading(true);
    setError(null);
    setShowResults(false);

    try {
      // Fetch installations
      const installationsSnapshot = await getDocs(collection(db, 'installations'));
      
      // Fetch locations
      const locationsMap = new Map();
      try {
        const locationsSnapshot = await getDocs(collection(db, 'locations'));
        locationsSnapshot.docs.forEach(doc => {
          const data = doc.data();
          locationsMap.set(doc.id, {
            latitude: data.latitude,
            longitude: data.longitude
          });
        });
      } catch (err) {
        console.warn('Could not fetch locations:', err);
      }

      // No need to fetch separate device data - it's in installations as latestDisCm
      console.log('Processing installations for server data...');

      // Process installations
      const deviceList: DeviceData[] = [];
      const processedDevices = new Set<string>();

      installationsSnapshot.docs.forEach(doc => {
        const installation = doc.data();
        const deviceId = installation.deviceId;

        if (processedDevices.has(deviceId)) return;
        processedDevices.add(deviceId);

        // Get coordinates (prefer location relation)
        let latitude: any = '';
        let longitude: any = '';
        let coordinateSource = 'none';

        if (installation.locationId && locationsMap.has(installation.locationId)) {
          const location = locationsMap.get(installation.locationId);
          latitude = location.latitude;
          longitude = location.longitude;
          coordinateSource = 'location_relation';
        } else if (installation.latitude && installation.longitude) {
          latitude = installation.latitude;
          longitude = installation.longitude;
          coordinateSource = 'user_entered';
        }

        // Get readings from installation
        const userReading = installation.sensorReading != null ? installation.sensorReading : null;
        const serverReading = installation.latestDisCm != null ? installation.latestDisCm : null;
        
        // Calculate variance (percentage difference between user and server readings)
        let calculatedVariance: number | null = null;
        if (userReading != null && serverReading != null && userReading !== 0) {
          const diff = Math.abs(serverReading - userReading);
          calculatedVariance = (diff / userReading) * 100;
        }

        deviceList.push({
          deviceId: deviceId,
          installerName: installation.installedByName || installation.installerName || 'Unknown',
          latitude: latitude,
          longitude: longitude,
          coordinateSource: coordinateSource,
          locationId: installation.locationId || '',
          teamId: installation.teamId || '',
          teamName: installation.teamId || '',
          userReading: userReading,
          serverReading: serverReading,
          hasServerData: serverReading != null,
          variance: calculatedVariance !== null ? calculatedVariance.toFixed(2) : 'N/A',
          dataPointsCount: serverReading != null ? 1 : 0,
          status: installation.status || '',
          installationDate: installation.createdAt || ''
        });
      });

      // Apply filters
      let filteredDevices = deviceList;
      console.log('Total devices before filtering:', deviceList.length);

      // Separate devices with and without server data
      const devicesWithoutServerData = deviceList.filter(device => !device.hasServerData);
      let devicesWithServerData = deviceList.filter(device => device.hasServerData);

      // Apply team filter to both groups
      if (teamId) {
        devicesWithServerData = devicesWithServerData.filter(device => device.teamId === teamId);
        const devicesWithoutServerDataFiltered = devicesWithoutServerData.filter(device => device.teamId === teamId);
        console.log('After team filter - with data:', devicesWithServerData.length, 'without data:', devicesWithoutServerDataFiltered.length);
        
        // If noServerData checkbox is checked, only show devices without server data
        if (noServerData) {
          filteredDevices = devicesWithoutServerDataFiltered;
        } else {
          // Otherwise, combine both groups
          filteredDevices = [...devicesWithServerData, ...devicesWithoutServerDataFiltered];
        }
      } else {
        // No team filter
        if (noServerData) {
          filteredDevices = devicesWithoutServerData;
        } else {
          filteredDevices = deviceList;
        }
      }

      // Apply variance filter ONLY to devices with server data, then add back devices without server data
      if (variance && variance.trim() !== '' && parseFloat(variance) > 0 && !noServerData) {
        const varianceThreshold = parseFloat(variance);
        console.log('Applying variance filter with threshold:', varianceThreshold);
        
        // Filter devices WITH server data by variance
        const filteredWithData = filteredDevices.filter(device => device.hasServerData).filter(device => {
          if (device.variance === 'N/A') return false;
          return parseFloat(device.variance) >= varianceThreshold;
        });
        
        // Keep all devices WITHOUT server data (if team filter was applied, these are already filtered)
        const withoutData = filteredDevices.filter(device => !device.hasServerData);
        
        // Combine: devices matching variance filter + all devices without server data
        filteredDevices = [...filteredWithData, ...withoutData];
        console.log('After variance filter - with data:', filteredWithData.length, 'without data:', withoutData.length);
      }

      if (readings && readings.trim() !== '') {
        const targetReadings = readings.split(',').map(r => r.trim().toLowerCase());
        console.log('Applying readings filter:', targetReadings);
        // Filter by readings (this would require device data to have reading types)
        // For now, skip this filter or implement based on your data structure
      }

      console.log('Final filtered devices:', filteredDevices.length);
      setDevices(filteredDevices);
      setShowResults(true);
      await fetchStats();

      toast({
        title: 'Filter Applied',
        description: `Found ${filteredDevices.length} device(s) matching your criteria`
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to filter devices'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      if (devices.length === 0) {
        toast({
          variant: 'destructive',
          title: 'No Data',
          description: 'Please filter devices first before exporting'
        });
        return;
      }

      // Generate CSV
      const csvRows = [];
      csvRows.push(['Device ID', 'Installer Name', 'Coordinates', 'User Reading (cm)', 'Server Reading (cm)', 'Variance (%)']);
      
      devices.forEach(device => {
        // Combine lat/long into one field
        const coordinates = (device.latitude && device.longitude) 
          ? `${device.latitude},${device.longitude}` 
          : 'N/A';
        
        csvRows.push([
          device.deviceId,
          device.installerName,
          coordinates,
          device.userReading != null ? device.userReading : 'N/A',
          device.serverReading != null ? device.serverReading : 'N/A',
          device.variance
        ]);
      });

      const csvContent = csvRows.map(row => 
        row.map(cell => {
          const cellStr = String(cell);
          if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
            return `"${cellStr.replace(/"/g, '""')}"`;
          }
          return cellStr;
        }).join(',')
      ).join('\n');

      // Download CSV
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `devices_filtered_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: 'CSV Exported',
        description: `Exported ${devices.length} device(s) to CSV`
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export CSV');
      toast({
        variant: 'destructive',
        title: 'Export Failed',
        description: err instanceof Error ? err.message : 'Failed to export CSV'
      });
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Device Filter & Export</h1>
          <p className="text-muted-foreground mt-1">
            Filter devices by variance, readings, or server data status
          </p>
        </div>
      </div>

      {/* Stats Card */}
      {stats && (
        <Card>
          <CardHeader>
            <CardTitle>Device Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 border rounded-lg">
                <div className="text-2xl font-bold">{stats.totalDevices}</div>
                <div className="text-sm text-muted-foreground">Total Devices</div>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="text-2xl font-bold text-green-600">{stats.devicesWithData}</div>
                <div className="text-sm text-muted-foreground">With Server Data</div>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="text-2xl font-bold text-orange-600">{stats.devicesWithoutData}</div>
                <div className="text-sm text-muted-foreground">Without Server Data</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter Card */}
      <Card>
        <CardHeader>
          <CardTitle>Filter Options</CardTitle>
          <CardDescription>
            Enter filter criteria to find specific devices
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="variance">Variance Threshold</Label>
              <Input
                id="variance"
                type="number"
                step="0.01"
                placeholder="e.g., 10"
                value={variance}
                onChange={(e) => setVariance(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Filter devices with variance ≥ this value
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="readings">Specific Readings</Label>
              <Input
                id="readings"
                type="text"
                placeholder="e.g., z,y,m"
                value={readings}
                onChange={(e) => setReadings(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated reading types
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="teamId">Team / Amanah</Label>
              <Select value={teamId || "all"} onValueChange={(value) => setTeamId(value === "all" ? "" : value)}>
                <SelectTrigger id="teamId">
                  <SelectValue placeholder="All Teams" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Teams</SelectItem>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Filter by specific team/amanah
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="noServerData"
              checked={noServerData}
              onCheckedChange={(checked) => setNoServerData(checked as boolean)}
            />
            <Label htmlFor="noServerData" className="cursor-pointer">
              Show only devices with no server data
            </Label>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-3 pt-4">
            <Button 
              onClick={handleFilter} 
              disabled={loading}
              className="flex-1"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Filter className="mr-2 h-4 w-4" />
                  Filter Devices
                </>
              )}
            </Button>

            <Button 
              onClick={handleExportCSV} 
              disabled={loading}
              variant="outline"
              className="flex-1"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      {showResults && (
        <Card>
          <CardHeader>
            <CardTitle>Filtered Results</CardTitle>
            <CardDescription>
              Found {devices.length} device{devices.length !== 1 ? 's' : ''} matching your criteria
            </CardDescription>
          </CardHeader>
          <CardContent>
            {devices.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No devices found matching the filter criteria
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device ID</TableHead>
                      <TableHead>Installer Name</TableHead>
                      <TableHead>Team/Amanah</TableHead>
                      <TableHead>User Reading (cm)</TableHead>
                      <TableHead>Server Reading (cm)</TableHead>
                      <TableHead>Variance (%)</TableHead>
                      <TableHead>Coordinates</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {devices.map((device) => (
                      <TableRow key={device.deviceId}>
                        <TableCell className="font-mono text-sm">
                          {device.deviceId}
                        </TableCell>
                        <TableCell>{device.installerName}</TableCell>
                        <TableCell>
                          {device.teamName ? (
                            <Badge variant="outline">{device.teamName}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">No team</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono">
                          {device.userReading != null ? device.userReading : (
                            <span className="text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono">
                          {device.serverReading != null ? device.serverReading : (
                            <span className="text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono">
                          {device.variance !== 'N/A' ? (
                            <Badge variant={parseFloat(device.variance) > 10 ? 'destructive' : 'default'}>
                              {device.variance}%
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {device.latitude && device.longitude ? (
                            <div className="space-y-1">
                              <div>{Number(device.latitude).toFixed(6)}</div>
                              <div>{Number(device.longitude).toFixed(6)}</div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">No coordinates</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            device.status === 'verified' ? 'default' :
                            device.status === 'pending' ? 'secondary' : 'outline'
                          }>
                            {device.status || 'N/A'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

