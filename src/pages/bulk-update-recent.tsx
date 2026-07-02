import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { AlertCircle, FileDown, History, Loader2, MapPin, RefreshCw, X } from "lucide-react";
import {
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { format, formatDistanceToNow, subDays, startOfDay, endOfDay } from "date-fns";
import {
  BULK_UPDATE_RECENT_DAYS,
  firestoreToDate,
  getBulkUpdateCutoffDate,
  hasBulkUpdateTag,
  hasVerifierEditTag,
  wasBulkEditedRecently,
  wasRecentlyEdited,
  wasVerifierEditedRecently,
} from "@/lib/bulk-update";

interface RecentEditRow {
  id: string;
  deviceId: string;
  locationId: string;
  latitude: number | null;
  longitude: number | null;
  updatedAt: Date;
  tags: string[];
  editedViaVerification: boolean;
  editedViaBulk: boolean;
  teamId: string;
  teamName: string;
}

const DATE_RANGE_OPTIONS = [
  { label: "Last 7 days",  value: "7" },
  { label: "Last 14 days", value: "14" },
  { label: "Last 30 days", value: "30" },
  { label: "Custom",       value: "custom" },
];

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

export default function BulkUpdateRecent() {
  const { userProfile } = useAuth();
  const [rows, setRows]       = useState<RecentEditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  // Filter state
  const [amanahFilter, setAmanahFilter]       = useState<string>("all");
  const [dateRangeOption, setDateRangeOption] = useState<string>("14");
  const [customFrom, setCustomFrom]           = useState<string>("");
  const [customTo, setCustomTo]               = useState<string>("");

  // All unique team names from loaded rows (for dropdown)
  const teamOptions = useMemo(() => {
    const names = new Set<string>();
    rows.forEach(r => { if (r.teamName) names.add(r.teamName); });
    return Array.from(names).sort();
  }, [rows]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch teams first
      const teamsSnap = await getDocs(collection(db, "teams"));
      const teamMap: Record<string, string> = {};
      teamsSnap.forEach(d => {
        const data = d.data();
        teamMap[d.id] = data.name || data.teamName || d.id;
      });

      const cutoff = getBulkUpdateCutoffDate();
      const installationsRef = collection(db, "installations");

      let snap;
      try {
        const q = query(
          installationsRef,
          where("updatedAt", ">=", Timestamp.fromDate(cutoff)),
          orderBy("updatedAt", "desc")
        );
        snap = await getDocs(q);
      } catch (indexErr: unknown) {
        console.warn("Firestore index query failed, using client filter:", indexErr);
        snap = await getDocs(installationsRef);
      }

      const parsed: RecentEditRow[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        const tags = Array.isArray(data.tags) ? (data.tags as string[]) : [];
        const updatedAt = firestoreToDate(data.updatedAt);
        if (!updatedAt || !wasRecentlyEdited(updatedAt, tags)) return;

        const bulkEditedRecently     = wasBulkEditedRecently(updatedAt, tags);
        const verifierEditedRecently = wasVerifierEditedRecently(updatedAt, tags);
        const teamId   = String(data.teamId ?? "");
        const teamName = teamMap[teamId] || teamId || "";

        parsed.push({
          id: docSnap.id,
          deviceId: String(data.deviceId ?? ""),
          locationId: String(data.locationId ?? ""),
          latitude:
            typeof data.latitude === "number"
              ? data.latitude
              : data.latitude != null
                ? parseFloat(String(data.latitude))
                : null,
          longitude:
            typeof data.longitude === "number"
              ? data.longitude
              : data.longitude != null
                ? parseFloat(String(data.longitude))
                : null,
          updatedAt,
          tags,
          editedViaVerification: verifierEditedRecently,
          editedViaBulk: bulkEditedRecently,
          teamId,
          teamName,
        });
      });

      parsed.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      setRows(parsed);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load data";
      setError(message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userProfile?.isAdmin) loadRows();
  }, [userProfile?.isAdmin, loadRows]);

  // Compute date window
  const dateWindow = useMemo<{ from: Date; to: Date } | null>(() => {
    if (dateRangeOption === "custom") {
      if (!customFrom) return null;
      const from = startOfDay(new Date(customFrom));
      const to   = customTo ? endOfDay(new Date(customTo)) : endOfDay(new Date());
      return { from, to };
    }
    const days = parseInt(dateRangeOption, 10);
    return { from: startOfDay(subDays(new Date(), days)), to: endOfDay(new Date()) };
  }, [dateRangeOption, customFrom, customTo]);

  // Apply filters
  const filteredRows = useMemo(() => {
    let result = rows;

    if (amanahFilter !== "all") {
      result = result.filter(r =>
        r.teamName.toLowerCase().includes(amanahFilter.toLowerCase())
      );
    }

    if (dateWindow) {
      result = result.filter(r =>
        r.updatedAt >= dateWindow.from && r.updatedAt <= dateWindow.to
      );
    }

    return result;
  }, [rows, amanahFilter, dateWindow]);

  const hasFilters = amanahFilter !== "all" || dateRangeOption !== "14";

  const clearFilters = () => {
    setAmanahFilter("all");
    setDateRangeOption("14");
    setCustomFrom("");
    setCustomTo("");
  };

  const handleCsvExport = () => {
    if (filteredRows.length === 0) return;

    const headers = [
      "Device ID",
      "Amanah",
      "Location ID",
      "Coordinates",
      "Updated",
      "Edit Source",
      "Tags",
    ];

    const csvRows = filteredRows.map((row) => {
      const coords =
        row.latitude != null && row.longitude != null
          ? `${row.latitude.toFixed(6)}, ${row.longitude.toFixed(6)}`
          : "";
      const editSource =
        row.editedViaBulk && row.editedViaVerification
          ? "Bulk + Verification"
          : row.editedViaVerification
            ? "Verification"
            : "Bulk Update";
      const tags = editTagLabels(row.tags).join("; ");

      return [
        `="${row.deviceId}"`,
        row.teamName || "",
        row.locationId || "",
        coords,
        format(row.updatedAt, "yyyy-MM-dd HH:mm"),
        editSource,
        tags,
      ];
    });

    const dateStr = format(new Date(), "yyyy-MM-dd");
    const amanahTag =
      amanahFilter !== "all"
        ? `_${amanahFilter.replace(/[^a-z0-9]/gi, "_")}`
        : "";
    downloadCsv(csvRows, `recent_edits${amanahTag}_${dateStr}.csv`, headers);
  };

  const editTagLabels = (tags: string[]) =>
    tags.filter(
      (tag) =>
        hasBulkUpdateTag([tag]) ||
        hasVerifierEditTag([tag]) ||
        tag.toLowerCase().includes("bulk")
    );

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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <History className="h-8 w-8 text-primary" />
            Recent Edits
          </h1>
          <p className="text-muted-foreground mt-1">
            Installations edited in the last {BULK_UPDATE_RECENT_DAYS} days via
            Bulk Installation Update or the Verification screen.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={loadRows} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={handleCsvExport}
            disabled={loading || filteredRows.length === 0}
          >
            <FileDown className="h-4 w-4 mr-2" />
            Download CSV
          </Button>
          <Link href="/coordinate-update">
            <Button variant="default">
              <MapPin className="h-4 w-4 mr-2" />
              Bulk Update
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Filters</CardTitle>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs">
                <X className="h-3 w-3 mr-1" /> Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Amanah filter */}
            <div className="space-y-1">
              <Label className="text-xs">Amanah / Team</Label>
              <Select value={amanahFilter} onValueChange={setAmanahFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Amanahs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Amanahs</SelectItem>
                  {teamOptions.map(name => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date range */}
            <div className="space-y-1">
              <Label className="text-xs">Date Range</Label>
              <Select value={dateRangeOption} onValueChange={setDateRangeOption}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATE_RANGE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Custom date inputs */}
            {dateRangeOption === "custom" && (
              <div className="space-y-1 sm:col-span-1">
                <Label className="text-xs">From → To</Label>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={customFrom}
                    onChange={e => setCustomFrom(e.target.value)}
                    className="text-xs"
                  />
                  <Input
                    type="date"
                    value={customTo}
                    onChange={e => setCustomTo(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Active filter badges */}
          {hasFilters && (
            <div className="flex flex-wrap gap-2 mt-3">
              {amanahFilter !== "all" && (
                <Badge variant="secondary" className="text-xs">
                  Amanah: {amanahFilter}
                </Badge>
              )}
              {dateRangeOption !== "14" && (
                <Badge variant="secondary" className="text-xs">
                  {dateRangeOption === "custom"
                    ? `${customFrom || "?"} → ${customTo || "today"}`
                    : `Last ${dateRangeOption} days`}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4">
            <p className="text-2xl font-bold">{loading ? "—" : rows.length}</p>
            <p className="text-xs text-muted-foreground">Total in last {BULK_UPDATE_RECENT_DAYS} days</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-2xl font-bold">{loading ? "—" : filteredRows.length}</p>
            <p className="text-xs text-muted-foreground">Matching current filters</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm font-medium">Cutoff</p>
            <p className="text-xs text-muted-foreground mt-1">
              {format(getBulkUpdateCutoffDate(), "MMM d, yyyy HH:mm")} onward
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

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Edited installations</CardTitle>
          <CardDescription>
            Sorted by most recently updated, including both bulk updates and verifier edits.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              Loading…
            </div>
          ) : filteredRows.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground text-sm">
              {rows.length === 0
                ? `No recent edits in the last ${BULK_UPDATE_RECENT_DAYS} days.`
                : "No results match the current filters."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device ID</TableHead>
                    <TableHead>Amanah</TableHead>
                    <TableHead>Location ID</TableHead>
                    <TableHead>Coordinates</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead>Edit Source</TableHead>
                    <TableHead>Tags</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">{row.deviceId}</TableCell>
                      <TableCell className="text-xs">{row.teamName || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{row.locationId || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.latitude != null && row.longitude != null
                          ? `${row.latitude.toFixed(6)}, ${row.longitude.toFixed(6)}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>{format(row.updatedAt, "yyyy-MM-dd HH:mm")}</div>
                        <div className="text-muted-foreground">
                          {formatDistanceToNow(row.updatedAt, { addSuffix: true })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px] font-normal">
                          {row.editedViaBulk && row.editedViaVerification
                            ? "Bulk + Verification"
                            : row.editedViaVerification
                              ? "Verification"
                              : "Bulk Update"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {editTagLabels(row.tags).map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-[10px] font-normal">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
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
