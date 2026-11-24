// An error that already knows its HTTP response. Services throw it; the error handler sends it.
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly body: Record<string, unknown>,
    readonly headers: Record<string, string> = {},
  ) {
    super(typeof body.error === "string" ? body.error : "error");
    this.name = "AppError";
  }
}
