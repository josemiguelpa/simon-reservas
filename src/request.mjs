import process from "node:process";
import { assertIsoDate, time24ToMinutes, toTwelveHour } from "./utils.mjs";
import { ValidationError } from "./errors.mjs";

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isBoolean(value) {
  return typeof value === "boolean";
}

// SIMON rejects a second block booked with the same participant documents, so each
// request may carry its own account. Falls back to the process credentials.
function normalizeCredentials(input) {
  if (input === undefined || input === null) return undefined;

  if (typeof input !== "object" || Array.isArray(input)) {
    throw new ValidationError("credentials debe ser un objeto.");
  }

  if (!isNonEmptyString(input.documentNumber) || !isNonEmptyString(input.password)) {
    throw new ValidationError("credentials requiere documentNumber y password como cadenas no vacías.");
  }

  for (const name of ["documentType", "role"]) {
    if (input[name] !== undefined && !isNonEmptyString(input[name])) {
      throw new ValidationError(`credentials.${name} debe ser una cadena no vacía cuando se envía.`);
    }
  }

  return {
    documentNumber: input.documentNumber.trim(),
    password: input.password,
    documentType: isNonEmptyString(input.documentType) ? input.documentType.trim() : undefined,
    role: isNonEmptyString(input.role) ? input.role.trim() : undefined,
  };
}

export function normalizeReservationPayload(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ValidationError("El cuerpo debe ser un objeto JSON.");
  }

  const payload = {
    scenario: input.scenario,
    division: input.division,
    date: input.date,
    start: input.start,
    end: input.end,
    participants: input.participants ?? [],
    confirm: input.confirm ?? false,
    // Deployments that provide a display (HEADED=true) default to a real browser
    // window; an explicit headed value in the payload still wins.
    headed: input.headed ?? process.env.HEADED === "true",
    requestId: input.requestId,
  };

  const required = ["scenario", "division", "date", "start", "end"];
  const missing = required.filter((name) => !isNonEmptyString(payload[name]));
  if (missing.length) {
    throw new ValidationError(`Faltan campos obligatorios: ${missing.join(", ")}.`);
  }

  assertIsoDate(payload.date);
  toTwelveHour(payload.start);
  toTwelveHour(payload.end);
  if (time24ToMinutes(payload.end) <= time24ToMinutes(payload.start)) {
    throw new ValidationError("end debe ser posterior a start.");
  }

  if (!Array.isArray(payload.participants) || payload.participants.some((value) => !isNonEmptyString(value))) {
    throw new ValidationError("participants debe ser un array de cadenas no vacías.");
  }

  if (!isBoolean(payload.confirm)) {
    throw new ValidationError("confirm debe ser booleano.");
  }

  if (!isBoolean(payload.headed)) {
    throw new ValidationError("headed debe ser booleano.");
  }

  if (payload.requestId !== undefined && !isNonEmptyString(payload.requestId)) {
    throw new ValidationError("requestId debe ser una cadena no vacía cuando se envía.");
  }

  return {
    scenario: payload.scenario.trim(),
    division: payload.division.trim(),
    date: payload.date,
    start: payload.start,
    end: payload.end,
    participants: payload.participants.map((value) => value.trim()),
    confirm: payload.confirm,
    headed: payload.headed,
    requestId: typeof payload.requestId === "string" ? payload.requestId.trim() : undefined,
    credentials: normalizeCredentials(input.credentials),
  };
}
