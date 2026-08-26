import fs from "node:fs";

function firstCsvColumn(line) {
  const value = line.replace(/^\uFEFF/, "").trimStart();
  if (!value.startsWith('"')) return value.split(/[,;]/, 1)[0].trim();

  let result = "";
  for (let index = 1; index < value.length; index += 1) {
    if (value[index] !== '"') {
      result += value[index];
      continue;
    }
    if (value[index + 1] === '"') {
      result += '"';
      index += 1;
      continue;
    }
    break;
  }
  return result.trim();
}

export function parseParticipantCsv(content) {
  const documents = [];
  const seen = new Set();
  let firstValue = true;

  for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
    if (!rawLine.trim()) continue;
    const document = firstCsvColumn(rawLine);

    if (firstValue && !/^\d+$/.test(document)) {
      firstValue = false;
      continue;
    }
    firstValue = false;
    if (!/^\d+$/.test(document)) {
      throw new Error(`Cédula inválida en la línea ${index + 1} del CSV.`);
    }
    if (!seen.has(document)) {
      seen.add(document);
      documents.push(document);
    }
  }

  return documents;
}

export function readParticipantCsv(path) {
  if (!fs.existsSync(path)) {
    throw new Error(`No existe el CSV de participantes: ${path}`);
  }
  return parseParticipantCsv(fs.readFileSync(path, "utf8"));
}

export function selectParticipantDocuments({ candidates, explicit, ownerDocument, minimum, maximum }) {
  const requiredAdditional = Math.max(0, minimum - 1);
  const allowedAdditional = Number.isFinite(maximum) ? Math.max(0, maximum - 1) : Number.POSITIVE_INFINITY;
  const source = explicit.length ? explicit : candidates;
  const filtered = [...new Set(source.map(String))].filter((document) => document !== ownerDocument);

  const invalid = filtered.find((document) => !/^\d+$/.test(document));
  if (invalid) throw new Error(`Cédula inválida: ${invalid}`);

  if (explicit.length && filtered.length < requiredAdditional) {
    throw new Error(`La reserva exige ${requiredAdditional} participantes adicionales; se indicaron ${filtered.length}.`);
  }
  if (explicit.length && filtered.length > allowedAdditional) {
    throw new Error(`La reserva admite máximo ${allowedAdditional} participantes adicionales.`);
  }
  if (!explicit.length && filtered.length < requiredAdditional) {
    throw new Error(
      `El CSV solo contiene ${filtered.length} cédulas utilizables y se necesitan ${requiredAdditional} participantes adicionales.`,
    );
  }

  return explicit.length ? filtered : filtered.slice(0, requiredAdditional);
}
