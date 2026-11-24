import express from "express";
import { createAccessTokenVerifier } from "./common/auth/verify";
import { errorHandler } from "./common/middleware/error-handler";
import { notFound } from "./common/middleware/not-found";
import { createRoutes } from "./routes";

// Builds the app from a public key and does not listen. Tests use this directly.
export function createApp(publicKey: string) {
  const app = express();
  app.disable("x-powered-by");
  app.use(createRoutes(createAccessTokenVerifier(publicKey)));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
