import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Database, FileDown, Filter, Loader2, RefreshCw, X } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { format } from "date-fns";
import type { Installation, Team } from "@/lib/types";
import { translateTeamNameToArabic } from "@/lib/amanah-translations";
import {
  buildDeviceUpdateSql,
  CoordinateMode,
  previewSqlRows,
  SQL_EXPORT_FIELD_OPTIONS,
  SqlExportFieldKey,
  SqlExportRowInput,
} from "@/lib/device-sql-export";

type StatusFilter =
  | "all"
  | "pending"
  | "highVariance"
  | "withServerData"
  | "noServerData"
  | "preVerified"
  | "verified"
  | "flagged"
  | "escalated";

interface LocationRecord {
  id: string;
  locationId: string;
  latitude: number;
  longitude: number;
  municipalityName?: string;
}

const DEFAULT_SELECTED_FIELDS: SqlExportFieldKey[] = [
  "amana_name",
  "municipality_name",
  "address",
  "lat",
  "lng",
  "sumpdepth",
  "binheight",
];

function downloadSql(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/sql;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function matchesDeviceUidList(deviceId: string, uidList: string[]): boolean {
  const devId = deviceId.toUpperCase();
  return uidList.some((uid) => (uid.length === 4 ? devId.endsWith(uid) : devId.includes(uid)));
}

function getVariancePercent(installation: Installation): number | null {
  if (installation.latestDisCm == null || installation.sensorReading == null) return null;
  if (installation.sensorReading === 0) return null;
  return (Math.abs(installation.latestDisCm - installation.sensorReading) / installation.sensorReading) * 100;
}

export default function DeviceSqlExport() {
  const { userProfile } = useAuth();
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeFilter, setActiveFilter] = useState<StatusFilter>("all");
  const [installerNameFilter, setInstallerNameFilter] = useState("");
  const [deviceIdFilter, setDeviceIdFilter] = useState("");
  const [locationIdFilter, setLocationIdFilter] = useState("");
  const [deviceUidsFilter, setDeviceUidsFilter] = useState("");
  const [teamIdFilter, setTeamIdFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const [coordinateMode, setCoordinateMode] = useState<CoordinateMode>("location");
  const [forceMunicipalityDash, setForceMunicipalityDash] = useState(true);
  const [includeFloodThresholds, setIncludeFloodThresholds] = useState(true);
  const [scriptLabel, setScriptLabel] = useState("update_devices_flowset_export");
  const [selectedFields, setSelectedFields] = useState<Set<SqlExportFieldKey>>(
    () => new Set(DEFAULT_SELECTED_FIELDS)
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [teamsSnap, instSnap, locSnap] = await Promise.all([
        getDocs(collection(db, "teams")),
        getDocs(collection(db, "installations")),
        getDocs(collection(db, "locations")),
      ]);

      setTeams(
        teamsSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Team, "id">),
        }))
      );

      setInstallations(
        instSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Installation, "id">),
          createdAt: d.data().createdAt?.toDate?.(),
          updatedAt: d.data().updatedAt?.toDate?.(),
        }))
      );

      setLocations(
        locSnap.docs
          .map((d) => {
            const data = d.data() as Record<string, unknown>;
            const lat =
              typeof data.latitude === "number"
                ? data.latitude
                : data.latitude
                  ? parseFloat(String(data.latitude))
                  : NaN;
            const lon =
              typeof data.longitude === "number"
                ? data.longitude
                : data.longitude
                  ? parseFloat(String(data.longitude))
                  : NaN;
            return {
              id: d.id,
              locationId: String(data.locationId || d.id),
              latitude: lat,
              longitude: lon,
              municipalityName: data.municipalityName ? String(data.municipalityName) : undefined,
            };
          })
          .filter((loc) => !Number.isNaN(loc.latitude) && !Number.isNaN(loc.longitude))
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load data");
      setInstallations([]);
      setTeams([]);
      setLocations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userProfile?.isAdmin) loadData();
  }, [userProfile?.isAdmin, loadData]);

  const teamNameById = useMemo(() => {
    const map: Record<string, string> = {};
    teams.forEach((team) => {
      map[team.id] = team.name;
    });
    return map;
  }, [teams]);

  const locationMap = useMemo(() => {
    const map = new Map<string, LocationRecord>();
    locations.forEach((loc) => {
      map.set(String(loc.locationId).trim(), loc);
      map.set(String(loc.id).trim(), loc);
    });
    return map;
  }, [locations]);

  const lookupLocation = useCallback(
    (locationId: string) => {
      const raw = locationId.trim();
      if (!raw) return null;
      const fromMap = locationMap.get(raw);
      if (fromMap) {
        return {
          latitude: fromMap.latitude,
          longitude: fromMap.longitude,
          municipalityName: fromMap.municipalityName,
        };
      }
      const found = locations.find(
        (loc) => String(loc.id).trim() === raw || String(loc.locationId).trim() === raw
      );
      if (!found) return null;
      return {
        latitude: found.latitude,
        longitude: found.longitude,
        municipalityName: found.municipalityName,
      };
    },
    [locationMap, locations]
  );

  const filteredInstallations = useMemo(() => {
    let filtered = installations;

    if (activeFilter === "pending") {
      filtered = filtered.filter((inst) => inst.status === "pending");
    } else if (activeFilter === "verified") {
      filtered = filtered.filter((inst) => inst.status === "verified");
    } else if (activeFilter === "flagged") {
      filtered = filtered.filter((inst) => inst.status === "flagged");
    } else if (activeFilter === "highVariance") {
      filtered = filtered.filter((inst) => {
        const variance = getVariancePercent(inst);
        return variance != null && variance > 5;
      });
    } else if (activeFilter === "withServerData") {
      filtered = filtered.filter((inst) => inst.latestDisCm != null);
    } else if (activeFilter === "noServerData") {
      filtered = filtered.filter((inst) => inst.latestDisCm == null);
    } else if (activeFilter === "preVerified") {
      filtered = filtered.filter((inst) => inst.systemPreVerified === true);
    } else if (activeFilter === "escalated") {
      filtered = filtered.filter((inst) => inst.tags?.includes("escalated to manager"));
    }

    if (installerNameFilter) {
      filtered = filtered.filter((inst) =>
        inst.installedByName?.toLowerCase().includes(installerNameFilter.toLowerCase())
      );
    }

    if (deviceIdFilter) {
      filtered = filtered.filter((inst) =>
        inst.deviceId?.toUpperCase().includes(deviceIdFilter.toUpperCase())
      );
    }

    if (locationIdFilter.trim()) {
      const term = locationIdFilter.trim().toLowerCase();
      filtered = filtered.filter((inst) =>
        String(inst.locationId ?? "").toLowerCase().includes(term)
      );
    }

    if (deviceUidsFilter.trim()) {
      const uidList = deviceUidsFilter
        .split("\n")
        .map((uid) => uid.trim().toUpperCase())
        .filter(Boolean);
      if (uidList.length > 0) {
        filtered = filtered.filter((inst) =>
          inst.deviceId ? matchesDeviceUidList(inst.deviceId, uidList) : false
        );
      }
    }

    if (teamIdFilter) {
      filtered = filtered.filter((inst) => inst.teamId === teamIdFilter);
    }

    if (dateFilter) {
      const filterDate = new Date(dateFilter);
      filterDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(filterDate);
      nextDay.setDate(nextDay.getDate() + 1);
      filtered = filtered.filter((inst) => {
        if (!inst.createdAt) return false;
        const installDate = new Date(inst.createdAt);
        installDate.setHours(0, 0, 0, 0);
        return installDate >= filterDate && installDate < nextDay;
      });
    }

    return filtered.filter((inst) => !!inst.deviceId);
  }, [
    installations,
    activeFilter,
    installerNameFilter,
    deviceIdFilter,
    locationIdFilter,
    deviceUidsFilter,
    teamIdFilter,
    dateFilter,
  ]);

  const selectedFieldList = useMemo(
    () => SQL_EXPORT_FIELD_OPTIONS.map((f) => f.key).filter((key) => selectedFields.has(key)),
    [selectedFields]
  );

  const sqlRowInputs = useMemo<SqlExportRowInput[]>(
    () =>
      filteredInstallations.map((installation) => ({
        installation,
        teamName: installation.teamId ? teamNameById[installation.teamId] || "" : "",
        lookupLocation,
        coordinateMode,
        forceMunicipalityDash,
        selectedFields,
      })),
    [filteredInstallations, teamNameById, lookupLocation, coordinateMode, forceMunicipalityDash, selectedFields]
  );

  const generatedSql = useMemo(() => {
    if (sqlRowInputs.length === 0 || selectedFieldList.length === 0) return "";
    return buildDeviceUpdateSql({
      rows: sqlRowInputs,
      selectedFields: selectedFieldList,
      includeFloodThresholds,
      scriptLabel: scriptLabel.trim() || "update_devices_flowset_export",
    });
  }, [sqlRowInputs, selectedFieldList, includeFloodThresholds, scriptLabel]);

  const previewRows = useMemo(
    () => previewSqlRows(sqlRowInputs, selectedFieldList, 5),
    [sqlRowInputs, selectedFieldList]
  );

  const toggleField = (field: SqlExportFieldKey, checked: boolean) => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (checked) next.add(field);
      else next.delete(field);
      return next;
    });
  };

  const handleDownload = () => {
    if (!generatedSql) return;
    const safeLabel = (scriptLabel.trim() || "update_devices_flowset_export").replace(
      /[^a-z0-9._-]/gi,
      "_"
    );
    downloadSql(generatedSql, `${safeLabel}_${format(new Date(), "yyyy-MM-dd")}.sql`);
  };

  const clearFilters = () => {
    setActiveFilter("all");
    setInstallerNameFilter("");
    setDeviceIdFilter("");
    setLocationIdFilter("");
    setDeviceUidsFilter("");
    setTeamIdFilter("");
    setDateFilter("");
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

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Database className="h-8 w-8 text-primary" />
            Device SQL Export
          </h1>
          <p className="text-muted-foreground mt-1">
            Generate cloud-safe UPDATE scripts using the same filters as the verification screen.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            onClick={handleDownload}
            disabled={loading || !generatedSql}
          >
            <FileDown className="h-4 w-4 mr-2" />
            Download SQL
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
          <CardDescription>Same filter set as the verification screen.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={activeFilter} onValueChange={(v) => setActiveFilter(v as StatusFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                  <SelectItem value="highVariance">High Variance</SelectItem>
                  <SelectItem value="withServerData">With Server Data</SelectItem>
                  <SelectItem value="noServerData">No Server Data</SelectItem>
                  <SelectItem value="preVerified">Pre-verified</SelectItem>
                  <SelectItem value="flagged">Flagged</SelectItem>
                  <SelectItem value="escalated">Escalated</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Installer Name</Label>
              <Input
                placeholder="Search installer..."
                value={installerNameFilter}
                onChange={(e) => setInstallerNameFilter(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Device ID</Label>
              <Input
                placeholder="Search device ID..."
                value={deviceIdFilter}
                onChange={(e) => setDeviceIdFilter(e.target.value)}
                className="font-mono"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Location ID</Label>
              <Input
                placeholder="Search location ID..."
                value={locationIdFilter}
                onChange={(e) => setLocationIdFilter(e.target.value)}
                className="font-mono"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Team / Amanah</Label>
              <Select value={teamIdFilter || "all"} onValueChange={(v) => setTeamIdFilter(v === "all" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="All Teams" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Teams</SelectItem>
                  {teams.map((team) => {
                    const arabic = translateTeamNameToArabic(team.name);
                    return (
                      <SelectItem key={team.id} value={team.id}>
                        {arabic ? `${team.name} / ${arabic}` : team.name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Installation Date</Label>
              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t">
            <Label htmlFor="device-uids-filter">Device UIDs (one per line)</Label>
            <Textarea
              id="device-uids-filter"
              placeholder="Enter device UIDs; 4 characters match last 4 of device ID"
              value={deviceUidsFilter}
              onChange={(e) => setDeviceUidsFilter(e.target.value)}
              className="font-mono text-sm h-24 resize-none"
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4 mr-2" />
              Clear Filters
            </Button>
            <Badge variant="secondary">{filteredInstallations.length} matching devices</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">SQL Fields</CardTitle>
          <CardDescription>
            Address = Location ID, sumpdepth = installer reading, binheight = server reading.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {SQL_EXPORT_FIELD_OPTIONS.map((field) => (
              <label key={field.key} className="flex items-start gap-3 rounded-md border p-3 cursor-pointer">
                <Checkbox
                  checked={selectedFields.has(field.key)}
                  onCheckedChange={(checked) => toggleField(field.key, checked === true)}
                />
                <div>
                  <div className="text-sm font-medium">{field.label}</div>
                  <div className="text-xs text-muted-foreground">{field.description}</div>
                </div>
              </label>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t">
            <div className="space-y-1">
              <Label className="text-xs">Coordinates</Label>
              <Select
                value={coordinateMode}
                onValueChange={(v) => setCoordinateMode(v as CoordinateMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="location">Location reference (9999 uses installer GPS)</SelectItem>
                  <SelectItem value="installer-gps">Installer GPS for all</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="script-label">Script label</Label>
              <Input
                id="script-label"
                value={scriptLabel}
                onChange={(e) => setScriptLabel(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={forceMunicipalityDash}
                onCheckedChange={(checked) => setForceMunicipalityDash(checked === true)}
              />
              Force municipality_name to &apos;-&apos;
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={includeFloodThresholds}
                onCheckedChange={(checked) => setIncludeFloodThresholds(checked === true)}
              />
              Include flood thresholds (99 / 99 / 99)
            </label>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Load failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
          <CardDescription>
            First 5 rows and generated SQL header. Full script is included in download.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : selectedFieldList.length === 0 ? (
            <p className="text-sm text-muted-foreground">Select at least one SQL field.</p>
          ) : filteredInstallations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No devices match the current filters.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 pr-3">Device ID</th>
                      {selectedFieldList.map((field) => (
                        <th key={field} className="py-2 pr-3">
                          {field}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row) => (
                      <tr key={row.deviceId} className="border-b">
                        <td className="py-2 pr-3 font-mono">{row.deviceId}</td>
                        {selectedFieldList.map((field) => (
                          <td key={field} className="py-2 pr-3 font-mono">
                            {row[field] == null || row[field] === "" ? "NULL" : String(row[field])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <pre className="text-xs bg-muted p-4 rounded-md overflow-x-auto max-h-72 whitespace-pre-wrap">
                {generatedSql.split("\n").slice(0, 12).join("\n")}
                {"\n...\n"}
                {generatedSql.split("\n").slice(-4).join("\n")}
              </pre>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
