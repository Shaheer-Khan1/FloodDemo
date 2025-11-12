import React, { useState, useEffect, useMemo } from "react";
import { collection, query, where, onSnapshot, orderBy, getDocs, getDoc, updateDoc, doc, increment, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Loader2, 
  Plus, 
  Clock, 
  CheckCircle, 
  AlertTriangle,
  MapPin,
  Gauge,
  Image as ImageIcon,
  Calendar,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Installation } from "@/lib/types";
import { format } from "date-fns";

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

export default function MySubmissions() {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [submissions, setSubmissions] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState<Installation | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Best-effort polling while installer keeps the app open:
  // For submissions with missing latestDisCm, periodically try to fetch and fill.
  useEffect(() => {
    let cancelled = false;

    const fetchForDue = async () => {
      try {
        const q = query(
          collection(db, "installations"),
          where("installedBy", "==", userProfile?.uid || ""),
          where("latestDisCm", "==", null)
        );
        const snap = await getDocs(q);
        await Promise.all(snap.docs.map(async d => {
          if (cancelled) return;
          const fresh = await getDoc(d.ref);
          if (!fresh.exists() || fresh.data().latestDisCm !== null) return;
          const deviceId: string = fresh.data().deviceId;
          try {
            const res = await fetch(`https://op1.smarttive.com/device/${deviceId.toUpperCase()}`, {
              headers: { "X-API-KEY": import.meta.env.VITE_API_KEY ?? "" }
            });
            if (!res.ok) throw new Error(`API ${res.status}`);
            const data = await res.json();
            const latestRecord = data?.records?.[0];
            const latest = latestRecord?.dis_cm ?? null;
            // Treat null or zero as "no server data yet"; skip variance/flagging until real data exists
            const hasServerData = latest !== null && Number(latest) > 0;
            if (hasServerData) {
              const sensor: number | undefined = fresh.data().sensorReading;
              const variancePct = sensor ? (Math.abs(latest - sensor) / sensor) * 100 : undefined;
              const preVerified = variancePct !== undefined && variancePct < 5;
              if (variancePct !== undefined && variancePct > 10) {
                await updateDoc(d.ref, {
                  latestDisCm: latest,
                  latestDisTimestamp: latestRecord?.timestamp ?? null,
                  status: "flagged",
                  flaggedReason: `Auto-rejected: variance ${variancePct.toFixed(2)}% > 10%`,
                  verifiedBy: "System (Auto-rejected)",
                  verifiedAt: serverTimestamp(),
                  systemPreVerified: false,
                  systemPreVerifiedAt: null,
                  updatedAt: serverTimestamp(),
                });
              } else {
                await updateDoc(d.ref, {
                  latestDisCm: latest,
                  latestDisTimestamp: latestRecord?.timestamp ?? null,
                  systemPreVerified: preVerified,
                  systemPreVerifiedAt: preVerified ? serverTimestamp() : null,
                  updatedAt: serverTimestamp(),
                });
              }
            }
          } catch (e) {
            // Ignore; verifier can fetch later
          }
        }));
      } catch {}
    };

    // Kick immediately, then every 2 minutes while open and visible
    fetchForDue();
    const id = setInterval(() => {
      if (!document.hidden) fetchForDue();
    }, 2 * 60 * 1000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) fetchForDue();
    });
    return () => { cancelled = true; clearInterval(id); };
  }, [userProfile?.uid]);

  // Real-time submissions listener
  useEffect(() => {
    if (!userProfile?.uid) return;

    const submissionsQuery = query(
      collection(db, "installations"),
      where("installedBy", "==", userProfile.uid)
    );

    const unsubscribe = onSnapshot(
      submissionsQuery,
      (snapshot) => {
        const submissionsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate(),
          updatedAt: doc.data().updatedAt?.toDate(),
          verifiedAt: doc.data().verifiedAt?.toDate(),
        })) as Installation[];
        
        // Sort in JavaScript instead of Firestore to avoid index requirement
        submissionsData.sort((a, b) => {
          if (!a.createdAt || !b.createdAt) return 0;
          return b.createdAt.getTime() - a.createdAt.getTime();
        });
        
        setSubmissions(submissionsData);
        setLoading(false);
      },
      (error) => {
        toast({
          variant: "destructive",
          title: "Failed to load submissions",
          description: error.message,
        });
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userProfile, toast]);

  // Stats
  const stats = useMemo(() => {
    return {
      total: submissions.length,
      pending: submissions.filter(s => s.status === "pending").length,
      verified: submissions.filter(s => s.status === "verified").length,
      flagged: submissions.filter(s => s.status === "flagged").length,
    };
  }, [submissions]);

  const viewDetails = (submission: Installation) => {
    setSelectedSubmission(submission);
    setDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
            My Submissions
          </h1>
          <p className="text-muted-foreground mt-2">Track your installation submissions</p>
        </div>
        <Button onClick={() => setLocation("/new-installation")}>
          <Plus className="h-4 w-4 mr-2" />
          New Installation
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground font-medium">Total Submissions</p>
              <p className="text-3xl font-bold mt-1">{stats.total}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground font-medium">Pending</p>
              <p className="text-3xl font-bold mt-1 text-yellow-600">{stats.pending}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground font-medium">Verified</p>
              <p className="text-3xl font-bold mt-1 text-green-600">{stats.verified}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground font-medium">Flagged</p>
              <p className="text-3xl font-bold mt-1 text-red-600">{stats.flagged}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Submissions Table */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">All Submissions ({submissions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {submissions.length === 0 ? (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
                <Clock className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No Submissions Yet</h3>
              <p className="text-muted-foreground mb-4">
                You haven't submitted any installations yet.
              </p>
              <Button onClick={() => setLocation("/new-installation")}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Installation
              </Button>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device ID</TableHead>
                    <TableHead>Location ID</TableHead>
                    <TableHead>Sensor Reading</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissions.map((submission) => {
                    const config = statusConfig[submission.status];
                    const Icon = config.icon;
                    
                    return (
                      <TableRow key={submission.id}>
                        <TableCell className="font-mono font-medium">
                          {submission.deviceId}
                        </TableCell>
                        <TableCell>{submission.locationId}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Gauge className="h-3 w-3 text-muted-foreground" />
                            {submission.sensorReading}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className={config.color}>
                              <Icon className="h-3 w-3 mr-1" />
                              {config.label}
                            </Badge>
                            {submission.tags?.includes("edited by verifier") && (
                              <Badge variant="secondary" className="text-[10px] w-fit mt-1">
                                Edited by Verifier
                              </Badge>
                            )}
                            {submission.status === "pending" && submission.systemPreVerified && (
                              <div className="text-[10px] text-green-600 mt-1 font-medium">Pre-verified by system</div>
                            )}
                            {submission.status === "pending" && !submission.systemPreVerified && submission.latestDisCm != null && (
                              <div className="text-[10px] text-yellow-600 mt-1 font-medium">Needs manual review</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {submission.createdAt 
                            ? format(submission.createdAt, "MMM d, yyyy HH:mm")
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => viewDetails(submission)}
                          >
                            View Details
                          </Button>
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

      {/* Details Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Installation Details</DialogTitle>
          </DialogHeader>
          {selectedSubmission && (
            <div className="space-y-6">
              {/* Status */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-sm text-muted-foreground">Status</p>
                  {selectedSubmission.tags?.includes("edited by verifier") && (
                    <Badge variant="secondary" className="text-xs">
                      Edited by Verifier
                    </Badge>
                  )}
                </div>
                <Badge 
                  variant="outline" 
                  className={`${statusConfig[selectedSubmission.status].color} text-base py-2 px-4`}
                >
                  {React.createElement(statusConfig[selectedSubmission.status].icon, { className: "h-4 w-4 mr-2" })}
                  {statusConfig[selectedSubmission.status].label}
                </Badge>
                {selectedSubmission.status === "flagged" && selectedSubmission.flaggedReason && (
                  <div className="mt-3 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md">
                    <p className="text-sm font-medium text-red-900 dark:text-red-100">Reason for Flag:</p>
                    <p className="text-sm text-red-800 dark:text-red-200 mt-1">
                      {selectedSubmission.flaggedReason}
                    </p>
                  </div>
                )}
              </div>

              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Device ID</p>
                  <p className="text-base font-mono font-medium">{selectedSubmission.deviceId}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Location ID</p>
                  <p className="text-base font-medium flex items-center gap-1">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    {selectedSubmission.locationId}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Sensor Reading</p>
                  <p className="text-base font-medium flex items-center gap-1">
                    <Gauge className="h-4 w-4 text-muted-foreground" />
                    {selectedSubmission.sensorReading}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Submitted On</p>
                  <p className="text-base font-medium flex items-center gap-1">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    {selectedSubmission.createdAt 
                      ? format(selectedSubmission.createdAt, "MMM d, yyyy HH:mm")
                      : "-"}
                  </p>
                </div>
              </div>

              {/* Images */}
              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium">Installation Photos ({selectedSubmission.imageUrls?.length || 0})</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {selectedSubmission.imageUrls?.map((url, index) => (
                      <img
                        key={index}
                        src={url}
                        alt={`Installation photo ${index + 1}`}
                        className="w-full h-48 object-cover rounded-lg border"
                      />
                    ))}
                  </div>
                </div>
                
                {selectedSubmission.videoUrl && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm font-medium">360° Video</p>
                    </div>
                    <video
                      src={selectedSubmission.videoUrl}
                      controls
                      className="w-full h-64 object-cover rounded-lg border"
                    />
                  </div>
                )}
              </div>

              {/* Verification Info */}
              {selectedSubmission.status === "verified" && (
                <div className="p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <p className="text-sm font-medium text-green-900 dark:text-green-100">
                    Verified on {selectedSubmission.verifiedAt 
                      ? format(selectedSubmission.verifiedAt, "MMM d, yyyy HH:mm")
                      : "N/A"}
                  </p>
                  {selectedSubmission.verifiedBy && (
                    <p className="text-xs text-green-800 dark:text-green-200 mt-1">
                      Verified by: {selectedSubmission.verifiedBy}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

