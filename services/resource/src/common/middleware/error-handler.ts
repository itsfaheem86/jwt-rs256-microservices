import type { ErrorRequestHandler } from "express";
import { AppError } from "../errors";

export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) return next(error);

  if (error instanceof AppError) {
    res.status(error.statusCode).set(error.headers).json(error.body);
    return;
  }

  const status = (error as { status?: unknown } | undefined)?.status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    res.status(status).json({ error: "bad_request" });
    return;
  }

  console.error(error);
  res.status(500).json({ error: "internal_error" });
};
