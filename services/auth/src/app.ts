import express from "express";
import { errorHandler } from "./common/middleware/error-handler";
import { notFound } from "./common/middleware/not-found";
import { routes } from "./routes";

// Builds the app and does not listen. Tests use this directly.
export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use(routes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
