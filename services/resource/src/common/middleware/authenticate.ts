import type { RequestHandler } from "express";
import type { AuthClaims } from "../auth/verify";
import { AppError } from "../errors";

const BEARER = /^Bearer (.+)$/;

// Reads the bearer token, verifies it, and stores the claims in res.locals.user.
export function authenticate(verifyAccessToken: (token: string) => AuthClaims): RequestHandler {
  return (req, res, next) => {
    const match = BEARER.exec(req.get("authorization") ?? "");
    if (!match) {
      throw new AppError(401, { error: "missing_token" }, { "www-authenticate": "Bearer" });
    }

    try {
      res.locals.user = verifyAccessToken(match[1]);
    } catch (error) {
      throw new AppError(
        401,
        { error: "invalid_token", reason: (error as Error).message },
        { "www-authenticate": 'Bearer error="invalid_token"' },
      );
    }
    next();
  };
}
