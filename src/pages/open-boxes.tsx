import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Loader2, Package } from "lucide-react";
import { collection, doc, getDocs, updateDoc, serverTimestamp, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Device, CustomTeamMember } from "@/lib/types";

export default function OpenBoxes() {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [devices, setDevices] = useState<Device[]>([]);
  const [installers, setInstallers] = useState<CustomTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [boxToOpen, setBoxToOpen] = useState<string>("");
  const [opening, setOpening] = useState(false);
  const [selectedBoxForAssignment, setSelectedBoxForAssignment] = useState<string>("");
  const [assignmentByDevice, setAssignmentByDevice] = useState<Record<string, string | "">>({});
  const [savingAssignments, setSavingAssignments] = useState(false);

  if (!userProfile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (userProfile.role !== "verifier") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-width-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Access Restricted</h2>
            <p className="text-muted-foreground">
              Only verifier accounts can open boxes for installation.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Load devices for this verifier's team and installers in the team
  useEffect(() => {
    if (!userProfile?.teamId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const devicesQuery = query(
      collection(db, "devices"),
      where("teamId", "==", userProfile.teamId)
    );

    const unsubscribeDevices = onSnapshot(
      devicesQuery,
      (snapshot) => {
        const loaded = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as Device[];
        setDevices(loaded);
        setLoading(false);
      },
      (error) => {
        console.error("Failed to load team devices:", error);
        setLoading(false);
      }
    );

    const unsubscribeInstallers = onSnapshot(
      collection(db, "teams", userProfile.teamId, "members"),
      (snapshot) => {
        const members = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as CustomTeamMember[];
        setInstallers(members.filter((m) => m.role === "installer"));
      },
      (error) => {
        console.error("Failed to load installers:", error);
      }
    );

    return () => {
      unsubscribeDevices();
      unsubscribeInstallers();
    };
  }, [userProfile]);

  const groupedBoxes = useMemo(() => {
    const opened: Record<string, number> = {};
    const notOpened: Record<string, number> = {};

    devices.forEach((d) => {
      const box = d.boxNumber || "(no box id)";
      if (d.boxOpened) {
        opened[box] = (opened[box] || 0) + 1;
      } else {
        notOpened[box] = (notOpened[box] || 0) + 1;
      }
    });

    return {
      opened: Object.entries(opened).map(([boxNumber, count]) => ({ boxNumber, count })),
      notOpened: Object.entries(notOpened).map(([boxNumber, count]) => ({ boxNumber, count })),
    };
  }, [devices]);

  const devicesInSelectedAssignmentBox = useMemo(
    () =>
      selectedBoxForAssignment
        ? devices.filter((d) => d.boxNumber === selectedBoxForAssignment)
        : [],
    [devices, selectedBoxForAssignment]
  );

  const allBoxIds = useMemo(() => {
    const set = new Set<string>();
    devices.forEach((d) => {
      if (d.boxNumber) set.add(d.boxNumber);
    });
    return Array.from(set).sort();
  }, [devices]);

  const handleOpenBox = async (boxIdFromRow?: string) => {
    if (!userProfile.teamId) {
      toast({
        variant: "destructive",
        title: "No Team Assigned",
        description: "Your account must be linked to a team before you can open boxes.",
      });
      return;
    }

    const trimmed = (boxIdFromRow ?? boxToOpen).trim();
    if (!trimmed) {
      toast({
        variant: "destructive",
        title: "Box Identifier Required",
        description: "Please enter the box identifier you are opening.",
      });
      return;
    }

    setOpening(true);
    try {
      const matching = devices.filter(
        (d) =>
          d.boxNumber?.toString().trim() === trimmed &&
          d.boxOpened !== true &&
          d.teamId === userProfile.teamId
      );

      if (matching.length === 0) {
        toast({
          variant: "destructive",
          title: "No Devices Found",
          description: "No devices for this box identifier in your team, or it is already opened.",
        });
        return;
      }

      for (const docSnap of matching) {
        await updateDoc(doc(db, "devices", docSnap.id), {
          boxOpened: true,
          updatedAt: serverTimestamp(),
        });
      }

      toast({
        title: "Box Opened",
        description: `Box ${trimmed} has been marked as opened. Installers in your team can now install devices from this box.`,
      });
      setBoxToOpen("");
    } catch (error) {
      console.error("Failed to open box:", error);
      toast({
        variant: "destructive",
        title: "Failed to Open Box",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
          Open Boxes
        </h1>
        <p className="text-muted-foreground mt-2">
          Verify and open assigned boxes so that installers in your team can start installing devices.
        </p>
      </div>

      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Mark Box as Open
          </CardTitle>
          <CardDescription>
            Enter the final <strong>Box Identifier</strong> that was assigned by the manager to your team.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="box-id">Box Identifier</Label>
            <Input
              id="box-id"
              placeholder="e.g., DMM-BOX-001"
              value={boxToOpen}
              onChange={(e) => setBoxToOpen(e.target.value)}
              disabled={opening}
            />
          </div>
          <Button onClick={handleOpenBox} disabled={opening} className="w-full sm:w-auto">
            {opening ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Opening Box...
              </>
            ) : (
              "Open Box for Installation"
            )}
          </Button>
          <p className="text-xs text-muted-foreground">
            This action will mark all devices in the selected box (for your team) as <strong>opened</strong>,
            allowing installers to proceed with installations.
          </p>
        </CardContent>
      </Card>

      {/* Boxes overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Not opened boxes */}
        <Card className="border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Boxes Not Opened</CardTitle>
            <CardDescription>
              Boxes assigned to your team that are still sealed. Open them before installers can proceed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading boxes...</span>
              </div>
            ) : groupedBoxes.notOpened.length === 0 ? (
              <p className="text-sm text-muted-foreground">No unopened boxes for your team.</p>
            ) : (
              <div className="space-y-1 text-xs font-mono">
                {groupedBoxes.notOpened.map((box) => (
                  <div
                    key={box.boxNumber}
                    className="flex items-center justify-between rounded border px-3 py-2 bg-slate-50 dark:bg-slate-950/30"
                  >
                    <div>
                      <div className="font-semibold">{box.boxNumber}</div>
                      <div className="text-muted-foreground">{box.count} devices</div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={opening}
                      onClick={() => handleOpenBox(box.boxNumber)}
                    >
                      Open Box
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Opened boxes */}
        <Card className="border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Opened Boxes</CardTitle>
            <CardDescription>
              Boxes already marked as opened. Installers can install devices from these boxes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading boxes...</span>
              </div>
            ) : groupedBoxes.opened.length === 0 ? (
              <p className="text-sm text-muted-foreground">No opened boxes for your team yet.</p>
            ) : (
              <div className="space-y-1 text-xs font-mono">
                {groupedBoxes.opened.map((box) => (
                  <div
                    key={box.boxNumber}
                    className="flex items-center justify-between rounded border px-3 py-2 bg-slate-50 dark:bg-slate-950/30"
                  >
                    <div>
                      <div className="font-semibold">{box.boxNumber}</div>
                      <div className="text-muted-foreground">{box.count} devices</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Assign devices in a box to installers */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Assign Devices to Installers</CardTitle>
          <CardDescription>
            Choose a box and assign each device in that box to an installer from your team. This is for planning;
            installers will still perform the actual installation in the mobile app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="assignment-box">Select Box</Label>
            <select
              id="assignment-box"
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={selectedBoxForAssignment}
              onChange={(e) => {
                setSelectedBoxForAssignment(e.target.value);
                setAssignmentByDevice({});
              }}
              disabled={allBoxIds.length === 0}
            >
              <option value="">Select a box</option>
              {allBoxIds.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {selectedBoxForAssignment && (
            <>
              {devicesInSelectedAssignmentBox.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No devices found in this box for your team.
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="max-h-72 overflow-y-auto rounded-md border bg-slate-50 dark:bg-slate-950/40">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 dark:bg-slate-900">
                        <tr>
                          <th class-name="text-left px-3 py-2">Device UID</th>
                          <th class-name="text-left px-3 py-2">Opened?</th>
                          <th class-name="text-left px-3 py-2">Assigned Installer</th>
                        </tr>
                      </thead>
                      <tbody>
                        {devicesInSelectedAssignmentBox.map((d) => {
                          const currentId =
                            assignmentByDevice[d.id] ?? d.assignedInstallerId ?? "";
                          const currentInstaller =
                            installers.find(
                              (i) =>
                                i.id === currentId ||
                                (i as any).userId === currentId
                            ) || null;
                          return (
                            <tr key={d.id} className="border-t">
                              <td className="px-3 py-2 font-mono">{d.id}</td>
                              <td className="px-3 py-2">
                                {d.boxOpened ? (
                                  <span className="text-green-600">Yes</span>
                                ) : (
                                  <span className="text-yellow-700">No</span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <select
                                  className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
                                  value={currentId}
                                  onChange={(e) =>
                                    setAssignmentByDevice((prev) => ({
                                      ...prev,
                                      [d.id]: e.target.value,
                                    }))
                                  }
                                >
                                  <option value="">Unassigned</option>
                                  {installers.map((inst) => (
                                    <option key={inst.id} value={(inst as any).userId || inst.id}>
                                      {inst.displayName || inst.name || inst.email}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <Button
                    size="sm"
                    onClick={async () => {
                      if (!userProfile?.teamId) return;
                      setSavingAssignments(true);
                      try {
                        const updates: Promise<void>[] = [];
                        devicesInSelectedAssignmentBox.forEach((d) => {
                          const newInstallerId =
                            assignmentByDevice[d.id] ?? d.assignedInstallerId ?? "";
                          const normalizedNew = newInstallerId || undefined;
                          const original = d.assignedInstallerId;
                          if (normalizedNew === original) return;

                          const installer =
                            installers.find(
                              (i) =>
                                i.id === newInstallerId ||
                                (i as any).userId === newInstallerId
                            ) || null;
                          updates.push(
                            updateDoc(doc(db, "devices", d.id), {
                              assignedInstallerId: normalizedNew || null,
                              assignedInstallerName: installer
                                ? installer.displayName || installer.name || installer.email
                                : null,
                              updatedAt: serverTimestamp(),
                            })
                          );
                        });

                        await Promise.all(updates);
                        toast({
                          title: "Assignments updated",
                          description: "Installer assignments for this box have been saved.",
                        });
                        setAssignmentByDevice({});
                      } catch (error) {
                        console.error("Failed to save assignments:", error);
                        toast({
                          variant: "destructive",
                          title: "Failed to save assignments",
                          description:
                            error instanceof Error
                              ? error.message
                              : "An error occurred while saving assignments.",
                        });
                      } finally {
                        setSavingAssignments(false);
                      }
                    }}
                    disabled={savingAssignments || devicesInSelectedAssignmentBox.length === 0}
                  >
                    {savingAssignments ? "Saving..." : "Save Assignments"}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Installers list */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Installers in Your Team</CardTitle>
          <CardDescription>
            These users can install devices once you open the corresponding boxes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {installers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No installers found in your team yet. Ask your manager/admin to add installer accounts.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              {installers.map((inst) => (
                <div
                  key={inst.id}
                  className="rounded border px-3 py-2 bg-slate-50 dark:bg-slate-950/30"
                >
                  <div className="font-medium">
                    {inst.displayName || inst.name || inst.email}
                  </div>
                  <div className="text-xs text-muted-foreground">{inst.email}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


