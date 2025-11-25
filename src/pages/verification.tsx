import { useState, useEffect, useMemo, useRef } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
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
  Clock, 
  CheckCircle2, 
  XCircle,
  AlertTriangle,
  Image as ImageIcon,
  Gauge,
  MapPin,
  Calendar,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  Filter,
  X,
  Database,
  CloudOff,
  CircleCheck,
  Edit,
  Save,
  FileDown,
  Upload,
  Trash2,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { Installation, Device, ServerData, VerificationItem, Team } from "@/lib/types";
import { format } from "date-fns";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { translateTeamNameToArabic } from "@/lib/amanah-translations";

export default function Verification() {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [allInstallations, setAllInstallations] = useState<Installation[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [locations, setLocations] = useState<{ id: string; locationId: string; latitude: number; longitude: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<VerificationItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [fetchingMap, setFetchingMap] = useState<Record<string, boolean>>({});
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'highVariance' | 'withServerData' | 'noServerData' | 'preVerified' | 'verified'>('all');
  
  // Filter states
  const [installerNameFilter, setInstallerNameFilter] = useState<string>("");
  const [teamIdFilter, setTeamIdFilter] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [deviceIdFilter, setDeviceIdFilter] = useState<string>("");
  const [displayLimit, setDisplayLimit] = useState(500);
  
  // Edit mode states
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedDeviceId, setEditedDeviceId] = useState<string>("");
  const [editedSensorReading, setEditedSensorReading] = useState<string>("");
  const [editedLocationId, setEditedLocationId] = useState<string>("");
  const [editedLatitude, setEditedLatitude] = useState<string>("");
  const [editedLongitude, setEditedLongitude] = useState<string>("");
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Delete states
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<VerificationItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Edit confirmation states
  const [editConfirmDialogOpen, setEditConfirmDialogOpen] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Array<{field: string, oldValue: string, newValue: string}>>([]);

  // Real-time installations listener (pending verification)
  useEffect(() => {
    if (!userProfile?.isAdmin && userProfile?.role !== "verifier" && userProfile?.role !== "manager") return;

    // Fetch installations; filter by team for manager/verifier
    const installationsQuery = userProfile.isAdmin
      ? collection(db, "installations")
      : query(collection(db, "installations"), where("teamId", "==", userProfile.teamId || null));

    const unsubscribe = onSnapshot(
      installationsQuery as any,
      (snapshot: any) => {
        const installationsData = snapshot.docs.map((doc: any) => {
          const data = doc.data();
          
          // Helper to safely convert Firestore timestamps to Date
          const convertToDate = (value: any): Date | null => {
            if (!value) return null;
            if (value instanceof Date) {
              return isNaN(value.getTime()) ? null : value;
            }
            if (typeof value.toDate === 'function') {
              try {
                const date = value.toDate();
                return isNaN(date.getTime()) ? null : date;
              } catch {
                return null;
              }
            }
            // If it's a string or number, try to parse it
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
          
          return {
            id: doc.id,
            ...data,
            createdAt: convertToDate(data.createdAt),
            updatedAt: convertToDate(data.updatedAt),
            serverRefreshedAt: convertToDate(data.serverRefreshedAt),
            verifiedAt: convertToDate(data.verifiedAt),
            systemPreVerifiedAt: convertToDate(data.systemPreVerifiedAt),
          } as Installation;
        });
        setAllInstallations(installationsData);
        setLoading(false);
      },
      (error: any) => {
        toast({
          variant: "destructive",
          title: "Failed to load installations",
          description: error.message,
        });
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userProfile, toast]);

  // Real-time devices listener
  useEffect(() => {
    if (!userProfile?.isAdmin && userProfile?.role !== "verifier" && userProfile?.role !== "manager") return;

    const unsubscribe = onSnapshot(
      collection(db, "devices"),
      (snapshot) => {
        const devicesData = snapshot.docs.map(doc => ({
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate(),
          updatedAt: doc.data().updatedAt?.toDate(),
        })) as Device[];
        setDevices(devicesData);
      },
      (error) => {
        console.error("Failed to load devices:", error);
      }
    );

    return () => unsubscribe();
  }, [userProfile]);

  // Real-time locations listener
  useEffect(() => {
    if (!userProfile?.isAdmin && userProfile?.role !== "verifier" && userProfile?.role !== "manager") return;

    const unsubscribe = onSnapshot(
      collection(db, "locations"),
      (snapshot) => {
        const locationsData = snapshot.docs.map((d) => {
          const docData = d.data();
          const lat = typeof docData.latitude === 'number' 
            ? docData.latitude 
            : (docData.latitude ? parseFloat(String(docData.latitude)) : null);
          const lon = typeof docData.longitude === 'number'
            ? docData.longitude
            : (docData.longitude ? parseFloat(String(docData.longitude)) : null);
          
          return {
            id: d.id,
            locationId: docData.locationId || d.id,
            latitude: lat,
            longitude: lon,
          };
        }).filter(loc => loc.latitude != null && loc.longitude != null && !isNaN(loc.latitude) && !isNaN(loc.longitude));
        
        setLocations(locationsData);
      },
      (error) => {
        console.error("Failed to load locations:", error);
      }
    );

    return () => unsubscribe();
  }, [userProfile]);

  // Real-time teams listener (for admin, verifier, and manager to display team names)
  useEffect(() => {
    if (!userProfile?.isAdmin && userProfile?.role !== "verifier" && userProfile?.role !== "manager") return;

    const unsubscribe = onSnapshot(
      collection(db, "teams"),
      (snapshot) => {
        const teamsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate(),
          updatedAt: doc.data().updatedAt?.toDate(),
        })) as Team[];
        teamsData.sort((a, b) => a.name.localeCompare(b.name));
        setTeams(teamsData);
      },
      (error) => {
        console.error("Failed to load teams:", error);
      }
    );

    return () => unsubscribe();
  }, [userProfile]);

  // Separate pending and verified installations
  const pendingInstallations = useMemo(() => {
    const filtered = allInstallations.filter(inst => {
      const isPending = inst.status === "pending";
      const isAutoFlagged = inst.status === "flagged" && (
        (inst.verifiedBy && inst.verifiedBy.startsWith("System")) ||
        (inst.flaggedReason && inst.flaggedReason.toLowerCase().includes("auto-rejected"))
      );
      return isPending || isAutoFlagged;
    });
    return filtered.slice().sort((a, b) => {
      const at = a.createdAt ? a.createdAt.getTime() : 0;
      const bt = b.createdAt ? b.createdAt.getTime() : 0;
      return bt - at; // newest first
    });
  }, [allInstallations]);

  const verifiedInstallations = useMemo(() => {
    const filtered = allInstallations.filter(inst => inst.status === "verified");
    return filtered.slice().sort((a, b) => {
      const at = a.createdAt ? a.createdAt.getTime() : 0;
      const bt = b.createdAt ? b.createdAt.getTime() : 0;
      return bt - at; // newest first
    });
  }, [allInstallations]);

  // Create verification items for pending installations
  const verificationItems = useMemo(() => {
    return pendingInstallations.map(installation => {
      const device = devices.find(d => d.id === installation.deviceId);
      
      // Use latestDisCm from installation document instead of serverData collection
      const serverValue = installation.latestDisCm;
      
      let percentageDifference: number | undefined;
      if (serverValue != null && installation.sensorReading != null) {
        const diff = Math.abs(serverValue - installation.sensorReading);
        percentageDifference = (diff / installation.sensorReading) * 100;
      }

      return {
        installation,
        device: device!,
        serverData: serverValue != null ? {
          id: `${installation.id}_server`,
          deviceId: installation.deviceId,
          sensorData: serverValue,
        } : undefined,
        percentageDifference,
      } as VerificationItem;
    }).filter(item => item.device); // Filter out items without device info
  }, [pendingInstallations, devices]);

  // Extract unique installer names
  const installerNames = useMemo(() => {
    const names = new Set<string>();
    allInstallations.forEach(inst => {
      if (inst.installedByName) {
        names.add(inst.installedByName);
      }
    });
    return Array.from(names).sort();
  }, [allInstallations]);

  // Helper function to get team name from teamId
  const getTeamName = (teamId?: string): string | null => {
    if (!teamId) return null;
    const team = teams.find(t => t.id === teamId);
    return team?.name || null;
  };

  // Create a map of locationId -> coordinates
  const locationMap = useMemo(() => {
    const map = new Map<string, { id: string; locationId: string; latitude: number; longitude: number }>();
    locations.forEach((loc) => {
      if (loc.id) {
        const idKey = String(loc.id).trim();
        map.set(idKey, loc);
        if (/^\d+$/.test(idKey)) {
          const numKey = String(Number(idKey)).trim();
          if (numKey !== idKey) {
            map.set(numKey, loc);
          }
        }
      }
      if (loc.locationId && String(loc.locationId).trim() !== String(loc.id).trim()) {
        const locIdKey = String(loc.locationId).trim();
        map.set(locIdKey, loc);
        if (/^\d+$/.test(locIdKey)) {
          const numKey = String(Number(locIdKey)).trim();
          if (numKey !== locIdKey) {
            map.set(numKey, loc);
          }
        }
      }
    });
    return map;
  }, [locations]);

  // Helper function to safely format dates
  const formatDateSafe = (date: Date | null | undefined, formatStr: string): string | null => {
    if (!date) return null;
    if (!(date instanceof Date)) return null;
    if (isNaN(date.getTime())) return null;
    try {
      return format(date, formatStr);
    } catch (error) {
      console.error("Error formatting date:", error, date);
      return null;
    }
  };

  // Calculate filter counts
  const noServerDataCount = useMemo(() => {
    return verificationItems.filter(i => !i.serverData || i.installation.latestDisCm == null).length;
  }, [verificationItems]);

  const preVerifiedCount = useMemo(() => {
    return verificationItems.filter(i => i.installation.systemPreVerified === true).length;
  }, [verificationItems]);

  const verifiedCount = useMemo(() => {
    return verifiedInstallations.length;
  }, [verifiedInstallations]);

  // Apply all filters to items shown in the table
  const displayedItems = useMemo(() => {
    let filtered = verificationItems;

    // Apply active filter (only one can be active at a time)
    if (activeFilter === 'pending') {
      filtered = verificationItems;
    } else if (activeFilter === 'highVariance') {
      filtered = verificationItems.filter(i => i.percentageDifference && i.percentageDifference > 5);
    } else if (activeFilter === 'withServerData') {
      filtered = verificationItems.filter(i => i.serverData);
    } else if (activeFilter === 'noServerData') {
      filtered = verificationItems.filter(i => !i.serverData || i.installation.latestDisCm == null);
    } else if (activeFilter === 'preVerified') {
      filtered = verificationItems.filter(i => i.installation.systemPreVerified === true);
    } else if (activeFilter === 'verified') {
      // For verified filter, return empty array for pending items (verified items shown in separate table)
      filtered = [];
    }

    // Apply installer name filter
    if (installerNameFilter) {
      filtered = filtered.filter(i => 
        i.installation.installedByName?.toLowerCase().includes(installerNameFilter.toLowerCase())
      );
    }

    // Apply device ID filter
    if (deviceIdFilter) {
      filtered = filtered.filter(i => 
        i.installation.deviceId?.toUpperCase().includes(deviceIdFilter.toUpperCase())
      );
    }

    // Apply team filter (admin only)
    if (teamIdFilter && userProfile?.isAdmin) {
      filtered = filtered.filter(i => i.installation.teamId === teamIdFilter);
    }

    // Apply date filter
    if (dateFilter) {
      const filterDate = new Date(dateFilter);
      filterDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(filterDate);
      nextDay.setDate(nextDay.getDate() + 1);
      
      filtered = filtered.filter(i => {
        if (!i.installation.createdAt) return false;
        const installDate = new Date(i.installation.createdAt);
        installDate.setHours(0, 0, 0, 0);
        return installDate >= filterDate && installDate < nextDay;
      });
    }

    // Sort by installation time, latest on top
    filtered.sort((a, b) => {
      const aTime = a.installation.createdAt?.getTime() || 0;
      const bTime = b.installation.createdAt?.getTime() || 0;
      return bTime - aTime; // newest first
    });

    return filtered;
  }, [verificationItems, activeFilter, installerNameFilter, deviceIdFilter, teamIdFilter, dateFilter, userProfile?.isAdmin]);

  // Limit displayed items for performance
  const paginatedDisplayedItems = useMemo(() => {
    return displayedItems.slice(0, displayLimit);
  }, [displayedItems, displayLimit]);

  // Apply filters to verified installations
  const displayedVerifiedItems = useMemo(() => {
    // Only show verified items if 'verified' filter is active, or if no filter is active and we want to show verified table
    if (activeFilter !== 'verified' && activeFilter !== 'all') {
      return [];
    }

    let filtered = verifiedInstallations.map(installation => {
      const device = devices.find(d => d.id === installation.deviceId);
      const serverValue = installation.latestDisCm;
      
      let percentageDifference: number | undefined;
      if (serverValue != null && installation.sensorReading != null) {
        const diff = Math.abs(serverValue - installation.sensorReading);
        percentageDifference = (diff / installation.sensorReading) * 100;
      }

      return {
        installation,
        device: device!,
        serverData: serverValue != null ? {
          id: `${installation.id}_server`,
          deviceId: installation.deviceId,
          sensorData: serverValue,
        } : undefined,
        percentageDifference,
      } as VerificationItem;
    }).filter(item => item.device);

    // Apply installer name filter
    if (installerNameFilter) {
      filtered = filtered.filter(i => 
        i.installation.installedByName?.toLowerCase().includes(installerNameFilter.toLowerCase())
      );
    }

    // Apply device ID filter
    if (deviceIdFilter) {
      filtered = filtered.filter(i => 
        i.installation.deviceId?.toUpperCase().includes(deviceIdFilter.toUpperCase())
      );
    }

    // Apply team filter (admin only)
    if (teamIdFilter && userProfile?.isAdmin) {
      filtered = filtered.filter(i => i.installation.teamId === teamIdFilter);
    }

    // Apply no server data filter if active
    if (activeFilter === 'noServerData') {
      filtered = filtered.filter(i => !i.serverData || i.installation.latestDisCm == null);
    }

    // Apply date filter
    if (dateFilter) {
      const filterDate = new Date(dateFilter);
      filterDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(filterDate);
      nextDay.setDate(nextDay.getDate() + 1);
      
      filtered = filtered.filter(i => {
        if (!i.installation.createdAt) return false;
        const installDate = new Date(i.installation.createdAt);
        installDate.setHours(0, 0, 0, 0);
        return installDate >= filterDate && installDate < nextDay;
      });
    }

    // Sort by installation time, latest on top
    filtered.sort((a, b) => {
      const aTime = a.installation.createdAt?.getTime() || 0;
      const bTime = b.installation.createdAt?.getTime() || 0;
      return bTime - aTime; // newest first
    });

    return filtered;
  }, [verifiedInstallations, devices, installerNameFilter, deviceIdFilter, teamIdFilter, activeFilter, dateFilter, userProfile?.isAdmin]);

  // Limit displayed verified items for performance
  const paginatedVerifiedItems = useMemo(() => {
    return displayedVerifiedItems.slice(0, displayLimit);
  }, [displayedVerifiedItems, displayLimit]);

  // Reset display limit when filters change
  useEffect(() => {
    setDisplayLimit(500);
  }, [activeFilter, installerNameFilter, deviceIdFilter, teamIdFilter, dateFilter]);

  const handleShowMore = () => {
    setDisplayLimit(prev => prev + 500);
  };

  // No auto-approval. We only mark system pre-verified for variance < 5% and keep status pending.

  const viewDetails = (item: VerificationItem) => {
    setSelectedItem(item);
    setDialogOpen(true);
    setRejectReason("");
    setIsEditMode(false);
    // Initialize edit values with current values
    setEditedDeviceId(item.installation.deviceId || "");
    setEditedSensorReading(item.installation.sensorReading.toString());
    setEditedLocationId(item.installation.locationId || "");
    setEditedLatitude(item.installation.latitude?.toString() || "");
    setEditedLongitude(item.installation.longitude?.toString() || "");
    setNewImageFile(null);
    setNewImagePreview(null);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast({
          variant: "destructive",
          title: "File too large",
          description: "Please select an image smaller than 10MB.",
        });
        return;
      }
      if (!file.type.startsWith('image/')) {
        toast({
          variant: "destructive",
          title: "Invalid file type",
          description: "Please select an image file.",
        });
        return;
      }
      setNewImageFile(file);
      setNewImagePreview(URL.createObjectURL(file));
    }
  };

  const handleApprove = async () => {
    if (!selectedItem || !userProfile) return;

    setProcessing(true);
    try {
      // Update installation status
      await updateDoc(doc(db, "installations", selectedItem.installation.id), {
        status: "verified",
        verifiedBy: userProfile.displayName,
        verifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Update device status
      await updateDoc(doc(db, "devices", selectedItem.installation.deviceId), {
        status: "verified",
        updatedAt: serverTimestamp(),
      });

      toast({
        title: "Installation Approved",
        description: "The installation has been successfully verified.",
      });

      setDialogOpen(false);
      setSelectedItem(null);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Approval Failed",
        description: error instanceof Error ? error.message : "An error occurred.",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedItem || !userProfile) return;

    // Validate Device ID
    if (!editedDeviceId.trim()) {
      toast({
        variant: "destructive",
        title: "Device ID Required",
        description: "Please enter a device ID.",
      });
      return;
    }

    // Validate inputs
    const sensorReading = parseFloat(editedSensorReading);
    if (isNaN(sensorReading) || sensorReading <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid Sensor Reading",
        description: "Please enter a valid positive number for sensor reading.",
      });
      return;
    }

    if (!editedLocationId.trim()) {
      toast({
        variant: "destructive",
        title: "Location ID Required",
        description: "Please enter a location ID.",
      });
      return;
    }

    if (!/^\d+$/.test(editedLocationId.trim())) {
      toast({
        variant: "destructive",
        title: "Invalid Location ID",
        description: "Location ID must contain only numbers.",
      });
      return;
    }

    const latitude = editedLatitude ? parseFloat(editedLatitude) : null;
    const longitude = editedLongitude ? parseFloat(editedLongitude) : null;

    if ((latitude !== null && (isNaN(latitude) || latitude < -90 || latitude > 90)) ||
        (longitude !== null && (isNaN(longitude) || longitude < -180 || longitude > 180))) {
      toast({
        variant: "destructive",
        title: "Invalid Coordinates",
        description: "Please enter valid latitude (-90 to 90) and longitude (-180 to 180).",
      });
      return;
    }

    const originalInstallation = selectedItem.installation;
    
    // Normalize coordinates for comparison (treat null and undefined as same)
    const normalizeCoord = (val: number | null | undefined) => val ?? null;
    const originalLat = normalizeCoord(originalInstallation.latitude);
    const originalLon = normalizeCoord(originalInstallation.longitude);
    
    // Collect all changes
    const changes: Array<{field: string, oldValue: string, newValue: string}> = [];
    
    if (editedDeviceId.trim() !== originalInstallation.deviceId) {
      changes.push({
        field: "Device ID",
        oldValue: originalInstallation.deviceId,
        newValue: editedDeviceId.trim()
      });
    }
    
    if (sensorReading !== originalInstallation.sensorReading) {
      changes.push({
        field: "Sensor Reading",
        oldValue: `${originalInstallation.sensorReading} cm`,
        newValue: `${sensorReading} cm`
      });
    }
    
    if (editedLocationId.trim() !== originalInstallation.locationId) {
      changes.push({
        field: "Location ID",
        oldValue: originalInstallation.locationId || "-",
        newValue: editedLocationId.trim()
      });
    }
    
    if (latitude !== originalLat) {
      changes.push({
        field: "Latitude",
        oldValue: originalLat !== null ? originalLat.toFixed(6) : "Not set",
        newValue: latitude !== null ? latitude.toFixed(6) : "Not set"
      });
    }
    
    if (longitude !== originalLon) {
      changes.push({
        field: "Longitude",
        oldValue: originalLon !== null ? originalLon.toFixed(6) : "Not set",
        newValue: longitude !== null ? longitude.toFixed(6) : "Not set"
      });
    }
    
    if (newImageFile) {
      changes.push({
        field: "Image",
        oldValue: "Current images",
        newValue: `Add new image: ${newImageFile.name}`
      });
    }

    if (changes.length === 0) {
      toast({
        title: "No Changes",
        description: "No changes were made to the installation.",
      });
      setIsEditMode(false);
      return;
    }

    // Show confirmation dialog with changes
    setPendingChanges(changes);
    setEditConfirmDialogOpen(true);
  };

  const handleEditConfirmed = async () => {
    if (!selectedItem || !userProfile) return;

    setEditConfirmDialogOpen(false);
    setProcessing(true);
    try {
      const originalInstallation = selectedItem.installation;
      
      // Normalize coordinates for comparison
      const normalizeCoord = (val: number | null | undefined) => val ?? null;
      const originalLat = normalizeCoord(originalInstallation.latitude);
      const originalLon = normalizeCoord(originalInstallation.longitude);
      
      const sensorReading = parseFloat(editedSensorReading);
      const latitude = editedLatitude ? parseFloat(editedLatitude) : null;
      const longitude = editedLongitude ? parseFloat(editedLongitude) : null;

      // Get existing tags or initialize empty array
      const existingTags = originalInstallation.tags || [];
      const tagsToUpdate = [...existingTags];
      
      // Add "edited by verifier" tag if not already present
      if (!tagsToUpdate.includes("edited by verifier")) {
        tagsToUpdate.push("edited by verifier");
      }

      // Helper function to find the next version number for a field
      const getNextVersion = (fieldName: string, installationData: any): number => {
        let maxVersion = 0;
        const prefix = `original_${fieldName}_`;
        
        // Check all keys in the installation document for existing versions
        Object.keys(installationData).forEach(key => {
          if (key.startsWith(prefix)) {
            const versionStr = key.substring(prefix.length);
            const version = parseInt(versionStr, 10);
            if (!isNaN(version) && version > maxVersion) {
              maxVersion = version;
            }
          }
        });
        
        return maxVersion + 1;
      };

      // Prepare update object with versioned original values
      const updateData: any = {
        tags: tagsToUpdate,
        updatedAt: serverTimestamp(),
      };

      // Store original values with version numbers before updating
      if (editedDeviceId.trim() !== originalInstallation.deviceId) {
        const version = getNextVersion('deviceId', originalInstallation);
        updateData[`original_deviceId_${version}`] = originalInstallation.deviceId;
        updateData.deviceId = editedDeviceId.trim();
      }

      if (sensorReading !== originalInstallation.sensorReading) {
        const version = getNextVersion('sensorReading', originalInstallation);
        updateData[`original_sensorReading_${version}`] = originalInstallation.sensorReading;
        updateData.sensorReading = sensorReading;
      }

      if (editedLocationId.trim() !== originalInstallation.locationId) {
        const version = getNextVersion('locationId', originalInstallation);
        updateData[`original_locationId_${version}`] = originalInstallation.locationId;
        updateData.locationId = editedLocationId.trim();
      }

      if (latitude !== originalLat) {
        const version = getNextVersion('latitude', originalInstallation);
        updateData[`original_latitude_${version}`] = originalLat;
        updateData.latitude = latitude;
      }

      if (longitude !== originalLon) {
        const version = getNextVersion('longitude', originalInstallation);
        updateData[`original_longitude_${version}`] = originalLon;
        updateData.longitude = longitude;
      }

      // Upload new image if one was selected
      if (newImageFile) {
        setUploadingImage(true);
        try {
          const storage = getStorage();
          const timestamp = Date.now();
          const imageRef = storageRef(storage, `installations/${selectedItem.installation.id}/additional_${timestamp}_${newImageFile.name}`);
          await uploadBytes(imageRef, newImageFile);
          const imageUrl = await getDownloadURL(imageRef);
          
          // Add new image URL to existing imageUrls array
          const currentImageUrls = originalInstallation.imageUrls || [];
          updateData.imageUrls = [...currentImageUrls, imageUrl];
        } catch (error) {
          toast({
            variant: "destructive",
            title: "Image Upload Failed",
            description: error instanceof Error ? error.message : "Failed to upload image.",
          });
          setUploadingImage(false);
          setProcessing(false);
          return;
        } finally {
          setUploadingImage(false);
        }
      }

      // Update installation with edited values, versioned originals, and tag
      await updateDoc(doc(db, "installations", selectedItem.installation.id), updateData);

      toast({
        title: "Installation Updated",
        description: newImageFile 
          ? "The installation has been successfully updated with version history and new image."
          : "The installation has been successfully updated with version history.",
      });

      setIsEditMode(false);
      setNewImageFile(null);
      setNewImagePreview(null);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: error instanceof Error ? error.message : "An error occurred.",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedItem || !userProfile || !rejectReason.trim()) {
      toast({
        variant: "destructive",
        title: "Reason Required",
        description: "Please provide a reason for rejection.",
      });
      return;
    }

    setProcessing(true);
    try {
      // Update installation status
      await updateDoc(doc(db, "installations", selectedItem.installation.id), {
        status: "flagged",
        flaggedReason: rejectReason.trim(),
        verifiedBy: userProfile.displayName,
        verifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Update device status
      await updateDoc(doc(db, "devices", selectedItem.installation.deviceId), {
        status: "flagged",
        updatedAt: serverTimestamp(),
      });

      toast({
        title: "Installation Flagged",
        description: "The installation has been flagged for review.",
        variant: "destructive",
      });

      setDialogOpen(false);
      setSelectedItem(null);
      setRejectReason("");
      setIsEditMode(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Rejection Failed",
        description: error instanceof Error ? error.message : "An error occurred.",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteClick = (item: VerificationItem) => {
    setItemToDelete(item);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete || !userProfile) return;

    setDeleting(true);
    try {
      // Delete the installation document
      await deleteDoc(doc(db, "installations", itemToDelete.installation.id));

      toast({
        title: "Installation Deleted",
        description: `Installation for device ${itemToDelete.installation.deviceId} has been permanently deleted.`,
      });

      setDeleteDialogOpen(false);
      setItemToDelete(null);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: error instanceof Error ? error.message : "An error occurred while deleting.",
      });
    } finally {
      setDeleting(false);
    }
  };

  const downloadCsv = (rowsData: string[][], filename: string) => {
    const headers = ["Device ID", "Amanah", "Location ID", "Coordinates", "Sensor Reading"];
    const csvRows = [headers, ...rowsData];
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
  };

  const handleCsvExport = () => {
    // Get items to export based on active filter
    // displayedItems and displayedVerifiedItems already have all filters applied
    let itemsToExport: VerificationItem[] = [];
    
    if (activeFilter === 'verified') {
      // Only verified items
      itemsToExport = displayedVerifiedItems;
    } else if (activeFilter === 'all') {
      // Both pending and verified items
      itemsToExport = [...displayedItems, ...displayedVerifiedItems];
    } else {
      // Only pending items (with filters applied)
      itemsToExport = displayedItems;
    }

    if (itemsToExport.length === 0) {
      toast({
        title: "No installations found",
        description: "There are no installations in the current view to export.",
      });
      return;
    }

    const csvRows = itemsToExport.map((item) => {
      const { installation } = item;
      const rawLocationId = installation?.locationId ? String(installation.locationId).trim() : "";

      let location: { id: string; locationId: string; latitude: number; longitude: number } | null = null;
      if (rawLocationId) {
        location = locationMap.get(rawLocationId) ?? null;
        if (!location && locations.length > 0) {
          location =
            locations.find(
              (loc) =>
                String(loc.id).trim() === rawLocationId ||
                String(loc.locationId).trim() === rawLocationId
            ) ?? null;
        }
      }

      // Only use coordinates from Firestore locations; do not fall back to installer-provided ones
      const latitude = location?.latitude ?? null;
      const longitude = location?.longitude ?? null;
      const coordinates =
        latitude != null && longitude != null
          ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
          : "-";

      // Get manually entered sensor reading from installation
      const sensorReadingValue = installation?.sensorReading != null ? String(installation.sensorReading) : "-";

      // Get team name (Amanah) and translate to Arabic when exporting
      const teamName = installation.teamId ? getTeamName(installation.teamId) : null;
      const translatedAmanah = translateTeamNameToArabic(teamName);
      const amanah = translatedAmanah ?? teamName ?? "-";

      return [
        installation.deviceId,
        amanah,
        rawLocationId || "-",
        coordinates,
        sensorReadingValue,
      ];
    });

    downloadCsv(csvRows, "verification-installations.csv");

    toast({
      title: "CSV downloaded",
      description: `Exported ${itemsToExport.length} installation${itemsToExport.length === 1 ? "" : "s"}.`,
    });
  };

  const fetchLatestServerReadings = async (installation: Installation) => {
    if (!installation?.deviceId) return;
    setFetchingMap(prev => ({ ...prev, [installation.id]: true }));
    try {
      const apiResponse = await fetch(`https://op1.smarttive.com/device/${installation.deviceId.toUpperCase()}`, {
        method: 'GET',
        headers: {
          'X-API-KEY': import.meta.env.VITE_API_KEY || ''
        }
      });
      // If server hasn't ingested data yet, the API may return 404. Show a friendly message instead of an error.
      if (apiResponse.status === 404) {
        await updateDoc(doc(db, "installations", installation.id), {
          serverRefreshedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        toast({
          title: "Data not available yet, please try later.",
        });
        return;
      }
      if (!apiResponse.ok) throw new Error(`API ${apiResponse.status}`);
      const apiData = await apiResponse.json();
      const latestRecord = apiData?.records?.[0];
      const latestDistance = latestRecord?.dis_cm ?? null;

      // Consider null or 0 as "no server data yet"
      const hasServerData = latestDistance !== null && Number(latestDistance) > 0;
      const hasSensor = !!installation.sensorReading;
      const variancePct = (hasServerData && hasSensor)
        ? (Math.abs(latestDistance - installation.sensorReading) / installation.sensorReading) * 100
        : undefined;
      const preVerified = variancePct !== undefined && variancePct < 5;

      if (variancePct !== undefined && variancePct > 10) {
        // Auto-reject due to high variance
        await updateDoc(doc(db, "installations", installation.id), {
          latestDisCm: latestDistance,
          latestDisTimestamp: latestRecord?.timestamp ?? null,
          status: "flagged",
          flaggedReason: `Auto-rejected: variance ${variancePct.toFixed(2)}% > 10%`,
          verifiedBy: "System (Auto-rejected)",
          verifiedAt: serverTimestamp(),
          systemPreVerified: false,
          systemPreVerifiedAt: null,
          serverRefreshedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await updateDoc(doc(db, "devices", installation.deviceId), {
          status: "flagged",
          updatedAt: serverTimestamp(),
        });
      } else if (hasServerData) {
        await updateDoc(doc(db, "installations", installation.id), {
          latestDisCm: latestDistance,
          latestDisTimestamp: latestRecord?.timestamp ?? null,
          systemPreVerified: preVerified,
          systemPreVerifiedAt: preVerified ? serverTimestamp() : null,
          serverRefreshedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        // No valid server data, still mark refresh attempt
        await updateDoc(doc(db, "installations", installation.id), {
          serverRefreshedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      toast({
        title: variancePct !== undefined && variancePct > 10
          ? "Installation Auto-Rejected"
          : hasServerData ? (preVerified ? "Pre-verified by System" : "Server Readings Updated") : "No Server Data Yet",
        description: hasServerData ? `Latest dis_cm: ${latestDistance}` : "No valid records returned.",
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Fetch Failed",
        description: e instanceof Error ? e.message : "Could not fetch server readings.",
      });
    } finally {
      setFetchingMap(prev => ({ ...prev, [installation.id]: false }));
    }
  };

  // Auto-refresh every 24h for high variance and no-data items (best-effort while page is open)
  const inFlightAuto = useRef<Set<string>>(new Set());
  useEffect(() => {
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    verificationItems.forEach(item => {
      const inst = item.installation;
      const isHighVariance = !!(item.percentageDifference && item.percentageDifference > 5);
      const hasNoData = inst.latestDisCm == null;
      if (!(isHighVariance || hasNoData)) return;
      const last = inst.serverRefreshedAt ? inst.serverRefreshedAt.getTime() : 0;
      const due = (now - last) > DAY_MS;
      if (!due) return;
      if (inFlightAuto.current.has(inst.id)) return;
      inFlightAuto.current.add(inst.id);
      fetchLatestServerReadings(inst).finally(() => inFlightAuto.current.delete(inst.id));
    });
  }, [verificationItems]);

  if (!userProfile?.isAdmin && userProfile?.role !== "verifier" && userProfile?.role !== "manager") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">Only verifiers, managers, and administrators can access this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
          Verification Queue
        </h1>
        <p className="text-muted-foreground mt-2">Review and verify installation submissions</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className={`border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${activeFilter==='pending' ? 'ring-2 ring-yellow-400' : ''}`} onClick={() => setActiveFilter(activeFilter==='pending' ? 'all' : 'pending')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Pending Verification</p>
                <p className="text-3xl font-bold mt-1">{verificationItems.length}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-yellow-100 dark:bg-yellow-950 flex items-center justify-center">
                <Clock className="h-6 w-6 text-yellow-600 dark:text-yellow-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${activeFilter==='highVariance' ? 'ring-2 ring-red-400' : ''}`} onClick={() => setActiveFilter(activeFilter==='highVariance' ? 'all' : 'highVariance')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">High Variance</p>
                <p className="text-3xl font-bold mt-1 text-red-600">
                  {verificationItems.filter(item => item.percentageDifference && item.percentageDifference > 5).length}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-red-100 dark:bg-red-950 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${activeFilter==='withServerData' ? 'ring-2 ring-green-400' : ''}`} onClick={() => setActiveFilter(activeFilter==='withServerData' ? 'all' : 'withServerData')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">With Server Data</p>
                <p className="text-3xl font-bold mt-1 text-green-600">
                  {verificationItems.filter(item => item.serverData).length}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-green-100 dark:bg-green-950 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${activeFilter==='noServerData' ? 'ring-2 ring-orange-400' : ''}`} onClick={() => setActiveFilter(activeFilter==='noServerData' ? 'all' : 'noServerData')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">No Server Data</p>
                <p className="text-3xl font-bold mt-1 text-orange-600">
                  {noServerDataCount}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-orange-100 dark:bg-orange-950 flex items-center justify-center">
                <CloudOff className="h-6 w-6 text-orange-600 dark:text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${activeFilter==='preVerified' ? 'ring-2 ring-blue-400' : ''}`} onClick={() => setActiveFilter(activeFilter==='preVerified' ? 'all' : 'preVerified')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Pre-verified</p>
                <p className="text-3xl font-bold mt-1 text-blue-600">
                  {preVerifiedCount}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                <CircleCheck className="h-6 w-6 text-blue-600 dark:text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${activeFilter==='verified' ? 'ring-2 ring-purple-400' : ''}`} onClick={() => setActiveFilter(activeFilter==='verified' ? 'all' : 'verified')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Verified</p>
                <p className="text-3xl font-bold mt-1 text-purple-600">
                  {verifiedCount}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-purple-100 dark:bg-purple-950 flex items-center justify-center">
                <Database className="h-6 w-6 text-purple-600 dark:text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters Section */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Installer Name Filter */}
            <div className="space-y-2">
              <Label htmlFor="installer-filter">Installer Name</Label>
              <Input
                id="installer-filter"
                placeholder="Search installer..."
                value={installerNameFilter}
                onChange={(e) => setInstallerNameFilter(e.target.value)}
              />
            </div>

            {/* Device ID Filter */}
            <div className="space-y-2">
              <Label htmlFor="device-id-filter">Device ID</Label>
              <Input
                id="device-id-filter"
                placeholder="Search device ID..."
                value={deviceIdFilter}
                onChange={(e) => setDeviceIdFilter(e.target.value)}
                className="font-mono"
              />
            </div>

            {/* Team Filter (Admin Only) */}
            {userProfile?.isAdmin && (
              <div className="space-y-2">
                <Label htmlFor="team-filter">Team Name</Label>
                <Select value={teamIdFilter || "all"} onValueChange={(value) => setTeamIdFilter(value === "all" ? "" : value)}>
                  <SelectTrigger id="team-filter">
                    <SelectValue placeholder="All Teams" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Teams</SelectItem>
                    {teams.map(team => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Date Filter */}
            <div className="space-y-2">
              <Label htmlFor="date-filter">Installation Date</Label>
              <Input
                id="date-filter"
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              />
            </div>
          </div>

          {/* Clear Filters Button */}
          {(installerNameFilter || deviceIdFilter || teamIdFilter || dateFilter || activeFilter !== 'all') && (
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setInstallerNameFilter("");
                  setDeviceIdFilter("");
                  setTeamIdFilter("");
                  setDateFilter("");
                  setActiveFilter('all');
                }}
              >
                <X className="h-4 w-4 mr-2" />
                Clear All Filters
              </Button>
              <div className="flex flex-wrap gap-2">
                {installerNameFilter && (
                  <Badge variant="secondary" className="text-xs">
                    Installer: {installerNameFilter}
                  </Badge>
                )}
                {deviceIdFilter && (
                  <Badge variant="secondary" className="text-xs font-mono">
                    Device: {deviceIdFilter}
                  </Badge>
                )}
                {teamIdFilter && (
                  <Badge variant="secondary" className="text-xs">
                    Team: {teams.find(t => t.id === teamIdFilter)?.name || teamIdFilter}
                  </Badge>
                )}
                {dateFilter && (
                  <Badge variant="secondary" className="text-xs">
                    Date: {format(new Date(dateFilter), "MMM d, yyyy")}
                  </Badge>
                )}
                {activeFilter !== 'all' && (
                  <Badge variant="secondary" className="text-xs">
                    {activeFilter === 'pending' ? 'Pending' : 
                     activeFilter === 'highVariance' ? 'High Variance' : 
                     activeFilter === 'withServerData' ? 'With Server Data' :
                     activeFilter === 'noServerData' ? 'No Server Data' :
                     activeFilter === 'preVerified' ? 'Pre-verified' :
                     activeFilter === 'verified' ? 'Verified' : ''}
                  </Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>


      {/* Verification Table - Hide if verified filter is active */}
      {activeFilter !== 'verified' && (
        <Card className="border shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-2xl font-bold">
                Pending Installations ({displayedItems.length > displayLimit ? `${paginatedDisplayedItems.length} of ` : ''}{displayedItems.length})
              </CardTitle>
              <Button
                variant="outline"
                className="flex items-center gap-2"
                onClick={handleCsvExport}
                disabled={displayedItems.length === 0}
              >
                <FileDown className="h-4 w-4" />
                Download CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {displayedItems.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
                <h3 className="text-lg font-semibold mb-2">All Caught Up!</h3>
                <p className="text-muted-foreground">
                  There are no installations pending verification at the moment.
                </p>
              </div>
            ) : (
            <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device ID</TableHead>
                    <TableHead>Input Method</TableHead>
                    <TableHead>Installer</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Installer Reading</TableHead>
                    <TableHead>Server Data</TableHead>
                    <TableHead>Variance</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedDisplayedItems.map((item) => {
                    const hasHighVariance = item.percentageDifference && item.percentageDifference > 5;
                    
                    return (
                      <TableRow key={item.installation.id} className={hasHighVariance ? "bg-red-50 dark:bg-red-950/10" : ""}>
                        <TableCell className="font-mono font-medium">{item.installation.deviceId}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize text-xs">
                            {item.installation.deviceInputMethod ? (item.installation.deviceInputMethod === 'qr' ? 'QR' : 'Manual') : 'Legacy'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span>{item.installation.installedByName}</span>
                            {item.installation.teamId && getTeamName(item.installation.teamId) && (
                              <Badge variant="outline" className="text-[10px] w-fit">
                                {getTeamName(item.installation.teamId)}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span>{item.installation.locationId || "-"}</span>
                            {(() => {
                              const locationId = item.installation.locationId ? String(item.installation.locationId).trim() : "";
                              const isLocation9999 = locationId === "9999";
                              const location = locationMap.get(locationId);
                              
                              // If location is 9999, use user-entered coordinates; otherwise use location coordinates
                              let displayLat: number | null = null;
                              let displayLon: number | null = null;
                              
                              if (isLocation9999) {
                                displayLat = item.installation.latitude ?? null;
                                displayLon = item.installation.longitude ?? null;
                              } else {
                                displayLat = location?.latitude ?? null;
                                displayLon = location?.longitude ?? null;
                              }
                              
                              return (displayLat != null && displayLon != null) ? (
                                <span className="text-xs text-muted-foreground">
                                  {displayLat.toFixed(6)}, {displayLon.toFixed(6)}
                                </span>
                              ) : null;
                            })()}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Gauge className="h-3 w-3 text-muted-foreground" />
                            {item.installation.sensorReading}
                          </div>
                        </TableCell>
                        <TableCell>
                          {item.serverData ? (
                            <div className="flex items-center gap-1">
                              <Gauge className="h-3 w-3 text-green-600" />
                              {item.serverData.sensorData}
                              {item.installation.latestDisTimestamp && (
                                <div className="text-[10px] text-muted-foreground ml-2">{item.installation.latestDisTimestamp}</div>
                              )}
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              <Minus className="h-3 w-3 mr-1" />
                              No Data
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {item.percentageDifference !== undefined ? (
                            <Badge 
                              variant="outline" 
                              className={hasHighVariance 
                                ? "text-red-600 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800" 
                                : "text-green-600 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"}
                            >
                              {hasHighVariance ? (
                                <TrendingUp className="h-3 w-3 mr-1" />
                              ) : (
                                <TrendingDown className="h-3 w-3 mr-1" />
                              )}
                              {item.percentageDifference.toFixed(2)}%
                            </Badge>
                          ) : (
                            "-"
                          )}
                          {!hasHighVariance && item.percentageDifference !== undefined && item.percentageDifference < 5 && (
                            <div className="text-[10px] text-green-600 mt-1 font-medium">Pre-verified by system</div>
                          )}
                          {!hasHighVariance && item.percentageDifference !== undefined && item.percentageDifference >= 5 && item.percentageDifference <= 10 && (
                            <div className="text-[10px] text-yellow-600 mt-1 font-medium">Needs manual review</div>
                          )}
                        </TableCell>
                        <TableCell>
                          {item.installation.createdAt 
                            ? format(item.installation.createdAt, "MMM d, HH:mm")
                            : "-"}
                        </TableCell>
                        <TableCell className="space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => viewDetails(item)}
                          >
                            Review
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={!!fetchingMap[item.installation.id]}
                            onClick={() => fetchLatestServerReadings(item.installation)}
                          >
                            {fetchingMap[item.installation.id] ? (
                              <>
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                Fetching
                              </>
                            ) : (item.installation.latestDisCm !== undefined && item.installation.latestDisCm !== null ? "Refresh Server Data" : "Fetch Server Readings")}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteClick(item)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            
            {displayedItems.length > displayLimit && (
              <div className="mt-6 pt-6 text-center border-t-2 border-dashed bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4">
                <p className="text-sm text-muted-foreground mb-3 font-medium">
                  Showing {paginatedDisplayedItems.length} of {displayedItems.length} installations
                </p>
                <Button variant="default" size="lg" onClick={handleShowMore} className="min-w-[250px] font-semibold shadow-md">
                  Show More ({displayedItems.length - paginatedDisplayedItems.length} remaining)
                </Button>
              </div>
            )}
            </>
            )}
        </CardContent>
      </Card>
      )}

      {/* Verified Installations Table - Show if verified filter is active or if no filter is active and there are verified installations */}
      {(activeFilter === 'verified' || (activeFilter === 'all' && verifiedInstallations.length > 0)) && (
        <Card className="border shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-2xl font-bold">
                Verified Installations ({displayedVerifiedItems.length > displayLimit ? `${paginatedVerifiedItems.length} of ` : ''}{displayedVerifiedItems.length})
              </CardTitle>
              <Button
                variant="outline"
                className="flex items-center gap-2"
                onClick={handleCsvExport}
                disabled={displayedVerifiedItems.length === 0 && displayedItems.length === 0}
              >
                <FileDown className="h-4 w-4" />
                Download CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {displayedVerifiedItems.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
                <h3 className="text-lg font-semibold mb-2">No Verified Installations Match Filters</h3>
                <p className="text-muted-foreground">
                  Try adjusting your filters to see more results.
                </p>
              </div>
            ) : (
              <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device ID</TableHead>
                      <TableHead>Input Method</TableHead>
                      <TableHead>Installer</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Installer Reading</TableHead>
                      <TableHead>Server Data</TableHead>
                      <TableHead>Variance</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Verified By</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedVerifiedItems.map((item) => {
                      const installation = item.installation;
                      const serverValue = installation.latestDisCm;
                      
                      let percentageDifference: number | undefined;
                      if (serverValue != null && installation.sensorReading != null) {
                        const diff = Math.abs(serverValue - installation.sensorReading);
                        percentageDifference = (diff / installation.sensorReading) * 100;
                      }

                      return (
                        <TableRow key={installation.id}>
                          <TableCell className="font-mono font-medium">{installation.deviceId}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize text-xs">
                              {installation.deviceInputMethod ? (installation.deviceInputMethod === 'qr' ? 'QR' : 'Manual') : 'Legacy'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <span>{installation.installedByName}</span>
                              {installation.teamId && getTeamName(installation.teamId) && (
                                <Badge variant="outline" className="text-[10px] w-fit">
                                  {getTeamName(installation.teamId)}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span>{installation.locationId || "-"}</span>
                              {(() => {
                                const locationId = installation.locationId ? String(installation.locationId).trim() : "";
                                const isLocation9999 = locationId === "9999";
                                const location = locationMap.get(locationId);
                                
                                // If location is 9999, use user-entered coordinates; otherwise use location coordinates
                                let displayLat: number | null = null;
                                let displayLon: number | null = null;
                                
                                if (isLocation9999) {
                                  displayLat = installation.latitude ?? null;
                                  displayLon = installation.longitude ?? null;
                                } else {
                                  displayLat = location?.latitude ?? null;
                                  displayLon = location?.longitude ?? null;
                                }
                                
                                return (displayLat != null && displayLon != null) ? (
                                  <span className="text-xs text-muted-foreground">
                                    {displayLat.toFixed(6)}, {displayLon.toFixed(6)}
                                  </span>
                                ) : null;
                              })()}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Gauge className="h-3 w-3 text-muted-foreground" />
                              {installation.sensorReading}
                            </div>
                          </TableCell>
                          <TableCell>
                            {serverValue !== undefined && serverValue !== null ? (
                              <div className="flex items-center gap-1">
                                <Gauge className="h-3 w-3 text-green-600" />
                                {serverValue}
                                {installation.latestDisTimestamp && (
                                  <div className="text-[10px] text-muted-foreground ml-2">{installation.latestDisTimestamp}</div>
                                )}
                              </div>
                            ) : (
                              <Badge variant="outline" className="text-xs">
                                <Minus className="h-3 w-3 mr-1" />
                                No Data
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {percentageDifference !== undefined ? (
                              <Badge 
                                variant="outline" 
                                className={percentageDifference > 5
                                  ? "text-red-600 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800" 
                                  : "text-green-600 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"}
                              >
                                {percentageDifference.toFixed(2)}%
                              </Badge>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="default" className="bg-green-600">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Verified
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <span className="text-sm text-muted-foreground">{installation.verifiedBy || "-"}</span>
                              {installation.verifiedBy && !installation.verifiedBy.startsWith("System") && (
                                (() => {
                                  const formattedDate = formatDateSafe(installation.verifiedAt, "MMM d, HH:mm");
                                  return formattedDate ? (
                                    <Badge variant="outline" className="text-[10px] w-fit">
                                      {formattedDate}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px] w-fit">
                                      Legacy
                                    </Badge>
                                  );
                                })()
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {installation.createdAt 
                              ? format(installation.createdAt, "MMM d, HH:mm")
                              : "-"}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteClick(item)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              
              {displayedVerifiedItems.length > displayLimit && (
                <div className="mt-6 pt-6 text-center border-t-2 border-dashed bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground mb-3 font-medium">
                    Showing {paginatedVerifiedItems.length} of {displayedVerifiedItems.length} installations
                  </p>
                  <Button variant="default" size="lg" onClick={handleShowMore} className="min-w-[250px] font-semibold shadow-md">
                    Show More ({displayedVerifiedItems.length - paginatedVerifiedItems.length} remaining)
                  </Button>
                </div>
              )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Verification Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) {
          setIsEditMode(false);
          setSelectedItem(null);
          setRejectReason("");
          setNewImageFile(null);
          setNewImagePreview(null);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Verify Installation</DialogTitle>
              {(userProfile?.isAdmin || userProfile?.role === "verifier") && !isEditMode && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditMode(true)}
                  disabled={processing}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              )}
            </div>
            {selectedItem?.installation.tags?.includes("edited by verifier") && (
              <Badge variant="secondary" className="mt-2 w-fit">
                Edited by Verifier
              </Badge>
            )}
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-6">
              {/* Variance Alert */}
              {selectedItem.percentageDifference && selectedItem.percentageDifference > 5 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>High Variance Detected</AlertTitle>
                  <AlertDescription>
                    The sensor reading variance is {selectedItem.percentageDifference.toFixed(2)}% which exceeds the 5% threshold.
                    Please review carefully before approving.
                  </AlertDescription>
                </Alert>
              )}

              {/* Data Comparison */}
              <div className="grid grid-cols-2 gap-6">
                {/* Installer Data */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Installer Data</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Badge variant="outline" className="capitalize text-xs">
                        {selectedItem.installation.deviceInputMethod ? (selectedItem.installation.deviceInputMethod === 'qr' ? 'QR' : 'Manual') : 'Legacy'}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Device ID</p>
                      {isEditMode ? (
                        <Input
                          value={editedDeviceId}
                          onChange={(e) => {
                            const value = e.target.value.toUpperCase();
                            setEditedDeviceId(value);
                          }}
                          className="mt-1 font-mono"
                          placeholder="Enter device ID"
                          type="text"
                        />
                      ) : (
                        <p className="text-base font-mono font-medium">{selectedItem.installation.deviceId}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Installer</p>
                      <div className="flex flex-col gap-1 mt-1">
                        <p className="text-base font-medium">{selectedItem.installation.installedByName}</p>
                        {selectedItem.installation.teamId && getTeamName(selectedItem.installation.teamId) && (
                          <Badge variant="outline" className="text-xs w-fit">
                            {getTeamName(selectedItem.installation.teamId)}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Location ID</p>
                      {isEditMode ? (
                        <Input
                          value={editedLocationId}
                          onChange={(e) => {
                            const value = e.target.value;
                            // Only allow numbers
                            if (value === '' || /^\d+$/.test(value)) {
                              setEditedLocationId(value);
                            }
                          }}
                          className="mt-1"
                          placeholder="Enter location ID (numbers only)"
                          type="text"
                          inputMode="numeric"
                          pattern="\d*"
                        />
                      ) : (
                        <p className="text-base font-medium flex items-center gap-1">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          {selectedItem.installation.locationId}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Sensor Reading</p>
                      {isEditMode ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={editedSensorReading}
                          onChange={(e) => setEditedSensorReading(e.target.value)}
                          className="mt-1 text-2xl font-bold"
                          placeholder="Enter sensor reading"
                        />
                      ) : (
                        <p className="text-2xl font-bold flex items-center gap-2">
                          <Gauge className="h-5 w-5 text-blue-600" />
                          {selectedItem.installation.sensorReading}
                        </p>
                      )}
                    </div>
                    {(() => {
                      const locationId = selectedItem.installation.locationId ? String(selectedItem.installation.locationId).trim() : "";
                      const isLocation9999 = locationId === "9999";
                      const location = locationMap.get(locationId);
                      
                      // If location is 9999, use user-entered coordinates; otherwise use location coordinates
                      let displayLat: number | null = null;
                      let displayLon: number | null = null;
                      let coordinateSource = "";
                      
                      if (isLocation9999) {
                        // For location 9999, use user-entered coordinates from installation
                        displayLat = selectedItem.installation.latitude ?? null;
                        displayLon = selectedItem.installation.longitude ?? null;
                        coordinateSource = displayLat != null && displayLon != null ? "User Entered" : "";
                      } else {
                        // For other locations, use coordinates from location relation
                        displayLat = location?.latitude ?? null;
                        displayLon = location?.longitude ?? null;
                        coordinateSource = displayLat != null && displayLon != null ? "From Location ID" : "";
                      }
                      
                      return (displayLat !== null || displayLon !== null || isEditMode) ? (
                        <div>
                          <p className="text-sm text-muted-foreground">
                            Coordinates
                            {coordinateSource && !isEditMode && (
                              <span className="ml-2 text-xs bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded">
                                {coordinateSource}
                              </span>
                            )}
                          </p>
                          {isEditMode ? (
                            <div className="grid grid-cols-2 gap-2 mt-1">
                              <div>
                                <Label htmlFor="latitude" className="text-xs">Latitude</Label>
                                <Input
                                  id="latitude"
                                  type="number"
                                  step="0.000001"
                                  value={editedLatitude}
                                  onChange={(e) => setEditedLatitude(e.target.value)}
                                  placeholder="Latitude"
                                />
                              </div>
                              <div>
                                <Label htmlFor="longitude" className="text-xs">Longitude</Label>
                                <Input
                                  id="longitude"
                                  type="number"
                                  step="0.000001"
                                  value={editedLongitude}
                                  onChange={(e) => setEditedLongitude(e.target.value)}
                                  placeholder="Longitude"
                                />
                              </div>
                            </div>
                          ) : (
                            <p className="text-base font-medium">
                              {displayLat != null && displayLon != null
                                ? `${displayLat.toFixed(6)}, ${displayLon.toFixed(6)}`
                                : "-"}
                            </p>
                          )}
                        </div>
                      ) : null;
                    })()}
                    <div>
                      <p className="text-sm text-muted-foreground">Submitted</p>
                      <p className="text-base font-medium flex items-center gap-1">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {selectedItem.installation.createdAt 
                          ? format(selectedItem.installation.createdAt, "MMM d, yyyy HH:mm")
                          : "-"}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Server Data */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Server Data</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedItem.serverData ? (
                      <>
                        <div>
                          <p className="text-sm text-muted-foreground">Device ID</p>
                          <p className="text-base font-mono font-medium">{selectedItem.serverData.deviceId}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Sensor Data</p>
                          <p className="text-2xl font-bold flex items-center gap-2">
                            <Gauge className="h-5 w-5 text-green-600" />
                            {selectedItem.serverData.sensorData}
                          </p>
                          {selectedItem.installation.latestDisTimestamp && (
                            <p className="text-xs text-muted-foreground mt-1">{selectedItem.installation.latestDisTimestamp}</p>
                          )}
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Received At</p>
                          <p className="text-base font-medium flex items-center gap-1">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {selectedItem.installation.latestDisTimestamp
                              ? selectedItem.installation.latestDisTimestamp
                              : (selectedItem.serverData.receivedAt
                                  ? format(selectedItem.serverData.receivedAt, "MMM d, yyyy HH:mm")
                                  : "-")}
                          </p>
                        </div>
                        {selectedItem.percentageDifference !== undefined && (
                          <div>
                            <p className="text-sm text-muted-foreground">Variance</p>
                            <p className={`text-2xl font-bold ${selectedItem.percentageDifference > 5 ? 'text-red-600' : 'text-green-600'}`}>
                              {selectedItem.percentageDifference.toFixed(2)}%
                            </p>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-center py-8">
                        <Minus className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-muted-foreground">No server data available yet</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Device Info */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Device Information</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Device UID</p>
                        <p className="text-base font-mono font-medium text-xs">{selectedItem.device.id}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Product ID</p>
                        <p className="text-base font-medium">{selectedItem.device.productId}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">IMEI</p>
                        <p className="text-base font-mono font-medium text-xs">{selectedItem.device.deviceImei}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">ICCID</p>
                        <p className="text-base font-mono font-medium text-xs">{selectedItem.device.iccid}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

              {/* Installation Images */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium">Installation Photos ({selectedItem.installation.imageUrls?.length || 0})</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {selectedItem.installation.imageUrls?.map((url, index) => (
                      <img
                        key={index}
                        src={url}
                        alt={`Installation photo ${index + 1}`}
                        className="w-full h-48 object-cover rounded-lg border cursor-zoom-in"
                        onClick={() => setImagePreviewUrl(url)}
                      />
                    ))}
                    {isEditMode && (
                      <div className="w-full h-48 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg hover:border-primary transition-colors cursor-pointer">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageSelect}
                          className="hidden"
                          id="additional-image-upload"
                          disabled={uploadingImage}
                        />
                        <label
                          htmlFor="additional-image-upload"
                          className="flex flex-col items-center justify-center w-full h-full cursor-pointer"
                        >
                          {newImagePreview ? (
                            <img
                              src={newImagePreview}
                              alt="New preview"
                              className="w-full h-full object-cover rounded-lg"
                            />
                          ) : (
                            <>
                              <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                              <p className="text-sm text-muted-foreground text-center px-2">
                                {uploadingImage ? "Uploading..." : "Add Photo"}
                              </p>
                            </>
                          )}
                        </label>
                      </div>
                    )}
                  </div>
                </div>
                
                {selectedItem.installation.videoUrl && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm font-medium">360° Video</p>
                    </div>
                    <video
                      src={selectedItem.installation.videoUrl}
                      controls
                      className="w-full h-64 object-cover rounded-lg border"
                    />
                  </div>
                )}
              </div>

              {/* Reject Reason */}
              <div>
                <Label htmlFor="rejectReason">Rejection Reason (Required if rejecting)</Label>
                <Textarea
                  id="rejectReason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Enter reason for flagging this installation..."
                  rows={3}
                  className="mt-2"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            {isEditMode ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditMode(false);
                    // Reset to original values
                    if (selectedItem) {
                      setEditedDeviceId(selectedItem.installation.deviceId || "");
                      setEditedSensorReading(selectedItem.installation.sensorReading.toString());
                      setEditedLocationId(selectedItem.installation.locationId || "");
                      setEditedLatitude(selectedItem.installation.latitude?.toString() || "");
                      setEditedLongitude(selectedItem.installation.longitude?.toString() || "");
                      setNewImageFile(null);
                      setNewImagePreview(null);
                    }
                  }}
                  disabled={processing}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleEdit}
                  disabled={processing || uploadingImage}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {(processing || uploadingImage) ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  {uploadingImage ? "Uploading..." : processing ? "Saving..." : "Save Changes"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={processing}
                >
                  {userProfile?.role === "manager" ? "Close" : "Cancel"}
                </Button>
                {(userProfile?.isAdmin || userProfile?.role === "verifier") && (
                  <>
                    <Button
                      variant="destructive"
                      onClick={handleReject}
                      disabled={processing}
                    >
                      {processing ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <XCircle className="h-4 w-4 mr-2" />
                      )}
                      Flag Installation
                    </Button>
                    <Button
                      onClick={handleApprove}
                      disabled={processing}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {processing ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                      )}
                      Approve Installation
                    </Button>
                  </>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Preview Lightbox */}
      <Dialog open={!!imagePreviewUrl} onOpenChange={(open) => !open && setImagePreviewUrl(null)}>
        <DialogContent className="max-w-[95vw] p-0">
          {imagePreviewUrl && (
            <img
              src={imagePreviewUrl}
              alt="Preview"
              className="max-w-[95vw] max-h-[90vh] object-contain mx-auto"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Confirmation Dialog */}
      <Dialog open={editConfirmDialogOpen} onOpenChange={setEditConfirmDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-600">
              <AlertCircle className="h-5 w-5" />
              Confirm Changes
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You are about to make the following changes to this installation:
            </p>
            <div className="border rounded-lg divide-y max-h-[400px] overflow-y-auto">
              {pendingChanges.map((change, index) => (
                <div key={index} className="p-4 space-y-2">
                  <div className="font-semibold text-sm text-foreground">{change.field}</div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground font-medium">Old Value</div>
                      <div className="text-sm p-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded font-mono">
                        {change.oldValue}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground font-medium">New Value</div>
                      <div className="text-sm p-2 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded font-mono">
                        {change.newValue}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Alert className="bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-900 dark:text-yellow-100">
                Original values will be preserved in version history. This action can be tracked but not automatically undone.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditConfirmDialogOpen(false);
                setPendingChanges([]);
              }}
              disabled={processing || uploadingImage}
            >
              Cancel
            </Button>
            <Button
              onClick={handleEditConfirmed}
              disabled={processing || uploadingImage}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {(processing || uploadingImage) ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {uploadingImage ? "Uploading..." : "Saving..."}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Confirm Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Delete Installation
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to permanently delete this installation? This action cannot be undone.
            </p>
            {itemToDelete && (
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold">Device ID:</span>
                  <span className="font-mono text-sm">{itemToDelete.installation.deviceId}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold">Location ID:</span>
                  <span className="text-sm">{itemToDelete.installation.locationId || "-"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold">Installer:</span>
                  <span className="text-sm">{itemToDelete.installation.installedByName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold">Submitted:</span>
                  <span className="text-sm">
                    {itemToDelete.installation.createdAt 
                      ? format(itemToDelete.installation.createdAt, "MMM d, yyyy HH:mm")
                      : "-"}
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setItemToDelete(null);
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Permanently
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

