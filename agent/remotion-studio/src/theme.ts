/**
 * Terminal Noir — визуальная тема Remotion-студии видеографа.
 * Палитра, шрифты, spring-пресеты, glow-стили.
 */

// ─── Палитра ────────────────────────────────────────────────────────────────
export const palette = {
  bgDeep: "#0A0E14",       // почти чёрный тёплый — фон всего
  bgPanel: "#131A24",      // панели, плашки, карточки
  accentCyan: "#2DD4BF",   // основной неон — линии, рамки, прогресс
  accentAmber: "#FFB020",  // вторичный — совпадает с AmneziaVPN «Подключено»
  textHi: "#F0F4F8",       // заголовки, основной текст
  textMid: "#8B98A8",      // подписи, второстепенное
  success: "#34D399",      // галочки, «работает», успех
  danger: "#FB7185",       // ошибки, timeout, предупреждения
} as const;

// ─── Шрифты ─────────────────────────────────────────────────────────────────
// Загружаются через @remotion/google-fonts (см. fonts.ts) — гарантированный
// шрифт при рендере, не системный fallback. Здесь — реэкспорт fontFamily-строк.
import { fontFamilies } from "./fonts";

export const fonts = {
  heading: fontFamilies.heading,  // Unbounded — заголовки / title cards
  mono: fontFamilies.mono,        // JetBrains Mono — технические / kinetic
  body: fontFamilies.body,        // Inter — подписи / lower thirds
} as const;

// ─── Spring-пресеты ──────────────────────────────────────────────────────────
// stiffness 120, damping 14 — мягкий «подскок» без дрожания
export const springs = {
  default: { stiffness: 120, damping: 14, mass: 1 },
  snappy: { stiffness: 180, damping: 16, mass: 1 },
  slow: { stiffness: 80, damping: 20, mass: 1 },
} as const;

// ─── Длительности (в кадрах при 30 fps) ─────────────────────────────────────
export const durations = {
  titleCard: 90,        // 3 сек
  lowerThird: 120,      // 4 сек
  progressStepper: 300, // 10 сек (сквозной)
  countUpTimer: 210,    // 7 сек
  kineticText: 90,      // 3 сек
  quoteCard: 120,       // 4 сек
  chapterWipe: 75,      // 2.5 сек
  ctaScreen: 150,       // 5 сек
  callout: 90,          // 3 сек
  errorBadge: 24,       // 0.8 сек — вспышка
  mapEurope: 150,       // 5 сек
  iconRow: 120,         // 4 сек
  fadeIn: 10,           // 0.33 сек
  fadeOut: 8,           // 0.27 сек
  drawOn: 12,           // 0.4 сек
  glowPulse: 36,        // 1.2 сек (один цикл)
} as const;

// ─── Glow-стили ──────────────────────────────────────────────────────────────
export const glows = {
  cyan: (intensity: number = 1) => ({
    boxShadow: `0 0 ${8 * intensity}px ${4 * intensity}px ${palette.accentCyan}55,
                0 0 ${24 * intensity}px ${8 * intensity}px ${palette.accentCyan}33`,
  }),
  amber: (intensity: number = 1) => ({
    boxShadow: `0 0 ${8 * intensity}px ${4 * intensity}px ${palette.accentAmber}55,
                0 0 ${24 * intensity}px ${8 * intensity}px ${palette.accentAmber}33`,
  }),
  success: (intensity: number = 1) => ({
    boxShadow: `0 0 ${8 * intensity}px ${4 * intensity}px ${palette.success}55`,
  }),
  textGlow: (color: string = palette.accentCyan) => ({
    textShadow: `0 0 12px ${color}CC, 0 0 24px ${color}66`,
  }),
} as const;

// ─── Базовые стили панели ────────────────────────────────────────────────────
export const panelStyle = {
  backgroundColor: `${palette.bgPanel}EE`,  // небольшая прозрачность
  border: `1px solid ${palette.accentCyan}44`,
  borderRadius: 8,
  backdropFilter: "blur(8px)",
} as const;

// ─── Размеры композиций ──────────────────────────────────────────────────────
export const compositionSizes = {
  // стандартный YouTube 16:9
  hd: { width: 1920, height: 1080 },
  // shorts/reels 9:16
  vertical: { width: 1080, height: 1920 },
} as const;

export const FPS = 30;
