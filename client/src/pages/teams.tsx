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
import { Users, Plus, Trash2, UserPlus, Loader2 } from "lucide-react";
import type { Team, TeamMember } from "@/lib/types";
import { TeamMemberDialog } from "@/components/team-member-dialog";

export default function Teams() {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [creating, setCreating] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [teamMembers, setTeamMembers] = useState<Record<string, TeamMember[]>>({});

  // Real-time teams listener
  useEffect(() => {
    if (!user) return;
    
    setLoading(true);
    const teamsQuery = query(
      collection(db, "teams"),
      where("ownerId", "==", user.uid)
    );
    
    const unsubscribe = onSnapshot(
      teamsQuery,
      (snapshot) => {
        const teamsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate(),
          updatedAt: doc.data().updatedAt?.toDate(),
        })) as Team[];
        
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
  }, [user, toast]);

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
  }, [teams]);

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
          <h1 className="text-3xl font-bold">My Teams</h1>
          <p className="text-muted-foreground">Manage your flood response teams</p>
        </div>
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
      </div>

      {teams.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No teams yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Create your first team to start managing flood response members
            </p>
            <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-first-team">
              <Plus className="mr-2 h-4 w-4" />
              Create Team
            </Button>
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
                <div className="flex gap-2">
                  <TeamMemberDialog 
                    teamId={team.id}
                    onMemberAdded={() => {}} // Real-time listener handles updates
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteTeam(team.id, team.name)}
                    data-testid={`button-delete-team-${team.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {teamMembers[team.id]?.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {teamMembers[team.id].map((member) => (
                      <Card key={member.id} className="hover-elevate">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <span className="text-sm font-semibold text-primary">
                                {member.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate" data-testid={`text-member-name-${member.id}`}>{member.name}</p>
                              <p className="text-sm text-muted-foreground truncate">{member.email}</p>
                              <div className="flex gap-2 mt-2 text-xs text-muted-foreground">
                                <span>ID: {member.deviceId}</span>
                                <span>•</span>
                                <span>{member.height} {member.heightUnit}</span>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <UserPlus className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No members yet. Add your first team member.</p>
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
