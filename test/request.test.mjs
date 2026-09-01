import test from "node:test";
import assert from "node:assert/strict";
import { normalizeReservationPayload } from "../src/request.mjs";

test("normaliza un payload válido", () => {
  assert.deepEqual(
    normalizeReservationPayload({
      scenario: "Cancha",
      division: "Completa",
      date: "2026-08-28",
      start: "18:00",
      end: "19:00",
      participants: ["1", "2"],
      confirm: true,
      headed: false,
      requestId: "abc-123",
    }),
    {
      scenario: "Cancha",
      division: "Completa",
      date: "2026-08-28",
      start: "18:00",
      end: "19:00",
      participants: ["1", "2"],
      confirm: true,
      headed: false,
      requestId: "abc-123",
      credentials: undefined,
    },
  );
});

test("normaliza credenciales por request y descarta campos opcionales vacíos", () => {
  const payload = normalizeReservationPayload({
    scenario: "Cancha",
    division: "Completa",
    date: "2026-08-28",
    start: "18:00",
    end: "19:00",
    credentials: { documentNumber: " 123 ", password: "secreta", role: "Ciudadano" },
  });

  assert.deepEqual(payload.credentials, {
    documentNumber: "123",
    password: "secreta",
    documentType: undefined,
    role: "Ciudadano",
  });
});

test("rechaza credenciales incompletas", () => {
  const base = {
    scenario: "Cancha",
    division: "Completa",
    date: "2026-08-28",
    start: "18:00",
    end: "19:00",
  };

  assert.throws(
    () => normalizeReservationPayload({ ...base, credentials: { documentNumber: "123" } }),
    /credentials requiere documentNumber y password/,
  );
  assert.throws(() => normalizeReservationPayload({ ...base, credentials: "123" }), /credentials debe ser un objeto/);
});

test("rechaza campos obligatorios ausentes", () => {
  assert.throws(
    () => normalizeReservationPayload({ division: "Completa", date: "2026-08-28", start: "18:00", end: "19:00" }),
    /Faltan campos obligatorios/,
  );
});

test("rechaza participantes inválidos y horas invertidas", () => {
  assert.throws(
    () =>
      normalizeReservationPayload({
        scenario: "Cancha",
        division: "Completa",
        date: "2026-08-28",
        start: "19:00",
        end: "18:00",
        participants: [""],
      }),
    /participants|end debe ser posterior/,
  );
});

test("rechaza banderas no booleanas", () => {
  assert.throws(
    () =>
      normalizeReservationPayload({
        scenario: "Cancha",
        division: "Completa",
        date: "2026-08-28",
        start: "18:00",
        end: "19:00",
        confirm: "yes",
      }),
    /confirm debe ser booleano/,
  );
});
