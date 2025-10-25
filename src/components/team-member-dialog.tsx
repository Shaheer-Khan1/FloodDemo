import { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Loader2, Mail, User, Smartphone, Ruler, Image as ImageIcon } from "lucide-react";

interface TeamMemberDialogProps {
  teamId: string;
  onMemberAdded: () => void;
}

export function TeamMemberDialog({ teamId, onMemberAdded }: TeamMemberDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    name: "",
    deviceId: "",
    height: "",
    heightUnit: "cm" as "cm" | "ft",
    photoFile: null as File | null,
    photoURL: "",
  });

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          variant: "destructive",
          title: "File too large",
          description: "Please select an image smaller than 5MB.",
        });
        return;
      }
      setFormData(prev => ({ 
        ...prev, 
        photoFile: file,
        photoURL: URL.createObjectURL(file)
      }));
    }
  };

  const handleSubmit = async () => {
    if (!formData.email || !formData.name || !formData.deviceId || !formData.height) {
      toast({
        variant: "destructive",
        title: "Missing fields",
        description: "Please fill in all required fields.",
      });
      return;
    }

    setLoading(true);
    try {
      let photoURL = formData.photoURL;
      
      // Upload photo if provided
      if (formData.photoFile) {
        const storageRef = ref(storage, `team-members/${teamId}/${Date.now()}`);
        await uploadBytes(storageRef, formData.photoFile);
        photoURL = await getDownloadURL(storageRef);
      }

      // Add member to team
      await addDoc(collection(db, "teams", teamId, "members"), {
        email: formData.email.trim(),
        name: formData.name.trim(),
        deviceId: formData.deviceId.trim(),
        photoURL,
        height: parseFloat(formData.height),
        heightUnit: formData.heightUnit,
        addedAt: serverTimestamp(),
      });

      toast({
        title: "Member added",
        description: `${formData.name} has been added to the team.`,
      });

      // Reset form and close dialog
      setFormData({
        email: "",
        name: "",
        deviceId: "",
        height: "",
        heightUnit: "cm",
        photoFile: null,
        photoURL: "",
      });
      setOpen(false);
      onMemberAdded();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to add member",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="button-add-member">
          <UserPlus className="mr-2 h-4 w-4" />
          Add Member
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Team Member</DialogTitle>
          <DialogDescription>
            Add a new member to this team with their details
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="member-email">Email *</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="member-email"
                  data-testid="input-member-email"
                  type="email"
                  placeholder="member@example.com"
                  className="pl-10 h-12"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-name">Full Name *</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="member-name"
                  data-testid="input-member-name"
                  placeholder="John Doe"
                  className="pl-10 h-12"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="member-device">Device ID *</Label>
            <div className="relative">
              <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="member-device"
                data-testid="input-member-device"
                placeholder="e.g., DEVICE-67890"
                className="pl-10 h-12"
                value={formData.deviceId}
                onChange={(e) => setFormData(prev => ({ ...prev, deviceId: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="member-height">Height *</Label>
              <div className="relative">
                <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="member-height"
                  data-testid="input-member-height"
                  type="number"
                  step="0.1"
                  placeholder="Enter height"
                  className="pl-10 h-12"
                  value={formData.height}
                  onChange={(e) => setFormData(prev => ({ ...prev, height: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Height Unit</Label>
              <RadioGroup
                value={formData.heightUnit}
                onValueChange={(value: "cm" | "ft") => setFormData(prev => ({ ...prev, heightUnit: value }))}
                className="flex gap-4"
                data-testid="radio-member-unit"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="cm" id="member-cm" />
                  <Label htmlFor="member-cm" className="font-normal cursor-pointer">cm</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="ft" id="member-ft" />
                  <Label htmlFor="member-ft" className="font-normal cursor-pointer">ft</Label>
                </div>
              </RadioGroup>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Photo (Optional)</Label>
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={formData.photoURL} />
                <AvatarFallback>
                  {formData.name.split(' ').map(n => n[0]).join('').toUpperCase() || 'M'}
                </AvatarFallback>
              </Avatar>
              <Button
                type="button"
                variant="outline"
                onClick={() => document.getElementById('member-photo-upload')?.click()}
                data-testid="button-upload-member-photo"
              >
                <ImageIcon className="mr-2 h-4 w-4" />
                Choose Photo
              </Button>
              <input
                id="member-photo-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoUpload}
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <Button 
              variant="outline" 
              onClick={() => setOpen(false)}
              data-testid="button-cancel-member"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={loading}
              data-testid="button-submit-member"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add Member
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
