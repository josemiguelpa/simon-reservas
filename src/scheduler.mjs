#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "./env.mjs";
import { nextWeekdayIso, taskMatchesDate, validateScheduleTask, zonedDateParts } from "./schedule-utils.mjs";
import { parseArgs } from "./utils.mjs";

const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));

function readJson(pathname, fallback) {
  if (!fs.existsSync(pathname)) return fallback;
  return JSON.parse(fs.readFileSync(pathname, "utf8"));
}

function writeState(pathname, state) {
  fs.mkdirSync(path.dirname(pathname), { recursive: true });
  fs.writeFileSync(pathname, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

function reservationArguments(task, targetDate) {
  const reservation = task.reservation;
  const args = [
    "src/cli.mjs",
    "--scenario", reservation.scenario,
    "--division", reservation.division,
    "--date", targetDate,
    "--start", reservation.start,
    "--end", reservation.end,
  ];
  if (reservation.participantsCsv) args.push("--participants-csv", reservation.participantsCsv);
  if (reservation.confirm) args.push("--confirm");
  return args;
}

async function runTask(task, timezone, now = new Date()) {
  const targetDate = nextWeekdayIso(now, timezone, task.reservation.targetWeekday, task.reservation.weeksAhead);
  console.log(`[${new Date().toISOString()}] Ejecutando ${task.id} para ${targetDate}.`);

  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, reservationArguments(task, targetDate), {
      cwd: PROJECT_ROOT,
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) throw new Error(`La tarea ${task.id} terminó con código ${exitCode}.`);
}

async function main() {
  loadEnvFile(path.join(PROJECT_ROOT, ".env"));
  const args = parseArgs(process.argv.slice(2));
  const configPath = path.resolve(PROJECT_ROOT, args.config || process.env.SIMON_SCHEDULES_FILE || "config/schedules.json");
  const statePath = path.resolve(PROJECT_ROOT, ".state/scheduler-state.json");
  const config = readJson(configPath, null);
  if (!config) throw new Error(`No existe la configuración de tareas: ${configPath}`);
  if (!Array.isArray(config.tasks)) {
    throw new Error(`La configuración ${configPath} debe contener un arreglo \"tasks\".`);
  }

  const timezone = config.timezone || "America/Bogota";
  const tasks = config.tasks.map(validateScheduleTask);
  const enabledTasks = tasks.filter((task) => task.enabled !== false);

  if (args.list) {
    for (const task of tasks) {
      console.log(`${task.id}: ${task.enabled === false ? "inactiva" : "activa"}, ${task.run.weekday} ${task.run.time}`);
    }
    return;
  }

  if (args.runNow) {
    const task = enabledTasks.find((candidate) => candidate.id === args.runNow);
    if (!task) throw new Error(`No existe una tarea activa con id ${args.runNow}.`);
    await runTask(task, timezone);
    return;
  }

  console.log(`Programador activo en ${timezone}. Tareas habilitadas: ${enabledTasks.length}.`);
  let checking = false;
  const tick = async () => {
    if (checking) return;
    checking = true;
    try {
      const now = new Date();
      const current = zonedDateParts(now, timezone);
      const state = readJson(statePath, { triggered: {} });
      if (!state.triggered || typeof state.triggered !== "object") state.triggered = {};
      for (const task of enabledTasks) {
        if (!taskMatchesDate(task, now, timezone)) continue;
        const key = `${current.date}T${current.time}`;
        if (state.triggered[task.id] === key) continue;

        state.triggered[task.id] = key;
        writeState(statePath, state);
        try {
          await runTask(task, timezone, now);
        } catch (error) {
          console.error(error.message);
        }
      }
    } finally {
      checking = false;
    }
  };

  await tick();
  setInterval(tick, 15_000);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
