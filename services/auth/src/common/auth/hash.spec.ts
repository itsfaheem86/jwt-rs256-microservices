import { sha256 } from "./hash";

describe("sha256", () => {
  it("matches the published test vector for 'abc'", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("returns 64 lowercase hex characters", () => {
    expect(sha256("anything")).toMatch(/^[0-9a-f]{64}$/);
  });
});
