import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { createAccessTokenVerifier } from "./verify";

// This unit creates its own key pairs. It never imports the auth service, so it tests the verifier alone.
const trusted = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const intruder = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const verify = createAccessTokenVerifier(trusted.publicKey);

// Signs a valid token by default. Each test overrides one option to make it invalid in one way.
function mint(
  options: jwt.SignOptions = {},
  payload: object = { sub: "u-42", roles: ["member"] },
  privateKey: string = trusted.privateKey,
): string {
  return jwt.sign(payload, privateKey, {
    algorithm: "RS256",
    keyid: "test-kid",
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    expiresIn: "5m",
    ...options,
  });
}

function tamperPayload(token: string, changes: Record<string, unknown>): string {
  const [header, payload, signature] = token.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  Object.assign(claims, changes);
  return [header, Buffer.from(JSON.stringify(claims)).toString("base64url"), signature].join(".");
}

describe("access token verifier", () => {
  it("accepts a token signed by the trusted key and returns its claims", () => {
    const claims = verify(mint());
    expect(claims.sub).toBe("u-42");
    expect(claims.roles).toEqual(["member"]);
  });

  it("rejects a payload changed after signing with invalid signature", () => {
    expect(() => verify(tamperPayload(mint(), { roles: ["admin"] }))).toThrow(/invalid signature/);
  });

  it("rejects a token signed by a different RSA key with invalid signature", () => {
    expect(() => verify(mint({}, undefined, intruder.privateKey))).toThrow(/invalid signature/);
  });

  it("rejects an HS256 token that uses the public key as the HMAC secret with invalid algorithm", () => {
    const token = jwt.sign({ sub: "u-42", roles: ["admin"] }, trusted.publicKey, {
      algorithm: "HS256",
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      expiresIn: "5m",
    });
    expect(() => verify(token)).toThrow(/invalid algorithm/);
  });

  it("rejects an alg none token", () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        sub: "u-42",
        roles: ["admin"],
        iss: env.JWT_ISSUER,
        aud: env.JWT_AUDIENCE,
        exp: Math.floor(Date.now() / 1000) + 300,
      }),
    ).toString("base64url");
    expect(() => verify(`${header}.${payload}.`)).toThrow();
  });

  it("rejects an RS512 token signed with the trusted key, which proves the RS256 pin", () => {
    expect(() => verify(mint({ algorithm: "RS512" }))).toThrow(/invalid algorithm/);
  });

  it("rejects a token for another audience with audience in the error", () => {
    expect(() => verify(mint({ audience: "billing.example.com" }))).toThrow(/audience/);
  });

  it("rejects a token from another issuer with issuer in the error", () => {
    expect(() => verify(mint({ issuer: "https://evil.example.com" }))).toThrow(/issuer/);
  });

  it("rejects an expired token with jwt expired", () => {
    expect(() => verify(mint({ expiresIn: -10 }))).toThrow(/jwt expired/);
  });

  it("rejects input that is not a JWT with jwt malformed", () => {
    expect(() => verify("not-a-jwt")).toThrow(/jwt malformed/);
  });
});
