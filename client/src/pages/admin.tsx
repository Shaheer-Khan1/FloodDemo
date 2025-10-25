import { useState, useEffect } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { Search, Loader2, Shield, MapPin, Smartphone, Ruler, Users } from "lucide-react";
import type { UserProfile, Team, TeamMember } from "@shared/schema";

export default function Admin() {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [userTeams, setUserTeams] = useState<Record<string, Team[]>>({});
  const [teamMembers, setTeamMembers] = useState<Record<string, TeamMember[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Real-time users listener
  useEffect(() => {
    if (!userProfile?.isAdmin) return;
    
    const unsubscribe = onSnapshot(
      query(collection(db, "users"), orderBy("displayName")),
      (snapshot) => {
        const usersData = snapshot.docs.map(doc => ({
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate(),
          updatedAt: doc.data().updatedAt?.toDate(),
        })) as UserProfile[];
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
          if (!teamsByOwner[team.ownerId]) {
            teamsByOwner[team.ownerId] = [];
          }
          teamsByOwner[team.ownerId].push(team);
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

  // Real-time team members listeners
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
          })) as TeamMember[];
          
          setTeamMembers(prev => ({ ...prev, [team.id]: members }));
        },
        (error) => {
          console.error(`Failed to load members for team ${team.id}:`, error);
        }
      );
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [userProfile, teams]);

  const filteredUsers = users.filter(user =>
    user.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.location.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground">Manage all users and teams</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Users</p>
                <p className="text-3xl font-bold">{users.length}</p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Teams</p>
                <p className="text-3xl font-bold">
                  {Object.values(userTeams).reduce((sum, teams) => sum + teams.length, 0)}
                </p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Admins</p>
                <p className="text-3xl font-bold">{users.filter(u => u.isAdmin).length}</p>
              </div>
              <Shield className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-3xl font-bold">{users.length}</p>
              </div>
              <div className="h-3 w-3 rounded-full bg-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users by name, email, or location..."
              className="pl-10 h-12"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              data-testid="input-search-users"
            />
          </div>
        </CardContent>
      </Card>

      {/* Users List */}
      <Card>
        <CardHeader>
          <CardTitle>All Users ({filteredUsers.length})</CardTitle>
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
                          {userTeams[user.uid].map((team) => (
                            <Card key={team.id} className="hover-elevate">
                              <CardContent className="p-4">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1">
                                    <p className="font-medium text-sm">{team.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {teamMembers[team.id]?.length || 0} members
                                    </p>
                                  </div>
                                </div>
                                {teamMembers[team.id]?.length > 0 && (
                                  <div className="mt-3 space-y-2">
                                    {teamMembers[team.id].map((member) => (
                                      <div key={member.id} className="flex items-center gap-2 text-xs">
                                        <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                                          <span className="text-xs">
                                            {member.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                                          </span>
                                        </div>
                                        <span className="flex-1 truncate">{member.name}</span>
                                        <span className="text-muted-foreground">{member.height} {member.heightUnit}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          ))}
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
