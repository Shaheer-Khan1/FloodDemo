import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertCircle, History, Loader2, MapPin, RefreshCw } from "lucide-react";
import {
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { format, formatDistanceToNow } from "date-fns";
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
}

export default function BulkUpdateRecent() {
  const { userProfile } = useAuth();
  const [rows, setRows] = useState<RecentEditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
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
        // Fallback if composite index is missing: load and filter client-side
        console.warn("Firestore index query failed, using client filter:", indexErr);
        snap = await getDocs(installationsRef);
      }

      const parsed: RecentEditRow[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        const tags = Array.isArray(data.tags) ? (data.tags as string[]) : [];
        const updatedAt = firestoreToDate(data.updatedAt);
        if (!updatedAt || !wasRecentlyEdited(updatedAt, tags)) return;

        const bulkEditedRecently = wasBulkEditedRecently(updatedAt, tags);
        const verifierEditedRecently = wasVerifierEditedRecently(updatedAt, tags);

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
    if (userProfile?.isAdmin) {
      loadRows();
    }
  }, [userProfile?.isAdmin, loadRows]);

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

  const editTagLabels = (tags: string[]) =>
    tags.filter(
      (tag) =>
        hasBulkUpdateTag([tag]) ||
        hasVerifierEditTag([tag]) ||
        tag.toLowerCase().includes("bulk")
    );

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
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
          <Link href="/coordinate-update">
            <Button variant="default">
              <MapPin className="h-4 w-4 mr-2" />
              Bulk Update
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="py-4">
            <p className="text-2xl font-bold">{loading ? "—" : rows.length}</p>
            <p className="text-xs text-muted-foreground">
              Edited in last {BULK_UPDATE_RECENT_DAYS} days
            </p>
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

      <Card>
        <CardHeader>
          <CardTitle>Edited installations</CardTitle>
          <CardDescription>
            Sorted by most recently updated, including both bulk updates and
            verifier edits.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              Loading…
            </div>
          ) : rows.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground text-sm">
              No recent edits in the last {BULK_UPDATE_RECENT_DAYS} days.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device ID</TableHead>
                    <TableHead>Location ID</TableHead>
                    <TableHead>Coordinates</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead>Edit Source</TableHead>
                    <TableHead>Tags</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">{row.deviceId}</TableCell>
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
