/**
 * API route registration. All /api/* routes are protected except:
 *
 * PUBLIC (no auth): POST /api/auth/login, POST /api/auth/register, POST /api/auth/firebase,
 *   WebAuthn endpoints, GET /api/community-pool, GET /api/leaderboard, GET /api/achievements (list).
 *
 * PROTECTED (requireAuth): /api/profile/me, /api/auth/check, POST /api/trips, POST /api/incidents,
 *   POST /api/simulate-refund, POST /api/ask. Routes with :userId also use requireResourceOwner
 *   so User A cannot access User B's data (dashboard, trips, scores, insights, achievements, GDPR).
 *
 * ADMIN (requireAuth + requireAdmin): PUT /api/community-pool. Rate limited via poolModificationLimiter.
 * GDPR delete is rate limited via gdprDeleteLimiter.
 */
import type { Express } from "express";
import { storage } from "./storage";
import { crypto } from "./lib/crypto";
import { telematicsProcessor, TelematicsData, TripJSON } from "./lib/telematics";
import { aiInsightsEngine } from "./lib/aiInsights";
import { scoreAggregation } from "./lib/scoreAggregation";
import { insertTripSchema, insertIncidentSchema } from "@shared/schema";
import { z } from "zod";
import { authService } from "./auth";
import { webauthnService } from "./webauthn";
import { authLimiter, tripDataLimiter, webhookLimiter } from "./middleware/security";
import { gdprDeleteLimiter, poolModificationLimiter } from "./middleware/rateLimiter";
import {
  verifyFirebaseAuth,
  requireAuth,
  requireResourceOwner,
  requireAdmin,
  type AuthRequest,
} from "./middleware/auth";
import { getStripe, getStripeWebhookSecret, stripeIdempotencyKey } from "./lib/stripe";
import { safeErrorResponse } from "./lib/errors";

export async function registerRoutes(app: Express): Promise<void> {
  // Verify Firebase JWT on all requests; sets req.auth { uid, email, userId } from token only (never from headers)
  app.use(verifyFirebaseAuth);

  // -------------------------------------------------------------------------
  // PUBLIC ROUTES (no auth) — login, register, webauthn, read-only leaderboard/achievements/community-pool
  // -------------------------------------------------------------------------

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // -------------------------------------------------------------------------
  // Profile API (protected: Firebase token required; identity from token only)
  // -------------------------------------------------------------------------
  app.get("/api/profile/me", requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.auth!.uid;
      const email = req.auth!.email ?? "";
      let profile = await storage.getUserByFirebaseUid(uid);
      if (!profile && email) {
        profile = await storage.getOrCreateUserByFirebase(uid, email, undefined);
      }
      if (!profile) {
        return res.status(404).json({ message: "Profile not found. Sign up first." });
      }
      const { password: _, ...safe } = profile;
      res.json({
        id: String(profile.id),
        firebaseUid: profile.firebaseUid,
        email: profile.email,
        name: profile.displayName ?? profile.firstName ?? profile.email?.split("@")[0] ?? "User",
        onboardingComplete: profile.onboardingComplete === true,
      });
    } catch (error: unknown) {
      console.error("GET /api/profile/me error:", error);
      res.status(500).json({ message: "Error fetching profile" });
    }
  });

  app.patch("/api/profile/me", requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.auth!.uid;
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) {
        return res.status(404).json({ message: "Profile not found. Complete signup first." });
      }
      const { onboardingComplete } = req.body as { onboardingComplete?: boolean };
      if (typeof onboardingComplete !== "boolean") {
        return res.status(400).json({ message: "onboardingComplete must be a boolean" });
      }
      const updated = await storage.updateUser(user.id, { onboardingComplete });
      if (!updated) {
        return res.status(500).json({ message: "Update failed" });
      }
      res.json({
        id: String(updated.id),
        email: updated.email,
        name: updated.displayName ?? updated.email?.split("@")[0] ?? "User",
        onboardingComplete: updated.onboardingComplete === true,
      });
    } catch (error: unknown) {
      console.error("PATCH /api/profile/me error:", error);
      res.status(500).json({ message: "Error updating profile" });
    }
  });

  // Auth endpoints with rate limiting
  app.post("/api/auth/login", authLimiter, async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password required" });
      }

      const user = await authService.login(username, password);
      
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Return user data without password
      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: any) {
      console.error("Login error:", error);
      // Do not leak internal error details to the client
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Auth check: requires valid Firebase JWT; returns authenticated + user from verified token (never trusts x-user-id)
  app.get("/api/auth/check", requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.auth!.uid;
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) {
        return res.status(200).json({ authenticated: true, user: null, firebaseUid: uid });
      }
      const { password: _, ...userWithoutPassword } = user;
      res.json({ authenticated: true, user: userWithoutPassword });
    } catch (e) {
      console.error("GET /api/auth/check error:", e);
      res.status(500).json({ authenticated: false });
    }
  });


  // Firebase Authentication with rate limiting (placeholder for future implementation)
  app.post("/api/auth/firebase", authLimiter, async (req, res) => {
    try {
      // TODO: Implement Firebase authentication when needed
      res.status(501).json({ message: "Firebase authentication not implemented yet" });
    } catch (error) {
      console.error("Firebase auth error:", error);
      res.status(401).json({ message: "Invalid token" });
    }
  });

  // -------------------------------------------------------------------------
  // WebAuthn (Face ID / Touch ID) — all lookups use email, not username
  // -------------------------------------------------------------------------

  // Public: check whether a passkey exists for an email (pre-login, no auth required)
  app.post("/api/auth/webauthn/check", authLimiter, async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ message: "email required" });
      }
      const hasPasskey = await webauthnService.hasCredentials(email);
      res.json({ hasPasskey });
    } catch (error: any) {
      console.error("WebAuthn check error:", error);
      res.json({ hasPasskey: false });
    }
  });

  app.post("/api/auth/webauthn/register/start", authLimiter, async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "email required" });
      const userAgent = req.headers['user-agent'];
      const options = await webauthnService.generateRegistrationOptions(email, userAgent);
      res.json(options);
    } catch (error: any) {
      safeErrorResponse(res, 400, "Failed to generate registration options", error);
    }
  });

  app.post("/api/auth/webauthn/register/complete", authLimiter, async (req, res) => {
    try {
      const { email, credential } = req.body;
      if (!email || !credential) return res.status(400).json({ message: "email and credential required" });
      const userAgent = req.headers['user-agent'];
      const result = await webauthnService.verifyRegistration(email, credential, userAgent);
      if (result.verified) {
        res.json({ success: true, message: "Biometric authentication registered successfully" });
      } else {
        res.status(400).json({ message: result.error || "Registration verification failed" });
      }
    } catch (error: any) {
      safeErrorResponse(res, 500, "Registration failed", error);
    }
  });

  app.post("/api/auth/webauthn/authenticate/start", authLimiter, async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "email required" });
      const options = await webauthnService.generateAuthenticationOptions(email);
      res.json(options);
    } catch (error: any) {
      safeErrorResponse(res, 400, "Failed to generate authentication options", error);
    }
  });

  // Returns customToken — client must call signInWithCustomToken() to create Firebase session
  app.post("/api/auth/webauthn/authenticate/complete", authLimiter, async (req, res) => {
    try {
      const { email, assertion } = req.body;
      if (!email || !assertion) return res.status(400).json({ message: "email and assertion required" });
      const result = await webauthnService.verifyAuthentication(email, assertion);
      if (result.verified && result.user) {
        res.json({ success: true, user: result.user, customToken: result.customToken ?? null });
      } else {
        res.status(401).json({ message: result.error || "Authentication failed" });
      }
    } catch (error: any) {
      safeErrorResponse(res, 500, "Authentication failed", error);
    }
  });

  // List own passkeys (protected: Firebase session required)
  app.get("/api/auth/webauthn/credentials/me", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUserByFirebaseUid(req.auth!.uid);
      if (!user?.email) return res.status(404).json({ message: "User not found" });
      const credentials = await webauthnService.getUserCredentials(user.email);
      res.json({
        credentials: credentials.map((cred: any) => ({
          id: cred.credentialId,
          deviceType: cred.deviceType,
          deviceName: cred.deviceName,
          createdAt: cred.createdAt,
          lastUsed: cred.lastUsed,
        })),
      });
    } catch (error: any) {
      console.error("Get credentials error:", error);
      res.status(500).json({ message: "Failed to fetch credentials" });
    }
  });

  // Remove a specific passkey (soft-delete, protected)
  app.delete("/api/auth/webauthn/credentials/:credentialId", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { credentialId } = req.params;
      const deleted = await webauthnService.deleteCredential(credentialId, req.auth!.uid);
      if (deleted) {
        res.json({ success: true });
      } else {
        res.status(404).json({ message: "Credential not found or already removed" });
      }
    } catch (error: any) {
      console.error("Delete credential error:", error);
      res.status(500).json({ message: "Failed to delete credential" });
    }
  });


  // Get user dashboard data (protected: token required; user can only access own dashboard)
  app.get("/api/dashboard/:userId", requireAuth, requireResourceOwner("userId"), async (req: AuthRequest, res) => {
    try {
      const userId = req.auth!.userId!;

      const user = await storage.getUser(userId);
      const profile = await storage.getDrivingProfile(userId);
      const recentTrips = await storage.getUserTrips(userId, 5);
      const pool = await storage.getCommunityPool();
      const achievements = await storage.getUserAchievements(userId);
      const leaderboard = await storage.getLeaderboard('weekly', 10);

      if (!user || !profile) {
        return res.status(404).json({ message: "User not found" });
      }

      // Calculate projected refund
      const poolSafetyFactor = pool?.safetyFactor || 0.80;
      const projectedRefund = telematicsProcessor.calculateRefund(
        profile.currentScore || 0,
        Number(poolSafetyFactor),
        Number(user.premiumAmount)
      );
      res.json({
        user,
        profile: { ...profile, projectedRefund },
        recentTrips,
        communityPool: pool,
        achievements,
        leaderboard
      });
    } catch (error: any) {
      safeErrorResponse(res, 500, "Error fetching dashboard data", error);
    }
  });

  // Submit trip data (protected: auth required; userId taken from token, not body)
  app.post("/api/trips", requireAuth, tripDataLimiter, async (req: AuthRequest, res) => {
    try {
      const authenticatedUserId = req.auth!.userId!;
      const body = { ...req.body, userId: authenticatedUserId };
      const tripData = insertTripSchema.parse(body);
      const telematicsDataOrJSON: TelematicsData | TripJSON = req.body.telematicsData || req.body;
      const userId = tripData.userId;

      // Get existing trips for duplicate detection (last 24 hours)
      const checkStart = new Date();
      checkStart.setHours(checkStart.getHours() - 24);
      const existingTrips = await storage.getTripsByDateRange(
        userId,
        checkStart,
        new Date(),
        100
      );

      // Convert to format needed for duplicate check
      const existingTripsForCheck = existingTrips.map(t => ({
        startTime: new Date(t.startTime),
        endTime: new Date(t.endTime),
        distance: Number(t.distance)
      }));

      // Process telematics data with anomaly detection
      const metrics = await telematicsProcessor.processTrip(
        telematicsDataOrJSON,
        userId,
        existingTripsForCheck
      );

      // Log anomalies if detected
      if (metrics.anomalies.hasImpossibleSpeed || metrics.anomalies.hasGPSJumps || metrics.anomalies.isDuplicate) {
        console.warn(`Trip anomalies detected for user ${userId}:`, {
          impossibleSpeed: metrics.anomalies.hasImpossibleSpeed,
          gpsJumps: metrics.anomalies.hasGPSJumps,
          duplicate: metrics.anomalies.isDuplicate,
          anomalyScore: metrics.anomalies.anomalyScore
        });
      }

      // Require a real encryption key — no insecure fallback in production
      const encryptionKey = process.env.ENCRYPTION_KEY;
      if (!encryptionKey) {
        console.error('ENCRYPTION_KEY env var not set; refusing to store telematics data');
        return res.status(500).json({ message: 'Server configuration error' });
      }

      // Create trip with processed metrics (distance in km)
      const trip = await storage.createTrip({
        ...tripData,
        score: metrics.score,
        hardBrakingEvents: metrics.hardBrakingEvents,
        harshAcceleration: metrics.harshAccelerationEvents,
        speedViolations: metrics.speedViolations,
        nightDriving: metrics.nightDriving,
        sharpCorners: metrics.sharpCorners,
        distance: metrics.distanceKm.toString(), // Store in km
        duration: metrics.duration,
        telematicsData: crypto.encrypt(
          JSON.stringify(telematicsDataOrJSON),
          encryptionKey
        )
      });

      // Update user's driving profile
      const profile = await storage.getDrivingProfile(tripData.userId);
      if (profile) {
        const currentScore = profile.currentScore || 0;
        const totalTrips = profile.totalTrips || 0;
        const newCurrentScore = Math.round((currentScore * totalTrips + metrics.score) / (totalTrips + 1));

        const updatedProfile = await storage.updateDrivingProfile(tripData.userId, {
          currentScore: newCurrentScore,
          hardBrakingScore: (profile.hardBrakingScore || 0) + metrics.hardBrakingEvents,
          accelerationScore: (profile.accelerationScore || 0) + metrics.harshAccelerationEvents,
          speedAdherenceScore: (profile.speedAdherenceScore || 0) + metrics.speedViolations,
          nightDrivingScore: (profile.nightDrivingScore || 0) + (metrics.nightDriving ? 1 : 0),
          corneringScore: (profile.corneringScore || 0) + metrics.sharpCorners,
          totalTrips: totalTrips + 1,
          totalMiles: (Number(profile.totalMiles) + metrics.distanceKm).toString() // Add km
        });

        // Update leaderboard
        await storage.updateLeaderboard(tripData.userId, newCurrentScore);
      }

      res.json({
        trip,
        metrics: {
          ...metrics,
          distance_km: metrics.distanceKm,
          avg_speed: metrics.avgSpeed,
          harsh_braking_count: metrics.harshBrakingCount
        },
        anomalies: metrics.anomalies
      });
    } catch (error: any) {
      safeErrorResponse(res, 500, "Error processing trip", error);
    }
  });

  // Get user trips (protected: user can only access own trips)
  app.get("/api/trips/:userId", requireAuth, requireResourceOwner("userId"), async (req: AuthRequest, res) => {
    try {
      const userId = req.auth!.userId!;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      
      // Support date range filtering for time-series optimization
      if (req.query.startDate && req.query.endDate) {
        const startDate = new Date(req.query.startDate as string);
        const endDate = new Date(req.query.endDate as string);
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          return res.status(400).json({ message: 'Invalid startDate or endDate; use ISO 8601 format' });
        }
        if (endDate <= startDate) {
          return res.status(400).json({ message: 'endDate must be after startDate' });
        }
        const trips = await storage.getTripsByDateRange(userId, startDate, endDate, limit);
        return res.json(trips);
      }
      
      const trips = await storage.getUserTrips(userId, limit, offset);
      res.json(trips);
    } catch (error: any) {
      safeErrorResponse(res, 500, "Error fetching trips", error);
    }
  });

  // Get aggregated weekly score (protected: own data only)
  app.get("/api/scores/weekly/:userId", requireAuth, requireResourceOwner("userId"), async (req: AuthRequest, res) => {
    try {
      const userId = req.auth!.userId!;
      const weekStart = req.query.weekStart 
        ? new Date(req.query.weekStart as string)
        : undefined;
      
      const score = await scoreAggregation.getWeeklyScore(userId, weekStart);
      if (!score) {
        return res.status(404).json({ message: "No trips found for this week" });
      }
      res.json(score);
    } catch (error: any) {
      safeErrorResponse(res, 500, "Error fetching weekly score", error);
    }
  });

  // Get aggregated monthly score (protected: own data only)
  app.get("/api/scores/monthly/:userId", requireAuth, requireResourceOwner("userId"), async (req: AuthRequest, res) => {
    try {
      const userId = req.auth!.userId!;
      const monthStart = req.query.monthStart 
        ? new Date(req.query.monthStart as string)
        : undefined;
      
      const score = await scoreAggregation.getMonthlyScore(userId, monthStart);
      if (!score) {
        return res.status(404).json({ message: "No trips found for this month" });
      }
      res.json(score);
    } catch (error: any) {
      safeErrorResponse(res, 500, "Error fetching monthly score", error);
    }
  });

  // Get time-series data (protected: own data only)
  app.get("/api/scores/timeseries/:userId", requireAuth, requireResourceOwner("userId"), async (req: AuthRequest, res) => {
    try {
      const userId = req.auth!.userId!;
      const startDate = new Date(req.query.startDate as string || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
      const endDate = new Date(req.query.endDate as string || new Date().toISOString());
      const granularity = (req.query.granularity as 'daily' | 'weekly' | 'monthly') || 'daily';
      
      const data = await scoreAggregation.getTimeSeriesData(userId, startDate, endDate, granularity);
      res.json(data);
    } catch (error: any) {
      safeErrorResponse(res, 500, "Error fetching time-series data", error);
    }
  });

  // Get score trend (protected: own data only)
  app.get("/api/scores/trend/:userId", requireAuth, requireResourceOwner("userId"), async (req: AuthRequest, res) => {
    try {
      const userId = req.auth!.userId!;
      const period = (req.query.period as 'weekly' | 'monthly') || 'weekly';
      
      const trend = await scoreAggregation.getScoreTrend(userId, period);
      res.json(trend);
    } catch (error: any) {
      safeErrorResponse(res, 500, "Error fetching score trend", error);
    }
  });

  // Report incident (protected: userId set from token)
  app.post("/api/incidents", requireAuth, async (req: AuthRequest, res) => {
    try {
      const incidentData = {
        ...req.body,
        userId: req.auth!.userId,
        reportedAt: new Date(),
        timestamp: req.body.timestamp || new Date().toISOString()
      };

      const validatedData = insertIncidentSchema.parse(incidentData);
      const incident = await storage.createIncident(validatedData);
      res.json(incident);
    } catch (error: any) {
      console.error("Incident submission error:", error);
      if (error.name === 'ZodError') {
        res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      } else {
        safeErrorResponse(res, 500, "Error reporting incident", error);
      }
    }
  });

  // Get community pool (public read-only)
  app.get("/api/community-pool", async (req, res) => {
    try {
      const pool = await storage.getCommunityPool();
      res.json(pool);
    } catch (error: any) {
      safeErrorResponse(res, 500, "Error fetching community pool", error);
    }
  });

  // Update community pool (admin only; rate limited)
  app.put("/api/community-pool", requireAuth, requireAdmin, poolModificationLimiter, async (req, res) => {
    try {
      const poolData = req.body;
      const pool = await storage.updateCommunityPool(poolData);
      res.json(pool);
    } catch (error: any) {
      safeErrorResponse(res, 500, "Error updating community pool", error);
    }
  });

  // Get leaderboard
  app.get("/api/leaderboard", async (req, res) => {
    try {
      const period = req.query.period as string || 'weekly';
      const limit = parseInt(req.query.limit as string) || 50;
      const leaderboard = await storage.getLeaderboard(period, limit);
      res.json(leaderboard);
    } catch (error: any) {
      safeErrorResponse(res, 500, "Error fetching leaderboard", error);
    }
  });

  // Get achievements
  app.get("/api/achievements", async (req, res) => {
    try {
      const achievements = await storage.getAchievements();
      res.json(achievements);
    } catch (error: any) {
      safeErrorResponse(res, 500, "Error fetching achievements", error);
    }
  });

  // Get user achievements (protected: own data only)
  app.get("/api/achievements/:userId", requireAuth, requireResourceOwner("userId"), async (req: AuthRequest, res) => {
    try {
      const userId = req.auth!.userId!;
      const achievements = await storage.getUserAchievements(userId);
      res.json(achievements);
    } catch (error: any) {
      safeErrorResponse(res, 500, "Error fetching user achievements", error);
    }
  });

  // Refund simulator (protected)
  app.post("/api/simulate-refund", requireAuth, async (req, res) => {
    try {
      const { personalScore, poolSafetyFactor, premiumAmount } = req.body;
      const refund = telematicsProcessor.calculateRefund(personalScore, poolSafetyFactor, premiumAmount);
      res.json({ refund });
    } catch (error: any) {
      safeErrorResponse(res, 500, "Error simulating refund", error);
    }
  });

  // AI insights (protected: own data only)
  app.get("/api/insights/:userId", requireAuth, requireResourceOwner("userId"), async (req: AuthRequest, res) => {
    try {
      const userId = req.auth!.userId!;
      
      // Get user profile and recent trips
      const profile = await storage.getDrivingProfile(userId);
      if (!profile) {
        return res.status(404).json({ message: "Driving profile not found" });
      }
      
      const trips = await storage.getTrips(userId, 20, 0);
      const communityPool = await storage.getCommunityPool(1);
      
      // Generate AI insights
      const insights = aiInsightsEngine.generateInsights(
        profile,
        trips,
        Number(communityPool?.safetyFactor) * 100 || 75
      );
      
      res.json(insights);
    } catch (error: any) {
      safeErrorResponse(res, 500, "Error generating insights", error);
    }
  });

  // GDPR: Export user data (protected: own data only)
  app.get("/api/gdpr/export/:userId", requireAuth, requireResourceOwner("userId"), async (req: AuthRequest, res) => {
    try {
      const userId = req.auth!.userId!;
      const userData = await storage.exportUserData(userId);

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename=driiva-data-${userId}.json`);
      res.json(userData);
    } catch (error: any) {
      safeErrorResponse(res, 500, "Error exporting data", error);
    }
  });

  // GDPR: Delete user account (protected: own data only; strict rate limit)
  app.delete("/api/gdpr/delete/:userId", requireAuth, requireResourceOwner("userId"), gdprDeleteLimiter, async (req: AuthRequest, res) => {
    try {
      const userId = req.auth!.userId!;
      await storage.deleteUserData(userId);
      res.json({ message: "User data deleted successfully" });
    } catch (error: any) {
      safeErrorResponse(res, 500, "Error deleting user data", error);
    }
  });

  // Perplexity AI endpoint (protected)
  // -------------------------------------------------------------------------
  // AI Driiva — structured driving feedback per trip
  // -------------------------------------------------------------------------

  const coachRateLimitMap = new Map<string, { count: number; resetAt: number }>();

  app.post("/api/ai/coach", requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.auth!.uid;

      // Simple in-memory rate limit: 10 requests / hour / user
      const now = Date.now();
      const bucket = coachRateLimitMap.get(uid);
      if (bucket && bucket.resetAt > now) {
        if (bucket.count >= 10) {
          return res.status(429).json({ message: "Rate limit exceeded. Try again later." });
        }
        bucket.count++;
      } else {
        coachRateLimitMap.set(uid, { count: 1, resetAt: now + 3600_000 });
      }

      const {
        score,
        scoreBreakdown,
        events,
        distanceMeters,
        durationSeconds,
        context,
        averageScore,
        totalTrips,
      } = req.body;

      if (score == null || !scoreBreakdown) {
        return res.status(400).json({ message: "Missing required trip score data" });
      }

      const distanceMiles = ((distanceMeters ?? 0) / 1609.34).toFixed(1);
      const durationMins = Math.round((durationSeconds ?? 0) / 60);

      const userPrompt = [
        `Trip data:`,
        `  Overall score: ${score}/100`,
        `  Speed score: ${scoreBreakdown.speedScore}, Braking: ${scoreBreakdown.brakingScore}, Acceleration: ${scoreBreakdown.accelerationScore}, Cornering: ${scoreBreakdown.corneringScore}, Phone: ${scoreBreakdown.phoneUsageScore}`,
        `  Hard braking events: ${events?.hardBrakingCount ?? 0}, Hard acceleration: ${events?.hardAccelerationCount ?? 0}, Speeding: ${events?.speedingSeconds ?? 0}s, Sharp turns: ${events?.sharpTurnCount ?? 0}`,
        `  Distance: ${distanceMiles} miles, Duration: ${durationMins} minutes`,
        context?.isNightDriving ? '  Night driving: yes' : '',
        context?.isRushHour ? '  Rush hour: yes' : '',
        context?.weatherCondition ? `  Weather: ${context.weatherCondition}` : '',
        averageScore != null ? `  Driver average score: ${averageScore}` : '',
        totalTrips != null ? `  Total trips recorded: ${totalTrips}` : '',
      ].filter(Boolean).join('\n');

      const systemPrompt =
        "You are Driiva's AI Driving Coach. Analyse the driving trip data and respond with ONLY valid JSON (no markdown, no backticks) in this exact shape: " +
        '{"headline":"<one sentence insight>","tips":["<tip1>","<tip2>","<tip3 optional>"],"encouragement":"<one encouraging sentence about strengths>"}. ' +
        "Tips should be specific, actionable, and based on the weakest scores. Be concise, warm, data-specific. Use UK English.";

      const provider = process.env.AI_COACH_PROVIDER ?? 'perplexity';
      const apiKey = process.env.AI_COACH_API_KEY ?? process.env.PERPLEXITY_API_KEY;

      if (!apiKey) {
        return res.status(503).json({ message: "AI Driiva is not configured" });
      }

      let result: { headline: string; tips: string[]; encouragement: string };

      if (provider === 'anthropic') {
        const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 400,
            system: systemPrompt,
            messages: [{ role: "user", content: userPrompt }],
          }),
        });
        if (!anthropicRes.ok) {
          const err = await anthropicRes.text();
          throw new Error(`Anthropic API error: ${anthropicRes.status} — ${err}`);
        }
        const anthropicData = await anthropicRes.json();
        const text = anthropicData.content?.[0]?.text ?? '{}';
        result = JSON.parse(text);
      } else {
        const perplexityRes = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "sonar-pro",
            stream: false,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.3,
            return_images: false,
            return_related_questions: false,
          }),
        });
        if (!perplexityRes.ok) {
          const err = await perplexityRes.text();
          throw new Error(`Perplexity API error: ${perplexityRes.status} — ${err}`);
        }
        const perplexityData = await perplexityRes.json();
        const raw = perplexityData.choices?.[0]?.message?.content ?? '{}';
        result = JSON.parse(raw);
      }

      if (!result.headline || !Array.isArray(result.tips) || !result.encouragement) {
        throw new Error("Invalid response shape from AI provider");
      }

      res.json(result);
    } catch (error: any) {
      console.error("[AI Driiva] Error:", error);
      safeErrorResponse(res, 500, "AI Coach error", error);
    }
  });

  // -------------------------------------------------------------------------
  // General AI ask endpoint
  // -------------------------------------------------------------------------

  app.post("/api/ask", requireAuth, async (req, res) => {
    try {
      const { prompt } = req.body;
      
      if (!prompt) {
        return res.status(400).json({ message: "Prompt is required" });
      }

      const response = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`
        },
        body: JSON.stringify({
          model: "sonar-pro",
          stream: false,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
          return_images: false,
          return_related_questions: false
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error("Perplexity API error:", response.status, errorData);
        throw new Error(`Perplexity API error: ${response.status} - ${errorData}`);
      }

      const data = await response.json();
      
      res.json({
        answer: data.choices[0].message.content,
        citations: data.citations || []
      });
    } catch (error: any) {
      console.error("AI backend error:", error);
      safeErrorResponse(res, 500, "AI backend error", error);
    }
  });

  // -------------------------------------------------------------------------
  // STRIPE PAYMENT ROUTES
  // -------------------------------------------------------------------------

  /**
   * Create (or retrieve) a Stripe Customer + Subscription.
   * Uses inline price_data so each user pays their individually-computed premium.
   *
   * Body:
   *   annualPremiumCents  — annual premium in pence (from client pricingEngine × 100)
   *   billingPeriod       — 'monthly' | 'annual'
   *   quoteId?            — Root Platform quoteId stored in subscription metadata
   *
   * If annualPremiumCents is missing, falls back to STRIPE_MONTHLY_PRICE_ID for
   * backwards compatibility with older clients.
   */
  app.post("/api/payments/create-subscription", requireAuth, async (req: AuthRequest, res) => {
    try {
      const stripe = getStripe();
      const uid = req.auth!.uid;
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(404).json({ message: "User not found" });

      const quoteId: string | undefined = req.body.quoteId;
      const billingPeriod: 'monthly' | 'annual' = req.body.billingPeriod === 'annual' ? 'annual' : 'monthly';
      const annualPremiumCents: number | undefined = req.body.annualPremiumCents
        ? Number(req.body.annualPremiumCents)
        : undefined;

      // Validate annualPremiumCents when provided
      if (annualPremiumCents !== undefined) {
        if (!Number.isFinite(annualPremiumCents) || annualPremiumCents < 10000 || annualPremiumCents > 500000) {
          return res.status(400).json({ message: "annualPremiumCents must be between 10000 and 500000" });
        }
      }

      // Upsert Stripe customer
      let customerId = user.stripeCustomerId ?? undefined;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined,
          metadata: { firebaseUid: uid, driivUserId: String(user.id) },
        }, { idempotencyKey: stripeIdempotencyKey(uid, 'customer-create') });
        customerId = customer.id;
        await storage.updateStripeCustomerId(user.id, customerId);
      }

      // Build subscription metadata
      const subscriptionMeta: Record<string, string> = { firebaseUid: uid, billingPeriod };
      if (quoteId) subscriptionMeta.quoteId = quoteId;

      // Build subscription item: use price_data if we have a computed premium,
      // otherwise fall back to the pre-created monthly Price ID.
      let subscriptionItem: any;
      const productId = process.env.STRIPE_PRODUCT_ID;

      if (annualPremiumCents !== undefined && productId) {
        const unitAmount = billingPeriod === 'annual'
          ? annualPremiumCents
          : Math.round(annualPremiumCents / 12 * 1.07);

        subscriptionItem = {
          price_data: {
            currency: 'gbp',
            product: productId,
            recurring: { interval: billingPeriod === 'annual' ? 'year' : 'month' },
            unit_amount: unitAmount,
          },
        };
        subscriptionMeta.annualPremiumCents = String(annualPremiumCents);
      } else {
        // Legacy fallback: use the pre-created monthly Price ID
        const priceId = req.body.priceId || process.env.STRIPE_MONTHLY_PRICE_ID;
        if (!priceId) {
          return res.status(400).json({ message: "STRIPE_PRODUCT_ID or STRIPE_MONTHLY_PRICE_ID is required" });
        }
        subscriptionItem = { price: priceId };
      }

      const idempotencyKey = stripeIdempotencyKey(
        uid,
        `subscription-${billingPeriod}-${annualPremiumCents ?? 'fixed'}-${quoteId ?? 'none'}`,
      );

      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [subscriptionItem],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
        metadata: subscriptionMeta,
      }, { idempotencyKey });

      const invoice = subscription.latest_invoice as any;
      const paymentIntent = invoice?.payment_intent;

      res.json({
        subscriptionId: subscription.id,
        clientSecret: paymentIntent?.client_secret ?? null,
        status: subscription.status,
      });
    } catch (error: any) {
      if (error.message?.includes('STRIPE_SECRET_KEY')) {
        return res.status(503).json({ message: "Stripe is not configured on this environment" });
      }
      safeErrorResponse(res, 500, "Failed to create subscription", error);
    }
  });

  /**
   * Create a one-time Stripe Checkout Session (for add-ons / one-off payments).
   * Body: { priceId: string, successUrl?: string, cancelUrl?: string }
   */
  app.post("/api/payments/create-checkout", requireAuth, async (req: AuthRequest, res) => {
    try {
      const stripe = getStripe();
      const uid = req.auth!.uid;
      const { priceId, successUrl, cancelUrl } = req.body;
      if (!priceId) return res.status(400).json({ message: "priceId is required" });

      const user = await storage.getUserByFirebaseUid(uid);
      if (!user) return res.status(404).json({ message: "User not found" });

      let customerId = user.stripeCustomerId ?? undefined;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { firebaseUid: uid },
        });
        customerId = customer.id;
        await storage.updateStripeCustomerId(user.id, customerId);
      }

      const origin = req.headers.origin || process.env.WEBAUTHN_ORIGIN || 'http://localhost:5000';
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'payment',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl || `${origin}/dashboard?checkout=success`,
        cancel_url: cancelUrl || `${origin}/checkout?checkout=cancelled`,
        metadata: { firebaseUid: uid },
      });

      res.json({ url: session.url, sessionId: session.id });
    } catch (error: any) {
      if (error.message?.includes('STRIPE_SECRET_KEY')) {
        return res.status(503).json({ message: "Stripe is not configured on this environment" });
      }
      safeErrorResponse(res, 500, "Failed to create checkout session", error);
    }
  });

  /**
   * Return a Stripe Customer Portal link so users can manage their subscription.
   */
  app.get("/api/payments/billing-portal", requireAuth, async (req: AuthRequest, res) => {
    try {
      const stripe = getStripe();
      const uid = req.auth!.uid;
      const user = await storage.getUserByFirebaseUid(uid);
      if (!user?.stripeCustomerId) {
        return res.status(404).json({ message: "No billing account found" });
      }

      const origin = req.headers.origin || process.env.WEBAUTHN_ORIGIN || 'http://localhost:5000';
      const session = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${origin}/settings`,
      });

      res.json({ url: session.url });
    } catch (error: any) {
      if (error.message?.includes('STRIPE_SECRET_KEY')) {
        return res.status(503).json({ message: "Stripe is not configured on this environment" });
      }
      safeErrorResponse(res, 500, "Failed to create billing portal session", error);
    }
  });

  /**
   * Stripe webhook endpoint.
   * Raw body is required for signature verification (app.ts registers express.raw for this path).
   * Events handled:
   *   invoice.payment_succeeded  → trigger Root policy bind if no active policy
   *   invoice.payment_failed     → log + notify user
   *   customer.subscription.deleted → mark policy cancelled
   *   checkout.session.completed → handle one-time purchases
   */
  app.post("/api/webhooks/stripe", webhookLimiter, async (req, res) => {
    let event: any;
    try {
      const stripe = getStripe();
      const sig = req.headers['stripe-signature'] as string;
      const webhookSecret = getStripeWebhookSecret();
      event = stripe.webhooks.constructEvent(req.body as Buffer, sig, webhookSecret);
    } catch (err: any) {
      console.error("[Stripe webhook] Signature verification failed:", err.message);
      return res.status(400).json({ message: `Webhook Error: ${err.message}` });
    }

    // Acknowledge immediately — process asynchronously
    res.json({ received: true });

    try {
      switch (event.type) {
        case 'invoice.payment_succeeded': {
          const invoice = event.data.object;
          const customerId = invoice.customer as string;
          const subscriptionId = invoice.subscription as string;
          console.log(`[Stripe webhook] Payment succeeded for customer ${customerId}`);

          // Retrieve subscription to get quoteId from metadata
          let quoteId: string | undefined;
          try {
            const stripe = getStripe();
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            quoteId = sub.metadata?.quoteId;
          } catch (subErr) {
            console.warn('[Stripe webhook] Could not retrieve subscription metadata:', subErr);
          }

          await handleStripePaymentSucceeded(customerId, subscriptionId, quoteId);
          break;
        }
        case 'invoice.payment_failed': {
          const invoice = event.data.object;
          console.warn(`[Stripe webhook] Payment FAILED for customer ${invoice.customer}`, {
            invoiceId: invoice.id,
            attemptCount: invoice.attempt_count,
          });
          break;
        }
        case 'customer.subscription.deleted': {
          const sub = event.data.object;
          console.log(`[Stripe webhook] Subscription deleted: ${sub.id}`);
          break;
        }
        case 'checkout.session.completed': {
          const session = event.data.object;
          console.log(`[Stripe webhook] Checkout completed: ${session.id}`);
          break;
        }
        default:
          // Unhandled event type — ignore silently
      }
    } catch (err) {
      console.error("[Stripe webhook] Handler error:", err);
    }
  });

  // -------------------------------------------------------------------------
  // ROOT PLATFORM WEBHOOK
  // Root pushes async policy status updates here.
  // -------------------------------------------------------------------------
  app.post("/api/webhooks/root", webhookLimiter, async (req, res) => {
    // Root signs webhooks with HMAC-SHA256; verify if ROOT_WEBHOOK_SECRET is set.
    const rootSecret = process.env.ROOT_WEBHOOK_SECRET;
    if (rootSecret) {
      const crypto = await import('crypto');
      const sig = req.headers['x-root-signature'] as string | undefined;
      if (!sig) return res.status(400).json({ message: "Missing Root webhook signature" });
      const expected = crypto.default
        .createHmac('sha256', rootSecret)
        .update(req.body as Buffer)
        .digest('hex');
      if (sig !== expected) return res.status(400).json({ message: "Invalid Root webhook signature" });
    }

    res.json({ received: true });

    try {
      const body = JSON.parse((req.body as Buffer).toString('utf8'));
      const eventType: string = body.event_type || body.type || '';
      const policyId: string = body.policy_id || body.data?.policy_id || '';
      console.log(`[Root webhook] Event: ${eventType}, policy: ${policyId}`);

      // Additional Root webhook handling would be wired here when Root sandbox creds
      // are available to confirm the exact payload shape.
    } catch (err) {
      console.error("[Root webhook] Handler error:", err);
    }
  });

}

// ---------------------------------------------------------------------------
// Stripe → Root integration glue (called from webhook handler above)
// ---------------------------------------------------------------------------

async function handleStripePaymentSucceeded(
  stripeCustomerId: string,
  stripeSubscriptionId: string,
  quoteId?: string,
): Promise<void> {
  try {
    const user = await storage.getUserByStripeCustomerId(stripeCustomerId);
    if (!user?.firebaseUid) {
      console.warn(`[Integration] No user found for Stripe customer ${stripeCustomerId}`);
      return;
    }

    console.log(`[Integration] Payment succeeded for ${user.firebaseUid} — writing pendingPayment`, { quoteId });

    const adminLib = await import('./lib/firebase-admin');
    const adminApp = adminLib.getFirebaseAdmin();
    if (!adminApp) {
      console.warn('[Integration] Firebase Admin not initialised — cannot write pendingPayment');
      return;
    }

    const { firestore: fsAdmin } = await import('firebase-admin');
    const doc: Record<string, unknown> = {
      stripeSubscriptionId,
      stripeCustomerId,
      status: 'pending',
      createdAt: fsAdmin.FieldValue.serverTimestamp(),
    };
    if (quoteId) doc.quoteId = quoteId;

    await adminApp.firestore()
      .collection('users')
      .doc(user.firebaseUid)
      .collection('pendingPayments')
      .doc(stripeSubscriptionId)
      .set(doc);

    console.log(`[Integration] pendingPayment written for ${user.firebaseUid}`);
  } catch (err) {
    console.error("[Integration] handleStripePaymentSucceeded error:", err);
  }
}