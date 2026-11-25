import "dotenv/config";
import express, { Response, NextFunction } from 'express';
import cookieParser from "cookie-parser";
import type { Request } from 'express';
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "node:http";
import { storage } from "./storage";
import { rollupEquations } from "./cognition";
import { bootstrapDefaultAdmin } from "./bootstrap";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

app.use(cookieParser());

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

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

      log(logLine);
    }
  });

  next();
});

(async () => {
  await bootstrapDefaultAdmin(log);
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  const host = process.env.HOST || "127.0.0.1";
  httpServer.listen(port, host, () => {
    log(`serving on ${host}:${port}`);
  });

  const ROLLUP_INTERVAL_MS = 30 * 60 * 1000;
  // 30 seconds * 1000 milliseconds
  // const ROLLUP_INTERVAL_MS = 30 * 1000;
  setInterval(async () => {
    try {
      const tenantIds = await storage.listActiveTenantIds();
      await Promise.all(tenantIds.map((id) => rollupEquations(id)));
      log(`equation rollup complete for ${tenantIds.length} tenant(s)`, "rollup");
    } catch (err) {
      log(`equation rollup failed: ${err}`, "rollup");
    }
  }, ROLLUP_INTERVAL_MS);

  // Deployment health poller — probes each tenant's deployment server every 30 seconds
  const HEALTH_POLL_INTERVAL_MS = 30_000;
  async function pollAgentHealth() {
    try {
      const tenantIds = await storage.listActiveTenantIds();
      for (const tenantId of tenantIds) {
        const tenant = await storage.getTenant(tenantId);
        if (!tenant?.deploymentHealthUrl) continue;
        const start = Date.now();
        try {
          const res = await fetch(tenant.deploymentHealthUrl, {
            signal: AbortSignal.timeout(5000),
            headers: { Accept: "application/json" },
          });
          const body = await res.json().catch(() => ({}));
          await storage.upsertTenantHealthProbe(tenantId, {
            isReachable: res.ok,
            httpStatus: res.status,
            responseMs: Date.now() - start,
            activeAgents: typeof body.active_agents === "number" ? body.active_agents : null,
          });
          log(`health probe [${tenantId}]: ${res.status} active_agents=${body.active_agents ?? "?"}`, "health-poll");
        } catch {
          await storage.upsertTenantHealthProbe(tenantId, {
            isReachable: false,
            httpStatus: null,
            responseMs: Date.now() - start,
            activeAgents: null,
          });
          log(`health probe [${tenantId}]: unreachable`, "health-poll");
        }
      }
    } catch (err) {
      log(`health poll failed: ${err}`, "health-poll");
    }
  }
  setInterval(pollAgentHealth, HEALTH_POLL_INTERVAL_MS);
})();
