import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateKeys, kidFor, readPrivateKey } from "./keys";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "keys-unit-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("kidFor", () => {
  it("is 16 base64url characters", () => {
    expect(kidFor("any pem text")).toMatch(/^[A-Za-z0-9_-]{16}$/);
  });

  it("is deterministic and depends on the input", () => {
    expect(kidFor("a")).toBe(kidFor("a"));
    expect(kidFor("a")).not.toBe(kidFor("b"));
  });
});

describe("generateKeys", () => {
  it("writes a PKCS8 private key and an SPKI public key, and returns the public key's kid", () => {
    const result = generateKeys(dir);
    const privatePem = fs.readFileSync(result.privatePath, "utf8");
    const publicPem = fs.readFileSync(result.publicPath, "utf8");
    expect(privatePem).toContain("BEGIN PRIVATE KEY");
    expect(publicPem).toContain("BEGIN PUBLIC KEY");
    expect(result.kid).toBe(kidFor(publicPem));
  });

  it("refuses to overwrite existing keys, and says how to force it", () => {
    generateKeys(dir);
    expect(() => generateKeys(dir)).toThrow(/Keys already exist/);
    expect(() => generateKeys(dir)).toThrow(/--force/);
  });

  it("overwrites existing keys when forced", () => {
    const first = generateKeys(dir);
    const before = fs.readFileSync(first.publicPath, "utf8");
    generateKeys(dir, { force: true });
    expect(fs.readFileSync(first.publicPath, "utf8")).not.toBe(before);
  });

  it("creates the directory when it does not exist", () => {
    const nested = path.join(dir, "a", "b");
    expect(generateKeys(nested).privatePath).toBe(path.join(nested, "private.pem"));
    expect(fs.existsSync(path.join(nested, "public.pem"))).toBe(true);
  });
});

describe("readPrivateKey", () => {
  it("returns the private key PEM", () => {
    const { privatePath } = generateKeys(dir);
    expect(readPrivateKey(dir)).toBe(fs.readFileSync(privatePath, "utf8"));
  });

  it("throws a message that says how to fix a missing key", () => {
    expect(() => readPrivateKey(dir)).toThrow(/Private key not found/);
    expect(() => readPrivateKey(dir)).toThrow(/npm run keygen/);
  });
});
