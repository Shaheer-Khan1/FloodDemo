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
  name?: string;
  displayName?: string;
  email: string;
  deviceId?: string;
  height?: number;
  heightUnit?: "cm" | "ft";
  addedAt?: Date;
}

// FlowSet Types

export type DeviceStatus = "pending" | "installed" | "verified" | "flagged";

export interface Device {
  id: string; // DEVICE UID (primary identifier)
  productId: string; // PRODUCT ID
  deviceSerialId: string; // DEVICE SERIAL ID
  deviceImei: string; // DEVICE IMEI
  iccid: string; // ICCID
  timestamp?: string; // Original import timestamp
  boxNumber?: string; // Box number from packaging
  status: DeviceStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Installation {
  id: string;
  deviceId: string;
  locationId: string;
  latitude?: number; // GPS latitude
  longitude?: number; // GPS longitude
  sensorReading: number;
  imageUrls: string[]; // Array of installation images (up to 4)
  videoUrl?: string; // Optional 360 video
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

