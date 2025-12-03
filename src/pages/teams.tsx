import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Users, Plus, Trash2, Loader2, UserPlus } from "lucide-react";
import type { Team, CustomTeamMember } from "@/lib/types";
import { useLocation } from "wouter";

export default function Teams() {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [creating, setCreating] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [teamMembers, setTeamMembers] = useState<Record<string, CustomTeamMember[]>>({});
  const [teamBoxes, setTeamBoxes] = useState<Record<string, { boxNumber: string; count: number }[]>>({});

  // Redirect installers to their installation page
  useEffect(() => {
    if (userProfile?.role === "installer") {
      setLocation("/new-installation");
    }
  }, [userProfile, setLocation]);

  // Real-time teams listener
  useEffect(() => {
    if (!user || !userProfile) return;
    
    setLoading(true);
    
    // Admins and managers can see all teams, others see teams they own or are assigned to
    let teamsQuery;
    if (userProfile.isAdmin || userProfile.role === "manager") {
      teamsQuery = collection(db, "teams");
    } else if (userProfile.teamId) {
      // Show the team they're assigned to
      teamsQuery = query(collection(db, "teams"), where("__name__", "==", userProfile.teamId));
    } else {
      // Show teams where user is owner
      teamsQuery = query(collection(db, "teams"), where("ownerId", "==", user.uid));
    }
    
    const unsubscribe = onSnapshot(
      teamsQuery,
      (snapshot) => {
        const teamsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate(),
          updatedAt: doc.data().updatedAt?.toDate(),
        })) as Team[];
        
        // Sort teams by name
        teamsData.sort((a, b) => a.name.localeCompare(b.name));
        
        setTeams(teamsData);
        setLoading(false);
      },
      (error) => {
        toast({
          variant: "destructive",
          title: "Failed to load teams",
          description: error.message,
        });
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, userProfile, toast]);

  // Real-time team members listener for each team
  useEffect(() => {
    if (teams.length === 0) return;
    
    const unsubscribes = teams.map(team => {
      return onSnapshot(
        collection(db, "teams", team.id, "members"),
        (snapshot) => {
          const members = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            addedAt: doc.data().addedAt?.toDate(),
          })) as CustomTeamMember[];
          
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
  }, [teams]);

  // Real-time box assignments per team (for admins and managers)
  useEffect(() => {
    if (!userProfile || (!userProfile.isAdmin && userProfile.role !== "manager")) return;

    const unsubscribe = onSnapshot(
      collection(db, "devices"),
      (snapshot) => {
        const boxesByTeam: Record<string, Record<string, number>> = {};

        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as any;
          const teamId = data.teamId as string | undefined;
          const boxNumber = data.boxNumber as string | undefined;
          if (!teamId || !boxNumber) return;

          if (!boxesByTeam[teamId]) boxesByTeam[teamId] = {};
          boxesByTeam[teamId][boxNumber] = (boxesByTeam[teamId][boxNumber] || 0) + 1;
        });

        const formatted: Record<string, { boxNumber: string; count: number }[]> = {};
        Object.entries(boxesByTeam).forEach(([teamId, boxes]) => {
          formatted[teamId] = Object.entries(boxes)
            .map(([boxNumber, count]) => ({ boxNumber, count }))
            .sort((a, b) => a.boxNumber.localeCompare(b.boxNumber));
        });

        setTeamBoxes(formatted);
      },
      (error) => {
        console.error("Failed to load team box assignments:", error);
      }
    );

    return () => unsubscribe();
  }, [userProfile]);

  const handleCreateTeam = async () => {
    if (!user || !userProfile || !newTeamName.trim()) return;
    
    setCreating(true);
    try {
      // Create the team
      const teamRef = await addDoc(collection(db, "teams"), {
        name: newTeamName.trim(),
        ownerId: user.uid,
        ownerName: userProfile.displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      
      // Add creator as team member with admin role
      await addDoc(collection(db, "teamMembers"), {
        teamId: teamRef.id,
        userId: user.uid,
        role: "admin",
        joinedAt: serverTimestamp(),
      });
      
      toast({
        title: "Team created",
        description: `${newTeamName} has been created successfully.`,
      });
      
      setNewTeamName("");
      setCreateDialogOpen(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to create team",
        description: error.message,
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteTeam = async (teamId: string, teamName: string) => {
    if (!confirm(`Are you sure you want to delete "${teamName}"?`)) return;
    
    try {
      // Delete the team
      await deleteDoc(doc(db, "teams", teamId));
      
      // Delete all teamMembers associated with this team
      const membersQuery = query(collection(db, "teamMembers"), where("teamId", "==", teamId));
      const membersSnapshot = await getDocs(membersQuery);
      
      const deletePromises = membersSnapshot.docs.map(memberDoc => 
        deleteDoc(doc(db, "teamMembers", memberDoc.id))
      );
      
      await Promise.all(deletePromises);
      
      toast({
        title: "Team deleted",
        description: `${teamName} has been deleted.`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to delete team",
        description: error.message,
      });
    }
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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">
            {userProfile?.isAdmin || userProfile?.role === "manager" ? "All Teams" : "My Teams"}
          </h1>
          <p className="text-muted-foreground">
            {userProfile?.isAdmin || userProfile?.role === "manager"
              ? "View and manage all teams and their box assignments"
              : "Manage your teams"}
          </p>
        </div>
        {userProfile?.isAdmin && (
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-team">
                <Plus className="mr-2 h-4 w-4" />
                Create Team
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Team</DialogTitle>
                <DialogDescription>
                  Create a team to manage flood response members
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="team-name">Team Name</Label>
                  <Input
                    id="team-name"
                    data-testid="input-team-name"
                    placeholder="e.g., North District Response Team"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateTeam()}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button 
                    variant="outline" 
                    onClick={() => setCreateDialogOpen(false)}
                    data-testid="button-cancel-team"
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleCreateTeam}
                    disabled={!newTeamName.trim() || creating}
                    data-testid="button-submit-team"
                  >
                  {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Create Team
                </Button>
              </div>
            </div>
          </DialogContent>
          </Dialog>
        )}
      </div>

      {teams.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No teams yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              {userProfile?.isAdmin 
                ? "Create your first team to start managing members"
                : "You haven't been assigned to any team yet"}
            </p>
            {userProfile?.isAdmin && (
              <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-first-team">
                <Plus className="mr-2 h-4 w-4" />
                Create Team
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {teams.map((team) => (
            <Card key={team.id}>
              <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap space-y-0 pb-4">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-lg font-semibold" data-testid={`text-team-name-${team.id}`}>
                    {team.name}
                  </CardTitle>
                  <Badge variant="secondary" data-testid={`badge-member-count-${team.id}`}>
                    {teamMembers[team.id]?.length || 0} members
                  </Badge>
                </div>
                {userProfile?.isAdmin && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteTeam(team.id, team.name)}
                      data-testid={`button-delete-team-${team.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {teamMembers[team.id]?.length > 0 ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {teamMembers[team.id].map((member) => {
                        const memberName = member.name || member.displayName || 'Unknown';
                        const initials = memberName.split(' ').map(n => n[0]).join('').toUpperCase() || 'U';
                        return (
                          <Card key={member.id} className="hover-elevate">
                            <CardContent className="p-4">
                              <div className="flex items-start gap-3">
                                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                  <span className="text-sm font-semibold text-primary">
                                    {initials}
                                  </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium truncate" data-testid={`text-member-name-${member.id}`}>{memberName}</p>
                                    {member.role && (
                                      <Badge variant="secondary" className="text-[10px] h-5 px-1.5 capitalize">
                                        {member.role}
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-sm text-muted-foreground truncate">{member.email || 'No email'}</p>
                                  <div className="flex gap-2 mt-2 text-xs text-muted-foreground">
                                    {member.deviceId && <><span>ID: {member.deviceId}</span><span>•</span></>}
                                    {member.height && <span>{member.height} {member.heightUnit || 'cm'}</span>}
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>

                    {(userProfile?.isAdmin || userProfile?.role === "manager") && (
                      <div className="mt-2 pt-3 border-t space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold">Assigned Boxes</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setLocation(`/assign-box?teamId=${team.id}`)}
                          >
                            Manage Assignments
                          </Button>
                        </div>
                        {teamBoxes[team.id]?.length ? (
                          <div className="flex flex-wrap gap-2">
                            {teamBoxes[team.id].map((box) => (
                              <button
                                key={box.boxNumber}
                                type="button"
                                className="px-3 py-1 rounded-full border text-xs font-mono bg-background text-foreground border-muted hover:bg-muted"
                                onClick={() =>
                                  setLocation(`/assign-box?teamId=${team.id}&box=${encodeURIComponent(box.boxNumber)}`)
                                }
                              >
                                {box.boxNumber} · {box.count}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            No boxes assigned to this team yet.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <UserPlus className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No members yet. Add your first team member.</p>
                    {(userProfile?.isAdmin || userProfile?.role === "manager") && (
                      <div className="mt-4 space-y-2">
                        <p className="text-xs text-muted-foreground">
                          You can still assign boxes to this team using the button below.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setLocation(`/assign-box?teamId=${team.id}`)}
                        >
                          Manage Box Assignments
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
