import express, { Router, Request, Response, NextFunction } from "express";

const healthRouter = Router();

healthRouter.get("/health", (req: Request, res: Response, next: NextFunction) => {
  res.json({ status: "ok" });
});

export default healthRouter;
