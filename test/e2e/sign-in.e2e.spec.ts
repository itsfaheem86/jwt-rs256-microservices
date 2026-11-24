// Journey: a user signs in to the auth service.
import { postJson, startStack, type Stack } from "./support/stack";

describe("sign in", () => {
  let stack: Stack;

  beforeAll(async () => {
    stack = await startStack();
  });

  afterAll(() => stack.stop());

  it("rejects a wrong password with 401 invalid_credentials", async () => {
    const res = await postJson(stack.authUrl, "/login", { username: "alice", password: "wrong" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_credentials" });
  });

  it("rejects an unknown user with the same 401 invalid_credentials", async () => {
    const res = await postJson(stack.authUrl, "/login", { username: "mallory", password: "correct-horse" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_credentials" });
  });

  it("returns an access token and a refresh token for correct credentials", async () => {
    const res = await postJson(stack.authUrl, "/login", { username: "alice", password: "correct-horse" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.accessToken).toBe("string");
    expect(typeof body.refreshToken).toBe("string");
  });

  it("rejects malformed JSON with 400 bad_request", async () => {
    const res = await fetch(`${stack.authUrl}/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
  });
});
