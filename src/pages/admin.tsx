import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, query, orderBy, where, doc, setDoc, serverTimestamp, getDocs, getDoc, updateDoc, writeBatch, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Search, Loader2, Shield, MapPin, Smartphone, Ruler, Users, Filter, X, Upload, Download, CheckCircle2, XCircle, Edit, RefreshCw, FileDown, AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { UserProfile, Team, TeamMember, Installation } from "@/lib/types";
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

const parseDeviceIdsList = (input: string) => {
  return Array.from(
    new Set(
      input
        .split(/\r?\n/)
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
    )
  );
};

export default function Admin() {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [userTeams, setUserTeams] = useState<Record<string, Team[]>>({});
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamMembersByTeam, setTeamMembersByTeam] = useState<Record<string, UserProfile[]>>({});
  const [customMembersByTeam, setCustomMembersByTeam] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [locationFile, setLocationFile] = useState<File | null>(null);
  const [uploadingLocations, setUploadingLocations] = useState(false);
  const [locationProgress, setLocationProgress] = useState(0);
  const [locationResult, setLocationResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const [municipalityFile, setMunicipalityFile] = useState<File | null>(null);
  const [uploadingMunicipalities, setUploadingMunicipalities] = useState(false);
  const [municipalityProgress, setMunicipalityProgress] = useState(0);
  const [municipalityResult, setMunicipalityResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  
  // Location ID Bulk Update State
  const [targetTeamId, setTargetTeamId] = useState("ttaMvVwJTIpXIJ5NTmee");
  const [excludeInstallerName, setExcludeInstallerName] = useState("Mitesh");
  const [newLocationId, setNewLocationId] = useState("9999");
  const [matchingInstallations, setMatchingInstallations] = useState<Installation[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [updatingLocationIds, setUpdatingLocationIds] = useState(false);
  const [showUpdateConfirmDialog, setShowUpdateConfirmDialog] = useState(false);
  
  // 999 to 9999 Update State
  const [updating999to9999, setUpdating999to9999] = useState(false);
  const [show999UpdateDialog, setShow999UpdateDialog] = useState(false);
  const [found999Installations, setFound999Installations] = useState<Installation[]>([]);
  const [exporting999Report, setExporting999Report] = useState(false);

  // Duplicate Installations Export State
  const [exportingDuplicates, setExportingDuplicates] = useState(false);

  // Bulk Team Change State
  const [deviceIdsInput, setDeviceIdsInput] = useState("");
  const [bulkChangeSourceTeamId, setBulkChangeSourceTeamId] = useState("");
  const [bulkChangeTargetTeamId, setBulkChangeTargetTeamId] = useState("");
  const [matchingTeamInstallations, setMatchingTeamInstallations] = useState<Installation[]>([]);
  const [loadingTeamMatches, setLoadingTeamMatches] = useState(false);
  const [updatingTeams, setUpdatingTeams] = useState(false);
  const [showTeamUpdateDialog, setShowTeamUpdateDialog] = useState(false);

  // Export Installations by UIDs State
  const [exportDeviceIdsInput, setExportDeviceIdsInput] = useState("");
  const [exportMatchingInstallations, setExportMatchingInstallations] = useState<Installation[]>([]);
  const [loadingExportMatches, setLoadingExportMatches] = useState(false);
  const [exportingSelectedInstallations, setExportingSelectedInstallations] = useState(false);

  // Bulk Location Change State
  const [bulkLocationDeviceIdsInput, setBulkLocationDeviceIdsInput] = useState("");
  const [bulkLocationTargetLocationId, setBulkLocationTargetLocationId] = useState("");
  const [matchingLocationInstallations, setMatchingLocationInstallations] = useState<Installation[]>([]);
  const [loadingLocationMatches, setLoadingLocationMatches] = useState(false);
  const [updatingLocations, setUpdatingLocations] = useState(false);
  const [showLocationUpdateDialog, setShowLocationUpdateDialog] = useState(false);

  // Device Deletion State
  const [deleteDeviceIdsInput, setDeleteDeviceIdsInput] = useState("");
  const [deletingDevices, setDeletingDevices] = useState(false);
  const [showDeleteDevicesDialog, setShowDeleteDevicesDialog] = useState(false);
  const [deviceDeletionSummary, setDeviceDeletionSummary] = useState<{
    deleted: string[];
    notFound: string[];
    failed: { id: string; error: string }[];
  } | null>(null);

  // Coordinate Range Filter State
  const [locations, setLocations] = useState<{ id: string; locationId: string; latitude: number; longitude: number }[]>([]);
  const [minLatitude, setMinLatitude] = useState<string>("");
  const [maxLatitude, setMaxLatitude] = useState<string>("");
  const [minLongitude, setMinLongitude] = useState<string>("");
  const [maxLongitude, setMaxLongitude] = useState<string>("");
  const [coordinateFilteredInstallations, setCoordinateFilteredInstallations] = useState<Installation[]>([]);
  const [loadingCoordinateFilter, setLoadingCoordinateFilter] = useState(false);
  const [exportingCoordinateFiltered, setExportingCoordinateFiltered] = useState(false);

  // Missing Coordinates Filter State
  const [missingCoordinatesInstallations, setMissingCoordinatesInstallations] = useState<Installation[]>([]);
  const [loadingMissingCoordinates, setLoadingMissingCoordinates] = useState(false);
  const [exportingMissingCoordinates, setExportingMissingCoordinates] = useState(false);

  // Real-time users listener
  useEffect(() => {
    if (!userProfile?.isAdmin) return;
    
    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const usersData = snapshot.docs.map(doc => ({
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate(),
          updatedAt: doc.data().updatedAt?.toDate(),
        })) as UserProfile[];
        
        // Sort in JavaScript to avoid index requirement
        usersData.sort((a, b) => a.displayName.localeCompare(b.displayName));
        
        setUsers(usersData);
        setLoading(false);
      },
      (error) => {
        toast({
          variant: "destructive",
          title: "Failed to load users",
          description: error.message,
        });
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userProfile, toast]);

  // Real-time teams listener
  useEffect(() => {
    if (!userProfile?.isAdmin) return;
    
    const unsubscribe = onSnapshot(
      collection(db, "teams"),
      (snapshot) => {
        const allTeams = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate(),
          updatedAt: doc.data().updatedAt?.toDate(),
        })) as Team[];
        
        setTeams(allTeams);
        
        // Organize teams by owner
        const teamsByOwner: Record<string, Team[]> = {};
        for (const team of allTeams) {
          const ownerId = team.ownerId || team.createdBy;
          if (!teamsByOwner[ownerId]) {
            teamsByOwner[ownerId] = [];
          }
          teamsByOwner[ownerId].push(team);
        }
        setUserTeams(teamsByOwner);
      },
      (error) => {
        toast({
          variant: "destructive",
          title: "Failed to load teams",
          description: error.message,
        });
      }
    );

    return () => unsubscribe();
  }, [userProfile, toast]);

  // Real-time locations listener (for coordinate filtering)
  useEffect(() => {
    if (!userProfile?.isAdmin) return;
    
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
        }).filter(loc => loc.latitude != null && loc.longitude != null && !isNaN(loc.latitude) && !isNaN(loc.longitude)) as { id: string; locationId: string; latitude: number; longitude: number }[];
        
        setLocations(locationsData);
      },
      (error) => {
        console.error("Failed to load locations:", error);
      }
    );

    return () => unsubscribe();
  }, [userProfile]);

  // Real-time team members listener
  useEffect(() => {
    if (!userProfile?.isAdmin) return;
    
    const unsubscribe = onSnapshot(
      collection(db, "teamMembers"),
      (snapshot) => {
        const members = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          joinedAt: doc.data().joinedAt?.toDate(),
        })) as TeamMember[];
        
        setTeamMembers(members);
      },
      (error) => {
        console.error("Failed to load team members:", error);
      }
    );

    return () => unsubscribe();
  }, [userProfile]);

  // Listen to custom members in teams/{teamId}/members subcollection
  useEffect(() => {
    if (!userProfile?.isAdmin || teams.length === 0) return;
    
    const unsubscribes = teams.map(team => {
      return onSnapshot(
        collection(db, "teams", team.id, "members"),
        (snapshot) => {
          const members = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            addedAt: doc.data().addedAt?.toDate(),
          }));
          
          setCustomMembersByTeam(prev => ({ ...prev, [team.id]: members }));
        },
        (error) => {
          console.error(`Failed to load custom members for team ${team.id}:`, error);
        }
      );
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [userProfile, teams]);

  // Build team members with user data (registered users)
  useEffect(() => {
    if (teams.length === 0 || users.length === 0 || teamMembers.length === 0) return;
    
    const membersByTeam: Record<string, UserProfile[]> = {};
    
    for (const team of teams) {
      const teamMemberIds = teamMembers
        .filter(tm => tm.teamId === team.id)
        .map(tm => tm.userId);
      
      membersByTeam[team.id] = users.filter(user => teamMemberIds.includes(user.uid));
    }
    
    setTeamMembersByTeam(membersByTeam);
  }, [teams, users, teamMembers]);

  // Get unique locations for filter
  const uniqueLocations = useMemo(() => {
    const locations = new Set(users.map(u => u.location).filter(Boolean));
    return Array.from(locations).sort();
  }, [users]);

  const deleteDeviceIdList = useMemo(() => parseDeviceIdsList(deleteDeviceIdsInput), [deleteDeviceIdsInput]);

  // Advanced filtering
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      // Text search: name, email, device ID
      const matchesSearch = searchTerm === "" || 
        user.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.deviceId.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Location filter
      const matchesLocation = locationFilter === "all" || user.location === locationFilter;
      
      // Team filter
      let matchesTeam = true;
      if (teamFilter !== "all") {
        const userInTeam = teamMembers.some(
          tm => tm.userId === user.uid && tm.teamId === teamFilter
        );
        matchesTeam = userInTeam;
      }
      
      return matchesSearch && matchesLocation && matchesTeam;
    });
  }, [users, searchTerm, locationFilter, teamFilter, teamMembers]);

  const clearFilters = () => {
    setSearchTerm("");
    setLocationFilter("all");
    setTeamFilter("all");
  };

  const hasActiveFilters = searchTerm !== "" || locationFilter !== "all" || teamFilter !== "all";

  const openDeleteDevicesDialog = () => {
    if (deleteDeviceIdList.length === 0) {
      toast({
        variant: "destructive",
        title: "No Device UIDs",
        description: "Please enter at least one device UID to delete.",
      });
      return;
    }
    setShowDeleteDevicesDialog(true);
  };

  const handleConfirmDeleteDevices = async () => {
    const deviceIds = deleteDeviceIdList;

    if (deviceIds.length === 0) {
      toast({
        variant: "destructive",
        title: "No Device UIDs",
        description: "Please enter at least one device UID to delete.",
      });
      setShowDeleteDevicesDialog(false);
      return;
    }

    setDeletingDevices(true);

    const deleted: string[] = [];
    const notFound: string[] = [];
    const failed: { id: string; error: string }[] = [];

    try {
      for (const id of deviceIds) {
        try {
          const deviceRef = doc(db, "devices", id);
          const deviceSnapshot = await getDoc(deviceRef);

          if (!deviceSnapshot.exists()) {
            notFound.push(id);
            continue;
          }

          await deleteDoc(deviceRef);
          deleted.push(id);
        } catch (error: any) {
          failed.push({ id, error: error?.message || "Unknown error" });
        }
      }

      setDeviceDeletionSummary({ deleted, notFound, failed });

      const summaryParts = [`${deleted.length} deleted`];
      if (notFound.length > 0) summaryParts.push(`${notFound.length} not found`);
      if (failed.length > 0) summaryParts.push(`${failed.length} failed`);

      toast({
        title: failed.length > 0 ? "Delete completed with warnings" : "Devices deleted",
        description: summaryParts.join(" • "),
        variant: failed.length > 0 ? "destructive" : "default",
      });

      if (failed.length > 0 || notFound.length > 0) {
        const remaining = [...failed.map((f) => f.id), ...notFound];
        setDeleteDeviceIdsInput(remaining.join("\n"));
      } else {
        setDeleteDeviceIdsInput("");
      }

      setShowDeleteDevicesDialog(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: error?.message || "An unexpected error occurred while deleting devices.",
      });
    } finally {
      setDeletingDevices(false);
    }
  };

  // Location ID Bulk Update Functions
  const findMatchingInstallations = async () => {
    if (!targetTeamId) {
      toast({
        variant: "destructive",
        title: "Missing Team ID",
        description: "Please enter a team ID to search.",
      });
      return;
    }

    setLoadingMatches(true);
    setMatchingInstallations([]);

    try {
      const installationsRef = collection(db, "installations");
      let q = query(installationsRef, where("teamId", "==", targetTeamId));
      
      const snapshot = await getDocs(q);
      
      const matches: Installation[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Filter out installations where installedByName matches the exclude name
        if (excludeInstallerName && data.installedByName === excludeInstallerName) {
          return;
        }
        matches.push({
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
          verifiedAt: data.verifiedAt?.toDate ? data.verifiedAt.toDate() : data.verifiedAt,
          systemPreVerifiedAt: data.systemPreVerifiedAt?.toDate ? data.systemPreVerifiedAt.toDate() : data.systemPreVerifiedAt,
          serverRefreshedAt: data.serverRefreshedAt?.toDate ? data.serverRefreshedAt.toDate() : data.serverRefreshedAt,
        } as Installation);
      });

      setMatchingInstallations(matches);
      
      toast({
        title: "Search Complete",
        description: `Found ${matches.length} matching installation(s).`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Search Failed",
        description: error.message || "An error occurred while searching.",
      });
    } finally {
      setLoadingMatches(false);
    }
  };

  const handleBulkLocationUpdate = async () => {
    if (matchingInstallations.length === 0) {
      toast({
        variant: "destructive",
        title: "No Installations",
        description: "Please search for installations first.",
      });
      return;
    }

    if (!newLocationId) {
      toast({
        variant: "destructive",
        title: "Missing Location ID",
        description: "Please enter a new location ID.",
      });
      return;
    }

    setUpdatingLocationIds(true);

    try {
      let batch = writeBatch(db);
      let batchCount = 0;

      for (const installation of matchingInstallations) {
        const installationRef = doc(db, "installations", installation.id);
        
        // Store the original locationId if it doesn't already exist
        const updateData: any = {
          locationId: newLocationId,
          updatedAt: serverTimestamp(),
        };

        // Only set originalLocationId if it doesn't exist yet
        if (!installation.originalLocationId) {
          updateData.originalLocationId = installation.locationId;
        }

        batch.update(installationRef, updateData);
        batchCount++;

        // Firestore batch limit is 500 operations
        if (batchCount === 500) {
          await batch.commit();
          batchCount = 0;
          batch = writeBatch(db);
        }
      }

      // Commit any remaining operations
      if (batchCount > 0) {
        await batch.commit();
      }

      toast({
        title: "Update Complete",
        description: `Successfully updated ${matchingInstallations.length} installation(s).`,
      });

      // Clear the matches after successful update
      setMatchingInstallations([]);
      setShowUpdateConfirmDialog(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: error.message || "An error occurred during update.",
      });
    } finally {
      setUpdatingLocationIds(false);
    }
  };

  // 999 to 9999 Location ID Update Functions
  const find999Installations = async () => {
    setLoadingMatches(true);
    setFound999Installations([]);

    try {
      const installationsRef = collection(db, "installations");
      const q = query(installationsRef, where("locationId", "==", "999"));
      
      const snapshot = await getDocs(q);
      
      const matches: Installation[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Exclude installations where teamId is "6ZsR0Bd6WbXyc11ooEuV"
        if (data.teamId === "6ZsR0Bd6WbXyc11ooEuV") {
          return;
        }
        matches.push({
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
          verifiedAt: data.verifiedAt?.toDate ? data.verifiedAt.toDate() : data.verifiedAt,
          systemPreVerifiedAt: data.systemPreVerifiedAt?.toDate ? data.systemPreVerifiedAt.toDate() : data.systemPreVerifiedAt,
          serverRefreshedAt: data.serverRefreshedAt?.toDate ? data.serverRefreshedAt.toDate() : data.serverRefreshedAt,
        } as Installation);
      });

      setFound999Installations(matches);
      
      if (matches.length > 0) {
        setShow999UpdateDialog(true);
      } else {
        toast({
          title: "No Installations Found",
          description: "No installations with locationId 999 (excluding the specified team) were found.",
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Search Failed",
        description: error.message || "An error occurred while searching.",
      });
    } finally {
      setLoadingMatches(false);
    }
  };

  const handleUpdate999to9999 = async () => {
    if (found999Installations.length === 0) {
      toast({
        variant: "destructive",
        title: "No Installations",
        description: "No installations found to update.",
      });
      return;
    }

    setUpdating999to9999(true);

    try {
      let batch = writeBatch(db);
      let batchCount = 0;

      for (const installation of found999Installations) {
        const installationRef = doc(db, "installations", installation.id);
        
        const updateData: any = {
          locationId: "9999",
          updatedAt: serverTimestamp(),
        };

        // Store original locationId if not already stored
        if (!installation.originalLocationId) {
          updateData.originalLocationId = installation.locationId;
        }

        batch.update(installationRef, updateData);
        batchCount++;

        if (batchCount === 500) {
          await batch.commit();
          batchCount = 0;
          batch = writeBatch(db);
        }
      }

      if (batchCount > 0) {
        await batch.commit();
      }

      toast({
        title: "Update Complete",
        description: `Successfully updated ${found999Installations.length} installation(s) from 999 to 9999.`,
      });

      setFound999Installations([]);
      setShow999UpdateDialog(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: error.message || "An error occurred during update.",
      });
    } finally {
      setUpdating999to9999(false);
    }
  };

  const export999to9999Report = async () => {
    setExporting999Report(true);

    try {
      // Query installations where locationId = "9999" AND has originalLocationId AND teamId = "ttaMvVwJTIpXIJ5NTmee"
      const installationsRef = collection(db, "installations");
      const q = query(
        installationsRef,
        where("locationId", "==", "9999"),
        where("teamId", "==", "ttaMvVwJTIpXIJ5NTmee")
      );
      
      const snapshot = await getDocs(q);
      
      // Filter to only include installations with originalLocationId
      const installationsWithOriginal = snapshot.docs.filter(doc => {
        const data = doc.data();
        return data.originalLocationId != null && data.originalLocationId !== "";
      });

      if (installationsWithOriginal.length === 0) {
        toast({
          title: "No Data",
          description: "No installations found with locationId 9999, an original location ID, and the specified team.",
        });
        setExporting999Report(false);
        return;
      }

      // Get teams data
      const teamsSnapshot = await getDocs(collection(db, "teams"));
      const teamsMap: Record<string, string> = {};
      teamsSnapshot.docs.forEach(doc => {
        teamsMap[doc.id] = doc.data().name || doc.id;
      });

      const csvRows: string[][] = [];
      
      installationsWithOriginal.forEach((doc, index) => {
        const data = doc.data() as Installation;
        
        // Get coordinates (use installation lat/lng if available)
        let coordinates = "-";
        if (data.latitude != null && data.longitude != null) {
          coordinates = `${Number(data.latitude).toFixed(6)}, ${Number(data.longitude).toFixed(6)}`;
        }

        // Get team name
        const teamName = data.teamId ? teamsMap[data.teamId] : "-";
        
        // Get sensor reading
        const sensorHeight = data.sensorReading != null ? String(data.sensorReading) : "-";
        
        // Original location ID
        const originalLocationId = data.originalLocationId || "-";

        // Installer name
        const installerName = data.installedByName || "-";

        csvRows.push([
          (index + 1).toString(), // Serial No
          data.locationId, // Location ID (9999)
          coordinates, // Coordinates
          data.deviceId, // Device ID
          teamName, // Amanah
          installerName, // Installer Name
          sensorHeight, // Sensor Height
          originalLocationId, // Original Location ID
        ]);
      });

      // Create CSV
      const headers = ["Serial No", "Location ID", "Coordinates", "Device ID", "Amanah", "Installer Name", "Sensor Height", "Original Location ID"];
      const allRows = [headers, ...csvRows];
      const csvContent = allRows
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
      const dateStr = new Date().toISOString().split('T')[0];
      link.setAttribute("download", `shifted-to-9999-report-${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Export Complete",
        description: `Exported ${csvRows.length} installation(s) successfully.`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: error.message || "An error occurred during export.",
      });
    } finally {
      setExporting999Report(false);
    }
  };

  // Location coordinates upload functions
  const downloadLocationTemplate = () => {
    const csvContent = `LocationID,Latitude,Longitude
5246,21.354801,39.873021
5348,21.460524,39.854247
5250,21.354617,39.874891`;

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "location_coordinates_template.csv";
    a.click();
    window.URL.revokeObjectURL(url);

    toast({
      title: "Template Downloaded",
      description: "Use this template to format your location coordinates data.",
    });
  };

  const handleLocationFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const validTypes = ["text/csv", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
      const isValidExtension = selectedFile.name.endsWith(".csv") || selectedFile.name.endsWith(".xlsx") || selectedFile.name.endsWith(".xls");
      
      if (!validTypes.includes(selectedFile.type) && !isValidExtension) {
        toast({
          variant: "destructive",
          title: "Invalid File Type",
          description: "Please upload a CSV or Excel (.xlsx) file.",
        });
        return;
      }
      setLocationFile(selectedFile);
      setLocationResult(null);
    }
  };

  const parseLocationCSV = (text: string): string[][] => {
    const lines = text.split("\n").filter(line => line.trim());
    return lines.map(line => {
      const matches = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g);
      return matches ? matches.map(cell => cell.replace(/^"|"$/g, "").trim()) : [];
    });
  };

  const parseLocationExcel = async (file: File): Promise<string[][]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];
          resolve(jsonData);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsBinaryString(file);
    });
  };

  const handleMunicipalityFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const validTypes = ["text/csv", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
      const isValidExtension = selectedFile.name.endsWith(".csv") || selectedFile.name.endsWith(".xlsx") || selectedFile.name.endsWith(".xls");
      
      if (!validTypes.includes(selectedFile.type) && !isValidExtension) {
        toast({
          variant: "destructive",
          title: "Invalid File Type",
          description: "Please upload a CSV or Excel (.xlsx) file.",
        });
        return;
      }
      setMunicipalityFile(selectedFile);
      setMunicipalityResult(null);
    }
  };

  const downloadMunicipalityMapping = async () => {
    try {
      const locationsSnapshot = await getDocs(collection(db, "locations"));
      
      if (locationsSnapshot.empty) {
        toast({
          variant: "destructive",
          title: "No Data",
          description: "No location data found in the database.",
        });
        return;
      }

      const csvRows: string[][] = [];
      
      locationsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const locationId = doc.id;
        const municipalityName = data.municipalityName || "";
        csvRows.push([locationId, municipalityName]);
      });

      // Sort by location ID
      csvRows.sort((a, b) => {
        const idA = a[0];
        const idB = b[0];
        // Try numeric sort first
        const numA = parseInt(idA);
        const numB = parseInt(idB);
        if (!isNaN(numA) && !isNaN(numB)) {
          return numA - numB;
        }
        return idA.localeCompare(idB);
      });

      const headers = ["Serial", "البلدية"];
      const allRows = [headers, ...csvRows];
      const csvContent = allRows
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
      const dateStr = new Date().toISOString().split('T')[0];
      link.setAttribute("download", `municipality-mapping-${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Download Complete",
        description: `Downloaded ${csvRows.length} location mappings.`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Download Failed",
        description: error.message || "An error occurred during download.",
      });
    }
  };

  const handleMunicipalityUpload = async () => {
    if (!municipalityFile) return;

    setUploadingMunicipalities(true);
    setMunicipalityProgress(0);
    const result = { success: 0, failed: 0, errors: [] as string[] };

    try {
      let rows: string[][];
      
      if (municipalityFile.name.endsWith('.xlsx') || municipalityFile.name.endsWith('.xls')) {
        rows = await parseLocationExcel(municipalityFile);
      } else {
        const text = await municipalityFile.text();
        rows = parseLocationCSV(text);
      }

      if (rows.length < 2) {
        toast({
          variant: "destructive",
          title: "Import Failed",
          description: "File must contain at least a header row and one data row.",
        });
        setUploadingMunicipalities(false);
        return;
      }

      const headerRow = rows[0].map(h => h.toString().toLowerCase().trim());
      const serialIdx = headerRow.findIndex(h => h.includes("serial") || h.includes("locationid"));
      const municipalityIdx = headerRow.findIndex(h => h.includes("municipality") || h.includes("البلدية"));

      if (serialIdx === -1 || municipalityIdx === -1) {
        toast({
          variant: "destructive",
          title: "Invalid Format",
          description: "File must include Serial/LocationId and MunicipalityName/البلدية columns.",
        });
        setUploadingMunicipalities(false);
        return;
      }

      const dataRows = rows.slice(1);
      const totalRows = dataRows.length;
      let batch = writeBatch(db);
      let batchCount = 0;

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const locationId = row[serialIdx]?.toString().trim();
        const municipalityName = row[municipalityIdx]?.toString().trim();

        if (!locationId) {
          result.failed++;
          result.errors.push(`Row ${i + 2}: Missing Serial/Location ID`);
          continue;
        }

        try {
          const locationRef = doc(db, "locations", locationId);
          const updateData: any = {
            updatedAt: serverTimestamp(),
          };
          if (municipalityName) {
            updateData.municipalityName = municipalityName;
          } else {
            updateData.municipalityName = null;
          }

          batch.set(locationRef, updateData, { merge: true });
          batchCount++;
          result.success++;
        } catch (error: any) {
          result.failed++;
          result.errors.push(`Row ${i + 2}: ${error.message || "Failed to queue update"}`);
        }

        if (batchCount === 500) {
          await batch.commit();
          batchCount = 0;
          batch = writeBatch(db);
        }

        setMunicipalityProgress(Math.round(((i + 1) / totalRows) * 100));
      }

      if (batchCount > 0) {
        await batch.commit();
      }

      setMunicipalityResult(result);
      toast({
        title: "Municipalities Updated",
        description: `Updated municipality for ${result.success} locations.`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: error.message || "An error occurred during upload.",
      });
    } finally {
      setUploadingMunicipalities(false);
      setMunicipalityProgress(0);
    }
  };

  const downloadDeviceUidsCSV = () => {
    try {
      // Create CSV with only device UIDs
      const csvRows: string[][] = [];
      
      filteredUsers.forEach((user, index) => {
        csvRows.push([
          (index + 1).toString(), // Serial No
          user.deviceId, // Device UID
        ]);
      });

      // Create CSV
      const headers = ["Serial No", "Device UID"];
      const allRows = [headers, ...csvRows];
      const csvContent = allRows
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
      const dateStr = new Date().toISOString().split('T')[0];
      link.setAttribute("download", `device-uids-${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Export Complete",
        description: `Exported ${csvRows.length} device UID(s) successfully.`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: error.message || "An error occurred during export.",
      });
    }
  };

  const exportDuplicateInstallations = async () => {
    setExportingDuplicates(true);

    try {
      // Get all installations
      const installationsRef = collection(db, "installations");
      const snapshot = await getDocs(installationsRef);
      
      const installations: Installation[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        installations.push({
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
          verifiedAt: data.verifiedAt?.toDate ? data.verifiedAt.toDate() : data.verifiedAt,
          systemPreVerifiedAt: data.systemPreVerifiedAt?.toDate ? data.systemPreVerifiedAt.toDate() : data.systemPreVerifiedAt,
          serverRefreshedAt: data.serverRefreshedAt?.toDate ? data.serverRefreshedAt.toDate() : data.serverRefreshedAt,
        } as Installation);
      });

      // Find duplicates by deviceId
      const deviceIdCount: Record<string, Installation[]> = {};
      installations.forEach(installation => {
        if (!deviceIdCount[installation.deviceId]) {
          deviceIdCount[installation.deviceId] = [];
        }
        deviceIdCount[installation.deviceId].push(installation);
      });

      // Filter to only duplicates (deviceId with more than 1 installation)
      const duplicates: Installation[] = [];
      Object.entries(deviceIdCount).forEach(([deviceId, installs]) => {
        if (installs.length > 1) {
          duplicates.push(...installs);
        }
      });

      if (duplicates.length === 0) {
        toast({
          title: "No Duplicates Found",
          description: "No duplicate device installations found in the system.",
        });
        setExportingDuplicates(false);
        return;
      }

      // Sort by deviceId and then by createdAt
      duplicates.sort((a, b) => {
        if (a.deviceId !== b.deviceId) {
          return a.deviceId.localeCompare(b.deviceId);
        }
        if (!a.createdAt || !b.createdAt) return 0;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });

      // Get teams data for team names
      const teamsSnapshot = await getDocs(collection(db, "teams"));
      const teamsMap: Record<string, string> = {};
      teamsSnapshot.docs.forEach(doc => {
        teamsMap[doc.id] = doc.data().name || doc.id;
      });

      const csvRows: string[][] = [];
      
      duplicates.forEach((installation, index) => {
        const coordinates = (installation.latitude != null && installation.longitude != null)
          ? `${Number(installation.latitude).toFixed(6)}, ${Number(installation.longitude).toFixed(6)}`
          : "-";

        const teamName = installation.teamId ? teamsMap[installation.teamId] : "-";
        const createdAtStr = installation.createdAt ? new Date(installation.createdAt).toISOString() : "-";
        const updatedAtStr = installation.updatedAt ? new Date(installation.updatedAt).toISOString() : "-";
        const verifiedAtStr = installation.verifiedAt ? new Date(installation.verifiedAt).toISOString() : "-";
        const systemPreVerifiedAtStr = installation.systemPreVerifiedAt ? new Date(installation.systemPreVerifiedAt).toISOString() : "-";
        const serverRefreshedAtStr = installation.serverRefreshedAt ? new Date(installation.serverRefreshedAt).toISOString() : "-";

        csvRows.push([
          (index + 1).toString(), // Serial No
          installation.id, // Installation ID
          installation.deviceId, // Device UID
          installation.locationId, // Location ID
          installation.originalLocationId || "-", // Original Location ID
          coordinates, // GPS Coordinates
          String(installation.sensorReading), // Sensor Reading (cm)
          String(installation.latestDisCm ?? "-"), // Latest Sensor Reading from Server
          installation.latestDisTimestamp || "-", // Latest Sensor Timestamp
          installation.installedByName, // Installed By Name
          installation.installedBy, // Installed By UID
          teamName, // Team Name
          installation.teamId || "-", // Team ID
          installation.status, // Status
          installation.flaggedReason || "-", // Flagged Reason
          installation.verifiedBy || "-", // Verified By
          verifiedAtStr, // Verified At
          String(installation.systemPreVerified ?? "-"), // System Pre-Verified
          systemPreVerifiedAtStr, // System Pre-Verified At
          createdAtStr, // Created At
          updatedAtStr, // Updated At
          installation.deviceInputMethod || "-", // Device Input Method
          serverRefreshedAtStr, // Server Refreshed At
          installation.imageUrls?.join("; ") || "-", // Image URLs
          installation.videoUrl || "-", // Video URL
          installation.tags?.join(", ") || "-", // Tags
        ]);
      });

      // Create CSV with comprehensive headers
      const headers = [
        "Serial No",
        "Installation ID",
        "Device UID",
        "Location ID",
        "Original Location ID",
        "GPS Coordinates",
        "Sensor Reading (cm)",
        "Latest Server Reading (cm)",
        "Latest Server Timestamp",
        "Installed By Name",
        "Installed By UID",
        "Team Name",
        "Team ID",
        "Status",
        "Flagged Reason",
        "Verified By",
        "Verified At",
        "System Pre-Verified",
        "System Pre-Verified At",
        "Created At",
        "Updated At",
        "Device Input Method",
        "Server Refreshed At",
        "Image URLs",
        "Video URL",
        "Tags",
      ];
      const allRows = [headers, ...csvRows];
      const csvContent = allRows
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
      const dateStr = new Date().toISOString().split('T')[0];
      link.setAttribute("download", `duplicate-installations-${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const uniqueDuplicateDevices = Object.keys(deviceIdCount).filter(deviceId => deviceIdCount[deviceId].length > 1).length;
      
      toast({
        title: "Export Complete",
        description: `Exported ${duplicates.length} duplicate installation(s) from ${uniqueDuplicateDevices} device(s).`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: error.message || "An error occurred during export.",
      });
    } finally {
      setExportingDuplicates(false);
    }
  };

  // Bulk Location Change Functions
  const findInstallationsForLocationChange = async () => {
    if (!bulkLocationDeviceIdsInput.trim()) {
      toast({
        variant: "destructive",
        title: "Device IDs Required",
        description: "Please enter device IDs (one per line).",
      });
      return;
    }

    if (!bulkLocationTargetLocationId.trim()) {
      toast({
        variant: "destructive",
        title: "Location ID Required",
        description: "Please enter a target location ID.",
      });
      return;
    }

    setLoadingLocationMatches(true);
    setMatchingLocationInstallations([]);

    try {
      // Parse device IDs from input (one per line)
      const deviceIds = bulkLocationDeviceIdsInput
        .split('\n')
        .map(id => id.trim().toUpperCase())
        .filter(id => id.length > 0);

      if (deviceIds.length === 0) {
        toast({
          variant: "destructive",
          title: "No Valid Device IDs",
          description: "Please enter at least one device ID.",
        });
        setLoadingLocationMatches(false);
        return;
      }

      const installationsRef = collection(db, "installations");
      const snapshot = await getDocs(installationsRef);
      
      const matches: Installation[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        const deviceId = data.deviceId?.toUpperCase();
        
        // Check if device ID is in the list
        if (deviceIds.includes(deviceId)) {
          matches.push({
            ...data,
            id: doc.id,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
            updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
            verifiedAt: data.verifiedAt?.toDate ? data.verifiedAt.toDate() : data.verifiedAt,
            systemPreVerifiedAt: data.systemPreVerifiedAt?.toDate ? data.systemPreVerifiedAt.toDate() : data.systemPreVerifiedAt,
            serverRefreshedAt: data.serverRefreshedAt?.toDate ? data.serverRefreshedAt.toDate() : data.serverRefreshedAt,
          } as Installation);
        }
      });

      setMatchingLocationInstallations(matches);
      
      if (matches.length > 0) {
        setShowLocationUpdateDialog(true);
      } else {
        toast({
          title: "No Installations Found",
          description: `No installations found matching the specified device IDs.`,
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Search Failed",
        description: error.message || "An error occurred while searching.",
      });
    } finally {
      setLoadingLocationMatches(false);
    }
  };

  const handleBulkLocationChangeByDeviceIds = async () => {
    if (matchingLocationInstallations.length === 0) {
      toast({
        variant: "destructive",
        title: "No Installations",
        description: "No installations found to update.",
      });
      return;
    }

    if (!bulkLocationTargetLocationId.trim()) {
      toast({
        variant: "destructive",
        title: "Location ID Required",
        description: "Please enter a target location ID.",
      });
      return;
    }

    setUpdatingLocations(true);

    try {
      let batch = writeBatch(db);
      let batchCount = 0;

      for (const installation of matchingLocationInstallations) {
        const installationRef = doc(db, "installations", installation.id);
        
        // Store original locationId if not already stored
        const updateData: any = {
          locationId: bulkLocationTargetLocationId.trim(),
          updatedAt: serverTimestamp(),
        };

        // If originalLocationId doesn't exist, save current locationId as original
        if (!installation.originalLocationId && installation.locationId) {
          updateData.originalLocationId = installation.locationId;
        }
        
        batch.update(installationRef, updateData);
        batchCount++;

        if (batchCount === 500) {
          await batch.commit();
          batchCount = 0;
          batch = writeBatch(db);
        }
      }

      if (batchCount > 0) {
        await batch.commit();
      }

      toast({
        title: "Update Complete",
        description: `Successfully updated ${matchingLocationInstallations.length} installation(s) to location ID ${bulkLocationTargetLocationId}.`,
      });

      setMatchingLocationInstallations([]);
      setShowLocationUpdateDialog(false);
      setBulkLocationDeviceIdsInput("");
      setBulkLocationTargetLocationId("");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: error.message || "An error occurred during update.",
      });
    } finally {
      setUpdatingLocations(false);
    }
  };

  // Coordinate Range Filter Functions
  const filterInstallationsByCoordinateRange = async () => {
    // Validate inputs
    const minLat = parseFloat(minLatitude);
    const maxLat = parseFloat(maxLatitude);
    const minLon = parseFloat(minLongitude);
    const maxLon = parseFloat(maxLongitude);

    if (isNaN(minLat) || isNaN(maxLat) || isNaN(minLon) || isNaN(maxLon)) {
      toast({
        variant: "destructive",
        title: "Invalid Coordinates",
        description: "Please enter valid numeric values for all coordinate ranges.",
      });
      return;
    }

    if (minLat > maxLat || minLon > maxLon) {
      toast({
        variant: "destructive",
        title: "Invalid Range",
        description: "Minimum values must be less than maximum values.",
      });
      return;
    }

    setLoadingCoordinateFilter(true);
    setCoordinateFilteredInstallations([]);

    try {
      // Create location map for quick lookup
      const locationMap = new Map<string, { latitude: number; longitude: number }>();
      locations.forEach((loc) => {
        locationMap.set(loc.locationId, { latitude: loc.latitude, longitude: loc.longitude });
      });

      // Fetch all installations
      const installationsRef = collection(db, "installations");
      const snapshot = await getDocs(installationsRef);
      
      const filtered: Installation[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        const locationId = data.locationId ? String(data.locationId).trim() : "";
        const isLocation9999 = locationId === "9999";
        
        let lat: number | null = null;
        let lon: number | null = null;
        
        // For location 9999, use user-entered coordinates
        // For other locations, use coordinates from locations collection
        if (isLocation9999) {
          lat = data.latitude != null ? (typeof data.latitude === 'number' ? data.latitude : parseFloat(String(data.latitude))) : null;
          lon = data.longitude != null ? (typeof data.longitude === 'number' ? data.longitude : parseFloat(String(data.longitude))) : null;
        } else {
          const location = locationMap.get(locationId);
          lat = location?.latitude ?? null;
          lon = location?.longitude ?? null;
        }
        
        // Check if coordinates are within range
        if (lat != null && lon != null && !isNaN(lat) && !isNaN(lon)) {
          if (lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon) {
            filtered.push({
              ...data,
              id: doc.id,
              createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
              updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
              verifiedAt: data.verifiedAt?.toDate ? data.verifiedAt.toDate() : data.verifiedAt,
              systemPreVerifiedAt: data.systemPreVerifiedAt?.toDate ? data.systemPreVerifiedAt.toDate() : data.systemPreVerifiedAt,
              serverRefreshedAt: data.serverRefreshedAt?.toDate ? data.serverRefreshedAt.toDate() : data.serverRefreshedAt,
            } as Installation);
          }
        }
      });

      setCoordinateFilteredInstallations(filtered);
      
      if (filtered.length > 0) {
        toast({
          title: "Filter Complete",
          description: `Found ${filtered.length} installation(s) within the specified coordinate range.`,
        });
      } else {
        toast({
          title: "No Installations Found",
          description: "No installations found within the specified coordinate range.",
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Filter Failed",
        description: error.message || "An error occurred while filtering.",
      });
    } finally {
      setLoadingCoordinateFilter(false);
    }
  };

  const exportCoordinateFilteredInstallations = async () => {
    if (coordinateFilteredInstallations.length === 0) {
      toast({
        variant: "destructive",
        title: "No Installations",
        description: "No installations to export. Please filter installations first.",
      });
      return;
    }

    setExportingCoordinateFiltered(true);

    try {
      // Create location map for coordinate lookup
      const locationMap = new Map<string, { latitude: number; longitude: number }>();
      locations.forEach((loc) => {
        locationMap.set(loc.locationId, { latitude: loc.latitude, longitude: loc.longitude });
      });

      // Fetch all teams to resolve team names
      const teamsSnapshot = await getDocs(collection(db, "teams"));
      const teamsMap = new Map<string, string>();
      teamsSnapshot.docs.forEach(doc => teamsMap.set(doc.id, doc.data().name));

      // Sort by deviceId and then by createdAt
      const sortedInstallations = [...coordinateFilteredInstallations].sort((a, b) => {
        if (a.deviceId < b.deviceId) return -1;
        if (a.deviceId > b.deviceId) return 1;
        return (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0);
      });

      const headers = [
        "Serial No", "Installation ID", "Device UID", "Location ID", "Original Location ID",
        "Latitude", "Longitude", "Sensor Reading (cm)", "Latest Server Reading (cm)", "Latest Server Timestamp",
        "Installed By Name", "Installed By UID", "Team Name", "Team ID", "Status", "Flagged Reason",
        "Verified By", "Verified At", "System Pre-Verified", "System Pre-Verified At",
        "Created At", "Updated At", "Device Input Method", "Server Refreshed At",
        "Image URLs", "Video URL", "Tags"
      ];

      const csvRows = sortedInstallations.map((inst, index) => {
        const locationId = inst.locationId ? String(inst.locationId).trim() : "";
        const isLocation9999 = locationId === "9999";
        
        let lat: number | null = null;
        let lon: number | null = null;
        
        // For location 9999, use user-entered coordinates
        // For other locations, use coordinates from locations collection
        if (isLocation9999) {
          lat = inst.latitude ?? null;
          lon = inst.longitude ?? null;
        } else {
          const location = locationMap.get(locationId);
          lat = location?.latitude ?? null;
          lon = location?.longitude ?? null;
        }

        return [
          (index + 1).toString(),
          inst.id,
          inst.deviceId,
          inst.locationId,
          inst.originalLocationId || "-",
          lat != null ? lat.toFixed(6) : "-",
          lon != null ? lon.toFixed(6) : "-",
          inst.sensorReading != null ? inst.sensorReading.toString() : "-",
          inst.latestDisCm != null ? inst.latestDisCm.toString() : "-",
          inst.latestDisTimestamp || "-",
          inst.installedByName || "-",
          inst.installedBy || "-",
          teamsMap.get(inst.teamId || "") || "-",
          inst.teamId || "-",
          inst.status,
          inst.flaggedReason || "-",
          inst.verifiedBy || "-",
          inst.verifiedAt ? format(inst.verifiedAt, "yyyy-MM-dd HH:mm:ss") : "-",
          inst.systemPreVerified ? "Yes" : "No",
          inst.systemPreVerifiedAt ? format(inst.systemPreVerifiedAt, "yyyy-MM-dd HH:mm:ss") : "-",
          inst.createdAt ? format(inst.createdAt, "yyyy-MM-dd HH:mm:ss") : "-",
          inst.updatedAt ? format(inst.updatedAt, "yyyy-MM-dd HH:mm:ss") : "-",
          inst.deviceInputMethod || "-",
          inst.serverRefreshedAt ? format(inst.serverRefreshedAt, "yyyy-MM-dd HH:mm:ss") : "-",
          inst.imageUrls?.join("; ") || "-",
          inst.videoUrl || "-",
          inst.tags?.join("; ") || "-",
        ];
      });

      const allRows = [headers, ...csvRows];
      const csvContent = allRows
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
      const dateStr = new Date().toISOString().split('T')[0];
      link.setAttribute("download", `coordinate-filtered-installations-${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Export Complete",
        description: `Exported ${coordinateFilteredInstallations.length} installation(s) successfully.`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: error.message || "An error occurred during export.",
      });
    } finally {
      setExportingCoordinateFiltered(false);
    }
  };

  // Missing Coordinates Filter Functions
  const findInstallationsWithMissingCoordinates = async () => {
    setLoadingMissingCoordinates(true);
    setMissingCoordinatesInstallations([]);

    try {
      // Create location map for quick lookup
      const locationMap = new Map<string, { latitude: number | null; longitude: number | null }>();
      locations.forEach((loc) => {
        locationMap.set(loc.locationId, { latitude: loc.latitude, longitude: loc.longitude });
      });

      // Fetch all installations
      const installationsRef = collection(db, "installations");
      const snapshot = await getDocs(installationsRef);
      
      const filtered: Installation[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        const locationId = data.locationId ? String(data.locationId).trim() : "";
        const isLocation9999 = locationId === "9999";
        
        let hasCoordinates = false;
        
        if (isLocation9999) {
          // For location 9999, check if user-entered coordinates exist
          const lat = data.latitude != null ? (typeof data.latitude === 'number' ? data.latitude : parseFloat(String(data.latitude))) : null;
          const lon = data.longitude != null ? (typeof data.longitude === 'number' ? data.longitude : parseFloat(String(data.longitude))) : null;
          hasCoordinates = lat != null && lon != null && !isNaN(lat) && !isNaN(lon);
        } else {
          // For other locations, check if location exists in locations collection with coordinates
          const location = locationMap.get(locationId);
          hasCoordinates = location != null && 
                          location.latitude != null && 
                          location.longitude != null && 
                          !isNaN(location.latitude) && 
                          !isNaN(location.longitude);
        }
        
        // If coordinates are missing, include this installation
        if (!hasCoordinates && locationId) {
          filtered.push({
            ...data,
            id: doc.id,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
            updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
            verifiedAt: data.verifiedAt?.toDate ? data.verifiedAt.toDate() : data.verifiedAt,
            systemPreVerifiedAt: data.systemPreVerifiedAt?.toDate ? data.systemPreVerifiedAt.toDate() : data.systemPreVerifiedAt,
            serverRefreshedAt: data.serverRefreshedAt?.toDate ? data.serverRefreshedAt.toDate() : data.serverRefreshedAt,
          } as Installation);
        }
      });

      setMissingCoordinatesInstallations(filtered);
      
      if (filtered.length > 0) {
        toast({
          title: "Search Complete",
          description: `Found ${filtered.length} installation(s) with missing coordinates.`,
        });
      } else {
        toast({
          title: "No Installations Found",
          description: "All installations have coordinates.",
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Search Failed",
        description: error.message || "An error occurred while searching.",
      });
    } finally {
      setLoadingMissingCoordinates(false);
    }
  };

  const exportMissingCoordinatesInstallations = async () => {
    if (missingCoordinatesInstallations.length === 0) {
      toast({
        variant: "destructive",
        title: "No Installations",
        description: "No installations to export. Please search for installations first.",
      });
      return;
    }

    setExportingMissingCoordinates(true);

    try {
      // Create location map for coordinate lookup
      const locationMap = new Map<string, { latitude: number | null; longitude: number | null }>();
      locations.forEach((loc) => {
        locationMap.set(loc.locationId, { latitude: loc.latitude, longitude: loc.longitude });
      });

      // Fetch all teams to resolve team names
      const teamsSnapshot = await getDocs(collection(db, "teams"));
      const teamsMap = new Map<string, string>();
      teamsSnapshot.docs.forEach(doc => teamsMap.set(doc.id, doc.data().name));

      // Sort by deviceId and then by createdAt
      const sortedInstallations = [...missingCoordinatesInstallations].sort((a, b) => {
        if (a.deviceId < b.deviceId) return -1;
        if (a.deviceId > b.deviceId) return 1;
        return (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0);
      });

      const headers = [
        "Serial No", "Installation ID", "Device UID", "Location ID", "Original Location ID",
        "Latitude", "Longitude", "Missing Coordinates Reason", "Sensor Reading (cm)", "Latest Server Reading (cm)", "Latest Server Timestamp",
        "Installed By Name", "Installed By UID", "Team Name", "Team ID", "Status", "Flagged Reason",
        "Verified By", "Verified At", "System Pre-Verified", "System Pre-Verified At",
        "Created At", "Updated At", "Device Input Method", "Server Refreshed At",
        "Image URLs", "Video URL", "Tags"
      ];

      const csvRows = sortedInstallations.map((inst, index) => {
        const locationId = inst.locationId ? String(inst.locationId).trim() : "";
        const isLocation9999 = locationId === "9999";
        
        let lat: number | null = null;
        let lon: number | null = null;
        let missingReason = "";
        
        if (isLocation9999) {
          lat = inst.latitude ?? null;
          lon = inst.longitude ?? null;
          missingReason = "Location 9999 - User-entered coordinates are null";
        } else {
          const location = locationMap.get(locationId);
          lat = location?.latitude ?? null;
          lon = location?.longitude ?? null;
          missingReason = location 
            ? `Location ID ${locationId} exists but coordinates are null`
            : `Location ID ${locationId} not found in locations database`;
        }

        return [
          (index + 1).toString(),
          inst.id,
          inst.deviceId,
          inst.locationId,
          inst.originalLocationId || "-",
          lat != null ? lat.toFixed(6) : "-",
          lon != null ? lon.toFixed(6) : "-",
          missingReason,
          inst.sensorReading != null ? inst.sensorReading.toString() : "-",
          inst.latestDisCm != null ? inst.latestDisCm.toString() : "-",
          inst.latestDisTimestamp || "-",
          inst.installedByName || "-",
          inst.installedBy || "-",
          teamsMap.get(inst.teamId || "") || "-",
          inst.teamId || "-",
          inst.status,
          inst.flaggedReason || "-",
          inst.verifiedBy || "-",
          inst.verifiedAt ? format(inst.verifiedAt, "yyyy-MM-dd HH:mm:ss") : "-",
          inst.systemPreVerified ? "Yes" : "No",
          inst.systemPreVerifiedAt ? format(inst.systemPreVerifiedAt, "yyyy-MM-dd HH:mm:ss") : "-",
          inst.createdAt ? format(inst.createdAt, "yyyy-MM-dd HH:mm:ss") : "-",
          inst.updatedAt ? format(inst.updatedAt, "yyyy-MM-dd HH:mm:ss") : "-",
          inst.deviceInputMethod || "-",
          inst.serverRefreshedAt ? format(inst.serverRefreshedAt, "yyyy-MM-dd HH:mm:ss") : "-",
          inst.imageUrls?.join("; ") || "-",
          inst.videoUrl || "-",
          inst.tags?.join("; ") || "-",
        ];
      });

      const allRows = [headers, ...csvRows];
      const csvContent = allRows
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
      const dateStr = new Date().toISOString().split('T')[0];
      link.setAttribute("download", `missing-coordinates-installations-${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Export Complete",
        description: `Exported ${missingCoordinatesInstallations.length} installation(s) successfully.`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: error.message || "An error occurred during export.",
      });
    } finally {
      setExportingMissingCoordinates(false);
    }
  };

  const findInstallationsForTeamChange = async () => {
    if (!deviceIdsInput.trim()) {
      toast({
        variant: "destructive",
        title: "Device IDs Required",
        description: "Please enter device IDs (one per line).",
      });
      return;
    }

    if (!bulkChangeSourceTeamId || !bulkChangeTargetTeamId) {
      toast({
        variant: "destructive",
        title: "Teams Required",
        description: "Please select both source and target teams.",
      });
      return;
    }

    setLoadingTeamMatches(true);
    setMatchingTeamInstallations([]);

    try {
      // Parse device IDs from input (one per line)
      const deviceIds = deviceIdsInput
        .split('\n')
        .map(id => id.trim().toUpperCase())
        .filter(id => id.length > 0);

      if (deviceIds.length === 0) {
        toast({
          variant: "destructive",
          title: "No Valid Device IDs",
          description: "Please enter at least one device ID.",
        });
        setLoadingTeamMatches(false);
        return;
      }

      const installationsRef = collection(db, "installations");
      const snapshot = await getDocs(installationsRef);
      
      const matches: Installation[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        const deviceId = data.deviceId?.toUpperCase();
        
        // Check if device ID is in the list and team matches source
        if (deviceIds.includes(deviceId) && data.teamId === bulkChangeSourceTeamId) {
          matches.push({
            ...data,
            id: doc.id,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
            updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
            verifiedAt: data.verifiedAt?.toDate ? data.verifiedAt.toDate() : data.verifiedAt,
            systemPreVerifiedAt: data.systemPreVerifiedAt?.toDate ? data.systemPreVerifiedAt.toDate() : data.systemPreVerifiedAt,
            serverRefreshedAt: data.serverRefreshedAt?.toDate ? data.serverRefreshedAt.toDate() : data.serverRefreshedAt,
          } as Installation);
        }
      });

      setMatchingTeamInstallations(matches);
      
      if (matches.length > 0) {
        setShowTeamUpdateDialog(true);
      } else {
        toast({
          title: "No Installations Found",
          description: `No installations found matching the specified device IDs with team ${bulkChangeSourceTeamId}.`,
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Search Failed",
        description: error.message || "An error occurred while searching.",
      });
    } finally {
      setLoadingTeamMatches(false);
    }
  };

  const handleBulkTeamUpdate = async () => {
    if (matchingTeamInstallations.length === 0) {
      toast({
        variant: "destructive",
        title: "No Installations",
        description: "No installations found to update.",
      });
      return;
    }

    setUpdatingTeams(true);

    try {
      let batch = writeBatch(db);
      let batchCount = 0;

      for (const installation of matchingTeamInstallations) {
        const installationRef = doc(db, "installations", installation.id);
        
        batch.update(installationRef, {
          teamId: bulkChangeTargetTeamId,
          updatedAt: serverTimestamp(),
        });
        batchCount++;

        if (batchCount === 500) {
          await batch.commit();
          batchCount = 0;
          batch = writeBatch(db);
        }
      }

      if (batchCount > 0) {
        await batch.commit();
      }

      toast({
        title: "Update Complete",
        description: `Successfully updated ${matchingTeamInstallations.length} installation(s) to new team.`,
      });

      setMatchingTeamInstallations([]);
      setShowTeamUpdateDialog(false);
      setDeviceIdsInput("");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: error.message || "An error occurred during update.",
      });
    } finally {
      setUpdatingTeams(false);
    }
  };

  const findInstallationsForExport = async () => {
    if (!exportDeviceIdsInput.trim()) {
      toast({
        variant: "destructive",
        title: "Device IDs Required",
        description: "Please enter device IDs (one per line).",
      });
      return;
    }

    setLoadingExportMatches(true);
    setExportMatchingInstallations([]);

    try {
      // Parse device IDs from input (one per line)
      const deviceIds = exportDeviceIdsInput
        .split('\n')
        .map(id => id.trim().toUpperCase())
        .filter(id => id.length > 0);

      if (deviceIds.length === 0) {
        toast({
          variant: "destructive",
          title: "No Valid Device IDs",
          description: "Please enter at least one device ID.",
        });
        setLoadingExportMatches(false);
        return;
      }

      const installationsRef = collection(db, "installations");
      const snapshot = await getDocs(installationsRef);
      
      const matches: Installation[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        const deviceId = data.deviceId?.toUpperCase();
        
        // Check if device ID is in the list
        if (deviceIds.includes(deviceId)) {
          matches.push({
            ...data,
            id: doc.id,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
            updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
            verifiedAt: data.verifiedAt?.toDate ? data.verifiedAt.toDate() : data.verifiedAt,
            systemPreVerifiedAt: data.systemPreVerifiedAt?.toDate ? data.systemPreVerifiedAt.toDate() : data.systemPreVerifiedAt,
            serverRefreshedAt: data.serverRefreshedAt?.toDate ? data.serverRefreshedAt.toDate() : data.serverRefreshedAt,
          } as Installation);
        }
      });

      setExportMatchingInstallations(matches);
      
      if (matches.length > 0) {
        toast({
          title: "Installations Found",
          description: `Found ${matches.length} installation(s) matching the specified device IDs.`,
        });
      } else {
        toast({
          title: "No Installations Found",
          description: "No installations found matching the specified device IDs.",
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Search Failed",
        description: error.message || "An error occurred while searching.",
      });
    } finally {
      setLoadingExportMatches(false);
    }
  };

  const exportSelectedInstallations = async () => {
    if (exportMatchingInstallations.length === 0) {
      toast({
        variant: "destructive",
        title: "No Installations",
        description: "No installations found to export.",
      });
      return;
    }

    setExportingSelectedInstallations(true);

    try {
      // Fetch all teams to resolve team names
      const teamsSnapshot = await getDocs(collection(db, "teams"));
      const teamsMap = new Map<string, string>();
      teamsSnapshot.docs.forEach(doc => teamsMap.set(doc.id, doc.data().name));

      // Sort by deviceId and then by createdAt
      const sortedInstallations = [...exportMatchingInstallations].sort((a, b) => {
        if (a.deviceId < b.deviceId) return -1;
        if (a.deviceId > b.deviceId) return 1;
        return (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0);
      });

      const headers = [
        "Serial No", "Installation ID", "Device UID", "Location ID", "Original Location ID",
        "Latitude", "Longitude", "Sensor Reading (cm)", "Latest Server Reading (cm)", "Latest Server Timestamp",
        "Installed By Name", "Installed By UID", "Team Name", "Team ID", "Status", "Flagged Reason",
        "Verified By", "Verified At", "System Pre-Verified", "System Pre-Verified At",
        "Created At", "Updated At", "Device Input Method", "Server Refreshed At",
        "Image URLs", "Video URL", "Tags"
      ];

      const csvRows = sortedInstallations.map((inst, index) => [
        (index + 1).toString(),
        inst.id,
        inst.deviceId,
        inst.locationId,
        inst.originalLocationId || "-",
        inst.latitude != null ? inst.latitude.toFixed(6) : "-",
        inst.longitude != null ? inst.longitude.toFixed(6) : "-",
        inst.sensorReading != null ? inst.sensorReading.toString() : "-",
        inst.latestDisCm != null ? inst.latestDisCm.toString() : "-",
        inst.latestDisTimestamp || "-",
        inst.installedByName || "-",
        inst.installedBy || "-",
        teamsMap.get(inst.teamId || "") || "-",
        inst.teamId || "-",
        inst.status,
        inst.flaggedReason || "-",
        inst.verifiedBy || "-",
        inst.verifiedAt ? format(inst.verifiedAt, "yyyy-MM-dd HH:mm:ss") : "-",
        inst.systemPreVerified ? "Yes" : "No",
        inst.systemPreVerifiedAt ? format(inst.systemPreVerifiedAt, "yyyy-MM-dd HH:mm:ss") : "-",
        inst.createdAt ? format(inst.createdAt, "yyyy-MM-dd HH:mm:ss") : "-",
        inst.updatedAt ? format(inst.updatedAt, "yyyy-MM-dd HH:mm:ss") : "-",
        inst.deviceInputMethod || "-",
        inst.serverRefreshedAt ? format(inst.serverRefreshedAt, "yyyy-MM-dd HH:mm:ss") : "-",
        inst.imageUrls?.join("; ") || "-",
        inst.videoUrl || "-",
        inst.tags?.join("; ") || "-",
      ]);

      const allRows = [headers, ...csvRows];
      const csvContent = allRows
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
      const dateStr = new Date().toISOString().split('T')[0];
      link.setAttribute("download", `selected-installations-${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Export Complete",
        description: `Exported ${sortedInstallations.length} installation(s) successfully.`,
      });

      // Clear the results after successful export
      setExportMatchingInstallations([]);
      setExportDeviceIdsInput("");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: error.message || "An error occurred during export.",
      });
    } finally {
      setExportingSelectedInstallations(false);
    }
  };

  const handleLocationUpload = async () => {
    if (!locationFile || !userProfile) return;

    setUploadingLocations(true);
    setLocationProgress(0);
    const result = { success: 0, failed: 0, errors: [] as string[] };

    try {
      let rows: string[][];
      
      if (locationFile.name.endsWith('.xlsx') || locationFile.name.endsWith('.xls')) {
        rows = await parseLocationExcel(locationFile);
      } else {
        const text = await locationFile.text();
        rows = parseLocationCSV(text);
      }

      if (rows.length < 2) {
        toast({
          variant: "destructive",
          title: "Import Failed",
          description: "File must contain at least a header row and one data row.",
        });
        setUploadingLocations(false);
        return;
      }

      // Skip header row
      const dataRows = rows.slice(1);
      const totalRows = dataRows.length;

      // Find column indices
      const headerRow = rows[0].map(h => h.toString().toLowerCase().trim());
      const locationIdIdx = headerRow.findIndex(h => h.includes('location') && h.includes('id'));
      const latIdx = headerRow.findIndex(h => h.includes('lat'));
      const lonIdx = headerRow.findIndex(h => h.includes('lon') || h.includes('lng'));

      if (locationIdIdx === -1 || latIdx === -1 || lonIdx === -1) {
        toast({
          variant: "destructive",
          title: "Invalid Format",
          description: "File must contain LocationID, Latitude, and Longitude columns.",
        });
        setUploadingLocations(false);
        return;
      }

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const locationId = row[locationIdIdx]?.toString().trim();
        const latStr = row[latIdx]?.toString().trim();
        const lonStr = row[lonIdx]?.toString().trim();

        if (!locationId || !latStr || !lonStr) {
          result.failed++;
          result.errors.push(`Row ${i + 2}: Missing required fields`);
          continue;
        }

        const lat = parseFloat(latStr);
        const lon = parseFloat(lonStr);

        if (isNaN(lat) || isNaN(lon)) {
          result.failed++;
          result.errors.push(`Row ${i + 2}: Invalid coordinates for ${locationId}`);
          continue;
        }

        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
          result.failed++;
          result.errors.push(`Row ${i + 2}: Coordinates out of range for ${locationId}`);
          continue;
        }

        try {
          await setDoc(doc(db, "locations", locationId), {
            locationId,
            latitude: lat,
            longitude: lon,
            updatedAt: serverTimestamp(),
          });
          result.success++;
        } catch (error: any) {
          result.failed++;
          result.errors.push(`Row ${i + 2}: ${error.message || 'Failed to save'}`);
        }

        setLocationProgress(Math.round(((i + 1) / totalRows) * 100));
      }

      setLocationResult(result);
      toast({
        title: "Upload Complete",
        description: `Successfully uploaded ${result.success} locations. ${result.failed > 0 ? `${result.failed} failed.` : ''}`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: error.message || "An error occurred during upload.",
      });
    } finally {
      setUploadingLocations(false);
      setLocationProgress(0);
    }
  };

  if (!userProfile?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">You don't have permission to access the admin dashboard.</p>
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
          Admin Dashboard
        </h1>
        <p className="text-muted-foreground mt-2">Manage all users, teams, and system settings</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Total Users</p>
                <p className="text-3xl font-bold">{users.length}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                <Users className="h-6 w-6 text-blue-600 dark:text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Total Teams</p>
                <p className="text-3xl font-bold">
                  {Object.values(userTeams).reduce((sum, teams) => sum + teams.length, 0)}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <Users className="h-6 w-6 text-slate-600 dark:text-slate-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Admins</p>
                <p className="text-3xl font-bold">{users.filter(u => u.isAdmin).length}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <Shield className="h-6 w-6 text-slate-600 dark:text-slate-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Active Users</p>
                <p className="text-3xl font-bold">{users.length}</p>
              </div>
              <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Location Coordinates Upload */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle>Upload Location Coordinates</CardTitle>
          <CardDescription>Upload a CSV or Excel file with LocationID, Latitude, and Longitude columns</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <div className="flex-1 space-y-2">
              <Input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleLocationFileChange}
                disabled={uploadingLocations}
                className="cursor-pointer"
              />
              <p className="text-xs text-muted-foreground">
                Accepted formats: CSV, Excel (.xlsx, .xls)
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={downloadLocationTemplate}
                disabled={uploadingLocations}
              >
                <Download className="h-4 w-4 mr-2" />
                Download Template
              </Button>
              <Button
                onClick={handleLocationUpload}
                disabled={!locationFile || uploadingLocations}
              >
                {uploadingLocations ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Locations
                  </>
                )}
              </Button>
            </div>
          </div>

          {uploadingLocations && (
            <div className="space-y-2">
              <Progress value={locationProgress} />
              <p className="text-sm text-muted-foreground text-center">
                {locationProgress}% complete
              </p>
            </div>
          )}

          {locationResult && (
            <div className="space-y-2 p-4 rounded-lg border">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="font-semibold text-green-600">{locationResult.success} successful</span>
                </div>
                {locationResult.failed > 0 && (
                  <div className="flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-red-600" />
                    <span className="font-semibold text-red-600">{locationResult.failed} failed</span>
                  </div>
                )}
              </div>
              {locationResult.errors.length > 0 && (
                <div className="mt-2 max-h-32 overflow-y-auto">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Errors:</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {locationResult.errors.slice(0, 10).map((error, idx) => (
                      <li key={idx}>{error}</li>
                    ))}
                    {locationResult.errors.length > 10 && (
                      <li className="text-muted-foreground">... and {locationResult.errors.length - 10} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Municipality Mapping Upload */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle>Upload Municipality Mapping</CardTitle>
          <CardDescription>Map Location IDs (Serial) to municipalities (البلدية)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <div className="flex-1 space-y-2">
              <Input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleMunicipalityFileChange}
                disabled={uploadingMunicipalities}
                className="cursor-pointer"
              />
              <p className="text-xs text-muted-foreground">
                Required columns: Serial (Location ID) and MunicipalityName/البلدية
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={downloadMunicipalityMapping}
                disabled={uploadingMunicipalities}
              >
                <Download className="h-4 w-4 mr-2" />
                Download Current
              </Button>
              <Button
                onClick={handleMunicipalityUpload}
                disabled={!municipalityFile || uploadingMunicipalities}
              >
                {uploadingMunicipalities ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Municipalities
                  </>
                )}
              </Button>
            </div>
          </div>

          {uploadingMunicipalities && (
            <div className="space-y-2">
              <Progress value={municipalityProgress} />
              <p className="text-sm text-muted-foreground text-center">
                {municipalityProgress}% complete
              </p>
            </div>
          )}

          {municipalityResult && (
            <div className="space-y-2 p-4 rounded-lg border">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="font-semibold text-green-600">{municipalityResult.success} updated</span>
                </div>
                {municipalityResult.failed > 0 && (
                  <div className="flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-red-600" />
                    <span className="font-semibold text-red-600">{municipalityResult.failed} failed</span>
                  </div>
                )}
              </div>
              {municipalityResult.errors.length > 0 && (
                <div className="mt-2 max-h-32 overflow-y-auto">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Errors:</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {municipalityResult.errors.slice(0, 10).map((error, idx) => (
                      <li key={idx}>{error}</li>
                    ))}
                    {municipalityResult.errors.length > 10 && (
                      <li className="text-muted-foreground">... and {municipalityResult.errors.length - 10} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk Location ID Update */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5" />
            Bulk Update Location IDs
          </CardTitle>
          <CardDescription>Find and update locationId for installations matching specific criteria</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Search Criteria */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Team ID</label>
              <Input
                placeholder="Enter team ID"
                value={targetTeamId}
                onChange={(e) => setTargetTeamId(e.target.value)}
                disabled={loadingMatches || updatingLocationIds}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Exclude Installer Name</label>
              <Input
                placeholder="Enter name to exclude"
                value={excludeInstallerName}
                onChange={(e) => setExcludeInstallerName(e.target.value)}
                disabled={loadingMatches || updatingLocationIds}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to include all installers
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">New Location ID</label>
              <Input
                placeholder="Enter new location ID"
                value={newLocationId}
                onChange={(e) => setNewLocationId(e.target.value)}
                disabled={loadingMatches || updatingLocationIds}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              onClick={findMatchingInstallations}
              disabled={!targetTeamId || loadingMatches || updatingLocationIds}
            >
              {loadingMatches ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Find Matching Installations
                </>
              )}
            </Button>

            {matchingInstallations.length > 0 && (
              <Button
                variant="default"
                onClick={() => setShowUpdateConfirmDialog(true)}
                disabled={!newLocationId || updatingLocationIds}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Update {matchingInstallations.length} Installation{matchingInstallations.length !== 1 ? 's' : ''}
              </Button>
            )}
          </div>

          {/* Matching Results */}
          {matchingInstallations.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-blue-600" />
                  <span className="font-semibold text-blue-600">
                    Found {matchingInstallations.length} matching installation{matchingInstallations.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {/* Preview of matching installations */}
              <div className="border rounded-lg p-4 max-h-96 overflow-y-auto">
                <p className="text-sm font-semibold mb-3">Preview (showing first 10):</p>
                <div className="space-y-2">
                  {matchingInstallations.slice(0, 10).map((installation) => (
                    <div key={installation.id} className="flex items-center justify-between p-3 rounded-md bg-muted/50 text-sm">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{installation.installedByName}</span>
                          <Badge variant="outline" className="text-xs">{installation.deviceId}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground flex gap-3">
                          <span>Current Location ID: <span className="font-mono font-medium">{installation.locationId}</span></span>
                          {installation.originalLocationId && (
                            <span>Original: <span className="font-mono">{installation.originalLocationId}</span></span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-muted-foreground">Will become</span>
                        <p className="font-mono font-medium text-green-600">{newLocationId}</p>
                      </div>
                    </div>
                  ))}
                  {matchingInstallations.length > 10 && (
                    <p className="text-xs text-muted-foreground text-center pt-2">
                      ... and {matchingInstallations.length - 10} more
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* No results message */}
          {!loadingMatches && matchingInstallations.length === 0 && targetTeamId && (
            <div className="text-center py-6 text-muted-foreground">
              <p className="text-sm">No matching installations found. Try searching first.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={showUpdateConfirmDialog} onOpenChange={setShowUpdateConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Bulk Update</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>You are about to update <strong>{matchingInstallations.length}</strong> installation(s).</p>
              <p className="font-semibold">Changes:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Set <code className="bg-muted px-1 rounded">locationId</code> to <strong>{newLocationId}</strong></li>
                <li>Save current locationId to <code className="bg-muted px-1 rounded">originalLocationId</code> (if not already saved)</li>
              </ul>
              <p className="text-amber-600 dark:text-amber-500 font-medium mt-3">
                This action cannot be undone. Are you sure you want to continue?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updatingLocationIds}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkLocationUpdate}
              disabled={updatingLocationIds}
              className="bg-primary"
            >
              {updatingLocationIds ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  Confirm Update
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Quick Fix: Update 999 to 9999 */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Quick Fix: Update Location 999 to 9999
          </CardTitle>
          <CardDescription>
            Update all installations with locationId "999" to "9999" (excluding team 6ZsR0Bd6WbXyc11ooEuV)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={find999Installations}
              disabled={loadingMatches || updating999to9999 || exporting999Report}
            >
              {loadingMatches ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Find Installations with 999
                </>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={export999to9999Report}
              disabled={exporting999Report || loadingMatches || updating999to9999}
            >
              {exporting999Report ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <FileDown className="h-4 w-4 mr-2" />
                  Export Shifted to 9999
                </>
              )}
            </Button>
            
            {found999Installations.length > 0 && (
              <Badge variant="outline" className="text-sm">
                Found {found999Installations.length} installation{found999Installations.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>

          {found999Installations.length > 0 && (
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-900 dark:text-blue-100">
                Ready to update {found999Installations.length} installation{found999Installations.length !== 1 ? 's' : ''} from locationId "999" to "9999"
              </p>
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            <p><strong>Export Report:</strong> Downloads all installations where locationId = "9999", has an originalLocationId, and teamId = "ttaMvVwJTIpXIJ5NTmee"</p>
          </div>
        </CardContent>
      </Card>

      {/* 999 to 9999 Confirmation Dialog */}
      <AlertDialog open={show999UpdateDialog} onOpenChange={setShow999UpdateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Location ID Update</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>You are about to update <strong>{found999Installations.length}</strong> installation(s).</p>
              <p className="font-semibold">Changes:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Change locationId from <strong>"999"</strong> to <strong>"9999"</strong></li>
                <li>Exclude team: <code className="bg-muted px-1 rounded">6ZsR0Bd6WbXyc11ooEuV</code></li>
                <li>Save original locationId to <code className="bg-muted px-1 rounded">originalLocationId</code></li>
              </ul>
              <p className="text-amber-600 dark:text-amber-500 font-medium mt-3">
                This action cannot be undone. Are you sure you want to continue?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updating999to9999}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUpdate999to9999}
              disabled={updating999to9999}
              className="bg-primary"
            >
              {updating999to9999 ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  Confirm Update
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Export Duplicate Installations */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Export Duplicate Device Installations
          </CardTitle>
          <CardDescription>
            Download a CSV report of all devices that have multiple installations (violations of one-device-one-installation rule)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Button
              variant="default"
              onClick={exportDuplicateInstallations}
              disabled={exportingDuplicates}
            >
              {exportingDuplicates ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <FileDown className="h-4 w-4 mr-2" />
                  Export Duplicate Installations
                </>
              )}
            </Button>
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>Report includes:</strong></p>
            <ul className="list-disc list-inside ml-2">
              <li>All installation records for devices with multiple installations</li>
              <li>Complete installation data: Device UID, Location ID, GPS, Sensor Reading, Images, Status, etc.</li>
              <li>Sorted by Device UID for easy identification of duplicates</li>
              <li>All fields and metadata for comprehensive analysis</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Delete Devices from Master List */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            Delete Devices from Master List
          </CardTitle>
          <CardDescription>
            Remove devices from the `devices` collection by UID. Related installation records are not deleted automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="delete-device-ids">Device UIDs (one per line)</Label>
            <Textarea
              id="delete-device-ids"
              placeholder="E75832989D048709&#10;434F564A84ADB55F&#10;8E9F81B4EDF9910B&#10;..."
              value={deleteDeviceIdsInput}
              onChange={(e) => setDeleteDeviceIdsInput(e.target.value)}
              disabled={deletingDevices}
              className="font-mono h-40"
            />
            <p className="text-xs text-muted-foreground">
              This only deletes device documents. Any installations referencing these UIDs must be cleaned up separately.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="destructive"
              onClick={openDeleteDevicesDialog}
              disabled={deleteDeviceIdList.length === 0 || deletingDevices}
            >
              {deletingDevices ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Devices
                  {deleteDeviceIdList.length > 0 && (
                    <span className="ml-2 text-xs font-normal">
                      ({deleteDeviceIdList.length})
                    </span>
                  )}
                </>
              )}
            </Button>

            {deleteDeviceIdList.length > 0 && !deletingDevices && (
              <Badge variant="secondary" className="text-xs">
                {deleteDeviceIdList.length} UID{deleteDeviceIdList.length === 1 ? "" : "s"} queued
              </Badge>
            )}
          </div>

          {deviceDeletionSummary && (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/40">
              <p className="text-sm font-semibold">Last delete run</p>
              {deviceDeletionSummary.deleted.length > 0 && (
                <p className="text-sm text-green-600 font-medium">
                  Deleted: {deviceDeletionSummary.deleted.length}
                </p>
              )}
              {deviceDeletionSummary.notFound.length > 0 && (
                <div className="text-sm text-amber-600 space-y-1">
                  <p className="font-medium">
                    Not found: {deviceDeletionSummary.notFound.length}
                  </p>
                  <p className="font-mono text-xs break-all">
                    {deviceDeletionSummary.notFound.slice(0, 5).join(", ")}
                    {deviceDeletionSummary.notFound.length > 5 && " ..."}
                  </p>
                </div>
              )}
              {deviceDeletionSummary.failed.length > 0 && (
                <div className="text-sm text-destructive space-y-1">
                  <p className="font-medium">
                    Failed: {deviceDeletionSummary.failed.length}
                  </p>
                  <div className="space-y-1 text-xs font-mono">
                    {deviceDeletionSummary.failed.slice(0, 3).map((item) => (
                      <p key={item.id}>
                        {item.id}: {item.error}
                      </p>
                    ))}
                    {deviceDeletionSummary.failed.length > 3 && (
                      <p className="italic text-[11px]">...and more</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Devices Confirmation Dialog */}
      <AlertDialog open={showDeleteDevicesDialog} onOpenChange={setShowDeleteDevicesDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteDeviceIdList.length} device{deleteDeviceIdList.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                This action permanently deletes <strong>{deleteDeviceIdList.length}</strong> device record{deleteDeviceIdList.length === 1 ? "" : "s"}.
              </p>
              <p className="text-amber-600">
                Installations referencing these UIDs will remain in the database until you delete them separately.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingDevices}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteDevices}
              disabled={deletingDevices}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingDevices ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Devices
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Team Change */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Bulk Team Change
          </CardTitle>
          <CardDescription>Change team for multiple installations by device IDs</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Source Team (From)</Label>
              <Select value={bulkChangeSourceTeamId} onValueChange={setBulkChangeSourceTeamId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select source team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name} ({team.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Target Team (To)</Label>
              <Select value={bulkChangeTargetTeamId} onValueChange={setBulkChangeTargetTeamId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name} ({team.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="deviceIds">Device IDs (one per line)</Label>
            <Textarea
              id="deviceIds"
              value={deviceIdsInput}
              onChange={(e) => setDeviceIdsInput(e.target.value)}
              placeholder="E75832989D048709&#10;434F564A84ADB55F&#10;8E9F81B4EDF9910B&#10;..."
              className="font-mono h-48"
              disabled={loadingTeamMatches || updatingTeams}
            />
            <p className="text-xs text-muted-foreground">
              Enter device IDs, one per line. Will only update installations matching these device IDs AND the source team.
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={findInstallationsForTeamChange}
              disabled={!bulkChangeSourceTeamId || !bulkChangeTargetTeamId || !deviceIdsInput.trim() || loadingTeamMatches || updatingTeams}
            >
              {loadingTeamMatches ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Find Matching Installations
                </>
              )}
            </Button>
          </div>

          {matchingTeamInstallations.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-blue-600" />
                  <span className="font-semibold text-blue-600">
                    Found {matchingTeamInstallations.length} matching installation{matchingTeamInstallations.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <Button
                  variant="default"
                  onClick={() => setShowTeamUpdateDialog(true)}
                  disabled={updatingTeams}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Update Teams
                </Button>
              </div>

              <div className="border rounded-lg p-4 max-h-96 overflow-y-auto">
                <p className="text-sm font-semibold mb-3">Preview (showing first 10):</p>
                <div className="space-y-2">
                  {matchingTeamInstallations.slice(0, 10).map((installation) => {
                    const sourceTeam = teams.find(t => t.id === installation.teamId);
                    const targetTeam = teams.find(t => t.id === bulkChangeTargetTeamId);
                    return (
                      <div key={installation.id} className="flex items-center justify-between p-3 rounded-md bg-muted/50 text-sm">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium font-mono">{installation.deviceId}</span>
                            <Badge variant="outline" className="text-xs">{installation.locationId}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Installer: {installation.installedByName}
                          </div>
                        </div>
                        <div className="text-right space-y-1">
                          <div className="text-xs text-muted-foreground">From: {sourceTeam?.name || bulkChangeSourceTeamId}</div>
                          <div className="text-xs font-medium text-green-600">To: {targetTeam?.name || bulkChangeTargetTeamId}</div>
                        </div>
                      </div>
                    );
                  })}
                  {matchingTeamInstallations.length > 10 && (
                    <p className="text-xs text-muted-foreground text-center pt-2">
                      ... and {matchingTeamInstallations.length - 10} more
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Team Update Confirmation Dialog */}
      <AlertDialog open={showTeamUpdateDialog} onOpenChange={setShowTeamUpdateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Bulk Team Change</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>You are about to update <strong>{matchingTeamInstallations.length}</strong> installation(s).</p>
              <p className="font-semibold">Changes:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Change team from <strong>{teams.find(t => t.id === bulkChangeSourceTeamId)?.name || bulkChangeSourceTeamId}</strong></li>
                <li>To <strong>{teams.find(t => t.id === bulkChangeTargetTeamId)?.name || bulkChangeTargetTeamId}</strong></li>
              </ul>
              <p className="text-amber-600 dark:text-amber-500 font-medium mt-3">
                This action cannot be undone. Are you sure you want to continue?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updatingTeams}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkTeamUpdate}
              disabled={updatingTeams}
              className="bg-primary"
            >
              {updatingTeams ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  Confirm Update
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Location Change */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Bulk Location Change
          </CardTitle>
          <CardDescription>Change location ID for multiple installations by device IDs</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bulk-location-device-ids">Device IDs (one per line)</Label>
              <Textarea
                id="bulk-location-device-ids"
                placeholder="Enter device IDs, one per line..."
                value={bulkLocationDeviceIdsInput}
                onChange={(e) => setBulkLocationDeviceIdsInput(e.target.value)}
                disabled={loadingLocationMatches || updatingLocations}
                className="min-h-[120px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Enter device UIDs, one per line. Matching installations will be found.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulk-location-target">Target Location ID</Label>
              <Input
                id="bulk-location-target"
                placeholder="Enter target location ID (e.g., 9999)"
                value={bulkLocationTargetLocationId}
                onChange={(e) => setBulkLocationTargetLocationId(e.target.value)}
                disabled={loadingLocationMatches || updatingLocations}
              />
              <p className="text-xs text-muted-foreground">
                Enter the location ID to assign to all matching installations.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={findInstallationsForLocationChange}
              disabled={!bulkLocationDeviceIdsInput.trim() || !bulkLocationTargetLocationId.trim() || loadingLocationMatches || updatingLocations}
            >
              {loadingLocationMatches ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Find Matching Installations
                </>
              )}
            </Button>
          </div>

          {/* Preview of matching installations */}
          {matchingLocationInstallations.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-blue-600" />
                  <span className="font-semibold text-blue-600">
                    Found {matchingLocationInstallations.length} matching installation{matchingLocationInstallations.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              <div className="border rounded-lg p-4 max-h-96 overflow-y-auto">
                <p className="text-sm font-semibold mb-3">Preview (showing first 10):</p>
                <div className="space-y-2">
                  {matchingLocationInstallations.slice(0, 10).map((installation) => (
                    <div key={installation.id} className="flex items-center justify-between p-3 rounded-md bg-muted/50 text-sm">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium font-mono">{installation.deviceId}</span>
                          <Badge variant="outline" className="text-xs">Current: {installation.locationId}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Installer: {installation.installedByName}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Will become</div>
                        <div className="text-xs font-medium text-green-600">Location: {bulkLocationTargetLocationId}</div>
                      </div>
                    </div>
                  ))}
                  {matchingLocationInstallations.length > 10 && (
                    <p className="text-xs text-muted-foreground text-center pt-2">
                      ... and {matchingLocationInstallations.length - 10} more
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog for Bulk Location Change */}
      <AlertDialog open={showLocationUpdateDialog} onOpenChange={setShowLocationUpdateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Bulk Location Change</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>You are about to update <strong>{matchingLocationInstallations.length}</strong> installation(s).</p>
              <p className="font-semibold">Changes:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Update location ID to <strong>{bulkLocationTargetLocationId}</strong></li>
                <li>Original location IDs will be preserved in the originalLocationId field</li>
              </ul>
              <p className="text-amber-600 dark:text-amber-500 font-medium mt-3">
                This action cannot be undone. Are you sure you want to continue?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updatingLocations}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkLocationChangeByDeviceIds}
              disabled={updatingLocations}
              className="bg-primary"
            >
              {updatingLocations ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  Confirm Update
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Coordinate Range Filter */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Filter by Coordinate Range
          </CardTitle>
          <CardDescription>
            Filter installations by latitude/longitude range. For location ID 9999, uses user-entered coordinates. 
            For other locations, uses coordinates from location database.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="min-latitude">Minimum Latitude</Label>
              <Input
                id="min-latitude"
                type="number"
                step="any"
                placeholder="e.g., 21.0"
                value={minLatitude}
                onChange={(e) => setMinLatitude(e.target.value)}
                disabled={loadingCoordinateFilter || exportingCoordinateFiltered}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-latitude">Maximum Latitude</Label>
              <Input
                id="max-latitude"
                type="number"
                step="any"
                placeholder="e.g., 22.0"
                value={maxLatitude}
                onChange={(e) => setMaxLatitude(e.target.value)}
                disabled={loadingCoordinateFilter || exportingCoordinateFiltered}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="min-longitude">Minimum Longitude</Label>
              <Input
                id="min-longitude"
                type="number"
                step="any"
                placeholder="e.g., 39.0"
                value={minLongitude}
                onChange={(e) => setMinLongitude(e.target.value)}
                disabled={loadingCoordinateFilter || exportingCoordinateFiltered}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-longitude">Maximum Longitude</Label>
              <Input
                id="max-longitude"
                type="number"
                step="any"
                placeholder="e.g., 40.0"
                value={maxLongitude}
                onChange={(e) => setMaxLongitude(e.target.value)}
                disabled={loadingCoordinateFilter || exportingCoordinateFiltered}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={filterInstallationsByCoordinateRange}
              disabled={!minLatitude || !maxLatitude || !minLongitude || !maxLongitude || loadingCoordinateFilter || exportingCoordinateFiltered}
            >
              {loadingCoordinateFilter ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Filtering...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Filter Installations
                </>
              )}
            </Button>

            {coordinateFilteredInstallations.length > 0 && (
              <Button
                onClick={exportCoordinateFilteredInstallations}
                disabled={exportingCoordinateFiltered}
                variant="default"
              >
                {exportingCoordinateFiltered ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <FileDown className="h-4 w-4 mr-2" />
                    Export to CSV ({coordinateFilteredInstallations.length})
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Results Preview */}
          {coordinateFilteredInstallations.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-blue-600" />
                  <span className="font-semibold text-blue-600">
                    Found {coordinateFilteredInstallations.length} installation{coordinateFilteredInstallations.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {/* Preview of filtered installations */}
              <div className="border rounded-lg p-4 max-h-96 overflow-y-auto">
                <p className="text-sm font-semibold mb-3">Preview (showing first 10):</p>
                <div className="space-y-2">
                  {coordinateFilteredInstallations.slice(0, 10).map((installation) => {
                    const locationId = installation.locationId ? String(installation.locationId).trim() : "";
                    const isLocation9999 = locationId === "9999";
                    const locationMap = new Map<string, { latitude: number; longitude: number }>();
                    locations.forEach((loc) => {
                      locationMap.set(loc.locationId, { latitude: loc.latitude, longitude: loc.longitude });
                    });
                    
                    let lat: number | null = null;
                    let lon: number | null = null;
                    
                    if (isLocation9999) {
                      lat = installation.latitude ?? null;
                      lon = installation.longitude ?? null;
                    } else {
                      const location = locationMap.get(locationId);
                      lat = location?.latitude ?? null;
                      lon = location?.longitude ?? null;
                    }

                    return (
                      <div key={installation.id} className="flex items-center justify-between p-3 rounded-md bg-muted/50 text-sm">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium font-mono">{installation.deviceId}</span>
                            <Badge variant="outline" className="text-xs">
                              Location: {installation.locationId}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Installer: {installation.installedByName}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">Coordinates</div>
                          <div className="text-xs font-mono">
                            {lat != null && lon != null ? `${lat.toFixed(6)}, ${lon.toFixed(6)}` : "N/A"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {coordinateFilteredInstallations.length > 10 && (
                    <p className="text-xs text-muted-foreground text-center pt-2">
                      ... and {coordinateFilteredInstallations.length - 10} more
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Missing Coordinates Filter */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Find Installations with Missing Coordinates
          </CardTitle>
          <CardDescription>
            Find installations where coordinates are missing:
            <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
              <li>Location ID 9999 with null user-entered coordinates</li>
              <li>Other location IDs where the location-to-coordinates mapping is missing or null</li>
            </ul>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex gap-3">
            <Button
              onClick={findInstallationsWithMissingCoordinates}
              disabled={loadingMissingCoordinates || exportingMissingCoordinates}
            >
              {loadingMissingCoordinates ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Find Missing Coordinates
                </>
              )}
            </Button>

            {missingCoordinatesInstallations.length > 0 && (
              <Button
                onClick={exportMissingCoordinatesInstallations}
                disabled={exportingMissingCoordinates}
                variant="default"
              >
                {exportingMissingCoordinates ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <FileDown className="h-4 w-4 mr-2" />
                    Export to CSV ({missingCoordinatesInstallations.length})
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Results Preview */}
          {missingCoordinatesInstallations.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <span className="font-semibold text-amber-600">
                    Found {missingCoordinatesInstallations.length} installation{missingCoordinatesInstallations.length !== 1 ? 's' : ''} with missing coordinates
                  </span>
                </div>
              </div>

              {/* Preview of filtered installations */}
              <div className="border rounded-lg p-4 max-h-96 overflow-y-auto">
                <p className="text-sm font-semibold mb-3">Preview (showing first 10):</p>
                <div className="space-y-2">
                  {missingCoordinatesInstallations.slice(0, 10).map((installation) => {
                    const locationId = installation.locationId ? String(installation.locationId).trim() : "";
                    const isLocation9999 = locationId === "9999";
                    const locationMap = new Map<string, { latitude: number | null; longitude: number | null }>();
                    locations.forEach((loc) => {
                      locationMap.set(loc.locationId, { latitude: loc.latitude, longitude: loc.longitude });
                    });
                    
                    let missingReason = "";
                    
                    if (isLocation9999) {
                      const lat = installation.latitude ?? null;
                      const lon = installation.longitude ?? null;
                      missingReason = (lat == null || lon == null) 
                        ? "Location 9999 - User-entered coordinates are null" 
                        : "Location 9999 - Coordinates exist";
                    } else {
                      const location = locationMap.get(locationId);
                      missingReason = location 
                        ? (location.latitude == null || location.longitude == null
                            ? `Location ID ${locationId} exists but coordinates are null`
                            : `Location ID ${locationId} - Has coordinates`)
                        : `Location ID ${locationId} not found in locations database`;
                    }

                    return (
                      <div key={installation.id} className="flex items-center justify-between p-3 rounded-md bg-muted/50 text-sm">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium font-mono">{installation.deviceId}</span>
                            <Badge variant="outline" className="text-xs">
                              Location: {installation.locationId}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Installer: {installation.installedByName}
                          </div>
                          <div className="text-xs text-amber-600 font-medium">
                            {missingReason}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {missingCoordinatesInstallations.length > 10 && (
                    <p className="text-xs text-muted-foreground text-center pt-2">
                      ... and {missingCoordinatesInstallations.length - 10} more
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Export Installations by Device UIDs */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5" />
            Export Installations by Device UIDs
          </CardTitle>
          <CardDescription>Enter device UIDs to get all installation details in CSV format</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="exportDeviceIds">Device UIDs (one per line)</Label>
            <Textarea
              id="exportDeviceIds"
              value={exportDeviceIdsInput}
              onChange={(e) => setExportDeviceIdsInput(e.target.value)}
              placeholder="E75832989D048709&#10;434F564A84ADB55F&#10;8E9F81B4EDF9910B&#10;..."
              className="font-mono h-48"
              disabled={loadingExportMatches || exportingSelectedInstallations}
            />
            <p className="text-xs text-muted-foreground">
              Enter device UIDs, one per line. Will find all installations for these devices.
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={findInstallationsForExport}
              disabled={!exportDeviceIdsInput.trim() || loadingExportMatches || exportingSelectedInstallations}
            >
              {loadingExportMatches ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Find Installations
                </>
              )}
            </Button>

            {exportMatchingInstallations.length > 0 && (
              <Button
                variant="default"
                onClick={exportSelectedInstallations}
                disabled={exportingSelectedInstallations}
              >
                {exportingSelectedInstallations ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <FileDown className="h-4 w-4 mr-2" />
                    Export to CSV
                  </>
                )}
              </Button>
            )}
          </div>

          {exportMatchingInstallations.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="font-semibold text-green-600">
                    Found {exportMatchingInstallations.length} installation{exportMatchingInstallations.length !== 1 ? 's' : ''} ready for export
                  </span>
                </div>
              </div>

              <div className="border rounded-lg p-4 max-h-96 overflow-y-auto">
                <p className="text-sm font-semibold mb-3">Preview (showing first 10):</p>
                <div className="space-y-2">
                  {exportMatchingInstallations.slice(0, 10).map((installation) => {
                    const team = teams.find(t => t.id === installation.teamId);
                    return (
                      <div key={installation.id} className="flex items-center justify-between p-3 rounded-md bg-muted/50 text-sm">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium font-mono">{installation.deviceId}</span>
                            <Badge variant="outline" className="text-xs">{installation.locationId}</Badge>
                            <Badge 
                              variant={installation.status === "verified" ? "default" : installation.status === "flagged" ? "destructive" : "secondary"}
                              className="text-xs"
                            >
                              {installation.status}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Installer: {installation.installedByName} • Team: {team?.name || installation.teamId}
                          </div>
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          {installation.createdAt ? format(installation.createdAt, "MMM dd, yyyy") : "-"}
                        </div>
                      </div>
                    );
                  })}
                  {exportMatchingInstallations.length > 10 && (
                    <p className="text-xs text-muted-foreground text-center pt-2">
                      ... and {exportMatchingInstallations.length - 10} more
                    </p>
                  )}
                </div>
              </div>

              <div className="text-xs text-muted-foreground space-y-1">
                <p><strong>CSV will include:</strong></p>
                <ul className="list-disc list-inside ml-2">
                  <li>Installation ID, Device UID, Location ID, GPS Coordinates</li>
                  <li>Sensor readings, server data, timestamps</li>
                  <li>Installer info, team details, verification status</li>
                  <li>Images, videos, tags, and all metadata</li>
                </ul>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Search & Filters */}
      <Card className="border shadow-sm">
        <CardContent className="p-6 space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or device ID..."
              className="pl-10 h-12"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              data-testid="input-search-users"
            />
          </div>

          {/* Filters Row */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Filters:</span>
            </div>
            
            {/* Location Filter */}
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
                {uniqueLocations.map((location) => (
                  <SelectItem key={location} value={location}>
                    {location}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Team Filter */}
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Teams" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Teams</SelectItem>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Clear Filters Button */}
            {hasActiveFilters && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={clearFilters}
                className="gap-1"
              >
                <X className="h-4 w-4" />
                Clear Filters
              </Button>
            )}

            {/* Results Count */}
            <div className="ml-auto text-sm text-muted-foreground">
              {filteredUsers.length} of {users.length} users
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users List */}
      <Card className="border shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl font-bold">All Users ({filteredUsers.length})</CardTitle>
            <Button
              variant="outline"
              onClick={downloadDeviceUidsCSV}
              disabled={filteredUsers.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Download Device UIDs CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="space-y-2">
            {filteredUsers.map((user) => (
              <AccordionItem key={user.uid} value={user.uid} className="border rounded-md px-4">
                <AccordionTrigger className="hover:no-underline py-4" data-testid={`accordion-user-${user.uid}`}>
                  <div className="flex items-center gap-4 flex-1">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={user.photoURL} />
                      <AvatarFallback>
                        {user.displayName.split(' ').map(n => n[0]).join('').toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{user.displayName}</p>
                        {user.isAdmin && <Badge variant="secondary" className="text-xs">Admin</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                    <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
                      <span>{userTeams[user.uid]?.length || 0} teams</span>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
                    {/* User Details */}
                    <div className="space-y-4">
                      <h4 className="font-semibold text-sm">User Details</h4>
                      <div className="space-y-3">
                        <div className="flex items-start gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-sm text-muted-foreground">Location</p>
                            <p className="text-sm font-medium">{user.location}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <Smartphone className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-sm text-muted-foreground">Device ID</p>
                            <p className="text-sm font-medium font-mono">{user.deviceId}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <Ruler className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-sm text-muted-foreground">Height</p>
                            <p className="text-sm font-medium">{user.height} {user.heightUnit}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* User Teams */}
                    <div className="space-y-4">
                      <h4 className="font-semibold text-sm">Teams ({userTeams[user.uid]?.length || 0})</h4>
                      {userTeams[user.uid]?.length > 0 ? (
                        <div className="space-y-3">
                          {userTeams[user.uid].map((team) => {
                            const registeredMembers = teamMembersByTeam[team.id] || [];
                            const customMembers = customMembersByTeam[team.id] || [];
                            const totalMembers = registeredMembers.length + customMembers.length;
                            
                            return (
                              <Card key={team.id} className="hover-elevate">
                                <CardContent className="p-4">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1">
                                      <p className="font-medium text-sm">{team.name}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {totalMembers} {totalMembers === 1 ? 'member' : 'members'}
                                      </p>
                                    </div>
                                    <Badge variant="outline" className="text-xs">Owner</Badge>
                                  </div>
                                  
                                  {totalMembers > 0 && (
                                    <div className="mt-3 space-y-2">
                                      <p className="text-xs font-medium text-muted-foreground mb-2">Team Members:</p>
                                      
                                      {/* Registered Users */}
                                      {registeredMembers.map((member) => (
                                        <div key={member.uid} className="flex items-center gap-2 text-xs p-2 rounded-md bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                                          <Avatar className="h-6 w-6">
                                            <AvatarImage src={member.photoURL} />
                                            <AvatarFallback className="text-[10px]">
                                              {member.displayName.split(' ').map(n => n[0]).join('').toUpperCase()}
                                            </AvatarFallback>
                                          </Avatar>
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1">
                                              <p className="font-medium truncate">{member.displayName}</p>
                                              <Badge variant="secondary" className="text-[8px] h-4 px-1">App User</Badge>
                                            </div>
                                            <p className="text-[10px] text-muted-foreground truncate">{member.email}</p>
                                          </div>
                                          <div className="text-right">
                                            <p className="text-muted-foreground">{member.height} {member.heightUnit}</p>
                                            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                              <Smartphone className="h-3 w-3" />
                                              {member.deviceId}
                                            </p>
                                          </div>
                                        </div>
                                      ))}
                                      
                                      {/* Custom Members */}
                                      {customMembers.map((member: any) => {
                                        const memberName = member.name || member.displayName || 'Unknown';
                                        const initials = memberName.split(' ').map((n: string) => n[0]).join('').toUpperCase() || 'U';
                                        return (
                                          <div key={member.id} className="flex items-center gap-2 text-xs p-2 rounded-md bg-muted/50">
                                            <Avatar className="h-6 w-6">
                                              <AvatarImage src={member.photoURL} />
                                              <AvatarFallback className="text-[10px]">
                                                {initials}
                                              </AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1 min-w-0">
                                              <p className="font-medium truncate">{memberName}</p>
                                              <p className="text-[10px] text-muted-foreground truncate">{member.email || 'No email'}</p>
                                            </div>
                                            <div className="text-right">
                                              {member.height && <p className="text-muted-foreground">{member.height} {member.heightUnit || 'cm'}</p>}
                                              {member.deviceId && <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                <Smartphone className="h-3 w-3" />
                                                {member.deviceId}
                                              </p>}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No teams created yet</p>
                      )}
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          {filteredUsers.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p>No users found matching your search</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
