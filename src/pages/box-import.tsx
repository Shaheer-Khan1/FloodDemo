import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Loader2, Package, Users } from "lucide-react";
import { collection, doc, onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { Team, Device } from "@/lib/types";
import { useLocation } from "wouter";

interface BoxAssignment {
  key: string;
  label: string;
  deviceCount: number;
  value: string; // boxCode
}

export default function BoxImport() {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();

  const searchParams = useMemo(
    () => new URLSearchParams(location.split("?")[1] || ""),
    [location]
  );
  const initialTeamFromQuery = searchParams.get("teamId") || "";
  const initialAssignedBoxFromQuery = searchParams.get("box") || "";

  const [teams, setTeams] = useState<Team[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [selectedBoxCode, setSelectedBoxCode] = useState<string>("");
  const [boxIdentifier, setBoxIdentifier] = useState<string>("");
  const [selectedTeamId, setSelectedTeamId] = useState<string>(initialTeamFromQuery);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [selectedAssignedBox, setSelectedAssignedBox] = useState<string>(initialAssignedBoxFromQuery);
  const [assignCount, setAssignCount] = useState<number | "">("");

  // Only managers (and admins, if you want) can assign boxes
  const isManager =
    userProfile?.role === "manager" || userProfile?.isAdmin;

  useEffect(() => {
    if (!userProfile || !isManager) return;

    setLoading(true);

    const teamsUnsub = onSnapshot(collection(db, "teams"), (snapshot) => {
      const loadedTeams = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      })) as Team[];
      loadedTeams.sort((a, b) => a.name.localeCompare(b.name));
      setTeams(loadedTeams);
    });

    const devicesUnsub = onSnapshot(collection(db, "devices"), (snapshot) => {
      const loadedDevices = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      })) as Device[];
      setDevices(loadedDevices);
      setLoading(false);
    });

    return () => {
      teamsUnsub();
      devicesUnsub();
    };
  }, [userProfile, isManager]);

  const availableBoxCodes: BoxAssignment[] = useMemo(() => {
    const counts: Record<string, number> = {};

    for (const d of devices) {
      // New flow only: devices imported with ORIGINAL BOX CODE and not yet assigned to any team
      if (d.boxCode && !d.teamId) {
        counts[d.boxCode] = (counts[d.boxCode] || 0) + 1;
      }
    }

    return Object.entries(counts)
      .map(([boxCode, deviceCount]) => ({
        key: boxCode,
        label: boxCode,
        deviceCount,
        value: boxCode,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [devices]);

  const selectedBoxMeta = useMemo(
    () => availableBoxCodes.find((b) => b.key === selectedBoxCode) || null,
    [availableBoxCodes, selectedBoxCode]
  );

  const selectedBoxDevices = useMemo(() => {
    if (!selectedBoxMeta) return [];

    // Devices imported with this ORIGINAL BOX CODE that are not yet assigned to any team
    return devices.filter(
      (d) => d.boxCode === selectedBoxMeta.value && !d.teamId
    );
  }, [devices, selectedBoxMeta]);

  // Reset selected devices when box changes
  useEffect(() => {
    setSelectedDeviceIds([]);
  }, [selectedBoxCode]);

  // Keep selected assigned box in sync with selected team
  useEffect(() => {
    if (!selectedTeamId) {
      setSelectedAssignedBox("");
      return;
    }
    // If current selectedAssignedBox doesn't belong to this team anymore, clear it
    const stillValid = devices.some(
      (d) => d.teamId === selectedTeamId && d.boxNumber === selectedAssignedBox
    );
    if (!stillValid) {
      setSelectedAssignedBox("");
    }
  }, [selectedTeamId, selectedAssignedBox, devices]);

  // Boxes already assigned to teams (by final boxNumber).
  // If a team is selected, we only show that team's boxes; otherwise show all teams.
  const assignedBoxes = useMemo(
    () => {
      const counts: Record<string, { teamId: string; boxNumber: string; count: number }> = {};
      for (const d of devices) {
        if (!d.teamId || !d.boxNumber) continue;
        if (selectedTeamId && d.teamId !== selectedTeamId) continue;
        const key = `${d.teamId}__${d.boxNumber}`;
        if (!counts[key]) {
          counts[key] = { teamId: d.teamId, boxNumber: d.boxNumber, count: 0 };
        }
        counts[key].count += 1;
      }
      return Object.values(counts).sort((a, b) =>
        a.boxNumber.localeCompare(b.boxNumber)
      );
    },
    [devices, selectedTeamId]
  );
  const assignedBoxCount = assignedBoxes.length;

  const assignedDevicesForSelectedBox = useMemo(() => {
    if (!selectedTeamId || !selectedAssignedBox) return [];
    return devices.filter(
      (d) => d.teamId === selectedTeamId && d.boxNumber === selectedAssignedBox
    );
  }, [devices, selectedTeamId, selectedAssignedBox]);

  const handleAssign = async () => {
    if (!userProfile || !isManager) return;

    if (!selectedBoxCode) {
      toast({
        variant: "destructive",
        title: "Original Box Code Required",
        description: "Please select an original box code from the list.",
      });
      return;
    }

    if (!boxIdentifier.trim()) {
      toast({
        variant: "destructive",
        title: "Box Identifier Required",
        description: "Please enter the final box identifier for this box.",
      });
      return;
    }

    if (!selectedTeamId) {
      toast({
        variant: "destructive",
        title: "Team Required",
        description: "Please select the Amanah team for this box.",
      });
      return;
    }

    const selected = availableBoxCodes.find((b) => b.key === selectedBoxCode);
    if (!selected) {
      toast({
        variant: "destructive",
        title: "Invalid Selection",
        description: "The selected box could not be found. Please refresh and try again.",
      });
      return;
    }

    // Determine which devices from this box should be assigned:
    // - If the user selected specific devices, only update those.
    // - Else if a count is provided, assign that many devices from this box.
    // - Else assign all devices from this box (current behaviour).
    const devicesInBox = selectedBoxDevices;
    let toUpdate: Device[];
    if (selectedDeviceIds.length) {
      toUpdate = devicesInBox.filter((d) => selectedDeviceIds.includes(d.id));
    } else if (typeof assignCount === "number" && assignCount > 0) {
      toUpdate = devicesInBox.slice(0, Math.min(assignCount, devicesInBox.length));
    } else {
      toUpdate = devicesInBox;
    }

    if (toUpdate.length === 0) {
      toast({
        variant: "destructive",
        title: "No Devices Selected",
        description: "Please select at least one device from this box to assign.",
      });
      return;
    }

    setSaving(true);
    try {
      const finalBoxId = boxIdentifier.trim();

      const updates = toUpdate.map((d) =>
        updateDoc(doc(db, "devices", d.id), {
          boxNumber: finalBoxId,
          teamId: selectedTeamId,
          boxOpened: false,
          updatedAt: serverTimestamp(),
        })
      );

      await Promise.all(updates);

      toast({
        title: "Box Assigned",
        description: `Assigned original box code ${selected.value} to box ${finalBoxId} and selected team.`,
      });

      setBoxIdentifier("");
      setSelectedBoxCode("");
      setSelectedDeviceIds([]);
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Assignment Failed",
        description: error instanceof Error ? error.message : "Failed to assign box to team.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAssignment = async () => {
    if (!userProfile || !isManager) return;

    if (!selectedTeamId || !selectedAssignedBox) {
      toast({
        variant: "destructive",
        title: "Select a box first",
        description: "Choose a team box assignment to delete.",
      });
      return;
    }

    const devicesInAssignment = devices.filter(
      (d) => d.teamId === selectedTeamId && d.boxNumber === selectedAssignedBox
    );

    if (devicesInAssignment.length === 0) {
      toast({
        variant: "destructive",
        title: "No devices found",
        description: "This box assignment no longer has devices to remove.",
      });
      return;
    }

    const teamName =
      teams.find((t) => t.id === selectedTeamId)?.name || selectedTeamId;
    const confirmed = window.confirm(
      `Remove box ${selectedAssignedBox} from ${teamName}? All devices will return to the unassigned pool and installer assignments will be cleared.`
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      const updates = devicesInAssignment.map((d) =>
        updateDoc(doc(db, "devices", d.id), {
          teamId: null,
          boxNumber: null,
          boxOpened: null,
          assignedInstallerId: null,
          assignedInstallerName: null,
          updatedAt: serverTimestamp(),
        })
      );

      await Promise.all(updates);

      toast({
        title: "Box assignment removed",
        description: `Box ${selectedAssignedBox} is now unassigned and can be reassigned.`,
      });

      setSelectedAssignedBox("");
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Delete failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to delete this box assignment.",
      });
    } finally {
      setDeleting(false);
    }
  };

  if (!userProfile || !isManager) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">
              Only managers (or admins) can assign boxes to Amanah teams.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
          Assign Box
        </h1>
        <p className="text-muted-foreground mt-2">
          Use original box codes from the device import to assign final box identifiers and Amanah teams.
        </p>
      </div>

      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Assign Box by Original Code
          </CardTitle>
          <CardDescription>
            Select an original box code, review the devices inside it,
            then assign it to a final box identifier and Amanah team.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading box codes and teams...</span>
            </div>
          ) : availableBoxCodes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No unassigned original box codes found. Make sure devices were imported with ORIGINAL BOX CODE
              and not already assigned to a box/team.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  Box (original)
                </label>
                <select
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={selectedBoxCode}
                  onChange={(e) => setSelectedBoxCode(e.target.value)}
                  disabled={saving}
                >
                  <option value="">Select original box</option>
                  {availableBoxCodes.map((b) => (
                    <option key={b.key} value={b.key}>
                      {b.label} ({b.deviceCount} devices)
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  Box Identifier
                </label>
                <Input
                  type="text"
                  placeholder="Enter final box identifier (e.g., DMM-BOX-001)"
                  value={boxIdentifier}
                  onChange={(e) => setBoxIdentifier(e.target.value)}
                  disabled={saving}
                />
              </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                Number of Devices (optional)
              </label>
              <Input
                type="number"
                min={1}
                placeholder="Leave empty to assign all devices in this box"
                value={assignCount === "" ? "" : assignCount}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) {
                    setAssignCount("");
                  } else {
                    const num = Number(val);
                    setAssignCount(Number.isFinite(num) && num > 0 ? num : "");
                  }
                }}
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">
                If you do not manually select devices with the checkboxes, this count controls how many
                devices will be assigned from the original box to the selected team. Leave empty to assign all.
              </p>
            </div>

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Amanah Team
                </label>
                <select
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  disabled={saving}
                >
                  <option value="">Select team</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </div>

              <Button
                onClick={handleAssign}
                disabled={saving || availableBoxCodes.length === 0}
                className="w-full sm:w-auto"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Assigning...
                  </>
                ) : (
                  "Assign Box to Team"
                )}
              </Button>

              {/* Devices inside selected box */}
              {selectedBoxMeta && (
                <div className="mt-6 border-t pt-4 space-y-2">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    Devices in this box ({selectedBoxDevices.length})
                  </h3>
                  {selectedBoxDevices.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No unassigned devices found for this box. It may already be assigned to a team.
                    </p>
                  ) : (
                    <div className="max-h-64 overflow-y-auto rounded-md border text-xs font-mono bg-slate-50 dark:bg-slate-950/40">
                      <table className="w-full">
                        <thead className="bg-slate-100 dark:bg-slate-900">
                          <tr>
                            <th className="px-3 py-1 w-8">
                              <input
                                type="checkbox"
                                className="h-3 w-3"
                                aria-label="Select all devices in box"
                                checked={
                                  selectedBoxDevices.length > 0 &&
                                  selectedDeviceIds.length === selectedBoxDevices.length
                                }
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedDeviceIds(selectedBoxDevices.map((d) => d.id));
                                  } else {
                                    setSelectedDeviceIds([]);
                                  }
                                }}
                              />
                            </th>
                            <th className="text-left px-3 py-1">Device UID</th>
                            <th className="text-left px-3 py-1">Product</th>
                            <th className="text-left px-3 py-1">Orig. Box Code</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedBoxDevices.map((d) => (
                            <tr key={d.id} className="border-t">
                              <td className="px-3 py-1">
                                <input
                                  type="checkbox"
                                  className="h-3 w-3"
                                  checked={selectedDeviceIds.includes(d.id)}
                                  onChange={(e) => {
                                    setSelectedDeviceIds((prev) =>
                                      e.target.checked
                                        ? [...prev, d.id]
                                        : prev.filter((id) => id !== d.id)
                                    );
                                  }}
                                />
                              </td>
                              <td className="px-3 py-1">{d.id}</td>
                              <td className="px-3 py-1">{d.productId}</td>
                              <td className="px-3 py-1">{d.boxCode || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Once assigned, installers from the selected Amanah team will only be able to install
                    devices from their own boxes (after the verifier opens the box).
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assigned section for existing assignments (all teams or selected team) */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Existing Box Assignments
          </CardTitle>
          <CardDescription>
            View devices already assigned to teams. Select a box to see its devices.
            {selectedTeamId
              ? " (Filtered to the selected Amanah team.)"
              : " (Showing boxes for all teams.)"}
            <div className="mt-1 text-xs text-muted-foreground">
              {assignedBoxCount} box{assignedBoxCount === 1 ? "" : "es"} found
              {selectedTeamId
                ? ` for ${teams.find((t) => t.id === selectedTeamId)?.name || "selected team"}`
                : " across all teams"}
              .
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {assignedBoxes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No boxes have been assigned to any team yet.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {assignedBoxes.map((entry) => {
                  const teamName =
                    teams.find((t) => t.id === entry.teamId)?.name || entry.teamId;
                  const key = `${entry.teamId}__${entry.boxNumber}`;
                  const isActive =
                    selectedAssignedBox === entry.boxNumber &&
                    selectedTeamId === entry.teamId;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`px-3 py-1 rounded-full border text-xs font-mono ${
                        isActive
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-foreground border-muted hover:bg-muted"
                      }`}
                      onClick={() => {
                        setSelectedTeamId(entry.teamId);
                        setSelectedAssignedBox(entry.boxNumber);
                      }}
                    >
                      {teamName}: {entry.boxNumber} · {entry.count}
                    </button>
                  );
                })}
              </div>

              {selectedTeamId && selectedAssignedBox && (
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold">
                      Devices in box {selectedAssignedBox} for{" "}
                      {teams.find((t) => t.id === selectedTeamId)?.name ||
                        selectedTeamId}{" "}
                      ({assignedDevicesForSelectedBox.length})
                    </h3>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDeleteAssignment}
                      disabled={deleting}
                    >
                      {deleting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        "Delete assignment"
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Deletes this box/team mapping and returns its devices to the unassigned pool.
                  </p>
                  {assignedDevicesForSelectedBox.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No devices currently assigned to this box for the selected team.
                    </p>
                  ) : (
                    <div className="max-h-64 overflow-y-auto rounded-md border text-xs font-mono bg-slate-50 dark:bg-slate-950/40">
                      <table className="w-full">
                        <thead className="bg-slate-100 dark:bg-slate-900">
                          <tr>
                            <th className="text-left px-3 py-1">Device UID</th>
                            <th className="text-left px-3 py-1">Product</th>
                            <th className="text-left px-3 py-1">Orig. Box Code</th>
                          </tr>
                        </thead>
                        <tbody>
                          {assignedDevicesForSelectedBox.map((d) => (
                            <tr key={d.id} className="border-t">
                              <td className="px-3 py-1">{d.id}</td>
                              <td className="px-3 py-1">{d.productId}</td>
                              <td className="px-3 py-1">{d.boxCode || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
