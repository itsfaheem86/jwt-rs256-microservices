import express from "express";
import { listenApp, type TestServer } from "../../../../../test/helpers/http";
import { errorHandler } from "../../common/middleware/error-handler";
import { notFound } from "../../common/middleware/not-found";
import { createMeRouter } from "./me.routes";

// HTTP-level unit test: the real router and error handler, with a stub verifier in place of the public key.
const verify = (token: string) => {
  if (token === "good-token") return { sub: "u-1", roles: ["member"] };
  throw new Error("invalid signature");
};

let server: TestServer;

beforeAll(async () => {
  const app = express();
  app.use("/api", createMeRouter(verify));
  app.use(notFound);
  app.use(errorHandler);
  server = await listenApp(app);
});

afterAll(() => server.close());

describe("GET /api/me", () => {
  it("returns 200 with sub and roles for a valid token", async () => {
    const res = await fetch(`${server.url}/api/me`, { headers: { authorization: "Bearer good-token" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sub: "u-1", roles: ["member"] });
  });

  it("returns 401 missing_token with a Bearer challenge when no token is sent", async () => {
    const res = await fetch(`${server.url}/api/me`);
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe("Bearer");
    expect(await res.json()).toEqual({ error: "missing_token" });
  });

  it("returns 401 invalid_token with the reason when the token is refused", async () => {
    const res = await fetch(`${server.url}/api/me`, { headers: { authorization: "Bearer forged" } });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe('Bearer error="invalid_token"');
    expect(await res.json()).toEqual({ error: "invalid_token", reason: "invalid signature" });
  });

  it("is not routed for other methods", async () => {
    const res = await fetch(`${server.url}/api/me`, { method: "POST", headers: { authorization: "Bearer good-token" } });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});
