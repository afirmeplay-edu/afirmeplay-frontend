import assert from "node:assert/strict";
import test from "node:test";
import { formatTurmasAgrupadas, formatTurmasFromRefs } from "./formatTurmasAgrupadas.ts";

test("lista vazia", () => {
  assert.equal(formatTurmasAgrupadas([]), "");
  assert.equal(formatTurmasAgrupadas(["", "   "]), "");
});

test("todos os nomes únicos", () => {
  assert.equal(formatTurmasAgrupadas(["9º ANO", "6º ANO", "8º ANO"]), "6º ANO, 8º ANO, 9º ANO");
});

test("todos iguais", () => {
  assert.equal(formatTurmasAgrupadas(["8º ANO", "8º ANO", "8º ANO"]), "3 do 8º ANO");
});

test("mistura únicos e repetidos na ordem da série", () => {
  assert.equal(
    formatTurmasAgrupadas(["6º ANO", "8º ANO", "8º ANO", "8º ANO", "9º ANO", "9º ANO"]),
    "6º ANO, 3 do 8º ANO, 2 do 9º ANO"
  );
});

test("espaços e caixa diferente usam a grafia da primeira ocorrência", () => {
  assert.equal(formatTurmasAgrupadas(["  8º ANO  ", "8º ano", "8º Ano"]), "3 do 8º ANO");
});

test("sem número, ordena em ordem alfabética depois das séries numéricas", () => {
  assert.equal(formatTurmasAgrupadas(["Turma B", "6º ANO", "Turma A"]), "6º ANO, Turma A, Turma B");
});

test("class_id repetido não conta duas vezes antes do agrupamento por nome", () => {
  assert.equal(
    formatTurmasFromRefs([
      { id: "c1", name: "8º ANO" },
      { id: "c1", name: "8º ANO" },
      { id: "c2", name: "8º ANO" },
      { id: "c3", name: "6º ANO" },
    ]),
    "6º ANO, 2 do 8º ANO"
  );
});
