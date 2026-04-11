import type { Request, Response } from "express";
import { autoFollowup } from "./followup.controller";
import { runDay } from "./operator.controller";
import { getWarRoom } from "./warRoom.controller";
import { getNextBestActions } from "../services/pipeline.service";
import { getRecentEstimates, getRecentInvoices } from "../services/squareEstimate.service";
import { errorResponse } from "../utils/response";
import { runBusiness } from "../../ops-engine/controllers/business.controller";

const SCHEDULE_TIME_BLOCKS = [
  "9:00–11:00",
  "11:00–1:00",
  "1:00–3:00",
  "3:00–5:00"
] as const;

const SCHEDULE_TEAM = [
  { name: "Patrick", role: "operator" as const },
  { name: "Employee1", role: "printer" as const }
];

type PrintType = "DTG" | "DTF" | "Screen Print";
type ScheduleJob = {
  name: string;
  quantity: number;
  dueDate: string;
  printType: PrintType;
  priority: "rush" | "standard";
  value: number;
};

function invoiceToJobs(
  invoices: Array<{ id: string; amount: number; createdAt: string; status: string }>
): ScheduleJob[] {
  return invoices.map((inv, i) => {
    const amount = inv.amount;
    const quantity = Math.max(12, Math.min(200, Math.round(amount / 18) || 24));
    const created = inv.createdAt ? new Date(inv.createdAt) : new Date();
    const due = new Date(created);
    due.setDate(due.getDate() + (amount >= 500 ? 1 : 5));
    const rush = amount >= 500 || /rush|asap|same\s*day/i.test(inv.status);
    const printType: PrintType =
      i % 3 === 0 ? "DTG" : i % 3 === 1 ? "DTF" : "Screen Print";
    return {
      name: `Invoice ${inv.id.slice(-8) || String(i)}`,
      quantity,
      dueDate: due.toISOString().slice(0, 10),
      printType,
      priority: rush ? "rush" : "standard",
      value: amount
    };
  });
}

function sortScheduleJobs(a: ScheduleJob, b: ScheduleJob): number {
  if (a.priority === "rush" && b.priority !== "rush") return -1;
  if (b.priority === "rush" && a.priority !== "rush") return 1;
  const da = new Date(a.dueDate).getTime();
  const db = new Date(b.dueDate).getTime();
  if (da !== db) return da - db;
  return b.value - a.value;
}

function blocksNeededForJob(job: ScheduleJob): number {
  const perBlock = job.printType === "DTG" ? 24 : 32;
  return Math.max(1, Math.ceil(job.quantity / perBlock));
}

function taskLabel(printType: PrintType): string {
  if (printType === "DTG") return "DTG production run";
  if (printType === "DTF") return "Heat press / DTF apply";
  return "Screen print / press run";
}

function buildScheduleFromJobs(jobs: ScheduleJob[]): {
  schedule: Array<{
    employee: string;
    blocks: Array<{ time: string; job: string; task: string; quantityTarget: number }>;
  }>;
  bottlenecks: string[];
} {
  const sorted = [...jobs].sort(sortScheduleJobs);
  const patrickQueue = sorted.filter((j) => j.printType === "DTG");
  const pressQueue = sorted.filter((j) => j.printType !== "DTG");

  type Block = { time: string; job: string; task: string; quantityTarget: number };
  const patrick: Block[] = [];
  const employee1: Block[] = [];

  const patrickRef = { current: 0 };
  for (const job of patrickQueue) {
    let remaining = job.quantity;
    while (remaining > 0 && patrickRef.current < SCHEDULE_TIME_BLOCKS.length) {
      const time = SCHEDULE_TIME_BLOCKS[patrickRef.current];
      const cap = 24;
      const target = Math.min(cap, remaining);
      patrick.push({
        time,
        job: job.name,
        task: taskLabel(job.printType),
        quantityTarget: target
      });
      remaining -= target;
      patrickRef.current += 1;
    }
  }

  const e1Ref = { current: 0 };
  for (const job of pressQueue) {
    let remaining = job.quantity;
    while (remaining > 0 && e1Ref.current < SCHEDULE_TIME_BLOCKS.length) {
      const time = SCHEDULE_TIME_BLOCKS[e1Ref.current];
      const cap = 32;
      const target = Math.min(cap, remaining);
      employee1.push({
        time,
        job: job.name,
        task: taskLabel(job.printType),
        quantityTarget: target
      });
      remaining -= target;
      e1Ref.current += 1;
    }
  }

  const bottlenecks: string[] = [];
  const totalBlockNeed = jobs.reduce((s, j) => s + blocksNeededForJob(j), 0);
  const capacityBlocks = SCHEDULE_TIME_BLOCKS.length * SCHEDULE_TEAM.length;
  if (totalBlockNeed > capacityBlocks) {
    bottlenecks.push("Overloaded day — delay lowest priority job");
  }
  const dtgNeed = patrickQueue.reduce((s, j) => s + blocksNeededForJob(j), 0);
  if (dtgNeed > SCHEDULE_TIME_BLOCKS.length) {
    bottlenecks.push("DTG overloaded — reassign or batch jobs");
  }
  const unscheduled = sorted.filter((j) => {
    const need = blocksNeededForJob(j);
    if (j.printType === "DTG") {
      return patrick.filter((b) => b.job === j.name).length < need;
    }
    return employee1.filter((b) => b.job === j.name).length < need;
  });
  if (unscheduled.length > 0) {
    bottlenecks.push(
      `Time risk — ${unscheduled.length} job(s) need more blocks than available (finish lowest priority tomorrow)`
    );
  }

  return {
    schedule: [
      { employee: "Patrick", blocks: patrick },
      { employee: "Employee1", blocks: employee1 }
    ],
    bottlenecks
  };
}

function parseCommand(message: string): string | null {
  const msg = message.toLowerCase();

  if (
    msg.includes("run business") ||
    msg.includes("run the business") ||
    msg.includes("business status") ||
    msg.includes("full status") ||
    msg.includes("shop status") ||
    msg.includes("what needs attention") ||
    msg.includes("what should i focus on") ||
    (msg.includes("business") && msg.includes("state"))
  ) {
    return "run-business";
  }
  if (msg.includes("schedule") && (msg.includes("day") || msg.includes("production"))) {
    return "schedule-day";
  }
  if (msg.includes("run") || msg.includes("today") || msg.includes("plan")) {
    return "run-day";
  }
  if (msg.includes("status") || msg.includes("what’s happening") || msg.includes("what's happening") || msg.includes("pipeline")) {
    return "status";
  }
  if (msg.includes("follow up") || msg.includes("follow-ups") || msg.includes("followups")) {
    return "followups";
  }
  if (msg.includes("close") || msg.includes("close deals")) {
    return "close-deals";
  }
  if (msg.includes("revive") || msg.includes("dead leads")) {
    return "revive-pipeline";
  }
  if (msg.includes("generate") || msg.includes("new leads") || msg.includes("get business")) {
    return "generate-revenue";
  }

  return null;
}

export async function executeCommand(req: Request, res: Response): Promise<Response> {
  const body = typeof req.body === "object" && req.body !== null ? req.body as Record<string, unknown> : {};
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const command =
    String(body.command || "").trim() ||
    (message ? parseCommand(message) || "" : "");

  if (!command) {
    return res.status(400).json(
      errorResponse(
        "Command not recognized. Try: run-business, run-day, status, followups, close-deals, schedule-day"
      )
    );
  }

  switch (command) {
    case "run-business":
      return runBusiness(req, res);
    case "run-day":
      return runDay(req, res);
    case "status":
      return getWarRoom(req, res);
    case "followups":
      return autoFollowup(req, res);
    case "schedule-day": {
      let jobs: ScheduleJob[] = [];
      try {
        const invRes = await getRecentInvoices();
        if (invRes.success && invRes.data.length > 0) {
          jobs = invoiceToJobs(invRes.data);
        }
      } catch {
        jobs = [];
      }
      if (jobs.length === 0) {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        jobs = [
          {
            name: "Job A",
            quantity: 24,
            dueDate: today.toISOString().slice(0, 10),
            printType: "DTG",
            priority: "standard",
            value: 450
          },
          {
            name: "Job B",
            quantity: 48,
            dueDate: tomorrow.toISOString().slice(0, 10),
            printType: "DTF",
            priority: "standard",
            value: 900
          }
        ];
      }
      const ordered = [...jobs].sort(sortScheduleJobs);
      const priorities = ordered.slice(0, 5).map((j) => ({
        name: j.name,
        qty: j.quantity,
        type: j.printType,
        priorityReason:
          j.priority === "rush"
            ? "Rush window — due soon or high-value pull-forward"
            : `Due ${j.dueDate} — sorted after rush; value $${Math.round(j.value)}`
      }));
      const { schedule, bottlenecks } = buildScheduleFromJobs(ordered);
      return res.json({ success: true, schedule, priorities, bottlenecks });
    }
    case "generate-revenue": {
      const targets = [
        { type: "HVAC Company", pitchAngle: "Crew uniforms — fast turnaround before summer rush" },
        { type: "Roofing Company", pitchAngle: "Durable branded work shirts for job sites" },
        { type: "Landscaping Company", pitchAngle: "Matching crew shirts for a clean professional look" },
        { type: "Gym", pitchAngle: "Member merch and coach shirts with quick local turnaround" },
        { type: "Church", pitchAngle: "Volunteer and event shirts for upcoming services and outreach" },
        { type: "HVAC Company", pitchAngle: "Service tech polos to reinforce brand trust at homes" },
        { type: "Roofing Company", pitchAngle: "High-visibility team shirts for active crews" },
        { type: "Landscaping Company", pitchAngle: "Season-ready uniforms before peak yard season" },
        { type: "Gym", pitchAngle: "Promo tees for class launches and member challenges" },
        { type: "Church", pitchAngle: "Youth group and ministry event shirt packages" }
      ];

      const outreachTemplate =
        "Hey, I run Cheeky Tees here in Fountain Inn — we do fast turnaround custom shirts for local crews.\n\n" +
        "If you’ve got a team that needs branded shirts, I can get you set up this week. Want me to mock something up for you?";
      const outreach = {
        messages: [
          outreachTemplate,
          outreachTemplate,
          outreachTemplate,
          outreachTemplate,
          outreachTemplate
        ],
        calls: [
          "Hey, this is Patrick from Cheeky Tees — I work with local businesses on custom shirts and uniforms.\n\nQuick question — do you guys currently have branded shirts for your crew?",
          "Hey, this is Patrick from Cheeky Tees — I work with local businesses on custom shirts and uniforms.\n\nQuick question — do you guys currently have branded shirts for your crew?",
          "Hey, this is Patrick from Cheeky Tees — I work with local businesses on custom shirts and uniforms.\n\nQuick question — do you guys currently have branded shirts for your crew?"
        ]
      };

      const social = [
        "We’ve got a few production slots left this week for custom shirts.\n\nIf your business needs uniforms or your team needs gear, now’s the time — message me to lock in.",
        "Proud to be printing for local businesses here in the Upstate.\n\nIf you need custom shirts done fast and done right, Cheeky Tees has you covered.",
        "Running a small batch deal this week — perfect for crews, teams, and events.\n\nDM me and I’ll get you a quick quote today."
      ];

      const walkIn = [
        "Hey, I’m Patrick — I run Cheeky Tees right here in Fountain Inn.\n\nWe do custom shirts for local businesses — I wanted to stop by and see if you guys needed anything for your crew."
      ];

      return res.json({
        success: true,
        targets,
        outreach,
        social,
        walkIn
      });
    }
    case "revive-pipeline": {
      const estimatesRes = await getRecentEstimates();
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      const reviveTargets = estimatesRes.data
        .map((row) => {
          const r = row as Record<string, unknown>;
          const status = String(r.status ?? "").toUpperCase();
          const createdAt = String(r.createdAt ?? "");
          const createdMs = new Date(createdAt).getTime();
          const daysOld = Number.isFinite(createdMs) ? Math.floor((now - createdMs) / dayMs) : -1;
          const value = typeof r.amount === "number" ? r.amount : 0;
          const name = String(r.customerId ?? "there");
          return { status, daysOld, value, name };
        })
        .filter((r) => r.status !== "PAID" && r.status !== "ACCEPTED")
        .filter((r) => r.daysOld >= 3 && r.daysOld <= 10)
        .sort((a, b) => b.value - a.value)
        .slice(0, 10)
        .map((r) => {
          const urgencyLevel = r.daysOld <= 5 ? "WARM" : "HOT — LAST CHANCE";
          const message =
            urgencyLevel === "WARM"
              ? `Hey ${r.name}, just circling back on your shirt order for $${r.value}.\n\nWe’ve got production rolling this week — if you still want to move forward, I can get you locked in quickly.`
              : `Hey ${r.name}, last follow-up on your order for $${r.value}.\n\nWe’re closing out this week’s production slots — if you want in, I’ll need to lock it today with the deposit.`;
          const callScript =
            `Hey ${r.name}, it’s Patrick from Cheeky Tees.\n\n` +
            "I wanted to check in one last time on your order. I’ve got a couple production slots left this week, and I didn’t want you to miss it if you still needed these.\n\n" +
            "Are you ready to move forward today?";
          return {
            name: r.name,
            value: r.value,
            daysOld: r.daysOld,
            urgencyLevel,
            message,
            callScript
          };
        });

      return res.json({
        success: true,
        reviveTargets
      });
    }
    case "close-deals": {
      const topDeals = getNextBestActions().slice(0, 5);
      const dealsToClose = topDeals.map((deal) => ({
        name: deal.name,
        value: deal.value,
        stage: deal.stage,
        action: "CALL NOW",
        callScript:
          `Hey ${deal.name}, it’s Patrick from Cheeky Tees.\n\n` +
          `I wanted to follow up on your order for $${deal.value}. I’ve got production slots closing for this week, so I wanted to lock you in before they fill up.\n\n` +
          "If you’re ready, I can send the deposit link right now and get this started today.",
        textScript:
          `Hey ${deal.name}, quick follow-up on your order for $${deal.value}.\n\n` +
          "I’ve got limited production slots this week — if you want to move forward, I can lock it in today with the deposit 👍"
      }));

      let followupPayload: unknown = { sent: 0 };
      const fakeRes = {
        status: (_code: number) => fakeRes,
        json: (out: unknown) => {
          followupPayload = out;
          return fakeRes;
        }
      } as unknown as Response;
      await autoFollowup(req, fakeRes);

      const followupObj =
        typeof followupPayload === "object" && followupPayload !== null
          ? (followupPayload as Record<string, unknown>)
          : {};
      const followupsTriggered =
        typeof followupObj.sent === "number" ? followupObj.sent : 0;

      return res.json({
        success: true,
        dealsToClose,
        followupsTriggered
      });
    }
    default:
      return res.status(400).json(errorResponse("Invalid command"));
  }
}
