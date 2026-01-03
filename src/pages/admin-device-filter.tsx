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

interface DeviceData {
  deviceId: string;
  installerName: string;
  latitude: string | number;
  longitude: string | number;
  coordinateSource: string;
  locationId: string;
  hasServerData: boolean;
  variance: string;
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

  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

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
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/devices/stats`);
      const result = await response.json();
      
      if (result.success) {
        setStats(result.data);
      }
    } catch (err) {
      console.error('Failed to fetch device stats:', err);
    }
  };

  const handleFilter = async () => {
    setLoading(true);
    setError(null);
    setShowResults(false);

    try {
      const params = new URLSearchParams();
      if (variance) params.append('variance', variance);
      if (readings) params.append('readings', readings);
      if (noServerData) params.append('noServerData', 'true');
      if (teamId) params.append('teamId', teamId);
      params.append('format', 'json');

      const response = await fetch(`${API_BASE}/api/admin/devices/filter?${params.toString()}`);
      const result = await response.json();

      if (result.success) {
        setDevices(result.data);
        setShowResults(true);
        await fetchStats();
      } else {
        setError(result.message || 'Failed to filter devices');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (variance) params.append('variance', variance);
      if (readings) params.append('readings', readings);
      if (noServerData) params.append('noServerData', 'true');
      if (teamId) params.append('teamId', teamId);
      params.append('format', 'csv');

      const response = await fetch(`${API_BASE}/api/admin/devices/filter?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error('Failed to generate CSV');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `devices_filtered_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export CSV');
    } finally {
      setLoading(false);
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
                      <TableHead>Coordinates</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Server Data</TableHead>
                      <TableHead>Variance</TableHead>
                      <TableHead>Data Points</TableHead>
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
                          <Badge variant={device.coordinateSource === 'location_relation' ? 'default' : 'secondary'}>
                            {device.coordinateSource === 'location_relation' ? 'Location' : 
                             device.coordinateSource === 'user_entered' ? 'User' : 'None'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={device.hasServerData ? 'default' : 'destructive'}>
                            {device.hasServerData ? 'Yes' : 'No'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono">
                          {device.variance}
                        </TableCell>
                        <TableCell>{device.dataPointsCount}</TableCell>
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

