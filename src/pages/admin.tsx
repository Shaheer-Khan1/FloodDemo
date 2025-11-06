import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, query, orderBy, where, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Search, Loader2, Shield, MapPin, Smartphone, Ruler, Users, Filter, X, Upload, Download, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { UserProfile, Team, TeamMember } from "@/lib/types";
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
