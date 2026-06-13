#!/usr/bin/env node
/**
 * srt-to-captions.mjs — Конвертер SRT → JSON-чанков для ShortsCaptions (Hormozi-стиль)
 *
 * Использование:
 *   node srt-to-captions.mjs input.srt output.json
 *   node srt-to-captions.mjs input.srt output.json --max-words=4
 *   node srt-to-captions.mjs input.srt output.json --offset=5.5  # сдвиг таймингов (сек)
 *
 * Что делает:
 *   1. Парсит SRT (формат "00:00:05,000 --> 00:00:10,200\nтекст")
 *   2. Режет фразы на чанки по 2-5 слов (дефолт max-words=4)
 *   3. Раздаёт тайминги равномерно внутри каждого SRT-блока
 *   4. Эвристика highlight: самое длинное / редкое / первое слово в хуке
 *   5. Выдаёт JSON формата ShortsCaptionsProps.lines
 *
 * Формат вывода:
 *   { "lines": [ { "start": 0.3, "end": 2.5, "text": "...", "highlight": "слово" } ] }
 */

import { readFileSync, writeFileSync } from "fs";

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Использование: node srt-to-captions.mjs <input.srt> <output.json> [--max-words=N] [--offset=S]");
  process.exit(1);
}

const inputPath = args[0];
const outputPath = args[1];

// Параметры
const maxWordsArg = args.find((a) => a.startsWith("--max-words="));
const offsetArg = args.find((a) => a.startsWith("--offset="));
const MAX_WORDS = maxWordsArg ? parseInt(maxWordsArg.split("=")[1]) : 4;
const OFFSET_SEC = offsetArg ? parseFloat(offsetArg.split("=")[1]) : 0;

// ─── Парсинг SRT ────────────────────────────────────────────────────────────

function parseSrtTime(ts) {
  // "00:01:23,456" → секунды
  const [hms, ms] = ts.split(",");
  const [h, m, s] = hms.split(":").map(Number);
  return h * 3600 + m * 60 + s + parseInt(ms) / 1000;
}

function parseSrt(content) {
  const blocks = content.trim().split(/\n\n+/);
  const entries = [];
  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 3) continue;
    // строка 0: номер; строка 1: тайминг; строки 2+: текст
    const timingLine = lines[1];
    if (!timingLine.includes("-->")) continue;
    const [startTs, endTs] = timingLine.split(" --> ").map((t) => t.trim());
    const text = lines.slice(2).join(" ").trim();
    if (!text) continue;
    entries.push({
      start: parseSrtTime(startTs),
      end: parseSrtTime(endTs),
      text,
    });
  }
  return entries;
}

// ─── Чанкинг ────────────────────────────────────────────────────────────────

function chunkText(text, maxWords) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(" "));
  }
  return chunks;
}

// ─── Highlight-эвристика ─────────────────────────────────────────────────────

// Стоп-слова (не выделяем их)
const STOP_WORDS = new Set([
  "и", "в", "на", "с", "по", "за", "от", "до", "из", "к", "у", "о", "об",
  "но", "или", "а", "же", "бы", "ли", "не", "что", "это", "как", "так",
  "для", "при", "через", "под", "над", "про", "без", "после", "то", "ты", "я",
  "мы", "вы", "он", "она", "они", "его", "её", "их", "мой", "твой", "наш",
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "have", "has",
  "это", "вот", "уже", "всё", "ещё", "просто", "только",
]);

// Слова которые хорошо выглядят выделенными (технические, эмоциональные, результат)
const BOOST_WORDS = new Set([
  "vpn", "dns", "ошибка", "работает", "готово", "настроен", "подключено",
  "быстро", "просто", "легко", "бесплатно", "бесплат", "таймаут",
  "скрыт", "защищён", "анонимно", "сделано", "установлен",
  "латвия", "швеция", "россия", "сервер", "протокол", "amnezia",
]);

function pickHighlight(text) {
  const words = text
    .toLowerCase()
    .replace(/[.,!?;:«»"()—]/g, "")
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return undefined;

  // 1. Boost-слово если есть
  for (const w of words) {
    if (BOOST_WORDS.has(w)) return w;
  }

  // 2. Самое длинное слово не из стоп-списка
  const candidates = words.filter((w) => !STOP_WORDS.has(w) && w.length > 3);
  if (candidates.length === 0) return words[0]; // fallback

  candidates.sort((a, b) => b.length - a.length);
  return candidates[0];
}

// ─── Основная логика ─────────────────────────────────────────────────────────

const srtContent = readFileSync(inputPath, "utf-8");
const srtEntries = parseSrt(srtContent);

const lines = [];

for (const entry of srtEntries) {
  const chunks = chunkText(entry.text, MAX_WORDS);
  if (chunks.length === 0) continue;

  const blockDuration = entry.end - entry.start;
  const chunkDuration = blockDuration / chunks.length;

  for (let i = 0; i < chunks.length; i++) {
    const chunkStart = entry.start + i * chunkDuration + OFFSET_SEC;
    const chunkEnd = entry.start + (i + 1) * chunkDuration + OFFSET_SEC;
    const highlight = pickHighlight(chunks[i]);

    lines.push({
      start: Math.round(chunkStart * 100) / 100,
      end: Math.round(chunkEnd * 100) / 100,
      text: chunks[i].toUpperCase(), // Hormozi-стиль: капслок
      highlight: highlight || undefined,
    });
  }
}

const output = { lines };
writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");

console.log(`Готово: ${lines.length} строк капшенов → ${outputPath}`);
console.log(`  SRT-блоков: ${srtEntries.length} | max-words: ${MAX_WORDS} | offset: ${OFFSET_SEC}с`);

// Пример первых 3 строк
if (lines.length > 0) {
  console.log("\nПервые строки:");
  lines.slice(0, 3).forEach((l) => {
    console.log(`  [${l.start}–${l.end}] "${l.text}" highlight="${l.highlight}"`);
  });
}
