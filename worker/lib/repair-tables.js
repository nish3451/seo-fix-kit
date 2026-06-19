import { jsonNoStore } from "./http.js";

const REPAIR_TABLES_MISSING_CODE = "REPAIR_QUEUE_MIGRATION_MISSING";

function isRepairTablesMissingError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("no such table") ||
    message.includes("does not exist") ||
    message.includes("not found")
  ) && (
    message.includes("repair_queue_items") ||
    message.includes("repair_agent_actions")
  );
}

function repairTablesMissingResponse() {
  return jsonNoStore({
    error: "Repair queue storage has not been migrated yet.",
    code: REPAIR_TABLES_MISSING_CODE
  }, 503);
}

async function repairTableAll(statement) {
  try {
    return await statement.all();
  } catch (error) {
    if (isRepairTablesMissingError(error)) return { results: [], repairTablesMissing: true };
    throw error;
  }
}

async function requireRepairTables(env) {
  try {
    await firstPrepared(env.WAITLIST_DB.prepare("SELECT id FROM repair_queue_items LIMIT 1"));
    await firstPrepared(env.WAITLIST_DB.prepare("SELECT id FROM repair_agent_actions LIMIT 1"));
    return { ok: true };
  } catch (error) {
    if (isRepairTablesMissingError(error)) {
      return { ok: false, response: repairTablesMissingResponse(), code: REPAIR_TABLES_MISSING_CODE };
    }
    throw error;
  }
}

function firstPrepared(statement) {
  if (statement?.first) return statement.first();
  return statement.bind().first();
}

export {
  isRepairTablesMissingError,
  repairTableAll,
  requireRepairTables
};
