import jwt from "jsonwebtoken";
import { sha256 } from "../../common/auth/hash";
import { publicKey } from "../../common/auth/issue";
import { AppError } from "../../common/errors";
import * as repo from "./auth.repository";
import * as service from "./auth.service";

// The repository is replaced by a fake that keeps records in a Map, so each test controls the store.
jest.mock("./auth.repository");

const ALICE = { id: "u-1", roles: ["member"], password: "correct-horse" };
let store: Map<string, repo.RefreshRecord>;

beforeEach(() => {
  jest.resetAllMocks();
  store = new Map();
  jest.mocked(repo.findUser).mockImplementation((username) => (username === "alice" ? ALICE : undefined));
  jest.mocked(repo.saveRefresh).mockImplementation((hash, record) => {
    store.set(hash, record);
  });
  jest.mocked(repo.findRefresh).mockImplementation((hash) => store.get(hash));
  jest.mocked(repo.revokeFamily).mockImplementation((familyId) => {
    for (const record of store.values()) {
      if (record.familyId === familyId) record.revoked = true;
    }
  });
});

const USER = { id: "u-42", roles: ["member"] };

function errorOf(fn: () => unknown): AppError {
  try {
    fn();
  } catch (error) {
    return error as AppError;
  }
  throw new Error("expected the call to throw");
}

describe("signIn", () => {
  it("returns an access token and a refresh token for correct credentials", () => {
    const session = service.signIn("alice", "correct-horse");
    expect(typeof session.refreshToken).toBe("string");
    expect(jwt.verify(session.accessToken, publicKey, { algorithms: ["RS256"] })).toMatchObject({ sub: "u-1" });
  });

  it("looks the user up by username", () => {
    service.signIn("alice", "correct-horse");
    expect(repo.findUser).toHaveBeenCalledWith("alice");
  });

  it("rejects a wrong password with invalid_credentials", () => {
    const error = errorOf(() => service.signIn("alice", "wrong"));
    expect(error.statusCode).toBe(401);
    expect(error.body).toEqual({ error: "invalid_credentials" });
  });

  it("rejects an unknown user with the same response as a wrong password", () => {
    const unknown = errorOf(() => service.signIn("mallory", "correct-horse"));
    const wrong = errorOf(() => service.signIn("alice", "wrong"));
    expect(unknown.body).toEqual(wrong.body);
    expect(unknown.statusCode).toBe(wrong.statusCode);
  });
});

describe("refresh tokens", () => {
  it("are stored as sha256 hashes, never as the raw token", () => {
    const { refreshToken } = service.login(USER);
    expect(repo.saveRefresh).toHaveBeenCalledWith(
      sha256(refreshToken),
      expect.objectContaining({ used: false, revoked: false }),
    );
    expect(repo.saveRefresh).not.toHaveBeenCalledWith(refreshToken, expect.anything());
  });

  it("rotate on refresh: a new refresh token and a verifiable access token", () => {
    const first = service.login(USER);
    const next = service.refresh(first.refreshToken);
    expect(next.refreshToken).not.toBe(first.refreshToken);
    jwt.verify(next.accessToken, publicKey, { algorithms: ["RS256"] });
  });

  it("are single use: refreshing the same token twice throws reuse detected", () => {
    const { refreshToken } = service.login(USER);
    service.refresh(refreshToken);
    expect(() => service.refresh(refreshToken)).toThrow(/reuse detected/);
  });

  it("reuse revokes the family, including the newest token", () => {
    const first = service.login(USER);
    const second = service.refresh(first.refreshToken);
    expect(() => service.refresh(first.refreshToken)).toThrow(/reuse detected/);
    expect(() => service.refresh(second.refreshToken)).toThrow(/revoked/);
  });

  it("logout revokes the family", () => {
    const { refreshToken } = service.login(USER);
    service.logout(refreshToken);
    expect(() => service.refresh(refreshToken)).toThrow(/revoked/);
  });

  it("an unknown token throws invalid refresh token", () => {
    expect(() => service.refresh("never-issued")).toThrow(/invalid refresh token/);
  });

  it("a missing or non-string token throws invalid refresh token", () => {
    expect(() => service.refresh(undefined)).toThrow(/invalid refresh token/);
    expect(() => service.refresh(42)).toThrow(/invalid refresh token/);
  });

  it("an expired token throws expired", () => {
    const { refreshToken } = service.login(USER);
    store.get(sha256(refreshToken))!.expiresAt = Date.now() - 1;
    expect(() => service.refresh(refreshToken)).toThrow(/expired/);
  });

  it("session isolation: logging out session A does not stop session B", () => {
    const a = service.login(USER);
    const b = service.login(USER);
    service.logout(a.refreshToken);
    expect(() => service.refresh(a.refreshToken)).toThrow(/revoked/);
    expect(service.refresh(b.refreshToken).accessToken).toBeTruthy();
  });
});

describe("logout", () => {
  it("ignores missing and non-string tokens without throwing", () => {
    expect(() => service.logout(undefined)).not.toThrow();
    expect(() => service.logout(42)).not.toThrow();
  });

  it("is not an error for an unknown token, and revokes nothing", () => {
    const session = service.login(USER);
    service.logout("never-issued");
    expect(service.refresh(session.refreshToken).accessToken).toBeTruthy();
  });
});
