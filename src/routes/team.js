/**
 * Team execution board — status on demand; no push notifications.
 */
const express = require("express");
const router = express.Router();

const { getAssignments } = require("../services/teamTaskStore");
const { getMemberById, getTeam } = require("../services/teamService");
const { getTeamBoardData } = require("../services/teamBoardService");
const { getRoleQueue } = require("../services/teamHandoffEngine");

router.get("/board", async (_req, res) => {
  try {
    const b = await getTeamBoardData();
    return res.status(200).json({
      type: "status",
      summary: `${b.inProgress.length} in progress, ${b.blocked.length} blocked, ${b.assignedTasks.length} queued`,
      data: b,
      actionsAvailable: ["POST /command with team queries"],
    });
  } catch (e) {
    return res.status(200).json({
      type: "status",
      summary: "Team board degraded",
      data: { error: e && e.message ? e.message : "error" },
      actionsAvailable: [],
    });
  }
});

router.get("/:userId", async (req, res) => {
  if (req.params.userId === "board") {
    return res.status(404).json({ error: "use /team/board" });
  }
  try {
    await getTeamBoardData();
    const uid = String(req.params.userId || "").toLowerCase().trim();
    const member = getMemberById(uid);
    if (!member) {
      return res.status(200).json({
        type: "status",
        summary: "Unknown team member",
        data: { userId: uid, tasks: [], knownMembers: getTeam().map((m) => m.id) },
        actionsAvailable: [],
      });
    }
    const all = getAssignments();
    const mine = all.filter((a) => String(a.assignedTo).toLowerCase() === uid);
    let serviceDeskItems = [];
    try {
      const role = String(member.role || "ADMIN").toUpperCase();
      if (["OWNER", "PRINTER", "ADMIN", "DESIGN"].includes(role)) {
        serviceDeskItems = getRoleQueue(role).slice(0, 40);
      }
    } catch (_e) {
      serviceDeskItems = [];
    }
    return res.status(200).json({
      type: "status",
      summary: `${mine.length} task(s) for ${member.name}`,
      data: {
        member,
        tasks: mine.map((t) => ({
          taskId: t.taskId,
          jobId: t.jobId,
          task: t.task,
          status: t.status,
          blockedReason: t.blockedReason || null,
        })),
        serviceDeskItems,
      },
      actionsAvailable: [],
    });
  } catch (e) {
    return res.status(200).json({
      type: "status",
      summary: "User view failed",
      data: { error: e && e.message ? e.message : "error" },
      actionsAvailable: [],
    });
  }
});

module.exports = router;
