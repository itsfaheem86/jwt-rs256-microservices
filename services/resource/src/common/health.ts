import { Router } from "express";

export const healthRouter = Router();

// Probe target for the Kubernetes liveness and readiness checks.
healthRouter.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});
