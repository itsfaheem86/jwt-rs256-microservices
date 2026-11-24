import path from "node:path";
import { generateKeys } from "../services/auth/src/common/auth/keys";

// Usage: npm run keygen -- [dir] [--force]. The default dir is keys/, which is gitignored.
const args = process.argv.slice(2);
const force = args.includes("--force");
const dir = path.resolve(args.find((arg) => !arg.startsWith("--")) ?? "keys");

try {
  const { privatePath, publicPath, kid } = generateKeys(dir, { force });
  console.log(`Wrote ${privatePath} (mode 600, keep secret)`);
  console.log(`Wrote ${publicPath} (safe to distribute)`);
  console.log(`kid: ${kid}`);
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
