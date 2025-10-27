import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, query, orderBy, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Search, Loader2, Shield, MapPin, Smartphone, Ruler, Users, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UserProfile, Team, TeamMember } from "@/lib/types";

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
    const locations = new Set(users.map(u => u.location));
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
                                      {customMembers.map((member: any) => (
                                        <div key={member.id} className="flex items-center gap-2 text-xs p-2 rounded-md bg-muted/50">
                                          <Avatar className="h-6 w-6">
                                            <AvatarImage src={member.photoURL} />
                                            <AvatarFallback className="text-[10px]">
                                              {member.name.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                                            </AvatarFallback>
                                          </Avatar>
                                          <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate">{member.name}</p>
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
