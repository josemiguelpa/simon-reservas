import http from "node:http";
import process from "node:process";
import { executeReservation, loadEnvFile } from "./service.mjs";
import { normalizeReservationPayload } from "./request.mjs";
import { ReservationError } from "./errors.mjs";

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    throw new ReservationError("El cuerpo debe ser JSON válido.", 400, "INVALID_JSON");
  }
}

async function handleReservation(req, res, confirmMode) {
  const input = await readJsonBody(req);
  const payload = normalizeReservationPayload(input);
  const effectivePayload = { ...payload, confirm: confirmMode ? payload.confirm : false };
  const result = await executeReservation(effectivePayload);
  sendJson(res, 200, result);
}

function handleError(res, error) {
  if (error instanceof ReservationError) {
    sendJson(res, error.statusCode, { ok: false, errorCode: error.code, message: error.message });
    return;
  }

  sendJson(res, 500, { ok: false, errorCode: "INTERNAL_ERROR", message: error.message || "Error interno" });
}

async function handler(req, res) {
  try {
    if (req.method === "GET" && req.url === "/health") {
      sendJson(res, 200, { ok: true, status: "up" });
      return;
    }

    if (req.method === "POST" && req.url === "/reservas/validar") {
      await handleReservation(req, res, false);
      return;
    }

    if (req.method === "POST" && req.url === "/reservas") {
      await handleReservation(req, res, true);
      return;
    }

    sendJson(res, 404, { ok: false, errorCode: "NOT_FOUND", message: "Ruta no encontrada" });
  } catch (error) {
    handleError(res, error);
  }
}

loadEnvFile();

http.createServer(handler).listen(PORT, HOST, () => {
  console.log(`simon-reservas escuchando en http://${HOST}:${PORT}`);
});
