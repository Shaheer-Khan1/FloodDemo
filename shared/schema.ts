import { z } from "zod";

// User Profile Schema (Firestore document)
export const userProfileSchema = z.object({
  uid: z.string(),
  email: z.string().email(),
  displayName: z.string().min(1, "Name is required"),
  photoURL: z.string().optional(),
  location: z.string().min(1, "Location is required"),
  deviceId: z.string().min(1, "Device ID is required"),
  height: z.number().positive("Height must be positive"),
  heightUnit: z.enum(["cm", "ft"]),
  isAdmin: z.boolean().default(false),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;

// Team Schema (Firestore document)
export const teamSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Team name is required"),
  ownerId: z.string(),
  ownerName: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Team = z.infer<typeof teamSchema>;

// Team Member Schema (Firestore subcollection)
export const teamMemberSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().min(1, "Name is required"),
  deviceId: z.string().min(1, "Device ID is required"),
  photoURL: z.string().optional(),
  height: z.number().positive("Height must be positive"),
  heightUnit: z.enum(["cm", "ft"]),
  addedAt: z.date(),
});

export type TeamMember = z.infer<typeof teamMemberSchema>;

// Insert schemas for forms
export const insertUserProfileSchema = userProfileSchema.omit({ 
  uid: true, 
  createdAt: true, 
  updatedAt: true,
  isAdmin: true 
});

export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;

export const insertTeamSchema = teamSchema.omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export type InsertTeam = z.infer<typeof insertTeamSchema>;

export const insertTeamMemberSchema = teamMemberSchema.omit({ 
  id: true, 
  addedAt: true 
});

export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
