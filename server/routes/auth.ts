import type { Express } from "express";
import { authService } from "../auth";
import { authLimiter } from "../middleware/security";

/**
 * Authentication routes
 */
export function registerAuthRoutes(app: Express) {
  // Login endpoint with rate limiting
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
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Auth check endpoint
  app.get("/api/auth/check", async (req, res) => {
    // For now, we'll use a simple check - in production, use sessions/JWT
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ authenticated: false });
    }
    
    const user = await authService.getUser(parseInt(userId as string));
    if (!user) {
      return res.status(401).json({ authenticated: false });
    }
    
    const { password: _, ...userWithoutPassword } = user;
    res.json({ authenticated: true, user: userWithoutPassword });
  });

  // Register endpoint
  app.post("/api/auth/register", authLimiter, async (req, res) => {
    try {
      const { username, email, password, firstName, lastName, phoneNumber } = req.body;
      
      if (!username || !email || !password) {
        return res.status(400).json({ message: "Username, email, and password are required" });
      }

      const user = await authService.createUser({
        username,
        email,
        password,
        firstName,
        lastName,
        phoneNumber
      });

      // Return user data without password
      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: any) {
      console.error("Registration error:", error);
      if (error.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ message: "Username or email already exists" });
      }
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // Firebase Authentication — real implementation is in server/routes.ts
  // This stub is intentionally removed to avoid shadowing the working endpoint.
}