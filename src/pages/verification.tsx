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
  Package,
  RefreshCw,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { Installation, Device, ServerData, VerificationItem, Team } from "@/lib/types";
import { format } from "date-fns";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { translateTeamNameToArabic } from "@/lib/amanah-translations";

export default function Verification() {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [allInstallations, setAllInstallations] = useState<Installation[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [locations, setLocations] = useState<{ id: string; locationId: string; latitude: number; longitude: number; municipalityName?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<VerificationItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [fetchingMap, setFetchingMap] = useState<Record<string, boolean>>({});
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshDialogOpen, setRefreshDialogOpen] = useState(false);
  const [refreshTargets, setRefreshTargets] = useState<Installation[]>([]);
  const [refreshStatuses, setRefreshStatuses] = useState<Record<string, "pending" | "success" | "error" | "skipped">>({});
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  // Set initial filter based on role - managers should only see escalated items
  const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'highVariance' | 'withServerData' | 'noServerData' | 'preVerified' | 'verified' | 'flagged' | 'escalated'>(
    userProfile?.role === "manager" && !userProfile?.isAdmin ? 'escalated' : 'all'
  );
  
  // Filter states
  const [installerNameFilter, setInstallerNameFilter] = useState<string>("");
  const [teamIdFilter, setTeamIdFilter] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [deviceIdFilter, setDeviceIdFilter] = useState<string>("");
  const [displayLimit, setDisplayLimit] = useState(500);
  const [exportDate, setExportDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [autoServerFetchEnabled, setAutoServerFetchEnabled] = useState(true);
  
  // Edit mode states
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedDeviceId, setEditedDeviceId] = useState<string>("");
  const [editedSensorReading, setEditedSensorReading] = useState<string>("");
  const [editedLocationId, setEditedLocationId] = useState<string>("");
  const [editedLatitude, setEditedLatitude] = useState<string>("");
  const [editedLongitude, setEditedLongitude] = useState<string>("");
  const [newImageFiles, setNewImageFiles] = useState<File[]>([]);
  const [newImagePreviews, setNewImagePreviews] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [deletedImageUrls, setDeletedImageUrls] = useState<string[]>([]);

  // Delete states
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<VerificationItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Edit confirmation states
  const [editConfirmDialogOpen, setEditConfirmDialogOpen] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Array<{field: string, oldValue: string, newValue: string}>>([]);
  const [verifyAfterEdit, setVerifyAfterEdit] = useState(false);
  const [escalateDialogOpen, setEscalateDialogOpen] = useState(false);
  const [escalateReason, setEscalateReason] = useState("");

  // Auto-set filter to escalated for managers (cannot be changed)
  useEffect(() => {
    if (userProfile?.role === "manager" && !userProfile?.isAdmin && activeFilter !== 'escalated') {
      setActiveFilter('escalated');
    }
  }, [userProfile, activeFilter]);

  // Real-time installations listener (pending verification)
  useEffect(() => {
    if (!userProfile?.isAdmin && userProfile?.role !== "verifier" && userProfile?.role !== "manager") return;

    // Fetch installations
    // - Admins: All installations
    // - Managers: All installations (to see escalated items from any team)
    // - Verifiers: Filter by team
    const installationsQuery = (userProfile.isAdmin || userProfile.role === "manager")
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
          const docData = d.data() as any;
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
            municipalityName: docData.municipalityName || undefined,
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

  // Create a map of locationId -> coordinates & municipality
  const locationMap = useMemo(() => {
    const map = new Map<string, { id: string; locationId: string; latitude: number; longitude: number; municipalityName?: string }>();
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

  // Installations filtered by sidebar filters (installer, device, team, date) for dashboard stats
  const filteredAllInstallations = useMemo(() => {
    let filtered = allInstallations;

    if (installerNameFilter) {
      filtered = filtered.filter((inst) =>
        inst.installedByName?.toLowerCase().includes(installerNameFilter.toLowerCase())
      );
    }

    if (deviceIdFilter) {
      filtered = filtered.filter((inst) =>
        inst.deviceId?.toUpperCase().includes(deviceIdFilter.toUpperCase())
      );
    }

    if (teamIdFilter && userProfile?.isAdmin) {
      filtered = filtered.filter((inst) => inst.teamId === teamIdFilter);
    }

    if (dateFilter) {
      const filterDate = new Date(dateFilter);
      filterDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(filterDate);
      nextDay.setDate(nextDay.getDate() + 1);

      filtered = filtered.filter((inst) => {
        if (!inst.createdAt) return false;
        const installDate = new Date(inst.createdAt);
        installDate.setHours(0, 0, 0, 0);
        return installDate >= filterDate && installDate < nextDay;
      });
    }

    return filtered;
  }, [allInstallations, installerNameFilter, deviceIdFilter, teamIdFilter, dateFilter, userProfile?.isAdmin]);

  const dashboardStats = useMemo(() => {
    const total = filteredAllInstallations.length;
    const installed = total; // every installation in the database represents an installed device
    const connectedWithServer = filteredAllInstallations.filter(
      (i) => i.latestDisCm != null
    ).length;
    const noConnection = filteredAllInstallations.filter(
      (i) => i.latestDisCm == null
    ).length;
    const editedRecords = filteredAllInstallations.filter((i) =>
      i.tags?.includes("edited by verifier")
    ).length;
    const systemPreApproved = filteredAllInstallations.filter(
      (i) => i.systemPreVerified === true
    ).length;

    const verifiedAll = filteredAllInstallations.filter(
      (i) => i.status === "verified"
    );
    const verifiedAuto = verifiedAll.filter(
      (i) =>
        i.systemPreVerified === true ||
        (i.verifiedBy && i.verifiedBy.toLowerCase().includes("system"))
    ).length;
    const verifiedManual = verifiedAll.length - verifiedAuto;

    return {
      total,
      installed,
      connectedWithServer,
      noConnection,
      editedRecords,
      verifiedAuto,
      verifiedManual,
      systemPreApproved,
    };
  }, [filteredAllInstallations]);

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
    } else if (activeFilter === 'flagged') {
      filtered = verificationItems.filter(i => i.installation.status === "flagged");
    } else if (activeFilter === 'escalated') {
      filtered = verificationItems.filter(i => i.installation.tags?.includes("escalated to manager"));
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
    // Only show verified items if 'verified', 'all', or 'noServerData' filter is active
    if (
      activeFilter !== 'verified' &&
      activeFilter !== 'all' &&
      activeFilter !== 'noServerData'
    ) {
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
    setNewImageFiles([]);
    setNewImagePreviews([]);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (!files.length) return;

    const MAX_NEW_IMAGES = 3;
    const remainingSlots = Math.max(0, MAX_NEW_IMAGES - newImageFiles.length);

    if (remainingSlots === 0) {
      toast({
        variant: "destructive",
        title: "Image limit reached",
        description: "You can add up to 3 new photos per edit.",
      });
      return;
    }

    const validFiles: File[] = [];
    const previews: string[] = [];

    files.forEach((file) => {
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast({
          variant: "destructive",
          title: "File too large",
          description: `${file.name} exceeds 10MB. Please select a smaller image.`,
        });
        return;
      }
      if (!file.type.startsWith('image/')) {
        toast({
          variant: "destructive",
          title: "Invalid file type",
          description: `${file.name} is not an image.`,
        });
        return;
      }
      validFiles.push(file);
      previews.push(URL.createObjectURL(file));
    });

    if (validFiles.length === 0) return;

    const limitedFiles = validFiles.slice(0, remainingSlots);
    const limitedPreviews = previews.slice(0, remainingSlots);

    if (validFiles.length > remainingSlots) {
      toast({
        variant: "destructive",
        title: "Image limit reached",
        description: "Only the first 3 new photos were added.",
      });
    }

    setNewImageFiles(prev => [...prev, ...limitedFiles]);
    setNewImagePreviews(prev => [...prev, ...limitedPreviews]);
  };

  // Box opening is handled on the dedicated Open Boxes page

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

  const handleUnverify = async () => {
    if (!selectedItem || !userProfile) return;

    setProcessing(true);
    try {
      const filteredTags = (selectedItem.installation.tags || []).filter(
        (tag) => tag !== "escalated to manager"
      );

      await updateDoc(doc(db, "installations", selectedItem.installation.id), {
        status: "pending",
        verifiedBy: null,
        verifiedAt: null,
        flaggedReason: null,
        updatedAt: serverTimestamp(),
        tags: filteredTags,
      });

      await updateDoc(doc(db, "devices", selectedItem.installation.deviceId), {
        status: "installed",
        updatedAt: serverTimestamp(),
      });

      toast({
        title: "Installation Unverified",
        description: "Status set back to pending for re-review.",
      });

      setDialogOpen(false);
      setSelectedItem(null);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Unverify Failed",
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
    
    if (newImageFiles.length > 0) {
      changes.push({
        field: "Image",
        oldValue: "Current images",
        newValue: `Add ${newImageFiles.length} new image${newImageFiles.length > 1 ? "s" : ""}`
      });
    }

    if (deletedImageUrls.length > 0) {
      changes.push({
        field: "Images",
        oldValue: `${originalInstallation.imageUrls?.length || 0} images`,
        newValue: `${(originalInstallation.imageUrls?.length || 0) - deletedImageUrls.length} images (${deletedImageUrls.length} deleted)`
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

      // Handle image deletions and additions
      const currentImageUrls = originalInstallation.imageUrls || [];
      let updatedImageUrls = currentImageUrls.filter(url => !deletedImageUrls.includes(url));
      
      // Upload new images (support multiple additions)
      if (newImageFiles.length > 0) {
        setUploadingImage(true);
        try {
          const storage = getStorage();
          for (const file of newImageFiles) {
            const timestamp = Date.now();
            const imageRef = storageRef(storage, `installations/${selectedItem.installation.id}/additional_${timestamp}_${file.name}`);
            await uploadBytes(imageRef, file);
            const imageUrl = await getDownloadURL(imageRef);
            
            // Add new image URL to filtered array
            updatedImageUrls = [...updatedImageUrls, imageUrl];
          }
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
      
      // Update imageUrls if there were any changes
      if (deletedImageUrls.length > 0 || newImageFiles.length > 0) {
        updateData.imageUrls = updatedImageUrls;
      }

      // Update installation with edited values, versioned originals, and tag
      await updateDoc(doc(db, "installations", selectedItem.installation.id), updateData);

      // If verifyAfterEdit is true and installation is flagged/escalated, verify it (for admins and managers)
      const isEscalated = selectedItem.installation.tags?.includes("escalated to manager");
      const isFlagged = selectedItem.installation.status === "flagged";
      
      if (verifyAfterEdit && (isFlagged || isEscalated)) {
        // Get existing tags and remove escalated tag if present
        const existingTags = selectedItem.installation.tags || [];
        const updatedTags = existingTags.filter(tag => tag !== "escalated to manager");
        
        await updateDoc(doc(db, "installations", selectedItem.installation.id), {
          status: "verified",
          verifiedBy: userProfile.displayName,
          verifiedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          flaggedReason: null, // Clear the flag reason since we're verifying
          tags: updatedTags, // Remove escalated tag
        });

        // Update device status
        await updateDoc(doc(db, "devices", selectedItem.installation.deviceId), {
          status: "verified",
          updatedAt: serverTimestamp(),
        });

        toast({
          title: "Installation Updated and Verified",
          description: "The installation has been updated and verified. The installer can now proceed.",
        });

        setDialogOpen(false);
        setSelectedItem(null);
      } else {
        toast({
          title: "Installation Updated",
          description: newImageFiles.length > 0 
            ? `The installation has been successfully updated with version history and ${newImageFiles.length} new image${newImageFiles.length > 1 ? "s" : ""}.`
            : "The installation has been successfully updated with version history.",
        });
      }

      setIsEditMode(false);
      setVerifyAfterEdit(false);
      setNewImageFiles([]);
      setNewImagePreviews([]);
      setDeletedImageUrls([]);
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
      // Get existing tags or initialize empty array
      const existingTags = selectedItem.installation.tags || [];
      const tagsToUpdate = [...existingTags];
      
      // Remove escalated tag if present (reset escalation on new flag)
      const filteredTags = tagsToUpdate.filter(tag => tag !== "escalated to manager");

      // Update installation status
      await updateDoc(doc(db, "installations", selectedItem.installation.id), {
        status: "flagged",
        flaggedReason: rejectReason.trim(),
        verifiedBy: userProfile.displayName,
        verifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        tags: filteredTags,
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

  const handleEscalate = async () => {
    if (!selectedItem || !userProfile || !escalateReason.trim()) {
      toast({
        variant: "destructive",
        title: "Reason Required",
        description: "Please provide a reason for escalation.",
      });
      return;
    }

    setProcessing(true);
    try {
      // Get existing tags or initialize empty array
      const existingTags = selectedItem.installation.tags || [];
      const tagsToUpdate = [...existingTags];
      
      // Add "escalated to manager" tag if not already present
      if (!tagsToUpdate.includes("escalated to manager")) {
        tagsToUpdate.push("escalated to manager");
      }

      // Update installation with escalation tag and reason
      await updateDoc(doc(db, "installations", selectedItem.installation.id), {
        tags: tagsToUpdate,
        escalatedBy: userProfile.displayName,
        escalatedAt: serverTimestamp(),
        escalateReason: escalateReason.trim(),
        updatedAt: serverTimestamp(),
      });

      toast({
        title: "Installation Escalated",
        description: "The installation has been escalated to a manager for review.",
      });

      setEscalateDialogOpen(false);
      setEscalateReason("");
      setDialogOpen(false);
      setSelectedItem(null);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Escalation Failed",
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

  const downloadCsv = (rowsData: string[][], filename: string, headers?: string[]) => {
    const csvRows = headers ? [headers, ...rowsData] : rowsData;
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

      // Coordinates: if locationId is 9999, use installer-entered coords; otherwise use Firestore location coords
      let latitude: number | null = null;
      let longitude: number | null = null;
      if (rawLocationId === "9999") {
        latitude = installation?.latitude ?? null;
        longitude = installation?.longitude ?? null;
      } else {
        latitude = location?.latitude ?? null;
        longitude = location?.longitude ?? null;
      }
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

    downloadCsv(csvRows, "verification-installations.csv", ["Device ID", "Amanah", "Location ID", "Coordinates", "Sensor Reading"]);

    toast({
      title: "CSV downloaded",
      description: `Exported ${itemsToExport.length} installation${itemsToExport.length === 1 ? "" : "s"}.`,
    });
  };

  const handleDailyCsvPrompt = () => {
    const defaultValue = exportDate || format(new Date(), "yyyy-MM-dd");
    const input = window.prompt("Enter date for CSV (YYYY-MM-DD)", defaultValue);
    if (!input) return;
    handleDailyCsvExport(input);
  };

  const handleDailyCsvExport = (selectedDate?: string) => {
    const targetDate = selectedDate?.trim() || exportDate;
    if (!targetDate) {
      toast({
        title: "Select a date",
        description: "Please choose a date to generate the CSV.",
      });
      return;
    }
    setExportDate(targetDate);

    const start = new Date(targetDate);
    if (isNaN(start.getTime())) {
      toast({
        variant: "destructive",
        title: "Invalid date",
        description: "Please select a valid date.",
      });
      return;
    }
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const installationsForDate = allInstallations.filter((inst) => {
      if (!inst.createdAt) return false;
      const created = inst.createdAt instanceof Date ? inst.createdAt : new Date(inst.createdAt);
      if (isNaN(created.getTime())) return false;
      return created >= start && created < end;
    });

    if (installationsForDate.length === 0) {
      toast({
        title: "No installations found",
        description: "There are no installations for the selected date.",
      });
      return;
    }

    const rows = installationsForDate.map((inst) => {
      const locationId = inst.locationId ? String(inst.locationId).trim() : "";
      const isLocation9999 = locationId === "9999";
      const location = locationId ? locationMap.get(locationId) : undefined;

      let latitude: number | null = null;
      let longitude: number | null = null;
      if (isLocation9999) {
        latitude = inst.latitude ?? null;
        longitude = inst.longitude ?? null;
      } else if (location) {
        latitude = location.latitude;
        longitude = location.longitude;
      }

      const coordinates =
        latitude != null && longitude != null ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}` : "-";
      const googleMapsUrl =
        latitude != null && longitude != null
          ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
          : "-";

      const installerReading = inst.sensorReading != null ? inst.sensorReading.toString() : "-";
      const serverReading = inst.latestDisCm != null ? inst.latestDisCm.toString() : "-";
      const hasInstallerReading = typeof inst.sensorReading === "number" && inst.sensorReading !== 0;
      const variance =
        inst.latestDisCm != null && hasInstallerReading
          ? (Math.abs(inst.latestDisCm - inst.sensorReading!) / Math.abs(inst.sensorReading!)) * 100
          : null;

      const teamName = inst.teamId ? getTeamName(inst.teamId) : null;
      const amanahArabic = translateTeamNameToArabic(teamName);

      const latestTimestamp = inst.latestDisTimestamp as Date | string | undefined;
      const serverDataTime = latestTimestamp
        ? formatDateSafe(
            latestTimestamp instanceof Date ? latestTimestamp : new Date(latestTimestamp),
            "MMM d, yyyy HH:mm"
          ) || "-"
        : "-";

      return [
        inst.deviceId,
        inst.installedByName || "-",
        amanahArabic ?? teamName ?? "-",
        teamName ?? "-",
        locationId || "-",
        coordinates,
        googleMapsUrl,
        inst.deviceInputMethod ? inst.deviceInputMethod.toUpperCase() : "-",
        installerReading,
        serverReading,
        variance != null ? `${variance.toFixed(2)}%` : "-",
        inst.status,
        inst.createdAt ? format(inst.createdAt, "MMM d, yyyy HH:mm") : "-",
        serverDataTime,
      ];
    });

    downloadCsv(rows, `installations-${targetDate}.csv`, [
      "Device ID",
      "Installer",
      "Amanah (Arabic / English)",
      "Team Name",
      "Location ID",
      "Coordinates",
      "Google Maps URL",
      "Input Method",
      "Installer Reading",
      "Server Reading",
      "Variance %",
      "Status",
      "Submitted At",
      "Server Data Time",
    ]);

    toast({
      title: "Daily CSV downloaded",
      description: `Exported ${installationsForDate.length} installation${installationsForDate.length === 1 ? "" : "s"} for ${format(start, "MMM d, yyyy")}.`,
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

  const refreshAllServerData = async () => {
    if (refreshingAll) return;
    
    setRefreshingAll(true);
    
    // Filter installations: only refresh if server data is missing or older than 5 days
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - 5);
    
    const installationsToRefresh = allInstallations.filter((installation) => {
      // If no server data, include it
      if (!installation.latestDisCm && !installation.latestDisTimestamp && !installation.serverRefreshedAt) {
        return true;
      }
      
      // If we have serverRefreshedAt, check if it's older than cutoff
      if (installation.serverRefreshedAt) {
        const refreshedDate = new Date(installation.serverRefreshedAt);
        refreshedDate.setHours(0, 0, 0, 0);
        // Only refresh if older than cutoff
        if (refreshedDate.getTime() < cutoff.getTime()) {
          return true;
        }
      }
      
      // If we have latestDisTimestamp, check if it's older than cutoff
      if (installation.latestDisTimestamp) {
        try {
          const timestampDate = new Date(installation.latestDisTimestamp);
          timestampDate.setHours(0, 0, 0, 0);
          // Only refresh if older than cutoff
          if (timestampDate.getTime() < cutoff.getTime()) {
            return true;
          }
        } catch {
          // If we can't parse the timestamp, refresh it
          return true;
        }
      }
      
      // If we have latestDisCm but no timestamp, refresh it to get the timestamp
      if (installation.latestDisCm && !installation.latestDisTimestamp) {
        return true;
      }
      
      // Default: don't refresh if we have data but can't determine date
      return false;
    });
    
    if (installationsToRefresh.length === 0) {
      toast({
        title: "No Installations to Refresh",
        description: "All installations already have today's server data.",
      });
      setRefreshingAll(false);
      return;
    }
    
    toast({
      title: "Refreshing Server Data",
      description: `Refreshing ${installationsToRefresh.length} of ${allInstallations.length} installations (missing or older than 5 days).`,
    });

    // Open dialog and set pending statuses
    const pendingStatuses: Record<string, "pending" | "success" | "error" | "skipped"> = {};
    installationsToRefresh.forEach(inst => {
      pendingStatuses[inst.id] = "pending";
    });
    setRefreshTargets(installationsToRefresh);
    setRefreshStatuses(pendingStatuses);
    setRefreshDialogOpen(true);

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    // Send all requests at once for speed
    await Promise.all(
      installationsToRefresh.map(async (installation) => {
      if (!installation.deviceId) {
        skippedCount++;
        setRefreshStatuses(prev => ({ ...prev, [installation.id]: "skipped" }));
          return;
      }

      try {
        const apiResponse = await fetch(
          `https://op1.smarttive.com/device/${installation.deviceId.toUpperCase()}`,
          {
            method: 'GET',
            headers: {
              'X-API-KEY': import.meta.env.VITE_API_KEY || ''
            }
          }
        );

        if (apiResponse.status === 404) {
          await updateDoc(doc(db, "installations", installation.id), {
            serverRefreshedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          skippedCount++;
          setRefreshStatuses(prev => ({ ...prev, [installation.id]: "skipped" }));
            return;
        }

        if (!apiResponse.ok) {
          errorCount++;
          setRefreshStatuses(prev => ({ ...prev, [installation.id]: "error" }));
            return;
        }

        const apiData = await apiResponse.json();
        const latestRecord = apiData?.records?.[0];
        const latestDistance = latestRecord?.dis_cm ?? null;

        // Consider null or 0 as "no server data yet"
        const hasServerData = latestDistance !== null && Number(latestDistance) > 0;
        const hasSensor = !!installation.sensorReading;
        const variancePct = (hasServerData && hasSensor)
          ? (Math.abs(latestDistance - installation.sensorReading) / installation.sensorReading) * 100
          : undefined;

        if (hasServerData) {
          // Update with server data, but don't change status for verified/system-approved installations
          const updateData: any = {
            latestDisCm: latestDistance,
            latestDisTimestamp: latestRecord?.timestamp ?? null,
            serverRefreshedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

          // Only update systemPreVerified for pending installations
          if (installation.status === "pending") {
            const preVerified = variancePct !== undefined && variancePct < 5;
            updateData.systemPreVerified = preVerified;
            updateData.systemPreVerifiedAt = preVerified ? serverTimestamp() : null;

            // Auto-reject pending installations with high variance
            if (variancePct !== undefined && variancePct > 10) {
              updateData.status = "flagged";
              updateData.flaggedReason = `Auto-rejected: variance ${variancePct.toFixed(2)}% > 10%`;
              updateData.verifiedBy = "System (Auto-rejected)";
              updateData.verifiedAt = serverTimestamp();
              
              await updateDoc(doc(db, "devices", installation.deviceId), {
                status: "flagged",
                updatedAt: serverTimestamp(),
              });
            }
          }

          await updateDoc(doc(db, "installations", installation.id), updateData);
          successCount++;
          setRefreshStatuses(prev => ({ ...prev, [installation.id]: "success" }));
        } else {
          // No valid server data, still mark refresh attempt
          await updateDoc(doc(db, "installations", installation.id), {
            serverRefreshedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          skippedCount++;
          setRefreshStatuses(prev => ({ ...prev, [installation.id]: "skipped" }));
        }
      } catch (error) {
        console.error(`Failed to refresh installation ${installation.id}:`, error);
        errorCount++;
        setRefreshStatuses(prev => ({ ...prev, [installation.id]: "error" }));
      }
      })
    );

    toast({
      title: "Refresh Complete",
      description: `Success: ${successCount}, Errors: ${errorCount}, Skipped: ${skippedCount}`,
    });

    setRefreshingAll(false);
  };

  // Auto-refresh every 24h for high variance and no-data items (best-effort while page is open)
  const inFlightAuto = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!autoServerFetchEnabled) return;

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
  }, [verificationItems, autoServerFetchEnabled]);

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
      {/* Refresh Queue Dialog */}
      <Dialog open={refreshDialogOpen} onOpenChange={setRefreshDialogOpen}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Refresh Queue
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Showing installations being refreshed (missing data or older than 5 days).
            </p>
          </DialogHeader>
          <div className="max-h-[420px] overflow-y-auto space-y-3">
            {refreshTargets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No refreshes in progress.</p>
            ) : (
              refreshTargets.map((inst) => {
                const status = refreshStatuses[inst.id] || "pending";
                return (
                  <div
                    key={inst.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                  >
                    <div className="flex flex-col">
                      <span className="font-mono text-sm font-semibold">{inst.deviceId || "Unknown Device"}</span>
                      <span className="text-xs text-muted-foreground">{inst.locationId || "-"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {status === "pending" && (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                          <span className="text-xs text-blue-600">Fetching…</span>
                        </>
                      )}
                      {status === "success" && (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          <span className="text-xs text-green-700">Updated</span>
                        </>
                      )}
                      {status === "skipped" && (
                        <>
                          <Minus className="h-4 w-4 text-amber-600" />
                          <span className="text-xs text-amber-700">Skipped</span>
                        </>
                      )}
                      {status === "error" && (
                        <>
                          <XCircle className="h-4 w-4 text-red-600" />
                          <span className="text-xs text-red-700">Error</span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <DialogFooter className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {refreshingAll ? "Refreshing in progress…" : "Refresh completed."}
            </div>
            <Button variant="outline" onClick={() => setRefreshDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
          {userProfile?.role === "manager" && !userProfile?.isAdmin ? "Escalated Verifications" : "Verification Queue"}
        </h1>
        <p className="text-muted-foreground mt-2">
          {userProfile?.role === "manager" && !userProfile?.isAdmin 
            ? "Review installations escalated by verifiers" 
            : "Review and verify installation submissions"}
        </p>
      </div>

      {/* Filters Section (now before stats; stats react to filters) */}
      <Card className="border shadow-sm">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Auto server fetch</span>
            <Switch
              checked={autoServerFetchEnabled}
              onCheckedChange={setAutoServerFetchEnabled}
            />
          </div>
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
          {(installerNameFilter || deviceIdFilter || teamIdFilter || dateFilter || (activeFilter !== 'all' && !(userProfile?.role === "manager" && !userProfile?.isAdmin))) && (
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setInstallerNameFilter("");
                  setDeviceIdFilter("");
                  setTeamIdFilter("");
                  setDateFilter("");
                  if (userProfile?.role === "manager" && !userProfile?.isAdmin) {
                    // Managers should stay on escalated filter
                    setActiveFilter('escalated');
                  } else {
                    setActiveFilter('all');
                  }
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
                {(activeFilter !== 'all' || (userProfile?.role === "manager" && !userProfile?.isAdmin)) && (
                  <Badge variant="secondary" className="text-xs">
                    {activeFilter === 'pending' ? 'Pending' : 
                     activeFilter === 'highVariance' ? 'High Variance' : 
                     activeFilter === 'withServerData' ? 'With Server Data' :
                     activeFilter === 'noServerData' ? 'No Server Data' :
                     activeFilter === 'preVerified' ? 'Pre-verified' :
                     activeFilter === 'verified' ? 'Verified' :
                     activeFilter === 'flagged' ? 'Flagged' :
                     activeFilter === 'escalated' ? 'Escalated to Manager' : 
                     (userProfile?.role === "manager" && !userProfile?.isAdmin) ? 'Escalated to Manager' : ''}
                  </Badge>
                )}
              </div>
            </div>
          )}

        </CardContent>
      </Card>

      {/* Stats Overview based on filtered installations */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="border shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Total in Database</p>
                <p className="text-3xl font-bold mt-1">
                  {dashboardStats.total}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center">
                <Database className="h-6 w-6 text-slate-700 dark:text-slate-200" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Installed</p>
                <p className="text-3xl font-bold mt-1">
                  {dashboardStats.installed}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-green-100 dark:bg-green-950 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Connected with Server</p>
                <p className="text-3xl font-bold mt-1 text-green-600">
                  {dashboardStats.connectedWithServer}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                <Gauge className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">No Connection Established</p>
                <p className="text-3xl font-bold mt-1 text-orange-600">
                  {dashboardStats.noConnection}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-orange-100 dark:bg-orange-950 flex items-center justify-center">
                <CloudOff className="h-6 w-6 text-orange-600 dark:text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Edited Records</p>
                <p className="text-3xl font-bold mt-1 text-purple-600">
                  {dashboardStats.editedRecords}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-purple-100 dark:bg-purple-950 flex items-center justify-center">
                <Edit className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">System Pre-approved</p>
                <p className="text-3xl font-bold mt-1 text-emerald-600">
                  {dashboardStats.systemPreApproved}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Verified (manual only)</p>
                <p className="text-2xl md:text-3xl font-bold mt-1 text-emerald-600">
                  {dashboardStats.verifiedManual}
                  <span className="ml-1 text-xs md:text-sm text-muted-foreground">manual</span>
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center">
                <CircleCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      {/* Verification Table - Hide if verified filter is active */}
      {activeFilter !== 'verified' && (
        <Card className="border shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-2xl font-bold">
                {userProfile?.role === "manager" && !userProfile?.isAdmin 
                  ? `Escalated Installations (${displayedItems.length > displayLimit ? `${paginatedDisplayedItems.length} of ` : ''}${displayedItems.length})`
                  : `Pending Installations (${displayedItems.length > displayLimit ? `${paginatedDisplayedItems.length} of ` : ''}${displayedItems.length})`}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="flex items-center gap-2"
                  onClick={refreshAllServerData}
                  disabled={refreshingAll || allInstallations.length === 0}
                >
                  {refreshingAll ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Refreshing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Refresh All Server Data
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  className="flex items-center gap-2"
                  onClick={() => setRefreshDialogOpen(true)}
                  disabled={refreshTargets.length === 0}
                >
                  <Database className="h-4 w-4" />
                  View Refresh Queue
                </Button>
                <Button
                  variant="outline"
                  className="flex items-center gap-2"
                  onClick={handleCsvExport}
                  disabled={displayedItems.length === 0}
                >
                  <FileDown className="h-4 w-4" />
                  Download CSV
                </Button>
                <Button
                  onClick={handleDailyCsvPrompt}
                  type="button"
                >
                  CSV by Date
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {displayedItems.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
                <h3 className="text-lg font-semibold mb-2">
                  {userProfile?.role === "manager" && !userProfile?.isAdmin 
                    ? "No Escalated Installations" 
                    : "All Caught Up!"}
                </h3>
                <p className="text-muted-foreground">
                  {userProfile?.role === "manager" && !userProfile?.isAdmin
                    ? "There are no installations escalated for review at the moment."
                    : "There are no installations pending verification at the moment."}
                </p>
              </div>
            ) : (
            <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device</TableHead>
                    <TableHead>Installer</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Installer Reading</TableHead>
                    <TableHead>Server Data</TableHead>
                    <TableHead>Variance</TableHead>
                    <TableHead>Amanah / Municipality</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedDisplayedItems.map((item) => {
                    const hasHighVariance = item.percentageDifference && item.percentageDifference > 5;
                    
                    return (
                      <TableRow key={item.installation.id} className={hasHighVariance ? "bg-red-50 dark:bg-red-950/10" : ""}>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="font-mono font-medium">
                              {item.installation.deviceId}
                            </span>
                            <div className="flex flex-wrap gap-1">
                              <Badge variant="outline" className="capitalize text-[10px]">
                                {item.installation.deviceInputMethod
                                  ? item.installation.deviceInputMethod === "qr"
                                    ? "QR"
                                    : "Manual"
                                  : "Data entry"}
                              </Badge>
                              {item.installation.tags?.includes("edited by verifier") && (
                                <Badge variant="secondary" className="text-[10px]">
                                  Edited
                                </Badge>
                              )}
                            </div>
                          </div>
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
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1">
                              <Gauge className="h-3 w-3 text-muted-foreground" />
                              {item.installation.sensorReading}
                            </div>
                            {item.installation.createdAt && (
                              <span className="text-[10px] text-muted-foreground">
                                {format(item.installation.createdAt, "MMM d, HH:mm")}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {item.serverData ? (() => {
                            let fetchedAtLabel: string | null = null;
                            const ts = item.installation.latestDisTimestamp as any;
                            if (ts) {
                              const maybeDate = ts instanceof Date ? ts : new Date(ts);
                              const formatted = formatDateSafe(maybeDate, "MMM d, HH:mm");
                              fetchedAtLabel = formatted;
                            }
                            return (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1">
                                  <Gauge className="h-3 w-3 text-green-600" />
                                  {item.serverData.sensorData}
                                </div>
                                {fetchedAtLabel && (
                                  <span className="text-[10px] text-muted-foreground">
                                    {fetchedAtLabel}
                                  </span>
                                )}
                              </div>
                            );
                          })() : (
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
                          {(() => {
                            const teamName = item.installation.teamId ? getTeamName(item.installation.teamId) : null;
                            const amanahArabic = translateTeamNameToArabic(teamName);
                            const amanahLabel = amanahArabic ?? teamName ?? "-";

                            const locationId = item.installation.locationId ? String(item.installation.locationId).trim() : "";
                            const loc = locationId ? locationMap.get(locationId) : undefined;
                            const municipality = loc?.municipalityName;

                            return (
                              <div className="flex flex-col gap-1">
                                <span className="text-xs font-medium">{amanahLabel}</span>
                                {municipality && (
                                  <span className="text-[11px] text-muted-foreground">
                                    {municipality}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-full px-4"
                              onClick={() => viewDetails(item)}
                            >
                              Review
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="rounded-full px-4"
                              disabled={!!fetchingMap[item.installation.id]}
                              onClick={() => fetchLatestServerReadings(item.installation)}
                            >
                              {fetchingMap[item.installation.id] ? (
                                <>
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  Fetch
                                </>
                              ) : item.installation.latestDisCm !== undefined && item.installation.latestDisCm !== null ? (
                                "Refresh"
                              ) : (
                                "Fetch"
                              )}
                            </Button>
                            {userProfile?.isAdmin && (
                              <Button
                                size="sm"
                                variant="destructive"
                                className="rounded-full px-3"
                                onClick={() => handleDeleteClick(item)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
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
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-2xl font-bold">
                Verified Installations ({displayedVerifiedItems.length > displayLimit ? `${paginatedVerifiedItems.length} of ` : ''}{displayedVerifiedItems.length})
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="flex items-center gap-2"
                  onClick={handleCsvExport}
                  disabled={displayedVerifiedItems.length === 0 && displayedItems.length === 0}
                >
                  <FileDown className="h-4 w-4" />
                  Download CSV
                </Button>
                <Button
                  onClick={handleDailyCsvPrompt}
                  type="button"
                >
                  CSV by Date
                </Button>
              </div>
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
        setNewImageFiles([]);
        setNewImagePreviews([]);
          setDeletedImageUrls([]);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Verify Installation</DialogTitle>
              {((userProfile?.isAdmin) || (userProfile?.role === "verifier" && !userProfile?.isAdmin && !selectedItem?.installation.tags?.includes("escalated to manager")) || (userProfile?.role === "manager" && !userProfile?.isAdmin)) && !isEditMode && (
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
            <div className="flex gap-2 flex-wrap mt-2">
              {selectedItem?.installation.tags?.includes("edited by verifier") && (
                <Badge variant="secondary" className="w-fit">
                  Edited by Verifier
                </Badge>
              )}
              {selectedItem?.installation.tags?.includes("escalated to manager") && (
                <Badge variant="outline" className="border-orange-500 text-orange-600 w-fit">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Escalated to Manager
                </Badge>
              )}
            </div>
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
                    {selectedItem.installation.imageUrls?.map((url, index) => {
                      const isDeleted = deletedImageUrls.includes(url);
                      return (
                        <div key={index} className="relative">
                          <img
                            src={url}
                            alt={`Installation photo ${index + 1}`}
                            className={`w-full h-48 object-cover rounded-lg border ${
                              isEditMode ? "cursor-default" : "cursor-zoom-in"
                            } ${isDeleted ? "opacity-50" : ""}`}
                            onClick={() => !isEditMode && setImagePreviewUrl(url)}
                          />
                          {isEditMode && (
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              className="absolute top-2 right-2 h-8 w-8 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isDeleted) {
                                  setDeletedImageUrls(prev => prev.filter(u => u !== url));
                                } else {
                                  setDeletedImageUrls(prev => [...prev, url]);
                                }
                              }}
                            >
                              {isDeleted ? (
                                <X className="h-4 w-4" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                          {isDeleted && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
                              <span className="text-white text-sm font-medium">Deleted</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {isEditMode && (
                      <div className="w-full h-48 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg hover:border-primary transition-colors cursor-pointer relative">
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleImageSelect}
                          className="hidden"
                          id="additional-image-upload"
                          disabled={uploadingImage || newImagePreviews.length >= 3}
                        />
                        <label
                          htmlFor="additional-image-upload"
                          className="flex flex-col items-center justify-center w-full h-full cursor-pointer"
                        >
                          {newImagePreviews.length > 0 ? (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                              <div className="grid grid-cols-3 gap-2 w-full h-full overflow-auto p-2">
                                {newImagePreviews.map((preview, idx) => (
                                  <div key={idx} className="relative group">
                                    <img
                                      src={preview}
                                      alt={`New preview ${idx + 1}`}
                                      className="w-full h-full object-cover rounded-lg"
                                    />
                                    <button
                                      type="button"
                                      className="absolute top-1 right-1 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setNewImageFiles((prev) =>
                                          prev.filter((_, i) => i !== idx)
                                        );
                                        setNewImagePreviews((prev) =>
                                          prev.filter((_, i) => i !== idx)
                                        );
                                      }}
                                    >
                                      <X className="h-4 w-4" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                              <p className="text-sm text-muted-foreground text-center px-2">
                                {uploadingImage
                                  ? "Uploading..."
                                  : newImagePreviews.length >= 3
                                  ? "Maximum of 3 new photos"
                                  : "Add more photos (up to 3)"}
                              </p>
                            </div>
                          ) : (
                            <>
                              <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                              <p className="text-sm text-muted-foreground text-center px-2">
                                {uploadingImage ? "Uploading..." : "Add Photos (up to 3)"}
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
                      setNewImageFiles([]);
                      setNewImagePreviews([]);
                      setDeletedImageUrls([]);
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
                {/* Verifiers can only approve or escalate - but NOT if already escalated */}
                {userProfile?.role === "verifier" && !userProfile?.isAdmin && !selectedItem?.installation.tags?.includes("escalated to manager") && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setEscalateDialogOpen(true)}
                      disabled={processing}
                      className="border-orange-500 text-orange-600 hover:bg-orange-50"
                    >
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Escalate to Manager
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
                {/* Show message if verifier tries to access escalated installation */}
                {userProfile?.role === "verifier" && !userProfile?.isAdmin && selectedItem?.installation.tags?.includes("escalated to manager") && (
                  <div className="text-sm text-muted-foreground text-center py-2">
                    This installation has been escalated to a manager and can no longer be modified by verifiers.
                  </div>
                )}
                {/* Managers can only edit and approve escalated installations (cannot flag) */}
                {userProfile?.role === "manager" && !userProfile?.isAdmin && (
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
                )}
                {/* Admins can approve, flag, or escalate */}
                {userProfile?.isAdmin && (
                  <>
                    {selectedItem?.installation.status === "verified" && (
                      <Button
                        variant="outline"
                        onClick={handleUnverify}
                        disabled={processing}
                        className="border-amber-500 text-amber-600 hover:bg-amber-50"
                      >
                        {processing ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <XCircle className="h-4 w-4 mr-2" />
                        )}
                        Unverify (Back to Pending)
                      </Button>
                    )}
                    {selectedItem?.installation.status === "flagged" && (
                      <Button
                        variant="outline"
                        onClick={() => setEscalateDialogOpen(true)}
                        disabled={processing}
                        className="border-orange-500 text-orange-600 hover:bg-orange-50"
                      >
                        <AlertTriangle className="h-4 w-4 mr-2" />
                        Escalate to Manager
                      </Button>
                    )}
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
            {/* Verify after edit option - show for admins and managers if installation is flagged or escalated */}
            {(selectedItem?.installation.status === "flagged" || selectedItem?.installation.tags?.includes("escalated to manager")) && (userProfile?.isAdmin || (userProfile?.role === "manager" && !userProfile?.isAdmin)) && (
              <div className="flex items-center space-x-2 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <Checkbox
                  id="verify-after-edit"
                  checked={verifyAfterEdit}
                  onCheckedChange={(checked) => setVerifyAfterEdit(checked === true)}
                  disabled={processing || uploadingImage}
                />
                <Label htmlFor="verify-after-edit" className="text-sm font-medium cursor-pointer">
                  Verify installation after saving (if edit fixes the issue)
                </Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditConfirmDialogOpen(false);
                setPendingChanges([]);
                setVerifyAfterEdit(false);
              }}
              disabled={processing || uploadingImage}
            >
              Cancel
            </Button>
            <Button
              onClick={handleEditConfirmed}
              disabled={processing || uploadingImage}
              className={verifyAfterEdit ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"}
            >
              {(processing || uploadingImage) ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {uploadingImage ? "Uploading..." : "Saving..."}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {verifyAfterEdit ? "Save & Verify" : "Confirm Changes"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Escalate to Manager Dialog */}
      <Dialog open={escalateDialogOpen} onOpenChange={setEscalateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="h-5 w-5" />
              Escalate to Manager
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This installation will be escalated to a manager for review. Please provide a reason for escalation.
            </p>
            <div>
              <Label htmlFor="escalate-reason">Reason for Escalation</Label>
              <Textarea
                id="escalate-reason"
                value={escalateReason}
                onChange={(e) => setEscalateReason(e.target.value)}
                placeholder="Enter reason for escalation..."
                rows={3}
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEscalateDialogOpen(false);
                setEscalateReason("");
              }}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleEscalate}
              disabled={processing || !escalateReason.trim()}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Escalating...
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Escalate to Manager
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

