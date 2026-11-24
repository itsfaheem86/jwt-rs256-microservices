// Journey: the user signs out, and the session cannot be refreshed again.
import { postJson, signIn, startStack, type Stack } from "./support/stack";

describe("logout", () => {
  let stack: Stack;

  beforeAll(async () => {
    stack = await startStack();
  });

  afterAll(() => stack.stop());

  it("returns 204, and then refresh with that token returns 401", async () => {
    const session = await signIn(stack);

    const logout = await postJson(stack.authUrl, "/logout", { refreshToken: session.refreshToken });
    expect(logout.status).toBe(204);
    expect(await logout.text()).toBe("");

    const refreshed = await postJson(stack.authUrl, "/refresh", { refreshToken: session.refreshToken });
    expect(refreshed.status).toBe(401);
  });
});
