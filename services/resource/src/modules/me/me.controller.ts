import type { Request, Response } from "express";
import type { AuthClaims } from "../../common/auth/verify";

export function me(_req: Request, res: Response): void {
  const user = res.locals.user as AuthClaims;
  res.status(200).json({ sub: user.sub, roles: user.roles });
}
