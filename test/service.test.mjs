import assert from "node:assert/strict";
import test from "node:test";
import { normalizeDocuments, pickReservation } from "../src/service.mjs";

const SAVED_AT = Date.parse("2026-09-08T19:28:00.000Z");

function booking(overrides = {}) {
  return {
    SCENARY_BOOKING_PK: 437886,
    BOOKING_FILED_CODE: "20260000140854",
    SCENARY_NAME: "Cancha de vóley playa N 1 Unidad Deportiva Atanasio Girardot",
    BOOKING_START_DATE: "2026-09-10T00:00:00.000Z",
    BOOKING_END_DATE: "2026-09-10T00:00:00.000Z",
    BOOKING_CREATED_DATE: "2026-09-08T19:28:08.610Z",
    BOOKING_STATUS_CODE: "PENDIENTE_APROBACION",
    PARTICIPANT_IDENTIFICATION_NUMBER: "1025884625,1193100386,1000756963,1193577655",
    ...overrides,
  };
}

const criteria = {
  date: "2026-09-10",
  applicant: "1025884625",
  participants: ["1193100386", "1000756963", "1193577655"],
  createdAfter: SAVED_AT,
};

test("normaliza documentos ignorando orden, espacios y repetidos", () => {
  assert.equal(normalizeDocuments(" 2, 1 ,2,, 3 "), "1,2,3");
  assert.equal(normalizeDocuments(null), "");
});

test("encuentra la reserva recién creada en la fecha solicitada", () => {
  const match = pickReservation([booking()], criteria);
  assert.equal(match.BOOKING_FILED_CODE, "20260000140854");
});

test("descarta reservas de otra fecha", () => {
  const other = booking({ BOOKING_START_DATE: "2026-09-11T00:00:00.000Z" });
  assert.equal(pickReservation([other], criteria), null);
});

test("descarta reservas creadas antes del guardado", () => {
  const previous = booking({ BOOKING_CREATED_DATE: "2026-09-01T10:00:00.000Z" });
  assert.equal(pickReservation([previous], criteria), null);
});

test("prefiere la reserva cuyas cédulas coinciden cuando hay varias del mismo día", () => {
  const foreign = booking({ SCENARY_BOOKING_PK: 1, PARTICIPANT_IDENTIFICATION_NUMBER: "999,888" });
  const mine = booking({ SCENARY_BOOKING_PK: 2 });
  assert.equal(pickReservation([foreign, mine], criteria).SCENARY_BOOKING_PK, 2);
});

test("acepta las mismas cédulas en distinto orden", () => {
  const shuffled = booking({ PARTICIPANT_IDENTIFICATION_NUMBER: "1193577655,1025884625,1000756963,1193100386" });
  const foreign = booking({ SCENARY_BOOKING_PK: 1, PARTICIPANT_IDENTIFICATION_NUMBER: "999" });
  assert.equal(pickReservation([foreign, shuffled], criteria).SCENARY_BOOKING_PK, 437886);
});

test("acepta la reserva del día aunque SIMON reporte otras cédulas", () => {
  const reshaped = booking({ PARTICIPANT_IDENTIFICATION_NUMBER: null });
  assert.equal(pickReservation([reshaped], criteria).BOOKING_FILED_CODE, "20260000140854");
});

test("acepta la reserva cuando SIMON no reporta fecha de creación", () => {
  const undated = booking({ BOOKING_CREATED_DATE: null });
  assert.ok(pickReservation([undated], criteria));
});

test("no inventa una reserva cuando el seguimiento viene vacío", () => {
  assert.equal(pickReservation([], criteria), null);
});
