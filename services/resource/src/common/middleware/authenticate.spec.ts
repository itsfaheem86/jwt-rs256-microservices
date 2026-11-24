import type { Request, Response } from "express";
import { fakeResponse, captureThrown } from "../../../../../test/helpers/fakes";
import type { AuthClaims } from "../auth/verify";
import { AppError } from "../errors";
import { authenticate } from "./authenticate";

const CLAIMS: AuthClaims = { sub: "u-1", roles: ["member"] };

function requestWith(headers: Record<string, string>): Request {
  return { get: (name: string) => headers[name.toLowerCase()] } as unknown as Request;
}

// Runs the middleware with a stub verifier and returns what happened.
function run(headers: Record<string, string>, verify = jest.fn((_token: string) => CLAIMS)) {
  const res = fakeResponse();
  const next = jest.fn();
  const thrown = captureThrown(() => authenticate(verify)(requestWith(headers), res as unknown as Response, next));
  return { thrown: thrown as AppError | undefined, res, next, verify };
}

describe("authenticate", () => {
  it("rejects a request with no Authorization header as missing_token", () => {
    const { thrown, verify } = run({});
    expect(thrown).toBeInstanceOf(AppError);
    expect(thrown!.statusCode).toBe(401);
    expect(thrown!.body).toEqual({ error: "missing_token" });
    expect(thrown!.headers).toEqual({ "www-authenticate": "Bearer" });
    expect(verify).not.toHaveBeenCalled();
  });

  it("treats a non-Bearer scheme as missing_token", () => {
    const { thrown, verify } = run({ authorization: "Basic dXNlcjpwYXNz" });
    expect(thrown!.body).toEqual({ error: "missing_token" });
    expect(verify).not.toHaveBeenCalled();
  });

  it("treats a Bearer header with no token as missing_token", () => {
    const { thrown } = run({ authorization: "Bearer " });
    expect(thrown!.body).toEqual({ error: "missing_token" });
  });

  it("rejects a token the verifier refuses as invalid_token, with the reason", () => {
    const verify = jest.fn((_token: string): AuthClaims => {
      throw new Error("invalid signature");
    });
    const { thrown } = run({ authorization: "Bearer forged" }, verify);
    expect(thrown!.statusCode).toBe(401);
    expect(thrown!.body).toEqual({ error: "invalid_token", reason: "invalid signature" });
    expect(thrown!.headers).toEqual({ "www-authenticate": 'Bearer error="invalid_token"' });
  });

  it("passes the token to the verifier and stores the claims in res.locals when valid", () => {
    const { thrown, res, next, verify } = run({ authorization: "Bearer good-token" });
    expect(thrown).toBeUndefined();
    expect(verify).toHaveBeenCalledWith("good-token");
    expect(res.locals.user).toEqual(CLAIMS);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
