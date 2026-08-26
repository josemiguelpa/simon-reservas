#!/usr/bin/env node
import process from "node:process";
import { chromium } from "playwright";
import { loadEnvFile } from "./env.mjs";
import { readParticipantCsv, selectParticipantDocuments } from "./participants.mjs";
import {
  assertIsoDate,
  blocksCoveringRange,
  parseArgs,
  requiredOptions,
  toTwelveHour,
} from "./utils.mjs";

const BASE_URL = "https://simon.inder.gov.co";
const LOGIN_URL = `${BASE_URL}/login/`;
const BOOKING_LIST_URL = `${BASE_URL}/apps/scenarios/booking/list/`;

function printHelp() {
  console.log(`
Uso:
  npm start -- --scenario "Nombre" --division "Completa" \\
    --date 2026-08-28 --start 18:00 --end 19:00 [opciones]

Opciones:
  --participants DOC1,DOC2  Reemplaza la selección automática del CSV.
  --participants-csv RUTA   CSV cuya primera columna contiene las cédulas.
  --headed                  Muestra el navegador.
  --confirm                 Confirma la reserva real. Sin esto solo valida.
  --help                    Muestra esta ayuda.

Credenciales requeridas en .env:
  SIMON_DOCUMENT_NUMBER, SIMON_PASSWORD
`);
}

async function chooseAutocomplete(page, label, option) {
  const input = page.getByRole("combobox", { name: label, exact: true });
  await input.click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function login(page) {
  const documentType = process.env.SIMON_DOCUMENT_TYPE || "Cédula de Ciudadanía";
  const documentNumber = process.env.SIMON_DOCUMENT_NUMBER;
  const password = process.env.SIMON_PASSWORD;

  if (!documentNumber || !password) {
    throw new Error("Define SIMON_DOCUMENT_NUMBER y SIMON_PASSWORD en .env o en el entorno.");
  }

  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
  await chooseAutocomplete(page, "*Tipo de documento", documentType);
  await page.getByPlaceholder("Ejemplo: 1020304050").fill(documentNumber);
  await page.locator("#auth-login-v2-password").fill(password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();

  try {
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
  } catch {
    const roleInput = page.getByRole("combobox", { name: /perfil de seguridad/i });
    if (await roleInput.isVisible().catch(() => false)) {
      await roleInput.click();
      const configuredRole = process.env.SIMON_ROLE;
      const roleOption = configuredRole
        ? page.getByRole("option", { name: configuredRole, exact: true })
        : page.getByRole("option").first();
      await roleOption.click();
      await page.getByRole("button", { name: "Ingresar", exact: true }).click();
      await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
      return;
    }

    const error = await page.getByRole("alert").allTextContents().catch(() => []);
    throw new Error(`No fue posible iniciar sesión. ${error.join(" ").trim()}`);
  }
}

async function openScenario(page, scenario) {
  await page.goto(BOOKING_LIST_URL, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Reservas", exact: true }).waitFor();
  await page.getByRole("searchbox", { name: "Buscar" }).fill(scenario);

  const cell = page.getByRole("cell", { name: scenario, exact: true });
  await cell.waitFor({ state: "visible", timeout: 15_000 });
  const row = cell.locator("xpath=ancestor::*[@role='row']");
  const matches = await page.getByRole("cell", { name: scenario, exact: true }).count();
  if (matches !== 1) throw new Error(`La búsqueda devolvió ${matches} coincidencias exactas para el escenario.`);

  await row.getByRole("button").last().click();
  await page.getByRole("menuitem", { name: "Reservar", exact: true }).click();
  await page.getByRole("combobox", { name: "Selecciona la división a reservar" }).waitFor();
}

async function goToDate(page, date) {
  const calendarDates = page.locator("th.fc-col-header-cell[data-date]");
  await calendarDates.first().waitFor({ state: "visible", timeout: 20_000 });

  const target = `.fc-timegrid-col[data-date="${date}"]`;
  for (let attempt = 0; attempt < 45; attempt += 1) {
    if (await page.locator(target).count()) return page.locator(target);

    const visibleDates = await page.locator("th.fc-col-header-cell[data-date]").evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-date")).filter(Boolean),
    );
    if (visibleDates.length && date < visibleDates[0]) {
      throw new Error(`La fecha ${date} es anterior al rango reservable mostrado por SIMON.`);
    }

    const next = page.locator("button.fc-next-button");
    if (!(await next.count()) || !(await next.isEnabled())) break;
    await next.click();
    await page.waitForTimeout(400);
  }

  throw new Error(`SIMON no mostró la fecha ${date} dentro de su rango reservable.`);
}

async function inspectRequestedBlocks(page, { date, start, end }) {
  const dayColumn = await goToDate(page, date);
  const eventTexts = await dayColumn.locator(".fc-event").allInnerTexts();
  const blocks = blocksCoveringRange(eventTexts, start, end);
  const occupied = blocks.filter((block) => !block.available);

  if (occupied.length) {
    throw new Error(
      `No está disponible todo el rango solicitado. Bloques ocupados: ${occupied.map((block) => block.range).join(", ")}.`,
    );
  }

  return blocks;
}

async function configureBlock(page, date, block, participants) {
  const dayColumn = page.locator(`.fc-timegrid-col[data-date="${date}"]`);
  const calendarBlock = dayColumn.locator(".fc-event").filter({ hasText: block.range });
  if ((await calendarBlock.count()) !== 1) {
    throw new Error(`El bloque ${date} ${block.range} cambió mientras se preparaba la reserva.`);
  }

  await calendarBlock.click();
  await page.getByRole("heading", { name: "Creación de Reserva" }).waitFor();
  for (const participant of participants) await addParticipant(page, participant);

  await page.getByRole("button", { name: "Guardar", exact: true }).last().click();
  await page.getByRole("heading", { name: "Creación de Reserva" }).waitFor({ state: "hidden", timeout: 10_000 });
}

async function addParticipant(page, documentNumber) {
  await page.getByRole("button", { name: "Agregar Participantes", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Participantes" });
  await dialog.waitFor();

  await dialog.getByRole("combobox", { name: "Tipo de Documento" }).click();
  await page.getByRole("option", { name: "Cédula de Ciudadanía", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Número de Documento" }).fill(documentNumber);
  await dialog.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.waitForTimeout(500);

  const add = dialog.getByRole("button", { name: "Agregar", exact: true });
  if (!(await add.isEnabled())) throw new Error(`No se pudo agregar al participante ${documentNumber}.`);
  await add.click();
  await dialog.waitFor({ state: "hidden", timeout: 10_000 });
}

async function readCapacity(page) {
  const fullText = await page.locator("main").innerText();
  return {
    minimum: Number(/Usuarios minimos por reserva:\s*(\d+)/i.exec(fullText)?.[1] || 1),
    maximum: Number(/Usuarios maximos por reserva:\s*(\d+)/i.exec(fullText)?.[1] || Number.POSITIVE_INFINITY),
  };
}

function resolveParticipants(args, capacity) {
  const csvPath = args.participantsCsv || process.env.SIMON_PARTICIPANTS_CSV || "./data/participants.csv";
  const candidates = args.participants.length || capacity.minimum <= 1 ? [] : readParticipantCsv(csvPath);
  return selectParticipantDocuments({
    candidates,
    explicit: args.participants,
    ownerDocument: process.env.SIMON_DOCUMENT_NUMBER,
    minimum: capacity.minimum,
    maximum: capacity.maximum,
  });
}

async function finalize(page) {
  await page.getByText("Bloques a Reservar", { exact: true }).waitFor({ timeout: 10_000 });
  const finalSave = page.getByRole("button", { name: "Guardar", exact: true }).last();
  await finalSave.click();

  const success = page.getByText(/Se ha registrado la reserva exitosamente/i);
  await success.waitFor({ timeout: 20_000 });
  return (await success.first().innerText()).trim();
}

async function main() {
  loadEnvFile();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();
  requiredOptions(args);
  assertIsoDate(args.date);
  toTwelveHour(args.start);
  toTwelveHour(args.end);

  const browser = await chromium.launch({ headless: !args.headed });
  const context = await browser.newContext({ locale: "es-CO", timezoneId: "America/Bogota" });
  const page = await context.newPage();

  try {
    console.log("Iniciando sesión en SIMON…");
    await login(page);
    console.log(`Buscando escenario: ${args.scenario}`);
    await openScenario(page, args.scenario);
    await chooseAutocomplete(page, "Selecciona la división a reservar", args.division);

    const blocks = await inspectRequestedBlocks(page, args);
    const capacity = await readCapacity(page);
    const participants = resolveParticipants(args, capacity);
    if (participants.length) {
      console.log(`Participantes adicionales seleccionados: ${participants.length} (mínimo requerido).`);
    }

    if (!args.confirm) {
      console.log(`Disponible: ${args.date}, ${blocks.map((block) => block.range).join(", ")}.`);
      console.log("Simulación terminada: no se creó ninguna reserva. Usa --confirm para reservar.");
      return;
    }

    console.log("Confirmación explícita recibida mediante --confirm. Creando reserva…");
    for (const block of blocks) await configureBlock(page, args.date, block, participants);
    console.log(await finalize(page));
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
