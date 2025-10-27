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
  role?: "admin" | "installer" | "verifier" | "manager"; // FlowSet roles
  teamId?: string; // For installers/verifiers
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  ownerId?: string;
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

export interface CustomTeamMember {
  id: string;
  name: string;
  email: string;
  deviceId: string;
  height: number;
  heightUnit: "cm" | "ft";
  addedAt?: Date;
}

// FlowSet Types

export type DeviceStatus = "pending" | "installed" | "verified" | "flagged";

export interface Device {
  id: string; // deviceId
  batchId: string;
  cityOfDispatch: string;
  manufacturer: string;
  description: string;
  status: DeviceStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Installation {
  id: string;
  deviceId: string;
  locationId: string;
  sensorReading: number;
  imageUrl: string; // mandatory image
  optionalImageUrl?: string; // optional image
  installedBy: string; // userId
  installedByName: string; // displayName
  teamId?: string;
  status: "pending" | "verified" | "flagged";
  flaggedReason?: string;
  verifiedBy?: string;
  verifiedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ServerData {
  id: string;
  deviceId: string;
  sensorData: number;
  receivedAt?: Date;
  createdAt?: Date;
}

export interface VerificationItem {
  installation: Installation;
  device: Device;
  serverData?: ServerData;
  percentageDifference?: number;
}

