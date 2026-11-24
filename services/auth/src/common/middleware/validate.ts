import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";
import { AppError } from "../errors";

// Parses the body. Controllers read the parsed output from res.locals.validated.
export function validate(schema: z.ZodType) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse({ body: req.body ?? {} });
    if (!result.success) throw new AppError(400, { error: "bad_request" });
    res.locals.validated = result.data;
    next();
  };
}
