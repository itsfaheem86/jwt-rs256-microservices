import type { Request, Response } from "express";
import { fakeResponse } from "../../../../../test/helpers/fakes";
import { AppError } from "../errors";
import { errorHandler } from "./error-handler";

// Runs the handler against a fake response and returns what it sent.
function handle(error: unknown, res = fakeResponse()) {
  const next = jest.fn();
  errorHandler(error, {} as Request, res as unknown as Response, next);
  return { res, next };
}

// A body-parser style error: it carries an HTTP status, like the errors Express's json() parser throws.
const parserError = (status: number) => Object.assign(new Error("parser"), { status });

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("error handler", () => {
  it("sends an AppError with its status, headers and body", () => {
    const { res } = handle(new AppError(401, { error: "invalid_token" }, { "www-authenticate": "Bearer" }));
    expect(res.statusCode).toBe(401);
    expect(res.headers).toEqual({ "www-authenticate": "Bearer" });
    expect(res.body).toEqual({ error: "invalid_token" });
  });

  it("maps an oversized body (413) to payload_too_large", () => {
    const { res } = handle(parserError(413));
    expect(res.statusCode).toBe(413);
    expect(res.body).toEqual({ error: "payload_too_large" });
  });

  it("maps other body-parser errors (malformed JSON) to bad_request", () => {
    const { res } = handle(parserError(400));
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "bad_request" });
  });

  it("hides unexpected errors behind a 500 internal_error that leaks no detail", () => {
    const { res } = handle(new Error("database password is hunter2"));
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "internal_error" });
    expect(JSON.stringify(res.body)).not.toContain("hunter2");
  });

  it("logs unexpected errors on the server", () => {
    handle(new Error("boom"));
    expect(console.error).toHaveBeenCalled();
  });

  it("passes the error on when the response has already started", () => {
    const res = fakeResponse();
    res.headersSent = true;
    const error = new Error("late");
    const { next } = handle(error, res);
    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });
});
