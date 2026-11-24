import { loadEnv } from "./env";

describe("loadEnv", () => {
  it("applies defaults to an empty environment", () => {
    expect(loadEnv({})).toEqual({
      NODE_ENV: "development",
      PORT: 3001,
      JWT_ISSUER: "https://auth.example.com",
      JWT_AUDIENCE: "api.example.com",
      AUTH_KEY_DIR: "keys",
    });
  });

  it("converts PORT from a string", () => {
    expect(loadEnv({ PORT: "3005" }).PORT).toBe(3005);
  });

  it("names the variable that is invalid", () => {
    expect(() => loadEnv({ PORT: "abc" })).toThrow(/Invalid environment configuration: PORT/);
  });

  it("rejects a port of zero", () => {
    expect(() => loadEnv({ PORT: "0" })).toThrow(/PORT/);
  });

  it("rejects an unknown NODE_ENV", () => {
    expect(() => loadEnv({ NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
  });
});
