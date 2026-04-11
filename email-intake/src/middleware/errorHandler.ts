import express, { Request, Response, NextFunction } from "express";
import { logError } from "../services/logger";
import { errorResponse } from "../utils/errors";

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  logError("express.unhandled", {
    message: err.message,
    path: req.originalUrl,
    method: req.method,
  });
  res.status(500).json(errorResponse("UNHANDLED", err.message || "Unknown error"));
}
