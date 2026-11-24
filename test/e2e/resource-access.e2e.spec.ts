// Journey: a signed-in user calls the resource service with the access token.
import { callMe, signIn, startStack, tamperPayload, type Stack } from "./support/stack";

describe("resource access", () => {
  let stack: Stack;

  beforeAll(async () => {
    stack = await startStack();
  });

  afterAll(() => stack.stop());

  it("a token from sign-in gets 200 with sub u-1 and roles member", async () => {
    const { accessToken } = await signIn(stack);
    const res = await callMe(stack, accessToken);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sub: "u-1", roles: ["member"] });
  });

  it("a request with no token gets 401 missing_token", async () => {
    const res = await fetch(`${stack.resourceUrl}/api/me`);
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe("Bearer");
    expect(await res.json()).toEqual({ error: "missing_token" });
  });

  it("a tampered payload gets 401 invalid_token", async () => {
    const { accessToken } = await signIn(stack);
    const res = await callMe(stack, tamperPayload(accessToken, { roles: ["admin"] }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid_token");
  });

  it("the string not-a-jwt gets 401", async () => {
    const res = await callMe(stack, "not-a-jwt");
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid_token");
  });
});
