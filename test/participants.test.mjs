import test from "node:test";
import assert from "node:assert/strict";
import { parseParticipantCsv, selectParticipantDocuments } from "../src/participants.mjs";

test("lee la primera columna, ignora encabezado y elimina duplicados", () => {
  assert.deepEqual(
    parseParticipantCsv('\ncedula,nombre\n"1001","Ana"\n1002,Carlos\n1001,Duplicado\n'),
    ["1001", "1002"],
  );
});

test("selecciona del CSV solo el mínimo adicional y excluye al titular", () => {
  assert.deepEqual(
    selectParticipantDocuments({
      candidates: ["1000", "1001", "1002", "1003"],
      explicit: [],
      ownerDocument: "1000",
      minimum: 3,
      maximum: 6,
    }),
    ["1001", "1002"],
  );
});

test("valida que el CSV alcance el mínimo", () => {
  assert.throws(
    () => selectParticipantDocuments({
      candidates: ["1001"],
      explicit: [],
      ownerDocument: "1000",
      minimum: 4,
      maximum: 6,
    }),
    /se necesitan 3/,
  );
});

test("los participantes explícitos reemplazan al CSV", () => {
  assert.deepEqual(
    selectParticipantDocuments({
      candidates: ["2001", "2002"],
      explicit: ["3001", "3002"],
      ownerDocument: "1000",
      minimum: 3,
      maximum: 4,
    }),
    ["3001", "3002"],
  );
});
