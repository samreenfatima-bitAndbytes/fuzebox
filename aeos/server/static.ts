import express from 'express';
import type { Express } from 'express';
import fs from "node:fs";
import path from "node:path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist (but not for unknown /api — return JSON)
  app.use("/{*path}", (req, res) => {
    const pathOnly = req.originalUrl.split("?")[0] ?? req.originalUrl;
    if (pathOnly.startsWith("/api")) {
      res.status(404).type("application/json").json({
        error: "not_found",
        message: `No API handler for ${req.method} ${pathOnly}`,
      });
      return;
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
