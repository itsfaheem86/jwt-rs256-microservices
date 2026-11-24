import jwt from "jsonwebtoken";
import { env } from "../config/env";

export type AuthClaims = { sub: string; roles: string[] };

// Verifier only. It holds a public key and has no way to sign, so this service never loads the private key.
export function createAccessTokenVerifier(publicKey: string): (token: string) => AuthClaims {
  return function verifyAccessToken(token: string): AuthClaims {
    const claims = jwt.verify(token, publicKey, {
      algorithms: ["RS256"],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    });
    return claims as unknown as AuthClaims;
  };
}
