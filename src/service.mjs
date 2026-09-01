import fs from "node:fs";
import process from "node:process";
import { chromium } from "playwright";
import { AvailabilityError, ReservationError, ValidationError } from "./errors.mjs";
import { blocksCoveringRange, parseArgs, requiredOptions } from "./utils.mjs";

const BASE_URL = "https://simon.inder.gov.co";
const LOGIN_URL = `${BASE_URL}/login/`;
const BOOKING_LIST_URL = `${BASE_URL}/apps/scenarios/booking/list/`;

export function loadEnvFile(path = ".env") {
  if (!fs.existsSync(path)) return;

  for (const rawLine of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function chooseAutocomplete(page, label, option) {
  const candidates = typeof label === "string"
    ? [
        page.getByRole("combobox", { name: label, exact: true }),
        page.getByRole("combobox", { name: label }),
        page.getByLabel(label, { exact: true }),
        page.getByLabel(label),
      ]
    : [
        page.getByRole("combobox", { name: label }),
        page.getByLabel(label),
      ];

  let input = null;
  for (const candidate of candidates) {
    try {
      await candidate.first().waitFor({ state: "visible", timeout: 5_000 });
      input = candidate.first();
      break;
    } catch {
      // Try next selector.
    }
  }

  if (!input) {
    throw new Error(`No se encontró el selector para ${label}.`);
  }

  await input.click();
  await page.getByRole("listbox").first().waitFor({ state: "visible", timeout: 5_000 });
  await page.getByRole("option", { name: option, exact: true }).click();
}

// Dump what the browser actually saw when a step times out, so failures caused by
// site changes or bot-manager challenges can be diagnosed without a live display.
async function captureDebugSnapshot(page, name, secrets = []) {
  const dir = process.env.DEBUG_DIR || "debug";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `${dir}/${stamp}-${name}`;

  try {
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: `${base}.png`, fullPage: true });

    let html = await page.content();
    for (const secret of secrets.filter(Boolean)) html = html.split(secret).join("[REDACTED]");
    fs.writeFileSync(`${base}.html`, html, "utf8");
    console.log(`Snapshot de depuración guardado en ${base}.png / ${base}.html (url: ${page.url()})`);
  } catch (error) {
    console.log(`No se pudo guardar el snapshot de depuración: ${error.message}`);
  }
}

async function waitForLoginForm(page) {
  await page.getByRole("combobox", { name: /tipo de documento/i }).waitFor({ state: "visible", timeout: 15_000 });
  await page.getByRole("textbox", { name: /número de documento/i }).waitFor({ state: "visible", timeout: 15_000 });
  await page.locator('input[type="password"]').waitFor({ state: "visible", timeout: 15_000 });
}

export function resolveCredentials(credentials = {}) {
  const documentType = credentials.documentType || process.env.SIMON_DOCUMENT_TYPE || "Cédula de Ciudadanía";
  const documentNumber = credentials.documentNumber || process.env.SIMON_DOCUMENT_NUMBER;
  const password = credentials.password || process.env.SIMON_PASSWORD;
  const role = credentials.role || process.env.SIMON_ROLE;

  if (!documentNumber || !password) {
    throw new ValidationError(
      "Faltan credenciales: envía credentials.documentNumber y credentials.password, o define SIMON_DOCUMENT_NUMBER y SIMON_PASSWORD en el entorno.",
    );
  }

  return { documentType, documentNumber, password, role };
}

async function login(page, { documentType, documentNumber, password, role }) {
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
  await waitForLoginForm(page);
  await chooseAutocomplete(page, /tipo de documento/i, documentType);
  await page.getByRole("textbox", { name: /número de documento/i }).fill(documentNumber);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /ingresar/i }).click();

  try {
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
  } catch {
    const roleInput = page.getByRole("combobox", { name: /perfil de seguridad/i });
    if (await roleInput.isVisible().catch(() => false)) {
      await roleInput.click();
      const roleOption = role
        ? page.getByRole("option", { name: role, exact: true })
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
    throw new AvailabilityError(
      `No está disponible todo el rango solicitado. Bloques ocupados: ${occupied.map((block) => block.range).join(", ")}.`,
    );
  }

  return blocks;
}

// After a block is saved SIMON opens a "Recuerda" modal telling the user to scroll
// down and press Guardar. It overlays the page, so nothing else is clickable until
// it is dismissed. It is not always shown, hence the tolerant wait.
async function dismissReminderDialog(page) {
  const dialog = page.getByRole("dialog", { name: "Recuerda" });

  try {
    await dialog.waitFor({ state: "visible", timeout: 5_000 });
  } catch {
    return;
  }

  await dialog.getByRole("button", { name: "Aceptar", exact: true }).click();
  await dialog.waitFor({ state: "hidden", timeout: 10_000 });
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

  await dialogSaveButton(page).click();
  await page.getByRole("heading", { name: "Creación de Reserva" }).waitFor({ state: "hidden", timeout: 10_000 });
  await dismissReminderDialog(page);
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

async function verifyCapacity(page, addedParticipants) {
  const fullText = await page.locator("main").innerText();
  const minimum = /Usuarios minimos por reserva:\s*(\d+)/i.exec(fullText)?.[1];
  if (minimum && 1 + addedParticipants < Number(minimum)) {
    throw new ValidationError(`Este escenario exige mínimo ${minimum} participantes; se configuraron ${1 + addedParticipants}.`);
  }
}

// Two "Guardar" buttons coexist: the form's final save carries a save icon, while the
// block dialog's plain one stays mounted but hidden in a portal after it is used.
// Telling them apart by icon is stable; telling them apart by DOM order is not.
const SAVE_ICON = '[data-testid="SaveIcon"]';

function finalSaveButton(page) {
  return page.getByRole("button", { name: "Guardar", exact: true }).filter({ has: page.locator(SAVE_ICON) });
}

function dialogSaveButton(page) {
  return page.getByRole("button", { name: "Guardar", exact: true }).filter({ hasNot: page.locator(SAVE_ICON) });
}

async function finalize(page) {
  // SIMON leaves no lasting confirmation in the DOM after the final save: the reservation
  // is created, the URL does not change and any notice it shows is gone seconds later.
  // The network response is the only durable signal, so the outcome is read from it.
  const saved = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().startsWith(BASE_URL),
    { timeout: 30_000 },
  );

  await finalSaveButton(page).click();
  const response = await saved;
  console.log(`Guardado final: HTTP ${response.status()} ${response.url()}`);

  if (!response.ok()) {
    throw new ReservationError(`SIMON rechazó la reserva (HTTP ${response.status()}).`, 502, "SIMON_REJECTED");
  }

  return "Reserva registrada en SIMON.";
}

export async function executeReservation(payload) {
  const credentials = resolveCredentials(payload.credentials);
  const browser = await chromium.launch({ headless: !payload.headed });
  const context = await browser.newContext({ locale: "es-CO", timezoneId: "America/Bogota" });
  const page = await context.newPage();
  let step = "login";

  try {
    console.log(payload.requestId ? `[${payload.requestId}] Iniciando sesión en SIMON…` : "Iniciando sesión en SIMON…");
    await login(page, credentials);
    console.log(`Buscando escenario: ${payload.scenario}`);
    step = "open-scenario";
    await openScenario(page, payload.scenario);
    step = "choose-division";
    await chooseAutocomplete(page, "Selecciona la división a reservar", payload.division);

    step = "inspect-blocks";
    const blocks = await inspectRequestedBlocks(page, payload);
    await verifyCapacity(page, payload.participants.length);

    if (!payload.confirm) {
      return {
        ok: true,
        message: `Disponible: ${payload.date}, ${blocks.map((block) => block.range).join(", ")}.`,
        data: {
          available: true,
          reserved: false,
          blocks,
        },
      };
    }

    // SIMON refuses a second block booked with the same participant documents, so a
    // multi-block range has to be split into one request per block and per account.
    if (blocks.length !== 1) {
      throw new ValidationError(
        `SIMON solo permite reservar un bloque por cuenta y conjunto de cédulas. El rango ${payload.start}-${payload.end} cubre ${blocks.length} bloques (${blocks
          .map((block) => block.range)
          .join(", ")}); envía un request por bloque.`,
      );
    }

    console.log("Confirmación explícita recibida. Creando reserva…");
    step = "configure-block";
    await configureBlock(page, payload.date, blocks[0], payload.participants);
    step = "finalize";
    const message = await finalize(page);

    return {
      ok: true,
      message,
      data: {
        available: true,
        reserved: true,
        blocks,
      },
    };
  } catch (error) {
    await captureDebugSnapshot(page, step, [credentials.password, credentials.documentNumber]);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

export function parseCliPayload(argv) {
  const args = parseArgs(argv);
  if (args.help) return { help: true };
  requiredOptions(args);

  return {
    scenario: args.scenario,
    division: args.division,
    date: args.date,
    start: args.start,
    end: args.end,
    participants: args.participants,
    confirm: args.confirm,
    headed: args.headed,
  };
}
