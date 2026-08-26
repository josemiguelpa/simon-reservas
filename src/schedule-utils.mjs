const WEEKDAYS = {
  SUN: 0,
  DOM: 0,
  DOMINGO: 0,
  MON: 1,
  LUN: 1,
  LUNES: 1,
  TUE: 2,
  MAR: 2,
  MARTES: 2,
  WED: 3,
  MIE: 3,
  MIERCOLES: 3,
  THU: 4,
  JUE: 4,
  JUEVES: 4,
  FRI: 5,
  VIE: 5,
  VIERNES: 5,
  SAT: 6,
  SAB: 6,
  SABADO: 6,
};

const CANONICAL_WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function withoutAccents(value) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase();
}

export function normalizeWeekday(value) {
  const weekday = WEEKDAYS[withoutAccents(String(value ?? ""))];
  if (weekday === undefined) throw new Error(`Día de la semana inválido: ${value}`);
  return CANONICAL_WEEKDAYS[weekday];
}

export function parseClockTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value ?? "");
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    throw new Error(`Hora inválida: ${value}. Usa HH:mm.`);
  }
  return { hour: Number(match[1]), minute: Number(match[2]), value };
}

export function zonedDateParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    weekday: normalizeWeekday(values.weekday),
    time: `${values.hour}:${values.minute}`,
  };
}

export function nextWeekdayIso(now, timezone, targetWeekday, weeksAhead = 0) {
  const current = zonedDateParts(now, timezone);
  const [year, month, day] = current.date.split("-").map(Number);
  const currentIndex = WEEKDAYS[current.weekday];
  const targetIndex = WEEKDAYS[normalizeWeekday(targetWeekday)];
  const offset = (targetIndex - currentIndex + 7) % 7 + Number(weeksAhead) * 7;
  const result = new Date(Date.UTC(year, month - 1, day + offset));
  return result.toISOString().slice(0, 10);
}

export function validateScheduleTask(task) {
  if (!task?.id) throw new Error("Cada tarea necesita un id.");
  normalizeWeekday(task.run?.weekday);
  parseClockTime(task.run?.time);
  normalizeWeekday(task.reservation?.targetWeekday);
  const start = parseClockTime(task.reservation?.start);
  const end = parseClockTime(task.reservation?.end);
  if (end.hour * 60 + end.minute <= start.hour * 60 + start.minute) {
    throw new Error(`La hora final debe ser posterior a la inicial en la tarea ${task.id}.`);
  }
  if (!task.reservation?.scenario || !task.reservation?.division) {
    throw new Error(`La tarea ${task.id} necesita escenario y división.`);
  }
  const weeksAhead = Number(task.reservation?.weeksAhead ?? 0);
  if (!Number.isInteger(weeksAhead) || weeksAhead < 0) {
    throw new Error(`weeksAhead inválido en la tarea ${task.id}.`);
  }
  return task;
}

export function taskMatchesDate(task, now, timezone) {
  const current = zonedDateParts(now, timezone);
  return current.weekday === normalizeWeekday(task.run.weekday) && current.time === task.run.time;
}
