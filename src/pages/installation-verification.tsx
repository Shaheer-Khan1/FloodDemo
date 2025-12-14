import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, Clock, AlertTriangle, RefreshCw } from "lucide-react";
import { collection, query, where, onSnapshot, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Installation } from "@/lib/types";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";

export default function InstallationVerification() {
  const { userProfile } = useAuth();
  const [, setLocation] = useLocation();
  const [pendingInstallation, setPendingInstallation] = useState<Installation | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date>(new Date());

  // Find pending installation for this installer
  useEffect(() => {
    if (!userProfile?.uid || userProfile?.role !== "installer") {
      return;
    }

    const installationsQuery = query(
      collection(db, "installations"),
      where("installedBy", "==", userProfile.uid),
      where("status", "==", "pending")
    );

    const unsubscribe = onSnapshot(installationsQuery, async (snapshot) => {
      if (snapshot.empty) {
        // No pending installations, redirect to my-submissions
        setPendingInstallation(null);
        setLoading(false);
        return;
      }

      // Find the most recent pending installation that is not system pre-verified
      const pending: Installation[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data() as Installation;
        // Check if it's truly pending (not system pre-verified and not manually verified)
        if (data.status === "pending" && !data.systemPreVerified) {
          pending.push({
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate?.() || data.createdAt,
            updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
            verifiedAt: data.verifiedAt?.toDate?.() || data.verifiedAt,
            systemPreVerifiedAt: data.systemPreVerifiedAt?.toDate?.() || data.systemPreVerifiedAt,
          } as Installation);
        }
      });

      // Sort by creation date, most recent first
      pending.sort((a, b) => {
        const aTime = a.createdAt?.getTime() || 0;
        const bTime = b.createdAt?.getTime() || 0;
        return bTime - aTime;
      });

      if (pending.length > 0) {
        setPendingInstallation(pending[0]);
      } else {
        // All pending installations have been system pre-verified or verified
        // Check if any are now verified or flagged
        const allPendingDocs = snapshot.docs;
        for (const docSnapshot of allPendingDocs) {
          const data = docSnapshot.data();
          if (data.status === "verified" || data.status === "flagged" || data.systemPreVerified === true) {
            // Installation has been processed, redirect to submissions
            setPendingInstallation(null);
            setLoading(false);
            return;
          }
        }
      }

      setLoading(false);
      setLastChecked(new Date());
    }, (error) => {
      console.error("Error fetching pending installation:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userProfile?.uid, userProfile?.role]);

  // Auto-redirect when installation is verified
  useEffect(() => {
    if (!pendingInstallation) {
      // Check if we should redirect (no pending means it was verified or user has none)
      if (!loading) {
        // Give a brief moment to show success, then redirect
        const timer = setTimeout(() => {
          setLocation("/my-submissions");
        }, 2000);
        return () => clearTimeout(timer);
      }
      return;
    }

    // Check if installation is now verified or system pre-verified
    const checkInstallation = async () => {
      if (!pendingInstallation?.id) return;

      try {
        const docRef = doc(db, "installations", pendingInstallation.id);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data() as Installation;
          if (data.status === "verified" || data.status === "flagged" || data.systemPreVerified === true) {
            // Installation has been verified, redirect to submissions
            setTimeout(() => {
              setLocation("/my-submissions");
            }, 2000);
          }
        }
      } catch (error) {
        console.error("Error checking installation status:", error);
      }
    };

    // Check every 5 seconds
    const interval = setInterval(checkInstallation, 5000);
    return () => clearInterval(interval);
  }, [pendingInstallation, loading, setLocation]);

  // Redirect non-installers
  useEffect(() => {
    if (userProfile && userProfile.role !== "installer") {
      setLocation("/dashboard");
    }
  }, [userProfile, setLocation]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If no pending installation, show success message briefly
  if (!pendingInstallation) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <CheckCircle2 className="h-16 w-16 mx-auto text-green-600" />
            <h2 className="text-2xl font-bold">Installation Verified!</h2>
            <p className="text-muted-foreground">
              Your installation has been verified. Redirecting to your submissions...
            </p>
            <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const isSystemPreVerified = pendingInstallation.systemPreVerified === true;
  const isVerified = pendingInstallation.status === "verified";
  const isFlagged = pendingInstallation.status === "flagged";

  return (
    <div className="flex items-center justify-center min-h-[80vh] p-4">
      <Card className="max-w-2xl w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {isVerified || isSystemPreVerified ? (
              <CheckCircle2 className="h-16 w-16 text-green-600 animate-pulse" />
            ) : isFlagged ? (
              <XCircle className="h-16 w-16 text-red-600" />
            ) : (
              <Loader2 className="h-16 w-16 text-blue-600 animate-spin" />
            )}
          </div>
          <CardTitle className="text-3xl">
            {isVerified || isSystemPreVerified
              ? "Installation Verified!"
              : isFlagged
              ? "Installation Requires Review"
              : "Waiting for Verification"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Status Badge */}
          <div className="flex justify-center">
            {isVerified || isSystemPreVerified ? (
              <Badge className="bg-green-600 text-white px-4 py-2 text-base">
                {isSystemPreVerified ? "System Approved" : "Manually Verified"}
              </Badge>
            ) : isFlagged ? (
              <Badge variant="destructive" className="px-4 py-2 text-base">
                Flagged for Review
              </Badge>
            ) : (
              <Badge variant="secondary" className="px-4 py-2 text-base">
                Pending Verification
              </Badge>
            )}
          </div>

          {/* Installation Details */}
          <div className="bg-muted rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Device ID</p>
                <p className="font-mono font-semibold">{pendingInstallation.deviceId}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Location ID</p>
                <p className="font-semibold">{pendingInstallation.locationId || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Sensor Reading</p>
                <p className="font-semibold">{pendingInstallation.sensorReading} cm</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Submitted</p>
                <p className="font-semibold">
                  {pendingInstallation.createdAt
                    ? format(pendingInstallation.createdAt, "MMM d, yyyy HH:mm")
                    : "-"}
                </p>
              </div>
            </div>

            {pendingInstallation.flaggedReason && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-sm text-muted-foreground mb-1">Flag Reason</p>
                <p className="text-sm font-medium text-red-600">{pendingInstallation.flaggedReason}</p>
              </div>
            )}

            {isSystemPreVerified && pendingInstallation.systemPreVerifiedAt && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-sm text-muted-foreground mb-1">System Approved At</p>
                <p className="text-sm font-medium text-green-600">
                  {format(pendingInstallation.systemPreVerifiedAt, "MMM d, yyyy HH:mm:ss")}
                </p>
              </div>
            )}
          </div>

          {/* Status Message */}
          <div className="text-center space-y-2">
            {isVerified || isSystemPreVerified ? (
              <p className="text-muted-foreground">
                Your installation has been successfully verified. You can now proceed with new installations.
              </p>
            ) : isFlagged ? (
              <div className="space-y-2">
                <p className="text-muted-foreground">
                  Your installation has been flagged and requires manual review by a verifier.
                </p>
                <p className="text-sm text-muted-foreground">
                  Please wait for a verifier to review your submission. You will be notified once it's processed.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-muted-foreground">
                  Your installation is being verified. This page will automatically update when verification is complete.
                </p>
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Last checked: {format(lastChecked, "HH:mm:ss")}</span>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-center gap-4 pt-4">
            {(isVerified || isSystemPreVerified || isFlagged) && (
              <Button
                onClick={() => setLocation("/my-submissions")}
                className="min-w-[150px]"
              >
                View My Submissions
              </Button>
            )}
            {!(isVerified || isSystemPreVerified) && (
              <Button
                variant="outline"
                onClick={() => setLocation("/my-submissions")}
                className="min-w-[150px]"
              >
                View My Submissions
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}















