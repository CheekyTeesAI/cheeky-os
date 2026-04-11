import type { Request, Response } from "express";
import { executeCommand } from "../../command-layer/controllers/command.controller";
import { getNextBestActions } from "../../decision-engine/decisionEngine.service";
import { runAutoOperator } from "../../auto-operator/autoOperator.service";
import { getWarRoom } from "../../command-layer/controllers/warRoom.controller";
import type { ParsedIntent } from "./intentParser.service";

type RouteOutput = {
  intent: ParsedIntent["intent"];
  command: string | null;
  result: unknown;
};

type MockRes = {
  statusCode: number;
  body: unknown;
};

function createMockReq(body: Record<string, unknown>): Request {
  return { body } as unknown as Request;
}

function createMockRes(): { res: Response; state: MockRes } {
  const state: MockRes = { statusCode: 200, body: null };
  const res = {
    status: (code: number) => {
      state.statusCode = code;
      return res;
    },
    json: (payload: unknown) => {
      state.body = payload;
      return res;
    }
  } as unknown as Response;
  return { res, state };
}

async function runExecuteCommand(command: string, message?: string): Promise<unknown> {
  const req = createMockReq({ command, message });
  const { res, state } = createMockRes();
  await executeCommand(req, res);
  return state.body;
}

async function runWarRoom(): Promise<unknown> {
  const req = createMockReq({});
  const { res, state } = createMockRes();
  await getWarRoom(req, res);
  return state.body;
}

export async function routeIntent(parsed: ParsedIntent): Promise<RouteOutput> {
  switch (parsed.intent) {
    case "RUN_BUSINESS":
      return {
        intent: parsed.intent,
        command: "run-business",
        result: await runAutoOperator("execute")
      };
    case "NEXT_ACTIONS":
      return {
        intent: parsed.intent,
        command: "next-actions",
        result: await getNextBestActions()
      };
    case "SYNC_BRAIN":
      return {
        intent: parsed.intent,
        command: "sync-brain",
        result: {
          synced: true,
          note: parsed.extractedData?.note || "",
          capturedAt: new Date().toISOString()
        }
      };
    case "SCHEDULE_DAY":
      return {
        intent: parsed.intent,
        command: "schedule-day",
        result: await runExecuteCommand("schedule-day")
      };
    case "FOLLOW_UP_LEADS":
      return {
        intent: parsed.intent,
        command: "auto-followup",
        result: await runExecuteCommand("followups")
      };
    case "CLOSE_DEALS":
      return {
        intent: parsed.intent,
        command: "close-deals",
        result: await runExecuteCommand("close-deals")
      };
    case "REVIVE_PIPELINE":
      return {
        intent: parsed.intent,
        command: "revive-pipeline",
        result: await runExecuteCommand("revive-pipeline")
      };
    case "GENERATE_REVENUE":
      return {
        intent: parsed.intent,
        command: "generate-revenue",
        result: await runExecuteCommand("generate-revenue")
      };
    case "SHOP_STATUS":
      return {
        intent: parsed.intent,
        command: "war-room",
        result: await runWarRoom()
      };
    default:
      return {
        intent: "UNKNOWN",
        command: null,
        result: {
          success: false,
          message: "Unknown command",
          availableCommands: [
            "run-business",
            "next-actions",
            "schedule-day",
            "auto-followup",
            "close-deals",
            "revive-pipeline",
            "generate-revenue",
            "war-room",
            "sync-brain"
          ]
        }
      };
  }
}
