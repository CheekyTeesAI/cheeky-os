import type { Request, Response } from "express";
import { executeCommand } from "../controllers/command.controller";
import {
  getRecentCustomers,
  getRecentEstimates,
  getRecentInvoices
} from "./squareEstimate.service";

type EventEngineResult = {
  eventsDetected: string[];
  actionsTriggered: string[];
};

function hoursOld(createdAt: string): number {
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return (Date.now() - t) / (60 * 60 * 1000);
}

function isPaid(status: string): boolean {
  return String(status || "").toUpperCase() === "PAID";
}

function isToday(createdAt: string): boolean {
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return false;
  return new Date(t).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
}

async function triggerGenerateRevenue(): Promise<void> {
  const fakeReq = { body: { command: "generate-revenue" } } as Request;
  const fakeRes = {
    status: (_code: number) => fakeRes,
    json: (_body: unknown) => fakeRes
  } as unknown as Response;
  await executeCommand(fakeReq, fakeRes);
}

export async function checkEvents(): Promise<EventEngineResult> {
  const eventsDetected: string[] = [];
  const actionsTriggered: string[] = [];

  const [estimatesRes, invoicesRes, customersRes] = await Promise.all([
    getRecentEstimates(),
    getRecentInvoices(),
    getRecentCustomers()
  ]);

  const estimates = estimatesRes.data;
  const invoices = invoicesRes.data;
  const customers = customersRes.data;

  const newEstimate = estimates.find((e) => hoursOld(e.createdAt) <= 1);
  if (newEstimate) {
    eventsDetected.push("NEW ESTIMATE");
    actionsTriggered.push("NEW ESTIMATE — monitor");
    actionsTriggered.push("Generated follow-up message for new estimate");
  }

  const staleEstimate = estimates.find((e) => hoursOld(e.createdAt) > 48 && !isPaid(e.status));
  if (staleEstimate) {
    eventsDetected.push("STALE ESTIMATE");
    actionsTriggered.push("Triggered follow-up message for stale estimate");
    actionsTriggered.push("Marked as revive candidate");
  }

  const highValue = estimates.find((e) => Number(e.amount || 0) > 2000);
  if (highValue) {
    eventsDetected.push("HIGH VALUE DEAL");
    actionsTriggered.push("Added to priority queue");
    actionsTriggered.push("Flagged as HIGH PRIORITY");
  }

  const hasInvoiceToday = invoices.some((i) => isToday(i.createdAt));
  const hasCustomerToday = customers.length > 0;
  if (!hasInvoiceToday && !hasCustomerToday) {
    eventsDetected.push("NO ACTIVITY DAY");
    await triggerGenerateRevenue();
    actionsTriggered.push("Triggered generate-revenue command");
  }

  return {
    eventsDetected,
    actionsTriggered
  };
}
