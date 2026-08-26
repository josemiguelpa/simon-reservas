import test from "node:test";
import assert from "node:assert/strict";
import {
  nextWeekdayIso,
  normalizeWeekday,
  taskMatchesDate,
  validateScheduleTask,
  zonedDateParts,
} from "../src/schedule-utils.mjs";
import { parseArgs } from "../src/utils.mjs";

const task = {
  id: "voley-sabado",
  enabled: true,
  run: { weekday: "THU", time: "06:00" },
  reservation: {
    targetWeekday: "SAT",
    weeksAhead: 0,
    scenario: "Cancha",
    division: "Completa",
    start: "13:00",
    end: "14:00",
    confirm: false,
  },
};

test("normaliza días en español e inglés", () => {
  assert.equal(normalizeWeekday("sábado"), "SAT");
  assert.equal(normalizeWeekday("Thursday".slice(0, 3)), "THU");
});

test("calcula el próximo día objetivo en la zona horaria", () => {
  const thursdayBogota = new Date("2026-08-27T11:00:00.000Z");
  assert.equal(zonedDateParts(thursdayBogota, "America/Bogota").time, "06:00");
  assert.equal(nextWeekdayIso(thursdayBogota, "America/Bogota", "SAT", 0), "2026-08-29");
  assert.equal(nextWeekdayIso(thursdayBogota, "America/Bogota", "SAT", 1), "2026-09-05");
});

test("detecta el minuto semanal de ejecución", () => {
  const thursdayBogota = new Date("2026-08-27T11:00:00.000Z");
  assert.equal(taskMatchesDate(task, thursdayBogota, "America/Bogota"), true);
});

test("valida la configuración completa", () => {
  assert.equal(validateScheduleTask(task), task);
  assert.throws(
    () => validateScheduleTask({ ...task, reservation: { ...task.reservation, end: "12:00" } }),
    /posterior/,
  );
});

test("interpreta opciones del CSV y del programador", () => {
  assert.deepEqual(
    parseArgs(["--participants-csv", "./data/personas.csv", "--run-now", "voley-sabado", "--list"]),
    {
      confirm: false,
      headed: false,
      participants: [],
      participantsCsv: "./data/personas.csv",
      runNow: "voley-sabado",
      list: true,
    },
  );
});
