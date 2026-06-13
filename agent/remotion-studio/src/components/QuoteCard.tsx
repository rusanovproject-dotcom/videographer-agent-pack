import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { palette, fonts, springs, glows, panelStyle } from "../theme";

export interface QuoteCardProps {
  /** Текст цитаты */
  quote: string;
  /** Автор / источник (опционально) */
  author?: string;
  /** Цвет акцента */
  accentColor?: "cyan" | "amber";
  /** Начало анимации (кадр) */
  startFrom?: number;
}

/**
 * QuoteCard — карточка-цитата (вырванная фраза-инсайт).
 *
 * Анимация:
 * - Карточка spring-появление снизу
 * - Глифы кавычек draw-on (scale + rotate)
 * - Текст fade-in по строкам
 * - Подпись автора в конце
 */
export const QuoteCard: React.FC<QuoteCardProps> = ({
  quote,
  author,
  accentColor = "cyan",
  startFrom = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const f = Math.max(0, frame - startFrom);

  const accent = accentColor === "cyan" ? palette.accentCyan : palette.accentAmber;

  // Card spring
  const cardSpring = spring({
    frame: f,
    fps,
    config: springs.default,
    durationInFrames: 22,
  });
  const cardScale = interpolate(cardSpring, [0, 1], [0.88, 1]);
  const cardOpacity = interpolate(cardSpring, [0, 1], [0, 1]);
  const cardY = interpolate(cardSpring, [0, 1], [50, 0]);

  // Quote-mark draw-on (открывающая кавычка)
  const markSpring = spring({
    frame: f - 4,
    fps,
    config: springs.snappy,
    durationInFrames: 16,
  });
  const markScale = interpolate(markSpring, [0, 1], [0, 1]);
  const markRotate = interpolate(markSpring, [0, 1], [-30, 0]);

  // Текст fade
  const quoteOpacity = interpolate(f, [10, 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Автор fade
  const authorOpacity = interpolate(f, [20, 32], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Fade-out
  const fadeOut = interpolate(
    f,
    [durationInFrames - 14, durationInFrames - 4],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Glow pulse
  const glowIntensity = f > 24 ? 0.5 + 0.3 * Math.sin((f / fps) * Math.PI * 2 * 0.5) : 0;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "transparent",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          transform: `scale(${cardScale}) translateY(${cardY}px)`,
          opacity: cardOpacity * fadeOut,
          maxWidth: "62%",
        }}
      >
        <div
          style={{
            ...panelStyle,
            position: "relative",
            padding: "56px 64px 48px 64px",
            borderColor: `${accent}55`,
            ...glows.cyan(glowIntensity),
          }}
        >
          {/* Открывающая кавычка-глиф */}
          <div
            style={{
              position: "absolute",
              top: -28,
              left: 40,
              fontFamily: fonts.heading,
              fontSize: 120,
              lineHeight: 1,
              fontWeight: 800,
              color: accent,
              transform: `scale(${markScale}) rotate(${markRotate}deg)`,
              transformOrigin: "center",
              ...glows.textGlow(accent),
            }}
          >
            «
          </div>

          {/* Текст цитаты */}
          <div
            style={{
              opacity: quoteOpacity,
              fontFamily: fonts.heading,
              fontSize: 44,
              fontWeight: 700,
              color: palette.textHi,
              lineHeight: 1.3,
              letterSpacing: "-0.01em",
              marginTop: 12,
            }}
          >
            {quote}
          </div>

          {/* Линия-акцент + автор */}
          {author && (
            <div
              style={{
                opacity: authorOpacity,
                display: "flex",
                alignItems: "center",
                gap: 16,
                marginTop: 28,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 2,
                  backgroundColor: accent,
                  ...glows.cyan(0.4),
                }}
              />
              <span
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 20,
                  color: palette.textMid,
                  letterSpacing: "0.04em",
                }}
              >
                {author}
              </span>
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
