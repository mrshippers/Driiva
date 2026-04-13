import { pgTable, text, serial, integer, boolean, timestamp, decimal, json, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  firebaseUid: text("firebase_uid").unique(),
  username: text("username").unique(),
  email: text("email").notNull().unique(),
  password: text("password"),
  displayName: text("display_name"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  phoneNumber: text("phone_number"),
  dateOfBirth: timestamp("date_of_birth"),
  licenseNumber: text("license_number"),
  onboardingComplete: boolean("onboarding_complete").notNull().default(false),
  premiumAmount: decimal("premium_amount", { precision: 10, scale: 2 }).default('500.00'),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
});

export const drivingProfiles = pgTable("driving_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull().unique(),
  currentScore: integer("current_score").default(0),
  hardBrakingScore: integer("hard_braking_score").default(0),
  accelerationScore: integer("acceleration_score").default(0),
  speedAdherenceScore: integer("speed_adherence_score").default(0),
  nightDrivingScore: integer("night_driving_score").default(0),
  corneringScore: integer("cornering_score").default(0),
  consistencyScore: integer("consistency_score").default(0),
  totalTrips: integer("total_trips").default(0),
  totalMiles: decimal("total_miles", { precision: 10, scale: 2 }).default('0.00'),
  projectedRefund: decimal("projected_refund", { precision: 10, scale: 2 }).default('0.00'),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

export const trips = pgTable("trips", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  startLocation: text("start_location"),
  endLocation: text("end_location"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  distance: decimal("distance", { precision: 10, scale: 2 }).notNull(),
  duration: integer("duration").notNull(), // in minutes
  score: integer("score").notNull(),
  hardBrakingEvents: integer("hard_braking_events").default(0),
  harshAcceleration: integer("harsh_acceleration").default(0),
  speedViolations: integer("speed_violations").default(0),
  nightDriving: boolean("night_driving").default(false),
  sharpCorners: integer("sharp_corners").default(0),
  telematicsData: json("telematics_data"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const communityPool = pgTable("community_pool", {
  id: serial("id").primaryKey(),
  poolAmount: decimal("pool_amount", { precision: 15, scale: 2 }).notNull(),
  safetyFactor: decimal("safety_factor", { precision: 5, scale: 2 }).default('0.80'),
  participantCount: integer("participant_count").default(0),
  safeDriverCount: integer("safe_driver_count").default(0),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

/** Trip summaries synced from Firestore on completion; API reads from here. */
export const tripsSummary = pgTable("trips_summary", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  firestoreTripId: text("firestore_trip_id").notNull().unique(),
  startedAt: timestamp("started_at").notNull(),
  endedAt: timestamp("ended_at").notNull(),
  distanceKm: decimal("distance_km", { precision: 10, scale: 2 }).notNull(),
  durationSeconds: integer("duration_seconds").notNull(),
  score: integer("score").notNull(),
  hardBrakingEvents: integer("hard_braking_events").default(0),
  harshAcceleration: integer("harsh_acceleration").default(0),
  speedViolations: integer("speed_violations").default(0),
  nightDriving: boolean("night_driving").default(false),
  sharpCorners: integer("sharp_corners").default(0),
  startAddress: text("start_address"),
  endAddress: text("end_address"),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: text("created_by"),
});

/** Policies (structured data for API; optional sync from Firestore). */
export const policies = pgTable("policies", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  policyNumber: text("policy_number").notNull(),
  status: text("status").notNull().default("pending"),
  coverageType: text("coverage_type").notNull().default("standard"),
  basePremiumCents: integer("base_premium_cents").notNull().default(0),
  currentPremiumCents: integer("current_premium_cents").notNull().default(0),
  discountPercentage: integer("discount_percentage").default(0),
  effectiveDate: timestamp("effective_date").notNull(),
  expirationDate: timestamp("expiration_date").notNull(),
  renewalDate: timestamp("renewal_date"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  billingCycle: text("billing_cycle").default("annual"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
});

export const achievements = pgTable("achievements", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull(),
  criteria: json("criteria").notNull(),
  badgeColor: text("badge_color").default('driiva-blue'),
  isActive: boolean("is_active").default(true),
});

export const userAchievements = pgTable("user_achievements", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  achievementId: integer("achievement_id").references(() => achievements.id).notNull(),
  unlockedAt: timestamp("unlocked_at").defaultNow(),
});

export const incidents = pgTable("incidents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  incidentType: text("incident_type").notNull(), // crash, breakdown, theft
  description: text("description"),
  location: text("location"),
  severity: text("severity").default('medium'),
  status: text("status").default('reported'),
  reportedAt: timestamp("reported_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

export const leaderboard = pgTable("leaderboard", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  score: integer("score").notNull(),
  rank: integer("rank").notNull(),
  period: text("period").default('weekly'), // weekly, monthly, all-time
  lastUpdated: timestamp("last_updated").defaultNow(),
}, (t) => [unique().on(t.userId, t.period)]);

export const webauthnCredentials = pgTable("webauthn_credentials", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  credentialId: text("credential_id").notNull().unique(),
  publicKey: text("public_key").notNull(),
  counter: integer("counter").default(0),
  deviceType: text("device_type"), // "face-id", "touch-id", "fingerprint", etc.
  deviceName: text("device_name"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  lastUsed: timestamp("last_used"),
});

export const webauthnChallenges = pgTable("webauthn_challenges", {
  key: text("key").primaryKey(),
  challenge: text("challenge").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  drivingProfile: one(drivingProfiles, {
    fields: [users.id],
    references: [drivingProfiles.userId],
  }),
  trips: many(trips),
  tripsSummaries: many(tripsSummary),
  policies: many(policies),
  achievements: many(userAchievements),
  incidents: many(incidents),
  leaderboardEntry: one(leaderboard, {
    fields: [users.id],
    references: [leaderboard.userId],
  }),
  webauthnCredentials: many(webauthnCredentials),
}));

export const tripsSummaryRelations = relations(tripsSummary, ({ one }) => ({
  user: one(users, { fields: [tripsSummary.userId], references: [users.id] }),
}));

export const policiesRelations = relations(policies, ({ one }) => ({
  user: one(users, { fields: [policies.userId], references: [users.id] }),
}));

export const drivingProfilesRelations = relations(drivingProfiles, ({ one }) => ({
  user: one(users, {
    fields: [drivingProfiles.userId],
    references: [users.id],
  }),
}));

export const tripsRelations = relations(trips, ({ one }) => ({
  user: one(users, {
    fields: [trips.userId],
    references: [users.id],
  }),
}));

export const userAchievementsRelations = relations(userAchievements, ({ one }) => ({
  user: one(users, {
    fields: [userAchievements.userId],
    references: [users.id],
  }),
  achievement: one(achievements, {
    fields: [userAchievements.achievementId],
    references: [achievements.id],
  }),
}));

export const incidentsRelations = relations(incidents, ({ one }) => ({
  user: one(users, {
    fields: [incidents.userId],
    references: [users.id],
  }),
}));

export const leaderboardRelations = relations(leaderboard, ({ one }) => ({
  user: one(users, {
    fields: [leaderboard.userId],
    references: [users.id],
  }),
}));

export const webauthnCredentialsRelations = relations(webauthnCredentials, ({ one }) => ({
  user: one(users, {
    fields: [webauthnCredentials.userId],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTripsSummarySchema = createInsertSchema(tripsSummary).omit({
  id: true,
  createdAt: true,
});

export const insertPolicySchema = createInsertSchema(policies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDrivingProfileSchema = createInsertSchema(drivingProfiles).omit({
  id: true,
  lastUpdated: true,
});

export const insertTripSchema = createInsertSchema(trips).omit({
  id: true,
  createdAt: true,
});

export const insertIncidentSchema = z.object({
  userId: z.number(),
  incidentType: z.string().min(1, "Incident type is required"),
  description: z.string().min(1, "Description is required"),
  location: z.string().optional(),
  severity: z.enum(["minor", "moderate", "major", "critical"]),
  status: z.string().default("pending")
});

export const insertAchievementSchema = createInsertSchema(achievements).omit({
  id: true,
});

export const insertUserAchievementSchema = createInsertSchema(userAchievements).omit({
  id: true,
  unlockedAt: true,
});

export const insertWebauthnCredentialSchema = createInsertSchema(webauthnCredentials).omit({
  id: true,
  createdAt: true,
  lastUsed: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type TripSummary = typeof tripsSummary.$inferSelect;
export type InsertTripSummary = z.infer<typeof insertTripsSummarySchema>;
export type Policy = typeof policies.$inferSelect;
export type InsertPolicy = z.infer<typeof insertPolicySchema>;
export type DrivingProfile = typeof drivingProfiles.$inferSelect;
export type InsertDrivingProfile = z.infer<typeof insertDrivingProfileSchema>;
export type Trip = typeof trips.$inferSelect;
export type InsertTrip = z.infer<typeof insertTripSchema>;
export type CommunityPool = typeof communityPool.$inferSelect;
export type Achievement = typeof achievements.$inferSelect;
export type InsertAchievement = z.infer<typeof insertAchievementSchema>;
export type UserAchievement = typeof userAchievements.$inferSelect;
export type InsertUserAchievement = z.infer<typeof insertUserAchievementSchema>;
export type Incident = typeof incidents.$inferSelect;
export type InsertIncident = z.infer<typeof insertIncidentSchema>;
export type Leaderboard = typeof leaderboard.$inferSelect;
export type WebauthnCredential = typeof webauthnCredentials.$inferSelect;
export type InsertWebauthnCredential = z.infer<typeof insertWebauthnCredentialSchema>;