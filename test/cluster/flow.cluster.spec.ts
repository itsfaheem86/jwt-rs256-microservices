// Black-box e2e against the deployed services, run inside the cluster (k8s/e2e-job.yaml).
// It only speaks HTTP and never imports the services, so it never touches the private key.

const AUTH_URL = process.env.E2E_AUTH_URL;
const RESOURCE_URL = process.env.E2E_RESOURCE_URL;
if (!AUTH_URL || !RESOURCE_URL) {
  throw new Error("Set E2E_AUTH_URL and E2E_RESOURCE_URL to the auth and resource service base URLs");
}

const post = (base: string, route: string, body: unknown) =>
  fetch(`${base}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const login = async () =>
  (await post(AUTH_URL, "/login", { username: "alice", password: "correct-horse" })).json();

const me = (accessToken: string) =>
  fetch(`${RESOURCE_URL}/api/me`, { headers: { authorization: `Bearer ${accessToken}` } });

function tamperPayload(token: string, changes: Record<string, unknown>): string {
  const [header, payload, signature] = token.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  Object.assign(claims, changes);
  return [header, Buffer.from(JSON.stringify(claims)).toString("base64url"), signature].join(".");
}

describe("cluster e2e: services reached by their Service DNS names", () => {
  it("login on the auth service returns an access token and a refresh token", async () => {
    const session = await login();
    expect(typeof session.accessToken).toBe("string");
    expect(typeof session.refreshToken).toBe("string");
  });

  it("the resource service accepts a token minted by the auth service", async () => {
    const { accessToken } = await login();
    const res = await me(accessToken);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sub: "u-1", roles: ["member"] });
  });

  it("the resource service rejects a tampered token with 401 invalid_token", async () => {
    const { accessToken } = await login();
    const res = await me(tamperPayload(accessToken, { roles: ["admin"] }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid_token");
  });

  it("the resource service rejects a request with no token with 401 missing_token", async () => {
    const res = await fetch(`${RESOURCE_URL}/api/me`);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "missing_token" });
  });

  it("refresh rotates the token, and reusing the old refresh token revokes the family", async () => {
    const first = await login();
    const second = await (await post(AUTH_URL, "/refresh", { refreshToken: first.refreshToken })).json();
    expect(typeof second.refreshToken).toBe("string");

    const reused = await post(AUTH_URL, "/refresh", { refreshToken: first.refreshToken });
    expect(reused.status).toBe(401);
    expect((await reused.json()).error).toMatch(/reuse detected/);

    const newer = await post(AUTH_URL, "/refresh", { refreshToken: second.refreshToken });
    expect(newer.status).toBe(401);
  });

  it("logout returns 204, and the refresh token is then rejected with 401", async () => {
    const session = await login();
    const logout = await post(AUTH_URL, "/logout", { refreshToken: session.refreshToken });
    expect(logout.status).toBe(204);

    const refreshed = await post(AUTH_URL, "/refresh", { refreshToken: session.refreshToken });
    expect(refreshed.status).toBe(401);
  });
});
