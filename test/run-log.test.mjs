import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendRunEvent, buildRunHistory, readRunEvents } from "../src/run-log.mjs";

test("registra y reconstruye ejecuciones exitosas, fallidas e interrumpidas", (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "simon-log-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const logPath = path.join(directory, "runs.jsonl");

  appendRunEvent(logPath, {
    runId: "success",
    taskId: "voley",
    status: "started",
    startedAt: "2026-08-26T10:00:00.000Z",
  });
  appendRunEvent(logPath, {
    runId: "success",
    taskId: "voley",
    status: "succeeded",
    startedAt: "2026-08-26T10:00:00.000Z",
    finishedAt: "2026-08-26T10:00:02.000Z",
    durationMs: 2000,
  });
  appendRunEvent(logPath, {
    runId: "interrupted",
    taskId: "futbol",
    status: "started",
    startedAt: "2026-08-26T11:00:00.000Z",
  });

  assert.deepEqual(
    buildRunHistory(readRunEvents(logPath)).map(({ runId, status }) => ({ runId, status })),
    [
      { runId: "interrupted", status: "interrupted" },
      { runId: "success", status: "succeeded" },
    ],
  );
  assert.equal(buildRunHistory(readRunEvents(logPath), { taskId: "voley" }).length, 1);
});

test("rechaza líneas corruptas", (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "simon-log-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const logPath = path.join(directory, "runs.jsonl");
  fs.writeFileSync(logPath, "no-es-json\n");
  assert.throws(() => readRunEvents(logPath), /línea 1/);
});
