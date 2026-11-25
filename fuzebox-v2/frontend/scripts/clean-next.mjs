#!/usr/bin/env node
/** Remove .next when writable; otherwise print the same fix as ensure-next-cache. */
import fs from "fs";
import path from "path";
const nextDir = path.join(process.cwd(), ".next");

if (!fs.existsSync(nextDir)) {
  console.log("No .next directory — nothing to clean.");
  process.exit(0);
}

try {
  fs.rmSync(nextDir, { recursive: true, force: true });
  console.log("Removed .next");
  process.exit(0);
} catch (err) {
  const code = err && typeof err === "object" && "code" in err ? err.code : "";
  if (code === "EACCES" || code === "EPERM") {
    console.error(`
Cannot remove .next (${code}). Run with elevated permissions:

  cd ${process.cwd()}
  sudo rm -rf .next
`);
    process.exit(1);
  }
  throw err;
}
