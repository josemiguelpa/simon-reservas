#!/usr/bin/env node
import process from "node:process";
import { parseCliPayload, executeReservation, loadEnvFile } from "./service.mjs";

function printHelp() {
  console.log(`
Uso:
  npm run start:cli -- --scenario "Nombre" --division "Completa" \\
    --date 2026-08-28 --start 18:00 --end 19:00 [opciones]

Opciones:
  --participants DOC1,DOC2  Agrega participantes registrados en SIMON.
  --headed                  Muestra el navegador.
  --confirm                 Confirma la reserva real. Sin esto solo valida.
  --help                    Muestra esta ayuda.

Credenciales requeridas en .env:
  SIMON_DOCUMENT_NUMBER, SIMON_PASSWORD
`);
}

async function main() {
  loadEnvFile();
  const payload = parseCliPayload(process.argv.slice(2));
  if (payload.help) return printHelp();

  const result = await executeReservation(payload);
  console.log(result.message);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
