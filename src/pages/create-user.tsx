import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserPlus, AlertCircle } from "lucide-react";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateCurrentUser } from "firebase/auth";
import { getAuth } from "firebase/auth";
import { doc, setDoc, collection, query, where, getDocs, serverTimestamp, addDoc, deleteDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useLocation } from "wouter";
import type { Team } from "@/lib/types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus } from "lucide-react";

export default function CreateUser() {
  const { userProfile, user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [creating, setCreating] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [showCreateTeamDialog, setShowCreateTeamDialog] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [creatingTeam, setCreatingTeam] = useState(false);

  const [formData, setFormData] = useState({
    displayName: "",
    email: "",
    password: "",
    role: userProfile?.isAdmin ? "" : "installer",
    teamId: "",
    location: "",
  });

  // Fetch teams based on user role
  useEffect(() => {
    const fetchTeams = async () => {
      if (!userProfile) return;

      try {
        let teamsData: Team[] = [];

        if (userProfile.isAdmin) {
          // Admins can see all teams
          const teamsQuery = query(collection(db, "teams"));
          const snapshot = await getDocs(teamsQuery);
          teamsData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
          })) as Team[];
        } else if (userProfile.teamId) {
          // Managers and Verifiers can only see their own team
          const teamDoc = await getDocs(query(
            collection(db, "teams"),
            where("__name__", "==", userProfile.teamId)
          ));
          
          teamsData = teamDoc.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
          })) as Team[];

        }
        
        setTeams(teamsData);
        
        // Auto-select team: non-admins with only one available team
        if (teamsData.length === 1 && !userProfile.isAdmin) {
          // Use setTimeout to ensure state is updated after teams are set
          setTimeout(() => {
            setFormData(prev => ({ ...prev, teamId: teamsData[0].id }));
          }, 100);
        }
      } catch (error) {
        console.error("Error fetching teams:", error);
      } finally {
        setLoadingTeams(false);
      }
    };

    fetchTeams();
  }, [userProfile]);

  // Auto-select team ID when teams are loaded for non-admins
  useEffect(() => {
    if (teams.length === 1 && !userProfile?.isAdmin && !formData.teamId) {
      setFormData(prev => ({ ...prev, teamId: teams[0].id }));
    }
  }, [teams, userProfile?.isAdmin]);

  const handleCreateTeam = async () => {
    if (!user || !userProfile || !newTeamName.trim()) return;

    setCreatingTeam(true);
    try {
      // Create team
      const teamRef = await addDoc(collection(db, "teams"), {
        name: newTeamName.trim(),
        ownerId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Add to teams list
      const newTeam: Partial<Team> = {
        id: teamRef.id,
        name: newTeamName.trim(),
        ownerId: user.uid,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      setTeams(prev => [...prev, newTeam as Team]);
      
      // Auto-select the new team
      setFormData(prev => ({ ...prev, teamId: teamRef.id }));

      toast({
        title: "Team Created",
        description: `${newTeamName} has been created.`,
      });

      setShowCreateTeamDialog(false);
      setNewTeamName("");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to create team",
        description: error.message,
      });
    } finally {
      setCreatingTeam(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.displayName.trim()) {
      toast({
        variant: "destructive",
        title: "Name Required",
        description: "Please enter the user's full name.",
      });
      return;
    }

    if (!formData.email.trim()) {
      toast({
        variant: "destructive",
        title: "Email Required",
        description: "Please enter the user's email address.",
      });
      return;
    }

    if (formData.password.length < 6) {
      toast({
        variant: "destructive",
        title: "Password Too Short",
        description: "Password must be at least 6 characters.",
      });
      return;
    }

    if (!formData.role) {
      // For non-admins, default role is installer
      if (userProfile && !userProfile.isAdmin) {
        setFormData(prev => ({ ...prev, role: "installer" }));
      } else {
        toast({
          variant: "destructive",
          title: "Role Required",
          description: "Please select a role for the user.",
        });
        return;
      }
    }

    if (!formData.teamId && formData.role !== "ministry") {
      toast({
        variant: "destructive",
        title: "Team Required",
        description: "Please select a team for the user.",
      });
      return;
    }

    setCreating(true);

    try {
      // Create user account in Firebase Auth
      // Note: This will sign us in as the new user
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        formData.email.trim(),
        formData.password
      );

      const newUser = userCredential.user;

      // Create user profile in Firestore (both userProfiles and users collections)
      const userData = {
        uid: newUser.uid,
        email: formData.email.trim(),
        displayName: formData.displayName.trim(),
        role: formData.role,
        teamId: formData.role === "ministry" ? null : formData.teamId,
        location: formData.location || "",
        isAdmin: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // Save to userProfiles
      await setDoc(doc(db, "userProfiles", newUser.uid), userData);
      
      // Also save to users (for auth-context compatibility)
      await setDoc(doc(db, "users", newUser.uid), userData);

      // Add user to team members (skip for ministry accounts)
      if (formData.role !== "ministry") {
        await setDoc(doc(db, "teams", formData.teamId, "members", newUser.uid), {
          userId: newUser.uid,
          displayName: formData.displayName.trim(),
          email: formData.email.trim(),
          role: formData.role,
          addedAt: serverTimestamp(),
        });
      }

      // Sign out immediately after creating the user
      await signOut(auth);
      
      toast({
        title: "User Created Successfully",
        description: `${formData.displayName} has been created. Redirecting to login...`,
        duration: 3000,
      });
      
      // Redirect to login
      setTimeout(() => {
        setLocation("/login");
      }, 1500);
    } catch (error: any) {
      let errorMessage = "Failed to create user account.";
      
      if (error.code === "auth/email-already-in-use") {
        errorMessage = "This email is already registered.";
      } else if (error.code === "auth/invalid-email") {
        errorMessage = "Invalid email address.";
      } else if (error.code === "auth/weak-password") {
        errorMessage = "Password is too weak.";
      }

      toast({
        variant: "destructive",
        title: "Creation Failed",
        description: errorMessage,
      });
    } finally {
      setCreating(false);
    }
  };

  // Check permissions
  if (!userProfile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Determine which roles this user can create
  const canCreateVerifierOrManager = userProfile.isAdmin;
  const canCreateInstaller = userProfile.isAdmin || 
                            userProfile.role === "manager" || 
                            userProfile.role === "verifier";

  if (!canCreateInstaller) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">
              You don't have permission to create user accounts.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check if non-admin users have a team
  if (!userProfile.isAdmin && !userProfile.teamId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">No Team Assigned</h2>
            <p className="text-muted-foreground">
              You must be assigned to a team before you can create user accounts.
              Please contact an administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
          Create User Account
        </h1>
        <p className="text-muted-foreground mt-2">
          {canCreateVerifierOrManager 
            ? "Create accounts for installers, verifiers, or managers and assign them to teams"
            : `Create installer accounts for your team${teams.length > 0 ? ` (${teams[0]?.name})` : ""}`}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="border shadow-sm">
          <CardHeader>
            <CardTitle>User Information</CardTitle>
            <CardDescription>Enter the details for the new user</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="displayName">Full Name *</Label>
              <Input
                id="displayName"
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                placeholder="Enter full name"
                disabled={creating}
                required
              />
            </div>

            <div>
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="user@example.com"
                disabled={creating}
                required
              />
            </div>

            <div>
              <Label htmlFor="password">Initial Password *</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Minimum 6 characters"
                disabled={creating}
                required
                minLength={6}
              />
              <p className="text-xs text-muted-foreground mt-1">
                User can change this password after their first login
              </p>
            </div>

            <div>
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="Enter location (optional)"
                disabled={creating}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Optional: Set the user's location
              </p>
            </div>

            {userProfile.isAdmin ? (
              <div>
                <Label htmlFor="role">Role *</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value) => setFormData({ ...formData, role: value })}
                  disabled={creating}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="installer">Installer</SelectItem>
                    <SelectItem value="verifier">Verifier</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="ministry">Ministry</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <input type="hidden" value={formData.role} readOnly />
            )}

            <div>
              <Label htmlFor="team">Team *</Label>
              <Select
                value={formData.teamId}
                onValueChange={(value) => {
                  if (value === "NEW_TEAM") {
                    setShowCreateTeamDialog(true);
                  } else {
                    setFormData({ ...formData, teamId: value });
                  }
                }}
                disabled={creating || loadingTeams || (!userProfile?.isAdmin && teams.length === 1)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingTeams ? "Loading teams..." : "Select a team or create new"} />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                  {userProfile?.isAdmin && <SelectItem value="NEW_TEAM" className="text-primary font-medium">
                    <div className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      Create New Team
                    </div>
                  </SelectItem>}
                </SelectContent>
              </Select>
              {!userProfile?.isAdmin && teams.length === 1 && (
                <p className="text-xs text-muted-foreground mt-1">
                  User will be added to your team: {teams[0].name}
                </p>
              )}
              {teams.length === 0 && !loadingTeams && (
                <p className="text-xs text-destructive mt-1">
                  {userProfile?.isAdmin 
                    ? "No teams available. Please create a team first."
                    : "You are not assigned to any team. Please contact an administrator."}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => setLocation("/admin")}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={creating || teams.length === 0}>
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4 mr-2" />
                Create User
              </>
            )}
          </Button>
        </div>
      </form>

      {/* Create New Team Dialog */}
      <Dialog open={showCreateTeamDialog} onOpenChange={setShowCreateTeamDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Team</DialogTitle>
            <DialogDescription>
              Create a new team for the user
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="new-team-name">Team Name</Label>
              <Input
                id="new-team-name"
                placeholder="e.g., North District Response Team"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateTeam()}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowCreateTeamDialog(false);
                  setNewTeamName("");
                }}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleCreateTeam}
                disabled={!newTeamName.trim() || creatingTeam}
              >
                {creatingTeam ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create Team
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

