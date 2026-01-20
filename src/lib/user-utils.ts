/**
 * Utility functions for user-specific data handling
 * Handles Smart LPG vs Flood sensor data separation
 */

import { User } from 'firebase/auth';

/**
 * List of emails that should see Smart LPG data instead of flood sensor data
 */
const SMART_LPG_USER_EMAILS = ['user@smart.com'];

/**
 * Check if a user should see Smart LPG data
 */
export function isSmartLPGUser(user: User | null): boolean {
  if (!user?.email) return false;
  return SMART_LPG_USER_EMAILS.includes(user.email.toLowerCase());
}

/**
 * Get the appropriate installations collection name based on user
 */
export function getInstallationsCollection(user: User | null): string {
  return isSmartLPGUser(user) ? 'smartLPG' : 'installations';
}

/**
 * Get the appropriate devices collection name based on user
 * For Smart LPG users, we might use a different collection or the same smartLPG collection
 */
export function getDevicesCollection(user: User | null): string {
  return isSmartLPGUser(user) ? 'smartLPG' : 'devices';
}

/**
 * Get user-specific labels for UI
 */
export function getUserLabels(user: User | null) {
  const isLPG = isSmartLPGUser(user);
  return {
    deviceType: isLPG ? 'LPG Device' : 'Flood Sensor',
    deviceTypePlural: isLPG ? 'LPG Devices' : 'Flood Sensors',
    installerName: isLPG ? 'Customer Name' : 'Installer Name',
    userReading: isLPG ? 'Initial Weight/Level' : 'User Reading (cm)',
    serverReading: isLPG ? 'Latest Weight/Level' : 'Server Reading (cm)',
    pageTitle: isLPG ? 'Smart LPG Management' : 'FlowSet IoT Management',
  };
}
