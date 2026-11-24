// Journey: the user's session keeps going with rotated tokens, and a stolen token is detected.
import { callMe, postJson, signIn, startStack, type Stack } from "./support/stack";

describe("refresh rotation", () => {
  let stack: Stack;

  beforeAll(async () => {
    stack = await startStack();
  });

  afterAll(() => stack.stop());

  it("refresh returns 200, a new refresh token, and an access token that works on /api/me", async () => {
    const first = await signIn(stack);
    const res = await postJson(stack.authUrl, "/refresh", { refreshToken: first.refreshToken });
    expect(res.status).toBe(200);
    const next = await res.json();
    expect(next.refreshToken).not.toBe(first.refreshToken);
    expect((await callMe(stack, next.accessToken)).status).toBe(200);
  });

  it("the old access token still returns 200 after refresh (stateless trade-off)", async () => {
    const first = await signIn(stack);
    await postJson(stack.authUrl, "/refresh", { refreshToken: first.refreshToken });
    expect((await callMe(stack, first.accessToken)).status).toBe(200);
  });

  it("reusing the old refresh token returns 401 reuse detected, and the newer token then returns 401 revoked", async () => {
    const first = await signIn(stack);
    const second = await (await postJson(stack.authUrl, "/refresh", { refreshToken: first.refreshToken })).json();

    const reused = await postJson(stack.authUrl, "/refresh", { refreshToken: first.refreshToken });
    expect(reused.status).toBe(401);
    expect((await reused.json()).error).toMatch(/reuse detected/);

    const newer = await postJson(stack.authUrl, "/refresh", { refreshToken: second.refreshToken });
    expect(newer.status).toBe(401);
    expect((await newer.json()).error).toMatch(/revoked/);
  });

  it("refresh with an empty body returns 401", async () => {
    const res = await fetch(`${stack.authUrl}/refresh`, { method: "POST", body: "" });
    expect(res.status).toBe(401);
  });

  // Both requests are sent together, but one process handles them one at a time.
  // A real race between several auth instances is not covered by this test.
  it("two concurrent refreshes with the same token: one gets 200, the other 401, and the winner token is then revoked", async () => {
    const session = await signIn(stack);

    const results = await Promise.all([
      postJson(stack.authUrl, "/refresh", { refreshToken: session.refreshToken }),
      postJson(stack.authUrl, "/refresh", { refreshToken: session.refreshToken }),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 401]);

    const winner = await results.find((res) => res.status === 200)!.json();
    const afterWin = await postJson(stack.authUrl, "/refresh", { refreshToken: winner.refreshToken });
    expect(afterWin.status).toBe(401);
  });
});
