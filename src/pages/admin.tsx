import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, query, orderBy, where, doc, setDoc, serverTimestamp, getDocs, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Search, Loader2, Shield, MapPin, Smartphone, Ruler, Users, Filter, X, Upload, Download, CheckCircle2, XCircle, Edit, RefreshCw, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { UserProfile, Team, TeamMember, Installation } from "@/lib/types";
import * as XLSX from 'xlsx';

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
      // Query installations where locationId = "9999" AND originalLocationId = "999"
      const installationsRef = collection(db, "installations");
      const q = query(
        installationsRef,
        where("locationId", "==", "9999"),
        where("originalLocationId", "==", "999")
      );
      
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        toast({
          title: "No Data",
          description: "No installations found with locationId 9999 and originalLocationId 999.",
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
      
      snapshot.docs.forEach((doc, index) => {
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

        csvRows.push([
          (index + 1).toString(), // Serial No
          data.locationId, // Location ID (9999)
          coordinates, // Coordinates
          data.deviceId, // Device ID
          teamName, // Amanah
          sensorHeight, // Sensor Height
          originalLocationId, // Original Location ID (999)
        ]);
      });

      // Create CSV
      const headers = ["Serial No", "Location ID", "Coordinates", "Device ID", "Amanah", "Sensor Height", "Original Location ID"];
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
      link.setAttribute("download", `999-to-9999-report-${dateStr}.csv`);
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
                  Export 999→9999 Report
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
            <p><strong>Export Report:</strong> Downloads all installations where originalLocationId = "999" and current locationId = "9999"</p>
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
          <CardTitle className="text-2xl font-bold">All Users ({filteredUsers.length})</CardTitle>
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
