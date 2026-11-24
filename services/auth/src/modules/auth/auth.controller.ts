import type { Request, Response } from "express";
import type { LoginInput } from "./auth.schema";
import * as authService from "./auth.service";

export function signIn(_req: Request, res: Response): void {
  const { body } = res.locals.validated as { body: LoginInput };
  res.status(200).json(authService.signIn(body.username, body.password));
}

export function refresh(req: Request, res: Response): void {
  res.status(200).json(authService.refresh(req.body?.refreshToken));
}

export function logout(req: Request, res: Response): void {
  authService.logout(req.body?.refreshToken);
  res.status(204).end();
}
