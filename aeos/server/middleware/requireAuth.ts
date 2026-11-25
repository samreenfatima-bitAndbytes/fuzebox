import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../auth";

// Augment Express locals to strongly type the auth object
declare global {
  namespace Express {
    interface Locals {
      auth?: {
        userId: number;
        tenantId: string;
      };
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Requires cookie-parser to be installed and mounted in index.ts!
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const payload = verifyToken(token);
    
    // Attach securely decoded payload to locals
    res.locals.auth = {
      userId: payload.userId,
      tenantId: payload.tenantId,
    };
    
    next();
  } catch (error) {
    // Token is invalid, tampered with, or expired
    res.status(401).json({ message: "Invalid or expired session" });
  }
}