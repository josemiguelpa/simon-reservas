#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { loadEnvFile } from "./env.mjs";
import { normalizeWeekday, parseClockTime, validateScheduleTask } from "./schedule-utils.mjs";
import { parseArgs } from "./utils.mjs";

function help() {
  console.log(`
Uso:
  pnpm schedule:add -- --id voley-sabado --run-day jueves --run-time 06:00 \\
    --target-day sábado --scenario "Nombre" --division "Completa" \\
    --start 13:00 --end 14:00 [--weeks-ahead 0] [--confirm]

Sin --confirm, la tarea semanal se crea en modo simulación.
`);
}

function required(args, names) {
  const missing = names.filter((name) => !args[name]);
  if (missing.length) throw new Error(`Faltan opciones: ${missing.map((name) => `--${name}`).join(", ")}`);
}

function main() {
  loadEnvFile();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return help();
  required(args, ["id", "runDay", "runTime", "targetDay", "scenario", "division", "start", "end"]);

  const configPath = path.resolve(args.config || process.env.SIMON_SCHEDULES_FILE || "./config/schedules.json");
  const config = fs.existsSync(configPath)
    ? JSON.parse(fs.readFileSync(configPath, "utf8"))
    : { timezone: "America/Bogota", tasks: [] };
  if (!Array.isArray(config.tasks)) {
    throw new Error(`La configuración ${configPath} debe contener un arreglo \"tasks\".`);
  }

  if (config.tasks.some((task) => task.id === args.id)) {
    throw new Error(`Ya existe una tarea con id ${args.id}.`);
  }

  parseClockTime(args.runTime);
  parseClockTime(args.start);
  parseClockTime(args.end);
  const task = validateScheduleTask({
    id: args.id,
    enabled: true,
    run: { weekday: normalizeWeekday(args.runDay), time: args.runTime },
    reservation: {
      targetWeekday: normalizeWeekday(args.targetDay),
      weeksAhead: Number(args.weeksAhead || 0),
      scenario: args.scenario,
      division: args.division,
      start: args.start,
      end: args.end,
      participantsCsv: args.participantsCsv || process.env.SIMON_PARTICIPANTS_CSV || "./data/participants.csv",
      confirm: args.confirm,
    },
  });

  config.tasks.push(task);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  console.log(`Tarea ${task.id} creada en ${configPath}. Modo real: ${task.reservation.confirm ? "sí" : "no"}.`);
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}
