export type User = { id: string; roles: string[]; password: string };

export type RefreshRecord = {
  user: { id: string; roles: string[] };
  familyId: string;
  expiresAt: number;
  used: boolean;
  revoked: boolean;
};

// Demo only: plain-text passwords. Production must hash them with argon2 or bcrypt.
const USERS: Record<string, User> = {
  alice: { id: "u-1", roles: ["member"], password: "correct-horse" },
};

// Keyed by sha256(refreshToken). Only hashes are stored. Lives in this process's memory,
// which is why the auth service runs as one replica.
const refreshRecords = new Map<string, RefreshRecord>();

export function findUser(username: string): User | undefined {
  return Object.hasOwn(USERS, username) ? USERS[username] : undefined;
}

export function saveRefresh(tokenHash: string, record: RefreshRecord): void {
  refreshRecords.set(tokenHash, record);
}

export function findRefresh(tokenHash: string): RefreshRecord | undefined {
  return refreshRecords.get(tokenHash);
}

export function revokeFamily(familyId: string): void {
  for (const record of refreshRecords.values()) {
    if (record.familyId === familyId) record.revoked = true;
  }
}
