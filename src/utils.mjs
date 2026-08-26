export function parseArgs(argv) {
  const result = { confirm: false, headed: false, participants: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (["--confirm", "--headed", "--help", "--list"].includes(token)) {
      result[token.slice(2)] = true;
      continue;
    }

    if (!token.startsWith("--")) {
      throw new Error(`Argumento inesperado: ${token}`);
    }

    const [inlineKey, inlineValue] = token.slice(2).split("=", 2);
    const value = inlineValue ?? argv[++index];
    if (!value || value.startsWith("--")) {
      throw new Error(`Falta el valor de --${inlineKey}`);
    }

    const key = inlineKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    result[key] = value;
  }

  if (typeof result.participants === "string") {
    result.participants = result.participants
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }

  return result;
}

export function assertIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) {
    throw new Error("--date debe usar el formato YYYY-MM-DD.");
  }

  const date = new Date(`${value}T00:00:00-05:00`);
  if (Number.isNaN(date.valueOf())) {
    throw new Error("--date no contiene una fecha válida.");
  }

  const [year, month, day] = value.split("-").map(Number);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new Error("--date no contiene una fecha válida.");
  }

  return value;
}

export function toTwelveHour(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value ?? "");
  if (!match) throw new Error("Las horas deben usar el formato HH:mm.");

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error(`Hora inválida: ${value}`);

  const suffix = hour >= 12 ? "PM" : "AM";
  const normalizedHour = hour % 12 || 12;
  return `${String(normalizedHour).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export function time24ToMinutes(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value ?? "");
  if (!match) throw new Error("Las horas deben usar el formato HH:mm.");

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error(`Hora inválida: ${value}`);
  return hour * 60 + minute;
}

export function time12ToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})\s+(AM|PM)$/i.exec(value?.trim() ?? "");
  if (!match) throw new Error(`Hora de calendario inválida: ${value}`);

  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return hour * 60 + Number(match[2]);
}

export function parseCalendarBlock(text) {
  const match = /(\d{1,2}:\d{2}\s+[AP]M)\s*-\s*(\d{1,2}:\d{2}\s+[AP]M)/i.exec(text ?? "");
  if (!match) return null;

  return {
    start: time12ToMinutes(match[1]),
    end: time12ToMinutes(match[2]),
    range: `${match[1].toUpperCase()} - ${match[2].toUpperCase()}`,
    available: /Bloque Disponible/i.test(text),
    text,
  };
}

export function blocksCoveringRange(eventTexts, start, end) {
  const requestedStart = time24ToMinutes(start);
  const requestedEnd = time24ToMinutes(end);
  if (requestedEnd <= requestedStart) {
    throw new Error("--end debe ser posterior a --start en el mismo día.");
  }

  const events = eventTexts
    .map(parseCalendarBlock)
    .filter(Boolean)
    .sort((left, right) => left.start - right.start || right.end - left.end);

  const selected = [];
  let cursor = requestedStart;
  while (cursor < requestedEnd) {
    const candidates = events.filter((event) => event.start === cursor && event.end <= requestedEnd);
    const event = candidates[0];
    if (!event) {
      throw new Error(`No existe un bloque que comience a las ${toTwelveHour(minutesToTime24(cursor))}.`);
    }
    selected.push(event);
    cursor = event.end;
  }

  return selected;
}

function minutesToTime24(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function requiredOptions(args) {
  const names = ["scenario", "division", "date", "start", "end"];
  const missing = names.filter((name) => !args[name]);
  if (missing.length) {
    throw new Error(`Faltan opciones obligatorias: ${missing.map((name) => `--${name}`).join(", ")}`);
  }
}
