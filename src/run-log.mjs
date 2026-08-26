import fs from "node:fs";
import path from "node:path";

export function appendRunEvent(logPath, event) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
}

export function readRunEvents(logPath) {
  if (!fs.existsSync(logPath)) return [];

  return fs.readFileSync(logPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`El log contiene JSON inválido en la línea ${index + 1}.`);
      }
    });
}

export function buildRunHistory(events, { taskId, limit = 20 } = {}) {
  const runs = new Map();

  for (const event of events) {
    if (!event?.runId || !event?.taskId) continue;
    const current = runs.get(event.runId) || {};
    runs.set(event.runId, { ...current, ...event });
  }

  return [...runs.values()]
    .filter((run) => !taskId || run.taskId === taskId)
    .map((run) => ({ ...run, status: run.status === "started" ? "interrupted" : run.status }))
    .sort((left, right) => String(right.startedAt).localeCompare(String(left.startedAt)))
    .slice(0, limit);
}
