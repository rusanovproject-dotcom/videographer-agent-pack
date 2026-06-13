#!/usr/bin/env node
/**
 * anchor-overlays.mjs — Word-level якорение Remotion-вставок к транскрипту.
 *
 * Проблема которую решает:
 *   Тайм-коды overlay задавались по плановым секундам EDL.
 *   После hook-prepend + silence_remove + speed_segments реальный тайм-лайн
 *   смещается. Результат: вставка появляется на 23+ сек раньше или позже речи.
 *
 * Решение:
 *   Каждая вставка якорится к ФРАЗЕ транскрипта (anchor_phrase).
 *   Тайм-код вычисляется из Deepgram words финального ролика.
 *
 * Вход:
 *   --anchors <file.json>   Список { component, anchor_phrase, offset_sec }
 *   --transcript <file.json> Deepgram JSON с words[].start/end или SRT-файл (.srt)
 *   --output <file.json>    Итоговый список { component, start_sec, end_sec, anchor_phrase }
 *
 * Пример запуска:
 *   node anchor-overlays.mjs \
 *     --anchors anchors.json \
 *     --transcript transcript.json \
 *     --output overlay-timecodes.json
 *
 * Формат anchors.json:
 * [
 *   {
 *     "component": "MapEurope",
 *     "anchor_phrase": "нидерланды польша",
 *     "duration_sec": 5,
 *     "offset_sec": -0.3,
 *     "props": { "points": [...], "showArcs": true }
 *   }
 * ]
 *
 * Формат transcript.json (Deepgram):
 *   results.channels[0].alternatives[0].words[].{ word, start, end }
 *
 * Формат transcript.srt (fallback):
 *   Стандартный SRT — ищем фразу в субтитрах, берём start тайм-кода.
 */

import { readFileSync, writeFileSync } from "fs";

// ─── Парсинг аргументов ────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : null;
}

const anchorsFile = getArg("--anchors");
const transcriptFile = getArg("--transcript");
const outputFile = getArg("--output") || "overlay-timecodes.json";

if (!anchorsFile || !transcriptFile) {
  console.error("Usage: node anchor-overlays.mjs --anchors <file.json> --transcript <file.json> [--output <file.json>]");
  process.exit(1);
}

// ─── Загрузка данных ───────────────────────────────────────────────────
const anchors = JSON.parse(readFileSync(anchorsFile, "utf-8"));
const transcriptRaw = readFileSync(transcriptFile, "utf-8");

// ─── Парсинг транскрипта ───────────────────────────────────────────────

/**
 * Нормализует строку: нижний регистр, убирает пунктуацию, лишние пробелы.
 */
function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[.,!?;:—–\-«»""''()\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Парсит Deepgram JSON → массив { word, start, end }.
 */
function parseDeepgramWords(json) {
  try {
    const data = JSON.parse(json);
    // Попробуем разные форматы Deepgram ответа
    const words =
      data?.results?.channels?.[0]?.alternatives?.[0]?.words ||
      data?.results?.alternatives?.[0]?.words ||
      data?.channel?.alternatives?.[0]?.words ||
      null;
    if (words && words.length > 0) return words;
    throw new Error("words не найден в JSON");
  } catch (e) {
    return null;
  }
}

/**
 * Парсит SRT → массив { word, start, end } (одно слово = один SRT-блок, start = начало блока).
 * Точность ниже чем Deepgram (блочная, не word-level), но работает как fallback.
 */
function parseSrtToWords(srt) {
  const blocks = srt.trim().split(/\n\s*\n/);
  const result = [];
  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 3) continue;
    const timeLine = lines.find(l => l.includes("-->"));
    if (!timeLine) continue;
    const [startStr, endStr] = timeLine.split("-->").map(s => s.trim());
    const parseTs = (ts) => {
      const [h, m, sec] = ts.split(":");
      const [s, ms] = sec.replace(",", ".").split(".");
      return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + (parseInt(ms || 0)) / 1000;
    };
    const start = parseTs(startStr);
    const end = parseTs(endStr);
    const text = lines.slice(2).join(" ");
    // Каждое слово блока получает start/end всего блока (SRT точность)
    const words = normalize(text).split(" ").filter(Boolean);
    for (const w of words) {
      result.push({ word: w, start, end });
    }
  }
  return result;
}

// Определяем формат и парсим
let words = null;
let transcriptMode = "unknown";

if (transcriptFile.endsWith(".srt")) {
  words = parseSrtToWords(transcriptRaw);
  transcriptMode = "srt";
} else {
  words = parseDeepgramWords(transcriptRaw);
  transcriptMode = "deepgram";
  if (!words) {
    // Возможно это SRT-текст сохранённый как .json — пробуем как SRT
    words = parseSrtToWords(transcriptRaw);
    transcriptMode = "srt-fallback";
  }
}

if (!words || words.length === 0) {
  console.error("Не удалось распарсить транскрипт. Поддерживаются: Deepgram JSON, SRT.");
  process.exit(1);
}

console.log(`Транскрипт: ${transcriptMode}, слов: ${words.length}`);
console.log(`Диапазон: 0 – ${words[words.length-1].end.toFixed(1)} сек`);
console.log();

// ─── Поиск фразы ──────────────────────────────────────────────────────

/**
 * Ищет anchor_phrase в массиве words.
 * Возвращает { start_sec, end_sec, matched_text, confidence } или null.
 *
 * Алгоритм: скользящее окно по размеру фразы, нормализованное сравнение,
 * поиск наилучшего совпадения (Jaccard по словам).
 */
function findPhrase(words, phrase) {
  const phraseWords = normalize(phrase).split(" ").filter(Boolean);
  const n = phraseWords.length;

  let bestMatch = null;
  let bestScore = 0;

  for (let i = 0; i <= words.length - n; i++) {
    const window = words.slice(i, i + n);
    const windowWords = window.map(w => normalize(w.word));

    // Jaccard similarity
    const setPhrase = new Set(phraseWords);
    const setWindow = new Set(windowWords);
    const intersection = [...setPhrase].filter(w => setWindow.has(w)).length;
    const union = new Set([...setPhrase, ...setWindow]).size;
    const score = intersection / union;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        start_sec: window[0].start,
        end_sec: window[window.length - 1].end,
        matched_text: window.map(w => w.word).join(" "),
        confidence: score,
        word_index: i,
      };
    }

    // Точное совпадение — не ищем дальше
    if (score === 1.0) break;
  }

  return bestScore >= 0.5 ? bestMatch : null;
}

// ─── Основной цикл ────────────────────────────────────────────────────

const results = [];
const warnings = [];

console.log("=== ЯКОРЕНИЕ ВСТАВОК ===");
console.log();

for (const anchor of anchors) {
  const {
    component,
    anchor_phrase,
    duration_sec = 5,
    offset_sec = 0,
    props = {},
  } = anchor;

  process.stdout.write(`[${component}] "${anchor_phrase}" → `);

  const match = findPhrase(words, anchor_phrase);

  if (!match) {
    process.stdout.write("НЕ НАЙДЕНО ⚠\n");
    warnings.push(`${component}: фраза "${anchor_phrase}" не найдена в транскрипте`);
    results.push({
      component,
      anchor_phrase,
      start_sec: null,
      end_sec: null,
      confidence: 0,
      matched_text: null,
      status: "NOT_FOUND",
      props,
    });
    continue;
  }

  const rawStart = match.start_sec + offset_sec;
  const start_sec = Math.max(0, rawStart);
  const end_sec = start_sec + duration_sec;

  const confidenceLabel =
    match.confidence === 1.0 ? "точно" :
    match.confidence >= 0.8 ? "хорошо" :
    match.confidence >= 0.5 ? "приблизительно" : "слабо";

  process.stdout.write(
    `${start_sec.toFixed(2)}–${end_sec.toFixed(2)} сек (${confidenceLabel}, ${(match.confidence * 100).toFixed(0)}%)\n`
  );
  if (match.confidence < 1.0) {
    console.log(`         matched: "${match.matched_text}"`);
  }

  results.push({
    component,
    anchor_phrase,
    start_sec,
    end_sec,
    confidence: match.confidence,
    matched_text: match.matched_text,
    status: match.confidence >= 0.8 ? "OK" : "LOW_CONFIDENCE",
    props,
  });
}

// ─── Генерация ffmpeg overlay команды ─────────────────────────────────

console.log();
console.log("=== ffmpeg overlay enable= строки ===");
console.log();
for (const r of results) {
  if (r.start_sec !== null) {
    const conf = r.confidence < 0.8 ? " /* LOW_CONF */" : "";
    console.log(`  # ${r.component}${conf}`);
    console.log(`  enable='between(t,${r.start_sec.toFixed(2)},${r.end_sec.toFixed(2)})'`);
    console.log();
  }
}

// ─── Предупреждения ───────────────────────────────────────────────────

if (warnings.length > 0) {
  console.log("=== ПРЕДУПРЕЖДЕНИЯ ===");
  for (const w of warnings) {
    console.log(`  ⚠ ${w}`);
  }
  console.log();
}

// ─── Сохранение результата ────────────────────────────────────────────

const output = {
  generated_at: new Date().toISOString(),
  transcript_mode: transcriptMode,
  total_words: words.length,
  anchors_total: anchors.length,
  anchors_found: results.filter(r => r.start_sec !== null).length,
  anchors_not_found: results.filter(r => r.start_sec === null).length,
  overlays: results,
};

writeFileSync(outputFile, JSON.stringify(output, null, 2));
console.log(`Результат сохранён: ${outputFile}`);

// Выход с ненулевым кодом если есть проблемы
const notFound = results.filter(r => r.start_sec === null).length;
if (notFound > 0) {
  process.exit(2); // частичный успех — часть фраз не найдена
}
