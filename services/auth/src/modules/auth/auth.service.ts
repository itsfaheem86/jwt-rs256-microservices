import crypto from "node:crypto";
import { REFRESH_TTL_MS } from "../../common/config/constants";
import { sha256 } from "../../common/auth/hash";
import { issueAccessToken } from "../../common/auth/issue";
import { AppError } from "../../common/errors";
import * as repo from "./auth.repository";

type Subject = { id: string; roles: string[] };
export type Session = { accessToken: string; refreshToken: string };

function refreshError(message: string): AppError {
  return new AppError(401, { error: message });
}

function issueRefreshToken(user: Subject, familyId: string): string {
  const token = crypto.randomBytes(32).toString("base64url");
  repo.saveRefresh(sha256(token), {
    user: { id: user.id, roles: user.roles },
    familyId,
    expiresAt: Date.now() + REFRESH_TTL_MS,
    used: false,
    revoked: false,
  });
  return token;
}

export function login(user: Subject): Session {
  const familyId = crypto.randomUUID();
  return {
    accessToken: issueAccessToken(user),
    refreshToken: issueRefreshToken(user, familyId),
  };
}

export function signIn(username: string, password: string): Session {
  const user = repo.findUser(username);
  // The same error for an unknown user and a wrong password.
  if (!user || user.password !== password) {
    throw new AppError(401, { error: "invalid_credentials" });
  }
  return login({ id: user.id, roles: user.roles });
}

// Rotates the refresh token. Presenting a used token revokes the whole family.
export function refresh(refreshToken: unknown): Session {
  if (typeof refreshToken !== "string") throw refreshError("invalid refresh token");

  const record = repo.findRefresh(sha256(refreshToken));
  if (!record) throw refreshError("invalid refresh token");
  if (record.revoked) throw refreshError("refresh token revoked");
  if (record.used) {
    repo.revokeFamily(record.familyId);
    throw refreshError("refresh token reuse detected");
  }
  if (record.expiresAt < Date.now()) throw refreshError("refresh token expired");

  record.used = true;
  return {
    accessToken: issueAccessToken(record.user),
    refreshToken: issueRefreshToken(record.user, record.familyId),
  };
}

// Unknown tokens are not an error: logout always succeeds.
export function logout(refreshToken: unknown): void {
  if (typeof refreshToken !== "string") return;
  const record = repo.findRefresh(sha256(refreshToken));
  if (record) repo.revokeFamily(record.familyId);
}
