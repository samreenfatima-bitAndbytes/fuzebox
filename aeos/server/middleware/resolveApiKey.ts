import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";

export async function resolveApiKey(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? req.header("Authorization");
  const rawKey = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";

  if (!rawKey) {
    return res.status(401).json({ error: "Invalid or missing API key" });
  }

  try {
    const tenantId = await storage.resolveTenantFromApiKey(rawKey);
    if (!tenantId) {
      return res.status(401).json({ error: "Invalid or missing API key" });
    }

    // Keep existing JWT locals typing intact; runtime shape differs for API keys.
    (res.locals as any).auth = { tenantId };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or missing API key" });
  }
}

