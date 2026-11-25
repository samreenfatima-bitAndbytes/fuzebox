import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

// Ensure secrets exist at startup
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("Missing JWT_SECRET environment variable. Please add it to your .env file.");
}

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

/**
 * Hashes a plain text password using bcrypt.
 */
export async function hashPassword(plain: string): Promise<string> {
  const saltRounds = 12;
  return await bcrypt.hash(plain, saltRounds);
}

/**
 * Verifies a plain text password against a stored bcrypt hash.
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(plain, hash);
}

// The core data we trust from the token
export interface TokenPayload {
  userId: number;
  tenantId: string;
}

/**
 * Signs a JWT embedding the userId and tenantId.
 */
export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET as string, {
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

/**
 * Verifies a JWT and extracts the payload.
 * Throws an error if the token is tampered with or expired.
 */
export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, JWT_SECRET as string) as jwt.JwtPayload & TokenPayload;
  
  return {
    userId: decoded.userId,
    tenantId: decoded.tenantId,
  };
}