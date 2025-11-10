import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  CheckCircle,
  CloudOff, 
  CircleCheck, 
  Database,
  X,
  Filter
} from "lucide-react";
import type { Device, Installation } from "@/lib/types";

const statusConfig = {
  pending: { 
    label: "Pending Verification", 
    icon: Clock, 
    color: "text-yellow-600 bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800" 
  },
  verified: { 
    label: "Verified", 
    icon: CheckCircle, 
    color: "text-green-600 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800" 
  },
  flagged: { 
    label: "Flagged", 
    icon: AlertTriangle, 
    color: "text-red-600 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800" 
  },
};

interface Location {
  id: string;
  locationId: string;
  latitude: number;
  longitude: number;
}

export default function MinistryDevices() {
  const { userProfile } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'withServerData' | 'noServerData' | 'preVerified' | 'verified'>('all');

  useEffect(() => {
    const unsubD = onSnapshot(collection(db, "devices"), (snap) => {
      const data = snap.docs.map((d) => ({ ...(d.data() as any), id: d.id })) as Device[];
      setDevices(data);
    });
    const unsubI = onSnapshot(collection(db, "installations"), (snap) => {
      const data = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
        createdAt: d.data().createdAt?.toDate(),
        updatedAt: d.data().updatedAt?.toDate(),
      })) as Installation[];
      setInstallations(data);
    });
    const unsubT = onSnapshot(collection(db, "teams"), (snap) => {
      setTeams(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as any);
    });
    const unsubL = onSnapshot(collection(db, "locations"), (snap) => {
      const data = snap.docs.map((d) => {
        const docData = d.data() as any;
        // Parse coordinates as numbers (handle both string and number formats)
        const lat = typeof docData.latitude === 'number' 
          ? docData.latitude 
          : (docData.latitude ? parseFloat(String(docData.latitude)) : null);
        const lon = typeof docData.longitude === 'number'
          ? docData.longitude
          : (docData.longitude ? parseFloat(String(docData.longitude)) : null);
        
        return {
          id: d.id,
          locationId: docData.locationId || d.id, // Use document ID as fallback
          latitude: lat,
          longitude: lon,
        } as Location;
      }).filter(loc => loc.latitude != null && loc.longitude != null && !isNaN(loc.latitude) && !isNaN(loc.longitude));
      
      setLocations(data);
    });
    return () => { unsubD(); unsubI(); unsubT(); unsubL(); };
  }, []);

  const teamIdToName = useMemo(() => {
    const map: Record<string, string> = {};
    teams.forEach((t) => { if (t.id) map[t.id] = (t as any).name; });
    return map;
  }, [teams]);

  // Create a map of locationId -> coordinates
  // In admin upload, document ID = locationId, so we map by both id and locationId field
  const locationMap = useMemo(() => {
    const map = new Map<string, Location>();
    locations.forEach((loc) => {
      // Map by document ID (which is the locationId in admin upload)
      if (loc.id) {
        const idKey = String(loc.id).trim();
        map.set(idKey, loc);
        // Also try without leading zeros for numeric IDs
        if (/^\d+$/.test(idKey)) {
          const numKey = String(Number(idKey)).trim();
          if (numKey !== idKey) {
            map.set(numKey, loc);
          }
        }
      }
      // Map by locationId field if it exists and differs from document ID
      if (loc.locationId && String(loc.locationId).trim() !== String(loc.id).trim()) {
        const locIdKey = String(loc.locationId).trim();
        map.set(locIdKey, loc);
        // Also try without leading zeros for numeric IDs
        if (/^\d+$/.test(locIdKey)) {
          const numKey = String(Number(locIdKey)).trim();
          if (numKey !== locIdKey) {
            map.set(numKey, loc);
          }
        }
      }
    });
    return map;
  }, [locations]);

  // Create rows with installation data and calculated metrics
  const allRows = useMemo(() => {
    return devices
      .map((d) => {
        const insts = installations.filter((i) => i.deviceId === d.id);
        insts.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
        const inst = insts[0];
        if (!inst) return null;
        
        const amanah = inst.teamId ? teamIdToName[inst.teamId] || inst.teamId : "-";
        
        // Calculate variance if we have both sensor reading and server data
        let percentageDifference: number | undefined;
        if (inst.latestDisCm != null && inst.sensorReading != null) {
          const diff = Math.abs(inst.latestDisCm - inst.sensorReading);
          percentageDifference = (diff / inst.sensorReading) * 100;
        }
        
        const hasServerData = inst.latestDisCm != null && inst.latestDisCm > 0;
        const hasNoServerData = !hasServerData;
        const isPreVerified = inst.systemPreVerified === true;
        const isVerified = inst.status === "verified";
        const isPending = inst.status === "pending";
        
        return { 
          device: d, 
          inst, 
          amanah,
          percentageDifference,
          hasServerData,
          hasNoServerData,
          isPreVerified,
          isVerified,
          isPending
        };
      })
      // Only show devices that have at least one installation (installed devices)
      .filter((row): row is NonNullable<typeof row> => row !== null);
  }, [devices, installations, teamIdToName]);

  // Calculate filter counts
  const pendingCount = useMemo(() => {
    return allRows.filter(row => row.isPending).length;
  }, [allRows]);

  const withServerDataCount = useMemo(() => {
    return allRows.filter(row => row.hasServerData).length;
  }, [allRows]);

  const noServerDataCount = useMemo(() => {
    return allRows.filter(row => row.hasNoServerData).length;
  }, [allRows]);

  const preVerifiedCount = useMemo(() => {
    return allRows.filter(row => row.isPreVerified).length;
  }, [allRows]);

  const verifiedCount = useMemo(() => {
    return allRows.filter(row => row.isVerified).length;
  }, [allRows]);

  // Apply filters to rows
  const rows = useMemo(() => {
    let filtered = allRows;

    // Apply active filter (only one can be active at a time)
    if (activeFilter === 'pending') {
      filtered = allRows.filter(row => row.isPending);
    } else if (activeFilter === 'withServerData') {
      filtered = allRows.filter(row => row.hasServerData);
    } else if (activeFilter === 'noServerData') {
      filtered = allRows.filter(row => row.hasNoServerData);
    } else if (activeFilter === 'preVerified') {
      filtered = allRows.filter(row => row.isPreVerified);
    } else if (activeFilter === 'verified') {
      filtered = allRows.filter(row => row.isVerified);
    }

    // Apply team filter
    if (teamFilter !== "all") {
      filtered = filtered.filter((row) => row.amanah === teamFilter);
    }

    return filtered;
  }, [allRows, activeFilter, teamFilter]);

  if (!userProfile?.isAdmin && userProfile?.role !== "ministry") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-xl font-semibold mb-2">Access Denied</p>
            <p className="text-muted-foreground">Only ministry and administrators can view this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const teamNames = Array.from(new Set(teams.map((t) => (t as any).name))).sort();

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">All Devices</h1>
        <p className="text-muted-foreground mt-2">View and filter installed devices</p>
      </div>

      {/* Stats - Filter Banners */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className={`border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${activeFilter==='pending' ? 'ring-2 ring-yellow-400' : ''}`} onClick={() => setActiveFilter(activeFilter==='pending' ? 'all' : 'pending')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Pending Verification</p>
                <p className="text-3xl font-bold mt-1">{pendingCount}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-yellow-100 dark:bg-yellow-950 flex items-center justify-center">
                <Clock className="h-6 w-6 text-yellow-600 dark:text-yellow-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${activeFilter==='withServerData' ? 'ring-2 ring-green-400' : ''}`} onClick={() => setActiveFilter(activeFilter==='withServerData' ? 'all' : 'withServerData')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">With Server Data</p>
                <p className="text-3xl font-bold mt-1 text-green-600">
                  {withServerDataCount}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-green-100 dark:bg-green-950 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${activeFilter==='noServerData' ? 'ring-2 ring-orange-400' : ''}`} onClick={() => setActiveFilter(activeFilter==='noServerData' ? 'all' : 'noServerData')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">No Server Data</p>
                <p className="text-3xl font-bold mt-1 text-orange-600">
                  {noServerDataCount}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-orange-100 dark:bg-orange-950 flex items-center justify-center">
                <CloudOff className="h-6 w-6 text-orange-600 dark:text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${activeFilter==='preVerified' ? 'ring-2 ring-blue-400' : ''}`} onClick={() => setActiveFilter(activeFilter==='preVerified' ? 'all' : 'preVerified')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Pre-verified</p>
                <p className="text-3xl font-bold mt-1 text-blue-600">
                  {preVerifiedCount}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                <CircleCheck className="h-6 w-6 text-blue-600 dark:text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${activeFilter==='verified' ? 'ring-2 ring-purple-400' : ''}`} onClick={() => setActiveFilter(activeFilter==='verified' ? 'all' : 'verified')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Verified</p>
                <p className="text-3xl font-bold mt-1 text-purple-600">
                  {verifiedCount}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-purple-100 dark:bg-purple-950 flex items-center justify-center">
                <Database className="h-6 w-6 text-purple-600 dark:text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters Section */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Team Filter */}
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Filter by Amanah:</label>
              <Select value={teamFilter} onValueChange={setTeamFilter}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All Teams" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Teams</SelectItem>
                  {teamNames.map((n) => (<SelectItem key={n} value={n}>{n}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Clear Filters Button */}
          {(teamFilter !== "all" || activeFilter !== 'all') && (
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setTeamFilter("all");
                  setActiveFilter('all');
                }}
              >
                <X className="h-4 w-4 mr-2" />
                Clear All Filters
              </Button>
              <div className="flex flex-wrap gap-2">
                {teamFilter !== "all" && (
                  <Badge variant="secondary" className="text-xs">
                    Team: {teamFilter}
                  </Badge>
                )}
                {activeFilter !== 'all' && (
                  <Badge variant="secondary" className="text-xs">
                    {activeFilter === 'pending' ? 'Pending' : 
                     activeFilter === 'withServerData' ? 'With Server Data' :
                     activeFilter === 'noServerData' ? 'No Server Data' :
                     activeFilter === 'preVerified' ? 'Pre-verified' :
                     activeFilter === 'verified' ? 'Verified' : ''}
                  </Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl md:text-2xl font-bold">Devices ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No devices match the current filters.</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[140px]">Device ID</TableHead>
                    <TableHead className="min-w-[120px]">Amanah</TableHead>
                    <TableHead className="min-w-[100px]">Location ID</TableHead>
                    <TableHead className="min-w-[120px]">Sensor Reading</TableHead>
                    <TableHead className="min-w-[140px]">Installation Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const { device, inst, amanah } = row;
                    // Normalize locationId - handle both string and number, trim whitespace
                    const locationId = inst?.locationId 
                      ? String(inst.locationId).trim() 
                      : null;
                    
                    // Try multiple lookup strategies to handle type mismatches
                    let location: Location | null = null;
                    if (locationId) {
                      // Try exact match first
                      location = locationMap.get(locationId);
                      // If not found, try with the document ID (which is also the locationId in admin upload)
                      if (!location && locations.length > 0) {
                        location = locations.find(loc => 
                          String(loc.id).trim() === locationId || 
                          String(loc.locationId).trim() === locationId
                        ) || null;
                      }
                    }
                    
                    const isSwapped = locationId === "9999";
                    const hasCoordinates = location && 
                      typeof location.latitude === 'number' && 
                      typeof location.longitude === 'number' &&
                      !isNaN(location.latitude) &&
                      !isNaN(location.longitude);
                    
                    return (
                      <TableRow key={device.id}>
                        <TableCell className="font-mono text-xs md:text-sm">{device.id}</TableCell>
                        <TableCell className="text-xs md:text-sm">{amanah}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="text-xs md:text-sm">{locationId || "-"}</span>
                            {hasCoordinates && (
                              <Badge variant="outline" className="text-[10px] w-fit">
                                {location!.latitude.toFixed(6)}, {location!.longitude.toFixed(6)}
                              </Badge>
                            )}
                            {isSwapped && (
                              <Badge variant="outline" className="text-[9px] w-fit bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-950/20 dark:text-gray-400 dark:border-gray-800">
                                Swapped
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs md:text-sm">{inst?.latestDisCm ?? "-"}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {inst?.status ? (() => {
                              const config = statusConfig[inst.status as keyof typeof statusConfig];
                              if (!config) {
                                return <Badge variant="outline" className="text-xs capitalize w-fit">{inst.status}</Badge>;
                              }
                              const Icon = config.icon;
                              return (
                                <Badge variant="outline" className={`${config.color} text-xs w-fit`}>
                                  <Icon className="h-3 w-3 mr-1" />
                                  {config.label}
                                </Badge>
                              );
                            })() : (
                              <span className="text-muted-foreground">-</span>
                            )}
                            {inst?.status === "pending" && inst?.systemPreVerified && (
                              <Badge variant="outline" className="text-[9px] w-fit bg-green-50 text-green-600 border-green-200 dark:bg-green-950/20 dark:text-green-400 dark:border-green-800">
                                Pre-verified
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
