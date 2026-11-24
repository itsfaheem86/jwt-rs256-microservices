import jwt, { type JwtPayload } from "jsonwebtoken";
import { env } from "../config/env";
import { KID, issueAccessToken, publicKey } from "./issue";

const USER = { id: "u-42", roles: ["member"] };

describe("access tokens", () => {
  it("are RS256 with the kid, issuer and audience from config", () => {
    const decoded = jwt.decode(issueAccessToken(USER), { complete: true });
    expect(decoded?.header.alg).toBe("RS256");
    expect(decoded?.header.kid).toBe(KID);
    expect(decoded?.payload).toMatchObject({ iss: env.JWT_ISSUER, aud: env.JWT_AUDIENCE });
  });

  it("expire 300 seconds after issue", () => {
    const { iat, exp } = jwt.decode(issueAccessToken(USER)) as JwtPayload;
    expect((exp as number) - (iat as number)).toBe(300);
  });

  it("verify with the public key and carry sub and roles", () => {
    const claims = jwt.verify(issueAccessToken(USER), publicKey, { algorithms: ["RS256"] }) as JwtPayload;
    expect(claims.sub).toBe("u-42");
    expect(claims.roles).toEqual(["member"]);
  });
});
