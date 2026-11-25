#!/usr/bin/env node
/**
 * Fail fast before `next build` when `.next` was created by root/Docker
 * and the current user cannot unlink files (EACCES).
 */
import fs from "fs";
import path from "path";

const nextDir = path.join(process.cwd(), ".next");

function dirOwnerHint() {
  try {
    const st = fs.statSync(nextDir);
    return `uid=${st.uid} gid=${st.gid}`;
  } catch {
    return "unknown";
  }
}

function canWriteDir() {
  if (!fs.existsSync(nextDir)) return true;
  try {
    fs.accessSync(nextDir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

if (!canWriteDir()) {
  const me = `${process.getuid?.() ?? "?"}:${process.getgid?.() ?? "?"}`;
  console.error(`
\x1b[31mBuild blocked:\x1b[0m .next is not writable by your user (${me}).
  Directory owner: ${dirOwnerHint()}

This usually means \`npm run dev\` (or Next) ran as \x1b[1mroot\x1b[0m or inside Docker.

Fix (stop dev server first):
  cd ${process.cwd()}
  sudo rm -rf .next
  npm run build

Or keep the folder and fix ownership:
  sudo chown -R "$(whoami):$(whoami)" .next
`);
  process.exit(1);
}
