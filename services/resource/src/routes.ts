import { Router } from "express";
import type { AuthClaims } from "./common/auth/verify";
import { healthRouter } from "./common/health";
import { createMeRouter } from "./modules/me/me.routes";

export function createRoutes(verifyAccessToken: (token: string) => AuthClaims): Router {
  const routes = Router();
  routes.use("/api", healthRouter);
  routes.use("/api", createMeRouter(verifyAccessToken));
  return routes;
}
