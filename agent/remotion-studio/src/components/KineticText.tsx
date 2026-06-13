import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { palette, fonts, springs, glows } from "../theme";

export interface KineticTextProps {
  /** Текст фразы — слова влетают по одному */
  text: string;
  /** Слово(а) для выделения крупно amber. Можно индекс или само слово. */
  highlight?: string;
  /** Кадров на появление каждого слова (stagger) */
  wordStagger?: number;
  /** Начало анимации (кадр) */
  startFrom?: number;
  /** Положение по вертикали: top | center | bottom */
  position?: "top" | "center" | "bottom";
}

/**
 * KineticText — кинетическая типографика.
 *
 * Анимация:
 * - Слова появляются по одному (stagger), spring снизу + fade-in
 * - Выделенное слово — крупнее, amber, с glow
 * - Лёгкий fade-out в конце композиции
 *
 * Для выделения фраз из речи поверх футажа.
 */
export const KineticText: React.FC<KineticTextProps> = ({
  text,
  highlight,
  wordStagger = 4,
  startFrom = 0,
  position = "center",
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const f = Math.max(0, frame - startFrom);

  const words = text.split(" ");
  const highlightWords = highlight ? highlight.toLowerCase().split(" ") : [];

  // Fade-out последние кадры
  const fadeOut = interpolate(
    f,
    [durationInFrames - 12, durationInFrames - 3],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const verticalAlign: React.CSSProperties =
    position === "top"
      ? { top: "14%", alignItems: "flex-start" }
      : position === "bottom"
      ? { bottom: "16%", alignItems: "flex-end" }
      : { top: 0, bottom: 0, alignItems: "center" };

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      <div
        style={{
          position: "absolute",
          left: "8%",
          right: "8%",
          ...verticalAlign,
          display: "flex",
          justifyContent: "center",
          opacity: fadeOut,
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0 18px",
            justifyContent: "center",
            alignItems: "baseline",
            maxWidth: "85%",
          }}
        >
          {words.map((word, i) => {
            const cleanWord = word.replace(/[.,!?;:«»"]/g, "").toLowerCase();
            const isHighlight = highlightWords.includes(cleanWord);

            const appearAt = i * wordStagger;
            const wordSpring = spring({
              frame: f - appearAt,
              fps,
              config: springs.snappy,
              durationInFrames: 14,
            });
            const translateY = interpolate(wordSpring, [0, 1], [40, 0]);
            const opacity = interpolate(wordSpring, [0, 1], [0, 1]);

            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  transform: `translateY(${translateY}px)`,
                  opacity,
                  fontFamily: isHighlight ? fonts.heading : fonts.body,
                  fontSize: isHighlight ? 78 : 48,
                  fontWeight: isHighlight ? 800 : 600,
                  color: isHighlight ? palette.accentAmber : palette.textHi,
                  lineHeight: 1.25,
                  letterSpacing: isHighlight ? "-0.02em" : "0",
                  ...(isHighlight
                    ? glows.textGlow(palette.accentAmber)
                    : glows.textGlow(palette.bgDeep)),
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
