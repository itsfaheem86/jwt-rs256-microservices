import { Router } from "express";
import { healthRouter } from "./common/health";
import { authRouter } from "./modules/auth/auth.routes";

export const routes = Router();

routes.use("/api", healthRouter);
routes.use(authRouter);
