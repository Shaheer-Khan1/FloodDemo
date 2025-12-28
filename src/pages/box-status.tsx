import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Loader2, Package, ChevronRight, ChevronDown } from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Device, Team, Installation } from "@/lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { translateTeamNameToArabic } from "@/lib/amanah-translations";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function BoxStatus() {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  
  const [devices, setDevices] = useState<Device[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>("all");
  const [expandedBox, setExpandedBox] = useState<string | null>(null);

  const isAdmin = userProfile?.isAdmin;

  useEffect(() => {
    if (!isAdmin) return;

    setLoading(true);

    // Listen to teams
    const teamsUnsub = onSnapshot(collection(db, "teams"), (snapshot) => {
      const loadedTeams = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      })) as Team[];
      loadedTeams.sort((a, b) => a.name.localeCompare(b.name));
      setTeams(loadedTeams);
    });

    // Listen to devices
    const devicesUnsub = onSnapshot(collection(db, "devices"), (snapshot) => {
      const loadedDevices = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      })) as Device[];
      setDevices(loadedDevices);
      setLoading(false);
    });

    // Listen to installations
    const installationsUnsub = onSnapshot(collection(db, "installations"), (snapshot) => {
      const loadedInstallations = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      })) as Installation[];
      setInstallations(loadedInstallations);
    });

    return () => {
      teamsUnsub();
      devicesUnsub();
      installationsUnsub();
    };
  }, [isAdmin]);

  // Create a map of deviceId -> installation status
  const deviceInstallationMap = useMemo(() => {
    const map = new Map<string, boolean>();
    installations.forEach((inst) => {
      map.set(inst.deviceId, true);
    });
    return map;
  }, [installations]);

  // Group devices by box number with team info
  const boxGroups = useMemo(() => {
    const filtered = devices.filter((d) => {
      // Must have a box number and team
      if (!d.boxNumber || !d.teamId) return false;
      // Apply team filter
      if (selectedTeamFilter !== "all" && d.teamId !== selectedTeamFilter) return false;
      return true;
    });

    const groups: Record<string, { 
      teamId: string; 
      teamName: string; 
      boxNumber: string; 
      devices: Device[];
      installedCount: number;
      pendingCount: number;
    }> = {};

    filtered.forEach((device) => {
      const key = `${device.teamId}__${device.boxNumber}`;
      if (!groups[key]) {
        const team = teams.find((t) => t.id === device.teamId);
        groups[key] = {
          teamId: device.teamId!,
          teamName: team?.name || device.teamId!,
          boxNumber: device.boxNumber!,
          devices: [],
          installedCount: 0,
          pendingCount: 0,
        };
      }
      groups[key].devices.push(device);
      
      // Check installation status
      if (deviceInstallationMap.has(device.id)) {
        groups[key].installedCount++;
      } else {
        groups[key].pendingCount++;
      }
    });

    // Sort by box number
    return Object.values(groups).sort((a, b) => 
      a.boxNumber.localeCompare(b.boxNumber)
    );
  }, [devices, teams, selectedTeamFilter, deviceInstallationMap]);

  const handleBoxClick = (boxKey: string) => {
    setExpandedBox(expandedBox === boxKey ? null : boxKey);
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">
              Only admins can view box status.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
          Box Status Overview
        </h1>
        <p className="text-muted-foreground mt-2">
          View boxes and their device installation status
        </p>
      </div>

      {/* Team Filter */}
      <Card>
        <CardHeader>
          <CardTitle>Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="team-filter">Amanah / Team</Label>
            <Select value={selectedTeamFilter} onValueChange={setSelectedTeamFilter}>
              <SelectTrigger id="team-filter" className="w-full md:w-[300px]">
                <SelectValue placeholder="Select team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Teams</SelectItem>
                {teams.map((team) => {
                  const arabicName = translateTeamNameToArabic(team.name);
                  return (
                    <SelectItem key={team.id} value={team.id}>
                      {arabicName ? `${team.name} / ${arabicName}` : team.name}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Boxes List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Boxes ({boxGroups.length})
          </CardTitle>
          <CardDescription>
            Click on a box to view its devices and installation status
          </CardDescription>
        </CardHeader>
        <CardContent>
          {boxGroups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No boxes found for the selected filter</p>
            </div>
          ) : (
            <div className="space-y-2">
              {boxGroups.map((box) => {
                const boxKey = `${box.teamId}__${box.boxNumber}`;
                const isExpanded = expandedBox === boxKey;
                const arabicName = translateTeamNameToArabic(box.teamName);

                return (
                  <div key={boxKey} className="border rounded-lg overflow-hidden">
                    {/* Box Header - Clickable */}
                    <button
                      onClick={() => handleBoxClick(boxKey)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        )}
                        <Package className="h-5 w-5 text-primary" />
                        <div className="text-left">
                          <div className="font-semibold text-lg">Box {box.boxNumber}</div>
                          <div className="text-sm text-muted-foreground">
                            {arabicName ? `${box.teamName} / ${arabicName}` : box.teamName}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="default" className="bg-green-600">
                            {box.installedCount} Installed
                          </Badge>
                          <Badge variant="secondary">
                            {box.pendingCount} Pending
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Total: {box.devices.length}
                        </div>
                      </div>
                    </button>

                    {/* Box Content - Devices Table */}
                    {isExpanded && (
                      <div className="border-t bg-muted/20">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Device ID</TableHead>
                              <TableHead>IMEI</TableHead>
                              <TableHead>Serial ID</TableHead>
                              <TableHead>Box Opened</TableHead>
                              <TableHead>Installer</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {box.devices.map((device) => {
                              const hasInstallation = deviceInstallationMap.has(device.id);
                              return (
                                <TableRow key={device.id}>
                                  <TableCell className="font-mono text-xs">
                                    {device.id}
                                  </TableCell>
                                  <TableCell className="font-mono text-xs">
                                    {device.deviceImei}
                                  </TableCell>
                                  <TableCell className="font-mono text-xs">
                                    {device.deviceSerialId}
                                  </TableCell>
                                  <TableCell>
                                    {device.boxOpened ? (
                                      <Badge variant="outline" className="bg-blue-50 text-blue-700">
                                        Opened
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="bg-gray-50 text-gray-700">
                                        Not Opened
                                      </Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {device.assignedInstallerName || "-"}
                                  </TableCell>
                                  <TableCell>
                                    {hasInstallation ? (
                                      <Badge variant="default" className="bg-green-600">
                                        Installed
                                      </Badge>
                                    ) : (
                                      <Badge variant="secondary">
                                        Pending
                                      </Badge>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

