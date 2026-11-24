import crypto from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import { ACCESS_TTL } from "../config/constants";
import { env } from "../config/env";
import { kidFor, readPrivateKey } from "./keys";

// Issuer only. Read at load time: a missing key stops the process before it listens.
const privatePem = readPrivateKey(env.AUTH_KEY_DIR);
export const publicKey = String(crypto.createPublicKey(privatePem).export({ type: "spki", format: "pem" }));
export const KID = kidFor(publicKey);

type TokenUser = { id: string; roles: string[] };
type AccessOptions = { expiresIn?: string | number; audience?: string };

export function issueAccessToken(
  user: TokenUser,
  { expiresIn = ACCESS_TTL, audience = env.JWT_AUDIENCE }: AccessOptions = {},
): string {
  return jwt.sign({ sub: user.id, roles: user.roles }, privatePem, {
    algorithm: "RS256",
    keyid: KID,
    issuer: env.JWT_ISSUER,
    audience,
    expiresIn: expiresIn as SignOptions["expiresIn"],
  });
}
