/**
 * fonts.ts — централизованная загрузка шрифтов через @remotion/google-fonts.
 *
 * Гарантирует, что рендер использует именно нужный шрифт (а не системный fallback).
 * loadFont() вызывается один раз на импорт модуля; компоненты берут fontFamily отсюда.
 *
 * Все шрифты — с подмножествами latin + cyrillic (кириллица в title cards и подписях).
 */
import { loadFont as loadUnbounded } from "@remotion/google-fonts/Unbounded";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadJetBrainsMono } from "@remotion/google-fonts/JetBrainsMono";

// Заголовки / title cards — жирный гротеск
const unbounded = loadUnbounded("normal", {
  weights: ["400", "700", "800"],
  subsets: ["latin", "cyrillic"],
});

// Подписи / lower thirds / body
const inter = loadInter("normal", {
  weights: ["400", "500", "700"],
  subsets: ["latin", "cyrillic"],
});

// Технические / kinetic / таймеры — моноширинный
const jetBrainsMono = loadJetBrainsMono("normal", {
  weights: ["400", "500", "700"],
  subsets: ["latin", "cyrillic"],
});

/**
 * fontFamilies — реальные font-family строки, гарантированно загруженные.
 * Использовать вместо CSS-строк с system fallback.
 */
export const fontFamilies = {
  heading: unbounded.fontFamily,    // Unbounded
  body: inter.fontFamily,           // Inter
  mono: jetBrainsMono.fontFamily,   // JetBrains Mono
} as const;
