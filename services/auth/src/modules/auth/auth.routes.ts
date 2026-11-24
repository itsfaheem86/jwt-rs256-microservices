import { Router } from "express";
import { validate } from "../../common/middleware/validate";
import * as controller from "./auth.controller";
import { loginSchema } from "./auth.schema";

export const authRouter = Router();

authRouter.post("/login", validate(loginSchema), controller.signIn);
authRouter.post("/refresh", controller.refresh);
authRouter.post("/logout", controller.logout);
