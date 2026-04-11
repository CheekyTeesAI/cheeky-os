import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Wraps async route handlers so rejections forward to Express error middleware.
 * Use for new routes; do not bulk-migrate existing routes.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
