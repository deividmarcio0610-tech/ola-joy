import test from "node:test";
import assert from "node:assert/strict";

import { APP_VERSION, bucketFromId, compareVersions } from "../src/lib/version.ts";
import { MAX_IMAGE_MB, MAX_VIDEO_MB, sanitizeText, validateFile } from "../src/lib/validation.ts";
import { RECORD_MODULES, isRecordModule, toRecordModule } from "../src/lib/record-modules.ts";

// ── version.ts ───────────────────────────────────────────────────────────────

test("compareVersions ordena semver corretamente", () => {
  assert.equal(compareVersions("2.0.0", "1.9.9"), 1);
  assert.equal(compareVersions("1.9.9", "2.0.0"), -1);
  assert.equal(compareVersions("2.0.0", "2.0.0"), 0);

  // Comparação numérica, não lexicográfica: "10" > "9".
  assert.equal(compareVersions("1.10.0", "1.9.0"), 1);
  assert.equal(compareVersions("2.0.10", "2.0.9"), 1);

  // Tamanhos diferentes: posições ausentes valem 0.
  assert.equal(compareVersions("2.0", "2.0.0"), 0);
  assert.equal(compareVersions("2.0.1", "2.0"), 1);
});

test("compareVersions não quebra com entrada malformada", () => {
  // parseInt(...) || 0 protege contra lixo vindo do banco: o segmento inválido vira 0.
  assert.equal(compareVersions("", "0.0.0"), 0);
  assert.equal(compareVersions("abc", "abc"), 0);

  // Cuidado: "v2.0.0" NÃO é entendido como 2.0.0 — o "v" faz o primeiro segmento virar 0,
  // então a versão é lida como 0.0.0 e fica ABAIXO de 2.0.0. Se a Central Administrativa
  // publicar uma versão com prefixo "v", o rollout não vai considerá-la mais nova.
  assert.equal(compareVersions("v2.0.0", "2.0.0"), -1);
  assert.equal(compareVersions("v2.0.0", "0.0.0"), 0);
});

test("APP_VERSION é um semver válido", () => {
  assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/);
});

test("bucketFromId é estável e fica entre 0 e 99", () => {
  const id = "8f14e45f-ea6a-4b1f-9c3d-1a2b3c4d5e6f";
  const b = bucketFromId(id);

  assert.ok(Number.isInteger(b));
  assert.ok(b >= 0 && b < 100, `bucket fora da faixa: ${b}`);
  assert.equal(bucketFromId(id), b, "mesmo id precisa dar sempre o mesmo bucket");
  assert.equal(bucketFromId(""), 0);

  // O rollout gradual depende de distribuição razoável entre os buckets.
  const buckets = new Set(Array.from({ length: 300 }, (_, i) => bucketFromId(`usuario-${i}-uuid`)));
  assert.ok(buckets.size > 50, `distribuição concentrada demais: ${buckets.size} buckets`);
});

// ── validation.ts ────────────────────────────────────────────────────────────

function fakeFile(type: string, sizeBytes: number): File {
  return { type, size: sizeBytes, name: "x" } as unknown as File;
}

test("validateFile aceita os tipos suportados dentro do limite", () => {
  for (const t of ["image/jpeg", "image/png", "image/webp", "image/heic"]) {
    assert.deepEqual(validateFile(fakeFile(t, 1024), "image"), { ok: true }, t);
  }
  for (const t of ["video/mp4", "video/webm", "video/quicktime"]) {
    assert.deepEqual(validateFile(fakeFile(t, 1024), "video"), { ok: true }, t);
  }
});

test("validateFile rejeita tipo errado com mensagem útil", () => {
  const r = validateFile(fakeFile("application/pdf", 1024), "image");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /Tipo não permitido/);

  // Vídeo enviado no campo de imagem precisa ser barrado.
  assert.equal(validateFile(fakeFile("video/mp4", 1024), "image").ok, false);

  // Arquivo sem MIME não pode passar como válido.
  const semTipo = validateFile(fakeFile("", 1024), "image");
  assert.equal(semTipo.ok, false);
  if (!semTipo.ok) assert.match(semTipo.error, /desconhecido/);
});

test("validateFile respeita o limite de tamanho de cada tipo", () => {
  const mb = (n: number) => n * 1024 * 1024;

  assert.equal(validateFile(fakeFile("image/jpeg", mb(MAX_IMAGE_MB)), "image").ok, true);
  assert.equal(validateFile(fakeFile("image/jpeg", mb(MAX_IMAGE_MB) + 1), "image").ok, false);

  // O limite de vídeo é maior — uma imagem de 20MB é barrada, um vídeo não.
  assert.equal(validateFile(fakeFile("image/jpeg", mb(20)), "image").ok, false);
  assert.equal(validateFile(fakeFile("video/mp4", mb(20)), "video").ok, true);
  assert.equal(validateFile(fakeFile("video/mp4", mb(MAX_VIDEO_MB) + 1), "video").ok, false);
});

test("sanitizeText remove HTML antes de ir para IA ou banco", () => {
  assert.equal(sanitizeText("<script>alert(1)</script>vazamento"), "alert(1)vazamento");
  assert.equal(sanitizeText("<b>EPI</b> ausente"), "EPI ausente");
  assert.equal(sanitizeText("<img src=x onerror=y>"), "");
});

test("sanitizeText remove caracteres de controle", () => {
  // É o motivo do eslint-disable no-control-regex em validation.ts.
  assert.equal(sanitizeText("risco\u0000oculto"), "riscooculto", "NUL");
  assert.equal(sanitizeText("linha\u001fquebrada"), "linhaquebrada", "unit separator");
  assert.equal(sanitizeText("del\u007fetado"), "deletado", "DEL");
  assert.equal(sanitizeText("a\u0008\u000b\u000cb"), "ab");

  // Texto legítimo com acento e travessão precisa sobreviver intacto.
  assert.equal(
    sanitizeText("Área de britagem — nível crítico"),
    "Área de britagem — nível crítico",
  );
});

test("sanitizeText corta no limite e apara as bordas", () => {
  assert.equal(sanitizeText("   com espaco   "), "com espaco");
  assert.equal(sanitizeText("a".repeat(5000)).length, 2000, "limite padrão");
  assert.equal(sanitizeText("a".repeat(50), 10).length, 10, "limite explícito");
  assert.equal(sanitizeText(""), "");
});

// ── record-modules.ts ────────────────────────────────────────────────────────

test("toRecordModule só produz valores do enum record_module do banco", () => {
  // Gravar um valor fora do enum faz o Postgres recusar o INSERT inteiro — foi assim
  // que o módulo Inspeção ficou sem conseguir salvar, mandando "inspecao".
  for (const key of RECORD_MODULES) {
    const mapped = toRecordModule(key);
    assert.ok(
      isRecordModule(mapped),
      `toRecordModule("${key}") devolveu "${mapped}", que não existe em record_module`,
    );
  }
});

test("supervisão é gravada como N3 e os demais módulos passam intactos", () => {
  assert.equal(toRecordModule("supervision"), "n3");
  for (const key of RECORD_MODULES.filter((m) => m !== "supervision")) {
    assert.equal(toRecordModule(key), key);
  }
});

test("isRecordModule rejeita o valor legado que quebrava o INSERT", () => {
  assert.equal(isRecordModule("inspecao"), false);
  assert.equal(isRecordModule("inspection"), true);
});
