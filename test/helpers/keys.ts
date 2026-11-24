import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateKeys } from "../../services/auth/src/common/auth/keys";

// The auth service reads its key at load time, so this must run before the service modules load.
// Jest runs setupFiles before each test file's imports, so each file gets its own key pair.
export function useTempKeys(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jwt-demo-keys-"));
  generateKeys(dir);
  process.env.AUTH_KEY_DIR = dir;
  return dir;
}
