import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Installation } from "@/lib/types";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";

// Hook to detect mobile viewport
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  return isMobile;
}

export default function MinistryStats() {
  const { userProfile } = useAuth();
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const isMobile = useIsMobile();

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
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-bold">Installation Statistics</h1>
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
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
        <Card><CardContent className="p-4 md:p-6 text-center"><p className="text-xs md:text-sm text-muted-foreground">Total</p><p className="text-2xl md:text-3xl font-bold">{stats.total}</p></CardContent></Card>
        <Card><CardContent className="p-4 md:p-6 text-center"><p className="text-xs md:text-sm text-muted-foreground">Pending</p><p className="text-2xl md:text-3xl font-bold text-yellow-600">{stats.pending}</p></CardContent></Card>
        <Card><CardContent className="p-4 md:p-6 text-center"><p className="text-xs md:text-sm text-muted-foreground">Verified</p><p className="text-2xl md:text-3xl font-bold text-green-600">{stats.verified}</p></CardContent></Card>
        <Card><CardContent className="p-4 md:p-6 text-center"><p className="text-xs md:text-sm text-muted-foreground">Flagged</p><p className="text-2xl md:text-3xl font-bold text-red-600">{stats.flagged}</p></CardContent></Card>
        <Card className="col-span-2 md:col-span-1"><CardContent className="p-4 md:p-6 text-center"><p className="text-xs md:text-sm text-muted-foreground">With Server Data</p><p className="text-2xl md:text-3xl font-bold text-blue-600">{stats.withServerData}</p></CardContent></Card>
      </div>

      {/* Status Distribution Pie */}
      <Card className="border shadow-sm">
        <CardHeader><CardTitle className="text-lg md:text-xl">Status Distribution</CardTitle></CardHeader>
        <CardContent>
          <ChartContainer config={{}} className="aspect-auto w-full h-56 sm:h-64 md:h-72">
            <PieChart>
              <Pie 
                data={statusData} 
                dataKey="value" 
                nameKey="name" 
                innerRadius={isMobile ? 30 : 50} 
                outerRadius={isMobile ? 60 : 80} 
                cx="50%" 
                cy="50%"
              >
                {statusData.map((entry, idx) => (
                  <Cell key={`cell-${idx}`} fill={entry.color} />
                ))}
              </Pie>
              <ChartTooltip content={<ChartTooltipContent />} />
            </PieChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Top Amanah by Installations */}
      <Card className="border shadow-sm">
        <CardHeader><CardTitle className="text-lg md:text-xl">Top Amanah by Installations</CardTitle></CardHeader>
        <CardContent>
          <ChartContainer config={{}} className="aspect-auto w-full h-64 sm:h-72 md:h-80">
            <BarChart 
              data={byTeamData} 
              margin={{ 
                left: isMobile ? 10 : 20, 
                right: isMobile ? 5 : 12, 
                top: 10, 
                bottom: isMobile ? 80 : 60 
              }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: isMobile ? 8 : 10 }} 
                interval={0} 
                angle={isMobile ? -60 : -45} 
                textAnchor="end" 
                height={isMobile ? 100 : 80}
              />
              <YAxis 
                allowDecimals={false} 
                tick={{ fontSize: isMobile ? 8 : 10 }} 
                width={isMobile ? 30 : 40}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="value" fill="#2563EB" radius={[4,4,0,0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
