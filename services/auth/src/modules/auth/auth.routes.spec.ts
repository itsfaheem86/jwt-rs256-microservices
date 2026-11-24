import express from "express";
import { listenApp, type TestServer } from "../../../../../test/helpers/http";
import { AppError } from "../../common/errors";
import { errorHandler } from "../../common/middleware/error-handler";
import { notFound } from "../../common/middleware/not-found";
import { authRouter } from "./auth.routes";
import * as service from "./auth.service";

// HTTP-level unit test: the real router, error handler and body parser, with the service replaced by a mock.
jest.mock("./auth.service");

const SESSION = { accessToken: "access-token", refreshToken: "refresh-token" };
let server: TestServer;

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(authRouter);
  app.use(notFound);
  app.use(errorHandler);
  server = await listenApp(app);
});

afterAll(() => server.close());

beforeEach(() => {
  jest.resetAllMocks();
});

function post(route: string, rawBody?: string): Promise<Response> {
  return fetch(`${server.url}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: rawBody,
  });
}

describe("POST /login", () => {
  it("returns 200 with the session the service returns, and passes the credentials through", async () => {
    jest.mocked(service.signIn).mockReturnValue(SESSION);
    const res = await post("/login", JSON.stringify({ username: "alice", password: "correct-horse" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(SESSION);
    expect(service.signIn).toHaveBeenCalledWith("alice", "correct-horse");
  });

  it("returns 400 bad_request without calling the service when a field is missing", async () => {
    const res = await post("/login", JSON.stringify({ username: "alice" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
    expect(service.signIn).not.toHaveBeenCalled();
  });

  it("returns the 401 that the service throws", async () => {
    jest.mocked(service.signIn).mockImplementation(() => {
      throw new AppError(401, { error: "invalid_credentials" });
    });
    const res = await post("/login", JSON.stringify({ username: "alice", password: "wrong" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_credentials" });
  });

  it("returns 400 bad_request for malformed JSON", async () => {
    const res = await post("/login", "{not json");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
  });

  it("returns 413 payload_too_large for a body over 1 MB, without calling the service", async () => {
    const oversized = JSON.stringify({ username: "a".repeat(1_100_000), password: "x" });
    const res = await post("/login", oversized);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "payload_too_large" });
    expect(service.signIn).not.toHaveBeenCalled();
  });
});

describe("POST /refresh", () => {
  it("returns 200 with the rotated session, and passes the refresh token through", async () => {
    jest.mocked(service.refresh).mockReturnValue(SESSION);
    const res = await post("/refresh", JSON.stringify({ refreshToken: "old-token" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(SESSION);
    expect(service.refresh).toHaveBeenCalledWith("old-token");
  });

  it("passes undefined for an empty body, and returns the service's 401", async () => {
    jest.mocked(service.refresh).mockImplementation(() => {
      throw new AppError(401, { error: "invalid refresh token" });
    });
    const res = await post("/refresh", "");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid refresh token" });
    expect(service.refresh).toHaveBeenCalledWith(undefined);
  });
});

describe("POST /logout", () => {
  it("returns 204 with no body and passes the refresh token through", async () => {
    const res = await post("/logout", JSON.stringify({ refreshToken: "token" }));
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(service.logout).toHaveBeenCalledWith("token");
  });

  it("returns 204 for an empty body, because logout always succeeds", async () => {
    const res = await post("/logout", "");
    expect(res.status).toBe(204);
    expect(service.logout).toHaveBeenCalledWith(undefined);
  });
});

describe("unknown routes", () => {
  it("returns 404 not_found", async () => {
    const res = await fetch(`${server.url}/does-not-exist`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});
