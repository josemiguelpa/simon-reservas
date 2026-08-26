import test from "node:test";
import assert from "node:assert/strict";
import {
  assertIsoDate,
  blocksCoveringRange,
  parseArgs,
  parseCalendarBlock,
  requiredOptions,
  time12ToMinutes,
  time24ToMinutes,
  toTwelveHour,
} from "../src/utils.mjs";

test("parsea opciones, participantes y banderas", () => {
  assert.deepEqual(
    parseArgs(["--scenario", "Cancha", "--division=Completa", "--participants", "1, 2", "--confirm"]),
    { scenario: "Cancha", division: "Completa", participants: ["1", "2"], confirm: true, headed: false },
  );
});

test("convierte horas al formato mostrado por SIMON", () => {
  assert.equal(toTwelveHour("00:30"), "12:30 AM");
  assert.equal(toTwelveHour("18:00"), "06:00 PM");
});

test("interpreta los bloques horarios renderizados por FullCalendar", () => {
  assert.equal(time24ToMinutes("13:30"), 810);
  assert.equal(time12ToMinutes("01:30 PM"), 810);
  assert.deepEqual(parseCalendarBlock("01:00 PM - 02:00 PM\nBloque Disponible"), {
    start: 780,
    end: 840,
    range: "01:00 PM - 02:00 PM",
    available: true,
    text: "01:00 PM - 02:00 PM\nBloque Disponible",
  });
});

test("divide un rango solicitado según los bloques reales del calendario", () => {
  const blocks = blocksCoveringRange(
    [
      "12:00 PM - 01:00 PM Bloque Ocupado",
      "01:00 PM - 02:00 PM Bloque Disponible",
      "02:00 PM - 03:00 PM Bloque Disponible",
    ],
    "12:00",
    "14:00",
  );

  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].available, false);
  assert.equal(blocks[1].available, true);
});

test("rechaza rangos con huecos o invertidos", () => {
  assert.throws(
    () => blocksCoveringRange(["01:00 PM - 02:00 PM Bloque Disponible"], "12:00", "14:00"),
    /No existe un bloque/,
  );
  assert.throws(() => blocksCoveringRange([], "14:00", "12:00"), /posterior/);
});

test("valida fecha y opciones obligatorias", () => {
  assert.equal(assertIsoDate("2026-08-28"), "2026-08-28");
  assert.throws(() => assertIsoDate("28/08/2026"));
  assert.throws(() => assertIsoDate("2026-02-31"));
  assert.throws(() => requiredOptions({ scenario: "Cancha" }), /Faltan opciones/);
});
