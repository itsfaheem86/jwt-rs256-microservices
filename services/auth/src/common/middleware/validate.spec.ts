import type { Request, Response } from "express";
import { z } from "zod";
import { fakeResponse, captureThrown } from "../../../../../test/helpers/fakes";
import { AppError } from "../errors";
import { validate } from "./validate";

const schema = z.object({
  body: z.object({ username: z.string(), password: z.string() }),
});

const requestWith = (body: unknown) => ({ body }) as unknown as Request;

describe("validate", () => {
  it("stores the parsed input in res.locals and calls next", () => {
    const res = fakeResponse();
    const next = jest.fn();
    validate(schema)(requestWith({ username: "alice", password: "pw", extra: 1 }), res as unknown as Response, next);
    // Unknown fields are stripped, so controllers only see what the schema allows.
    expect(res.locals.validated).toEqual({ body: { username: "alice", password: "pw" } });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("throws a 400 bad_request and does not call next when input is invalid", () => {
    const res = fakeResponse();
    const next = jest.fn();
    const thrown = captureThrown(() =>
      validate(schema)(requestWith({ username: "alice" }), res as unknown as Response, next),
    );
    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).statusCode).toBe(400);
    expect((thrown as AppError).body).toEqual({ error: "bad_request" });
    expect(next).not.toHaveBeenCalled();
  });

  it("treats a missing body as an empty object, which fails validation", () => {
    const thrown = captureThrown(() =>
      validate(schema)(requestWith(undefined), fakeResponse() as unknown as Response, jest.fn()),
    );
    expect((thrown as AppError).statusCode).toBe(400);
  });
});
