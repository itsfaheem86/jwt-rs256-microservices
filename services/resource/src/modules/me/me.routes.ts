import { Router } from "express";
import type { AuthClaims } from "../../common/auth/verify";
import { authenticate } from "../../common/middleware/authenticate";
import * as controller from "./me.controller";

export function createMeRouter(verifyAccessToken: (token: string) => AuthClaims): Router {
  const router = Router();
  router.get("/me", authenticate(verifyAccessToken), controller.me);
  return router;
}
