import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { Device, Installation } from "@/lib/types";

export default function MinistryDevices() {
  const { userProfile } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "verified" | "flagged">("all");

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
    return () => { unsubD(); unsubI(); unsubT(); };
  }, []);

  const teamIdToName = useMemo(() => {
    const map: Record<string, string> = {};
    teams.forEach((t) => { if (t.id) map[t.id] = (t as any).name; });
    return map;
  }, [teams]);

  const rows = useMemo(() => {
    return devices.map((d) => {
      const insts = installations.filter((i) => i.deviceId === d.id);
      insts.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
      const inst = insts[0];
      const amanah = inst?.teamId ? teamIdToName[inst.teamId] || inst.teamId : "-";
      return { device: d, inst, amanah };
    })
      .filter((row) => teamFilter === "all" || row.amanah === teamFilter)
      .filter((row) => statusFilter === "all" || (row.inst?.status === statusFilter));
  }, [devices, installations, teamFilter, statusFilter, teamIdToName]);

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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-bold">All Devices</h1>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="text-sm text-muted-foreground">Filter by Amanah:</span>
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="w-full sm:w-[220px]"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {teamNames.map((n) => (<SelectItem key={n} value={n}>{n}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="text-sm text-muted-foreground">Status:</span>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="flagged">Flagged</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl md:text-2xl font-bold">Devices ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[140px]">Device ID</TableHead>
                  <TableHead className="min-w-[120px]">Amanah</TableHead>
                  <TableHead className="min-w-[100px]">Location ID</TableHead>
                  <TableHead className="min-w-[120px]">Server Reading</TableHead>
                  <TableHead className="min-w-[140px]">Installation Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ device, inst, amanah }) => (
                  <TableRow key={device.id}>
                    <TableCell className="font-mono text-xs md:text-sm">{device.id}</TableCell>
                    <TableCell className="text-xs md:text-sm">{amanah}</TableCell>
                    <TableCell className="text-xs md:text-sm">{inst?.locationId || "-"}</TableCell>
                    <TableCell className="text-xs md:text-sm">{inst?.latestDisCm ?? "-"}</TableCell>
                    <TableCell>
                      {inst?.status ? (
                        <Badge variant="outline" className="text-xs capitalize">{inst.status}</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
