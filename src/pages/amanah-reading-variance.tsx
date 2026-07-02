import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertCircle, FileDown, Gauge, Loader2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { format } from "date-fns";
import type { Installation } from "@/lib/types";

interface TeamOption {
  id: string;
  name: string;
}

interface VarianceRow {
  id: string;
  deviceId: string;
  teamName: string;
  locationId: string;
  installerReading: number;
  serverReading: number;
  differenceCm: number;
  percentBelowServer: number;
  installerName: string;
  status: string;
}

const THRESHOLD_PRESETS = ["1", "2", "3", "5", "10"];

function downloadCsv(rowsData: string[][], filename: string, headers?: string[]) {
  const csvRows = headers ? [headers, ...rowsData] : rowsData;
  const csvContent = csvRows
    .map((row) =>
      row
        .map((value) => {
          const safeValue = value ?? "";
          return `"${safeValue.replace(/"/g, '""')}"`;
        })
        .join(",")
    )
    .join("\r\n");

  const blob = new Blob(["\ufeff", csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Installer reading is more than threshold% below server reading. */
function isInstallerTooLow(
  installerReading: number,
  serverReading: number,
  thresholdPercent: number
): boolean {
  if (serverReading <= 0) return false;
  if (installerReading >= serverReading) return false;
  const percentBelow = ((serverReading - installerReading) / serverReading) * 100;
  return percentBelow > thresholdPercent;
}

export default function AmanahReadingVariance() {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [teamId, setTeamId] = useState<string>("");
  const [thresholdPreset, setThresholdPreset] = useState<string>("2");
  const [customThreshold, setCustomThreshold] = useState<string>("");

  const thresholdPercent = useMemo(() => {
    if (thresholdPreset === "custom") {
      const parsed = parseFloat(customThreshold);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
    return parseFloat(thresholdPreset);
  }, [thresholdPreset, customThreshold]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [teamsSnap, instSnap] = await Promise.all([
        getDocs(collection(db, "teams")),
        getDocs(collection(db, "installations")),
      ]);

      const teamList: TeamOption[] = [];
      teamsSnap.forEach((docSnap) => {
        const data = docSnap.data();
        teamList.push({
          id: docSnap.id,
          name: data.name || data.teamName || docSnap.id,
        });
      });
      teamList.sort((a, b) => a.name.localeCompare(b.name));
      setTeams(teamList);

      const instList: Installation[] = instSnap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Installation, "id">),
        createdAt: docSnap.data().createdAt?.toDate?.(),
        updatedAt: docSnap.data().updatedAt?.toDate?.(),
      }));
      setInstallations(instList);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load data");
      setTeams([]);
      setInstallations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userProfile?.isAdmin) loadData();
  }, [userProfile?.isAdmin, loadData]);

  const teamNameById = useMemo(() => {
    const map: Record<string, string> = {};
    teams.forEach((t) => {
      map[t.id] = t.name;
    });
    return map;
  }, [teams]);

  const matchingRows = useMemo(() => {
    if (!teamId || thresholdPercent == null) return [];

    const rows: VarianceRow[] = [];

    installations.forEach((inst) => {
      if (inst.teamId !== teamId) return;

      const installerReading =
        typeof inst.sensorReading === "number" ? inst.sensorReading : null;
      const serverReading =
        typeof inst.latestDisCm === "number" ? inst.latestDisCm : null;

      if (
        installerReading == null ||
        serverReading == null ||
        installerReading <= 0 ||
        serverReading <= 0
      ) {
        return;
      }

      if (!isInstallerTooLow(installerReading, serverReading, thresholdPercent)) {
        return;
      }

      const differenceCm = serverReading - installerReading;
      const percentBelowServer = (differenceCm / serverReading) * 100;

      rows.push({
        id: inst.id,
        deviceId: inst.deviceId,
        teamName: teamNameById[inst.teamId ?? ""] || inst.teamId || "-",
        locationId: inst.locationId ? String(inst.locationId) : "-",
        installerReading,
        serverReading,
        differenceCm,
        percentBelowServer,
        installerName: inst.installedByName || "-",
        status: inst.status || "-",
      });
    });

    rows.sort((a, b) => b.percentBelowServer - a.percentBelowServer);
    return rows;
  }, [installations, teamId, thresholdPercent, teamNameById]);

  const handleCsvExport = () => {
    if (matchingRows.length === 0 || !teamId || thresholdPercent == null) return;

    const teamName = teamNameById[teamId] || teamId;
    const headers = [
      "Device ID",
      "Amanah",
      "Location ID",
      "Installer Reading (cm)",
      "Server Reading (cm)",
      "Difference (cm)",
      "% Below Server",
      "Installer",
      "Status",
    ];

    const csvRows = matchingRows.map((row) => [
      `="${row.deviceId}"`,
      row.teamName,
      row.locationId,
      row.installerReading.toString(),
      row.serverReading.toString(),
      row.differenceCm.toFixed(2),
      row.percentBelowServer.toFixed(2),
      row.installerName,
      row.status,
    ]);

    const dateStr = format(new Date(), "yyyy-MM-dd");
    const safeTeam = teamName.replace(/[^a-z0-9]/gi, "_");
    const filename = `amanah_reading_variance_${safeTeam}_${thresholdPercent}pct_${dateStr}.csv`;
    downloadCsv(csvRows, filename, headers);

    toast({
      title: "CSV downloaded",
      description: `Exported ${matchingRows.length} device${matchingRows.length === 1 ? "" : "s"} from ${teamName}.`,
    });
  };

  if (!userProfile?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>Only admins can view this page.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const selectedTeamName = teamId ? teamNameById[teamId] || teamId : "";

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Gauge className="h-8 w-8 text-primary" />
            Reading Variance by Amanah
          </h1>
          <p className="text-muted-foreground mt-1">
            Find devices where the installer reading is more than the selected
            percentage below the server reading.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={handleCsvExport}
            disabled={loading || matchingRows.length === 0}
          >
            <FileDown className="h-4 w-4 mr-2" />
            Download CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>
            Example: 2% shows devices where installer reading is more than 2%
            lower than server reading (server 100 cm, installer 97 cm = 3%
            below).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Amanah / Team</Label>
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Amanah" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Acceptable variance (%)</Label>
              <Select value={thresholdPreset} onValueChange={setThresholdPreset}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {THRESHOLD_PRESETS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}%
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
              {thresholdPreset === "custom" && (
                <Input
                  type="number"
                  min="0.1"
                  step="0.1"
                  placeholder="Enter percentage"
                  value={customThreshold}
                  onChange={(e) => setCustomThreshold(e.target.value)}
                  className="mt-2"
                />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="py-4">
            <p className="text-2xl font-bold">
              {loading || !teamId || thresholdPercent == null ? "—" : matchingRows.length}
            </p>
            <p className="text-xs text-muted-foreground">Matching devices</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm font-medium truncate">
              {selectedTeamName || "No Amanah selected"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Threshold:{" "}
              {thresholdPercent != null ? `>${thresholdPercent}% below server` : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Load failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>Results</CardTitle>
              <CardDescription>
                Only devices with both installer and server readings are included.
              </CardDescription>
            </div>
            {matchingRows.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleCsvExport}>
                <FileDown className="h-4 w-4 mr-2" />
                Download CSV ({matchingRows.length})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!teamId ? (
            <p className="py-12 text-center text-muted-foreground text-sm">
              Select an Amanah to view results.
            </p>
          ) : thresholdPercent == null ? (
            <p className="py-12 text-center text-muted-foreground text-sm">
              Enter a valid percentage threshold.
            </p>
          ) : loading ? (
            <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              Loading…
            </div>
          ) : matchingRows.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground text-sm">
              No devices in {selectedTeamName} where installer reading is more
              than {thresholdPercent}% below server reading.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device ID</TableHead>
                    <TableHead>Location ID</TableHead>
                    <TableHead>Installer (cm)</TableHead>
                    <TableHead>Server (cm)</TableHead>
                    <TableHead>Diff (cm)</TableHead>
                    <TableHead>% Below Server</TableHead>
                    <TableHead>Installer</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matchingRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">{row.deviceId}</TableCell>
                      <TableCell className="font-mono text-xs">{row.locationId}</TableCell>
                      <TableCell>{row.installerReading}</TableCell>
                      <TableCell>{row.serverReading}</TableCell>
                      <TableCell>{row.differenceCm.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant="destructive" className="text-[10px]">
                          {row.percentBelowServer.toFixed(2)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{row.installerName}</TableCell>
                      <TableCell className="capitalize text-xs">{row.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
