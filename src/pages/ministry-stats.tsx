import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Installation } from "@/lib/types";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";

export default function MinistryStats() {
  const { userProfile } = useAuth();
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [teamFilter, setTeamFilter] = useState<string>("all");

  useEffect(() => {
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
    return () => { unsubI(); unsubT(); };
  }, []);

  const teamIdToName = useMemo(() => {
    const map: Record<string, string> = {};
    teams.forEach((t) => { if (t.id) map[t.id] = (t as any).name; });
    return map;
  }, [teams]);

  const filtered = useMemo(() => {
    return installations.filter((i) => teamFilter === "all" || (i.teamId && teamIdToName[i.teamId] === teamFilter));
  }, [installations, teamFilter, teamIdToName]);

  const stats = useMemo(() => ({
    total: filtered.length,
    pending: filtered.filter(i => i.status === 'pending').length,
    verified: filtered.filter(i => i.status === 'verified').length,
    flagged: filtered.filter(i => i.status === 'flagged').length,
    withServerData: filtered.filter(i => i.latestDisCm != null).length,
  }), [filtered]);

  const statusData = useMemo(() => (
    [
      { name: 'Pending', value: stats.pending, color: '#EAB308' },
      { name: 'Verified', value: stats.verified, color: '#16A34A' },
      { name: 'Flagged', value: stats.flagged, color: '#DC2626' },
    ]
  ), [stats]);

  const byTeamData = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.forEach(i => {
      const team = i.teamId ? (teamIdToName[i.teamId] || i.teamId) : 'Unassigned';
      counts[team] = (counts[team] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [filtered, teamIdToName]);

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Installation Statistics</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filter by Amanah:</span>
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {teamNames.map((n) => (<SelectItem key={n} value={n}>{n}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="p-6 text-center"><p className="text-sm text-muted-foreground">Total</p><p className="text-3xl font-bold">{stats.total}</p></CardContent></Card>
        <Card><CardContent className="p-6 text-center"><p className="text-sm text-muted-foreground">Pending</p><p className="text-3xl font-bold text-yellow-600">{stats.pending}</p></CardContent></Card>
        <Card><CardContent className="p-6 text-center"><p className="text-sm text-muted-foreground">Verified</p><p className="text-3xl font-bold text-green-600">{stats.verified}</p></CardContent></Card>
        <Card><CardContent className="p-6 text-center"><p className="text-sm text-muted-foreground">Flagged</p><p className="text-3xl font-bold text-red-600">{stats.flagged}</p></CardContent></Card>
        <Card><CardContent className="p-6 text-center"><p className="text-sm text-muted-foreground">With Server Data</p><p className="text-3xl font-bold text-blue-600">{stats.withServerData}</p></CardContent></Card>
      </div>

      {/* Status Distribution Pie */}
      <Card className="border shadow-sm">
        <CardHeader><CardTitle>Status Distribution</CardTitle></CardHeader>
        <CardContent>
          <ChartContainer config={{}} className="h-72">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100}>
                  {statusData.map((entry, idx) => (
                    <Cell key={`cell-${idx}`} fill={entry.color} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
              </PieChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Top Amanah by Installations */}
      <Card className="border shadow-sm">
        <CardHeader><CardTitle>Top Amanah by Installations</CardTitle></CardHeader>
        <CardContent>
          <ChartContainer config={{}} className="h-80">
            <ResponsiveContainer>
              <BarChart data={byTeamData} margin={{ left: 24, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-30} textAnchor="end" height={60} />
                <YAxis allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" fill="#2563EB" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
