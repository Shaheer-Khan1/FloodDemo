import { useState, useEffect, useMemo, useCallback } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Clock, Eye, Filter, X } from "lucide-react";
import type { Installation } from "@/lib/types";
import { format } from "date-fns";
import { useLocation } from "wouter";

// Custom debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default function ReviewAudit() {
  const { userProfile } = useAuth();
  const [, setLocation] = useLocation();
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInstallation, setSelectedInstallation] = useState<Installation | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deviceIdFilter, setDeviceIdFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "partial" | "complete">("all");
  const [displayLimit, setDisplayLimit] = useState(500); // Show 500 reviews per page
  
  // Debounce the device ID filter to prevent sluggish filtering
  const debouncedDeviceIdFilter = useDebounce(deviceIdFilter, 300);

  // Redirect non-admins
  useEffect(() => {
    if (userProfile && !userProfile.isAdmin) {
      setLocation("/dashboard");
    }
  }, [userProfile, setLocation]);

  // Load all installations
  useEffect(() => {
    if (!userProfile?.isAdmin) return;

    const unsubscribe = onSnapshot(
      collection(db, "installations"),
      (snapshot) => {
        const installationsData = snapshot.docs.map((doc) => {
          const data = doc.data();
          
          const convertToDate = (value: any): Date | null => {
            if (!value) return null;
            if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
            if (typeof value.toDate === 'function') {
              try {
                const date = value.toDate();
                return isNaN(date.getTime()) ? null : date;
              } catch {
                return null;
              }
            }
            if (typeof value === 'string' || typeof value === 'number') {
              try {
                const date = new Date(value);
                return isNaN(date.getTime()) ? null : date;
              } catch {
                return null;
              }
            }
            return null;
          };

          // Convert fieldCheckMetadata dates
          const metadata = data.fieldCheckMetadata || {};
          const convertedMetadata: Record<string, any> = {};
          Object.keys(metadata).forEach(key => {
            convertedMetadata[key] = {
              ...metadata[key],
              checkedAt: convertToDate(metadata[key]?.checkedAt),
            };
          });
          
          return {
            id: doc.id,
            ...data,
            createdAt: convertToDate(data.createdAt),
            updatedAt: convertToDate(data.updatedAt),
            verifiedAt: convertToDate(data.verifiedAt),
            fieldCheckMetadata: convertedMetadata,
          } as Installation;
        });
        
        setInstallations(installationsData);
        setLoading(false);
      },
      (error) => {
        console.error("Failed to load installations:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userProfile]);

  // Calculate review progress for each installation
  const installationsWithProgress = useMemo(() => {
    return installations.map(installation => {
      const fieldCheckStates = installation.fieldCheckStates || {};
      const fieldCheckMetadata = installation.fieldCheckMetadata || {};
      
      // Only count fields that actually have checkboxes in the verification screen
      const requiredFields = [
        "installer_deviceId",
        "installer_locationId",
        "installer_sensorReading",
        "installer_coordinates",
      ];

      // Add server sensor data field if available
      if (installation.latestDisCm != null) {
        requiredFields.push("server_sensorData");
      }

      // Add image fields (all images must be checked for approval)
      (installation.imageUrls || []).forEach((_, index) => {
        requiredFields.push(`image_${index}`);
      });

      const totalFields = requiredFields.length;
      const checkedFields = requiredFields.filter(field => fieldCheckStates[field]).length;
      const progressPercentage = totalFields > 0 ? (checkedFields / totalFields) * 100 : 0;

      // Get the reviewer name from fieldCheckMetadata
      let reviewedBy = null;
      let reviewedByUid = null;
      if (fieldCheckMetadata && Object.keys(fieldCheckMetadata).length > 0) {
        // Get the first metadata entry (all should have the same reviewer)
        const firstKey = Object.keys(fieldCheckMetadata)[0];
        const metadata = fieldCheckMetadata[firstKey];
        if (metadata) {
          reviewedBy = metadata.checkedByName || null;
          reviewedByUid = metadata.checkedBy || null;
        }
      } else if (checkedFields > 0) {
        // Fallback: If there are checked fields but no metadata (old data), show "In Review"
        reviewedBy = "In Review";
        reviewedByUid = null;
      }

      return {
        ...installation,
        totalFields,
        checkedFields,
        progressPercentage,
        reviewStatus: checkedFields === 0 ? "not-started" : checkedFields === totalFields ? "complete" : "partial",
        reviewedBy,
        reviewedByUid,
      };
    });
  }, [installations]);

  // Filter installations (using debounced filter for smooth performance)
  const filteredInstallations = useMemo(() => {
    let filtered = installationsWithProgress;

    if (debouncedDeviceIdFilter) {
      filtered = filtered.filter(inst =>
        inst.deviceId?.toUpperCase().includes(debouncedDeviceIdFilter.toUpperCase())
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter(inst => {
        if (statusFilter === "partial") {
          return inst.reviewStatus === "partial";
        } else if (statusFilter === "complete") {
          return inst.reviewStatus === "complete";
        }
        return true;
      });
    }

    // Sort by most recent first
    return filtered.sort((a, b) => {
      const aTime = a.updatedAt?.getTime() || 0;
      const bTime = b.updatedAt?.getTime() || 0;
      return bTime - aTime;
    });
  }, [installationsWithProgress, debouncedDeviceIdFilter, statusFilter]);
  
  // Paginate installations for performance
  const paginatedInstallations = useMemo(() => {
    return filteredInstallations.slice(0, displayLimit);
  }, [filteredInstallations, displayLimit]);
  
  // Reset display limit when filters change
  useEffect(() => {
    setDisplayLimit(500); // Reset to initial limit
  }, [debouncedDeviceIdFilter, statusFilter]);
  
  // Handle "Show More" button
  const handleShowMore = useCallback(() => {
    setDisplayLimit(prev => prev + 500); // Load 500 more at a time
  }, []);

  // Stats
  const stats = useMemo(() => {
    return {
      total: installationsWithProgress.length,
      notStarted: installationsWithProgress.filter(i => i.reviewStatus === "not-started").length,
      partial: installationsWithProgress.filter(i => i.reviewStatus === "partial").length,
      complete: installationsWithProgress.filter(i => i.reviewStatus === "complete").length,
    };
  }, [installationsWithProgress]);

  const viewDetails = (installation: Installation) => {
    setSelectedInstallation(installation);
    setDialogOpen(true);
  };

  // Get field label
  const getFieldLabel = (key: string): string => {
    const labels: Record<string, string> = {
      installer_deviceId: "Installer: Device ID",
      installer_installer: "Installer: Installer Name",
      installer_locationId: "Installer: Location ID",
      installer_sensorReading: "Installer: Sensor Reading",
      installer_coordinates: "Installer: Coordinates",
      server_deviceId: "Server: Device ID",
      server_sensorData: "Server: Sensor Data",
      server_receivedAt: "Server: Received At",
      server_variance: "Server: Variance",
    };
    
    if (key.startsWith("image_")) {
      const index = key.split("_")[1];
      return `Photo ${parseInt(index) + 1}`;
    }
    
    if (key === "video") {
      return "360° Video";
    }
    
    return labels[key] || key;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
          Review Audit Log
        </h1>
        <p className="text-muted-foreground mt-2">
          Track review progress and verifier activity for all installations
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Total Installations</p>
                <p className="text-3xl font-bold mt-1">{stats.total}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center">
                <Clock className="h-6 w-6 text-slate-700 dark:text-slate-200" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Not Started</p>
                <p className="text-3xl font-bold mt-1 text-gray-600">{stats.notStarted}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
                <Clock className="h-6 w-6 text-gray-600 dark:text-gray-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Partially Reviewed</p>
                <p className="text-3xl font-bold mt-1 text-blue-600">{stats.partial}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                <Clock className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Fully Reviewed</p>
                <p className="text-3xl font-bold mt-1 text-green-600">{stats.complete}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-green-100 dark:bg-green-950 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
            {(deviceIdFilter || statusFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDeviceIdFilter("");
                  setStatusFilter("all");
                }}
              >
                <X className="h-4 w-4 mr-1" />
                Clear Filters
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="deviceIdFilter">Device ID</Label>
              <Input
                id="deviceIdFilter"
                placeholder="Search by device ID..."
                value={deviceIdFilter}
                onChange={(e) => setDeviceIdFilter(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="statusFilter">Review Status</Label>
              <select
                id="statusFilter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">All Statuses</option>
                <option value="partial">Partially Reviewed</option>
                <option value="complete">Fully Reviewed</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Installations Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Installations ({filteredInstallations.length > displayLimit ? `${paginatedInstallations.length} of ` : ''}{filteredInstallations.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredInstallations.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No installations found matching your filters.</p>
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device ID</TableHead>
                      <TableHead>Installer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reviewed By</TableHead>
                      <TableHead>Verified By</TableHead>
                      <TableHead>Review Progress</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedInstallations.map((installation: any) => (
                    <TableRow key={installation.id}>
                      <TableCell>
                        <span className="font-mono font-medium">{installation.deviceId}</span>
                      </TableCell>
                      <TableCell>{installation.installedByName}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            installation.status === "verified"
                              ? "bg-green-50 text-green-700 border-green-200"
                              : installation.status === "flagged"
                              ? "bg-red-50 text-red-700 border-red-200"
                              : "bg-yellow-50 text-yellow-700 border-yellow-200"
                          }
                        >
                          {installation.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {installation.reviewedBy ? (
                          <div className="space-y-0.5">
                            <div className="text-sm font-medium">{installation.reviewedBy}</div>
                            {installation.reviewedByUid && (
                              <div className="text-xs text-muted-foreground font-mono">{installation.reviewedByUid}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Not reviewed</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {installation.verifiedBy ? (
                          <span className="text-sm">{installation.verifiedBy}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">Not verified</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {installation.checkedFields} / {installation.totalFields}
                            </span>
                            <Badge
                              variant="outline"
                              className={
                                installation.reviewStatus === "complete"
                                  ? "bg-green-50 text-green-700 border-green-200"
                                  : installation.reviewStatus === "partial"
                                  ? "bg-blue-50 text-blue-700 border-blue-200"
                                  : "bg-gray-50 text-gray-700 border-gray-200"
                              }
                            >
                              {installation.progressPercentage.toFixed(0)}%
                            </Badge>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${
                                installation.reviewStatus === "complete"
                                  ? "bg-green-600"
                                  : installation.reviewStatus === "partial"
                                  ? "bg-blue-600"
                                  : "bg-gray-400"
                              }`}
                              style={{ width: `${installation.progressPercentage}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {installation.updatedAt
                          ? format(installation.updatedAt, "MMM d, yyyy HH:mm")
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => viewDetails(installation)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            
            {/* Show More Button */}
            {filteredInstallations.length > displayLimit && (
              <div className="mt-6 pt-6 text-center border-t-2 border-dashed bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4">
                <p className="text-sm text-muted-foreground mb-3 font-medium">
                  Showing {paginatedInstallations.length} of {filteredInstallations.length} installations
                </p>
                <Button 
                  variant="default" 
                  size="lg" 
                  onClick={handleShowMore} 
                  className="min-w-[250px] font-semibold shadow-md"
                >
                  Show More ({filteredInstallations.length - paginatedInstallations.length} remaining)
                </Button>
              </div>
            )}
          </>
          )}
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-6xl max-h-[90vh] overflow-y-auto px-4 sm:px-6">
          <DialogHeader>
            <DialogTitle>Review Audit Details</DialogTitle>
          </DialogHeader>
          {selectedInstallation && (
            <div className="space-y-6">
              {/* Installation Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Installation Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Device ID</p>
                      <p className="font-mono font-medium text-sm sm:text-base">{selectedInstallation.deviceId}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Installer</p>
                      <p className="font-medium">{selectedInstallation.installedByName}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      <Badge variant="outline">{selectedInstallation.status}</Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Location ID</p>
                      <p className="font-medium">{selectedInstallation.locationId || "-"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Sensor Reading</p>
                      <p className="font-medium">{selectedInstallation.sensorReading} cm</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Server Data</p>
                      <p className="font-medium">{selectedInstallation.latestDisCm != null ? `${selectedInstallation.latestDisCm} cm` : "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Submitted</p>
                      <p className="text-sm">
                        {selectedInstallation.createdAt
                          ? format(selectedInstallation.createdAt, "MMM d, yyyy HH:mm")
                          : "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Verified By</p>
                      <p className="text-sm">{selectedInstallation.verifiedBy || "Not verified"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Verified At</p>
                      <p className="text-sm">
                        {selectedInstallation.verifiedAt
                          ? format(selectedInstallation.verifiedAt, "MMM d, yyyy HH:mm")
                          : "Not verified"}
                      </p>
                    </div>
                  </div>
                  {selectedInstallation.latitude && selectedInstallation.longitude && (
                    <div>
                      <p className="text-sm text-muted-foreground">GPS Coordinates</p>
                      <p className="text-sm font-mono">
                        {selectedInstallation.latitude.toFixed(6)}, {selectedInstallation.longitude.toFixed(6)}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Installation Photos */}
              {selectedInstallation.imageUrls && selectedInstallation.imageUrls.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Installation Photos ({selectedInstallation.imageUrls.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {selectedInstallation.imageUrls.map((url, index) => {
                        const imageKey = `image_${index}`;
                        const metadata = selectedInstallation.fieldCheckMetadata?.[imageKey];
                        return (
                          <div key={index} className="relative group">
                            <img
                              src={url}
                              alt={`Installation photo ${index + 1}`}
                              className="w-full h-48 object-cover rounded-lg border cursor-pointer transition-transform hover:scale-105"
                              onClick={() => window.open(url, '_blank')}
                            />
                            <div className="absolute bottom-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs">
                              Photo {index + 1}
                            </div>
                            {metadata && (
                              <div className="absolute top-2 right-2 bg-green-500/90 text-white px-2 py-1 rounded text-xs flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Verified
                              </div>
                            )}
                            {metadata && (
                              <div className="mt-2 p-2 bg-muted rounded text-xs space-y-1">
                                <p className="font-medium text-green-700 dark:text-green-400">✓ Verified</p>
                                <p className="text-muted-foreground">
                                  By: <span className="font-medium text-foreground">{metadata.checkedByName}</span>
                                </p>
                                <p className="text-muted-foreground">
                                  UID: <span className="font-mono text-xs">{metadata.checkedBy}</span>
                                </p>
                                <p className="text-muted-foreground">
                                  At: {format(
                                    metadata.checkedAt instanceof Date 
                                      ? metadata.checkedAt 
                                      : (metadata.checkedAt as any).toDate 
                                        ? (metadata.checkedAt as any).toDate()
                                        : new Date((metadata.checkedAt as any).seconds * 1000), 
                                    "MMM d, yyyy HH:mm"
                                  )}
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* 360 Video */}
              {selectedInstallation.videoUrl && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">360° Video</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <video
                      src={selectedInstallation.videoUrl}
                      controls
                      className="w-full h-64 object-cover rounded-lg border"
                    />
                  </CardContent>
                </Card>
              )}

              {/* Review Progress - Only show editable fields */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center justify-between">
                    <span>Review Progress</span>
                    <Badge variant="outline" className="text-sm">
                      {(() => {
                        const fieldCheckStates = selectedInstallation.fieldCheckStates || {};
                        // Only count fields with actual checkboxes
                        const allFields = [
                          "installer_deviceId",
                          "installer_locationId",
                          "installer_sensorReading",
                          "installer_coordinates",
                        ];
                        // Add server sensor data if available
                        if (selectedInstallation.latestDisCm != null) {
                          allFields.push("server_sensorData");
                        }
                        // Add image fields
                        (selectedInstallation.imageUrls || []).forEach((_, index) => {
                          allFields.push(`image_${index}`);
                        });
                        const checkedCount = allFields.filter(f => fieldCheckStates[f]).length;
                        return `${checkedCount} / ${allFields.length} checked`;
                      })()}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {(() => {
                      const fieldCheckStates = selectedInstallation.fieldCheckStates || {};
                      const fieldCheckMetadata = selectedInstallation.fieldCheckMetadata || {};
                      
                      // Only show editable fields (those with checkboxes)
                      const allFields = [
                        "installer_deviceId",
                        "installer_installer",
                        "installer_locationId",
                        "installer_sensorReading",
                        "installer_coordinates",
                      ];

                      return (
                        <div className="space-y-2">
                          {allFields.map((field) => {
                            const isChecked = fieldCheckStates[field];
                            const metadata = fieldCheckMetadata[field];
                            
                            return (
                              <div
                                key={field}
                                className={`p-3 sm:p-4 rounded-lg border transition-all ${
                                  isChecked
                                    ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                                    : "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                                }`}
                              >
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                  <div className="flex items-start sm:items-center gap-3">
                                    {isChecked ? (
                                      <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5 sm:mt-0" />
                                    ) : (
                                      <Clock className="h-5 w-5 text-gray-400 flex-shrink-0 mt-0.5 sm:mt-0" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-sm sm:text-base">{getFieldLabel(field)}</p>
                                      {isChecked && metadata && (
                                        <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                                          <div>
                                            Verified by <span className="font-medium text-green-700 dark:text-green-400">{metadata.checkedByName || metadata.checkedBy}</span>
                                          </div>
                                          {metadata.checkedAt && (
                                            <div className="text-[11px]">
                                              {format(
                                                metadata.checkedAt instanceof Date 
                                                  ? metadata.checkedAt 
                                                  : (metadata.checkedAt as any).toDate 
                                                    ? (metadata.checkedAt as any).toDate()
                                                    : new Date((metadata.checkedAt as any).seconds * 1000), 
                                                "MMM d, yyyy 'at' HH:mm"
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                      {!isChecked && (
                                        <p className="text-xs text-muted-foreground mt-1">Not verified yet</p>
                                      )}
                                    </div>
                                  </div>
                                  {isChecked && (
                                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 w-fit">
                                      ✓ Verified
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

