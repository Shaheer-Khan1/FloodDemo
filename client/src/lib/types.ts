// TypeScript types for the application

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  location: string;
  deviceId: string;
  height: number;
  heightUnit: "cm" | "ft";
  isAdmin: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  role: "admin" | "member";
  joinedAt?: Date;
}

