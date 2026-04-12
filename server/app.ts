import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { securityHeaders, sanitizeInput, errorHandler, apiLimiter } from "./middleware/security";
import { log } from "./logger";

const app = express();

app.use(securityHeaders);

const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? "http://localhost:5173,http://localhost:3000,http://localhost:3001,http://localhost:3002,http://127.0.0.1:5173,http://127.0.0.1:3000,http://127.0.0.1:3001,http://127.0.0.1:3002")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const CORS_ORIGIN_SET = new Set(CORS_ORIGINS);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && CORS_ORIGIN_SET.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use('/api/', apiLimiter);
app.use(sanitizeInput);
// Stripe webhook requires raw body for signature verification — must come before express.json()
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));
app.use('/api/webhooks/root', express.raw({ type: 'application/json' }));
// Trip data uploads can be large (batched GPS points), but cap at 5mb to prevent DoS.
// The trip point batching strategy (100 pts / 10s flush) keeps payloads well under 1mb normally.
app.use('/api/trips', express.json({ limit: '5mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

export const ready = registerRoutes(app).then(() => {
  app.use(errorHandler);
});

export { app };
