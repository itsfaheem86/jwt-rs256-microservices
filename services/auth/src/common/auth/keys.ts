import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type GeneratedKeys = { privatePath: string; publicPath: string; kid: string };

// kid = first 16 characters of base64url(SHA-256(public PEM)). Every signer and verifier derives it the same way.
export function kidFor(publicPem: string): string {
  return crypto.createHash("sha256").update(publicPem).digest("base64url").slice(0, 16);
}

export function generateKeys(dir: string, { force = false }: { force?: boolean } = {}): GeneratedKeys {
  const absDir = path.resolve(dir);
  const privatePath = path.join(absDir, "private.pem");
  const publicPath = path.join(absDir, "public.pem");

  if (!force && (fs.existsSync(privatePath) || fs.existsSync(publicPath))) {
    throw new Error(`Keys already exist in ${absDir}. Pass --force to overwrite them.`);
  }

  fs.mkdirSync(absDir, { recursive: true, mode: 0o700 });

  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  fs.writeFileSync(privatePath, privateKey, { mode: 0o600 });
  fs.chmodSync(privatePath, 0o600); // writeFileSync ignores mode when the file already exists
  fs.writeFileSync(publicPath, publicKey, { mode: 0o644 });

  return { privatePath, publicPath, kid: kidFor(publicKey) };
}

export function readPrivateKey(dir: string): string {
  const privatePath = path.join(dir, "private.pem");
  try {
    return fs.readFileSync(privatePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Private key not found at ${privatePath}. Run: npm run keygen`);
    }
    throw error;
  }
}
