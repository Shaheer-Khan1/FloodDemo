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
  role?: "admin" | "installer" | "verifier" | "manager" | "ministry"; // FlowSet roles
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
  role?: "owner" | "admin" | "manager" | "verifier" | "installer" | "member";
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
  /**
   * Original box code / sequence identifier for the device inside the box
   * (e.g. "No" column or any internal code printed on packaging).
   */
  boxCode?: string;
  /**
   * True if this device/box was mapped using the legacy box-number workflow
   * (without ORIGINAL BOX CODE from the new master list).
   */
  legacyBox?: boolean;
  /**
   * Team responsible for this device/box.
   * Set when admin assigns a box list to a specific team.
   */
  teamId?: string;
  /**
   * Whether the physical box containing this device has been opened
   * by the assigned team (verifier). Installers must only be able
   * to install devices when boxOpened === true.
   *
   * Undefined or false = not opened yet.
   */
  boxOpened?: boolean;
  /** Optional installer assignment for planning who should install this device */
  assignedInstallerId?: string;
  assignedInstallerName?: string;
  status: DeviceStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Installation {
  id: string;
  deviceId: string;
  locationId: string;
  originalLocationId?: string; // Stores the original locationId before bulk updates
  latitude?: number; // GPS latitude
  longitude?: number; // GPS longitude
  sensorReading: number;
  latestDisCm?: number; // Latest sensor reading from API
  latestDisTimestamp?: string; // ISO or server timestamp string of latest reading
  imageUrls: string[]; // Array of installation images (up to 4)
  videoUrl?: string; // Optional 360 video
  installedBy: string; // userId
  installedByName: string; // displayName
  teamId?: string;
  status: "pending" | "verified" | "flagged";
  flaggedReason?: string;
  verifiedBy?: string;
  verifiedAt?: Date;
  systemPreVerified?: boolean; // true if variance < 5% auto-check passed
  systemPreVerifiedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  deviceInputMethod?: "qr" | "manual";
  serverRefreshedAt?: Date; // last time we attempted a server fetch
  tags?: string[]; // Tags for tracking special states (e.g., "edited by verifier")
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

