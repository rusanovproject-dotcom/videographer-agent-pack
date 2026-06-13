import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { palette, fonts, springs, glows } from "../theme";

export interface CaptionLine {
  /** Начало показа строки — в секундах от начала шортса */
  start: number;
  /** Конец показа строки — в секундах */
  end: number;
  /** Текст строки (1-5 слов, как Hormozi-капшен) */
  text: string;
  /** Слово(а) для amber-выделения, через пробел; matching по lower-case без пунктуации */
  highlight?: string;
}

export interface ShortsCaptionsProps {
  /** Все строки трека. Показывается та, в чей интервал попадает текущее время. */
  lines: CaptionLine[];
  /** Положение по вертикали блока капшенов */
  position?: "center" | "lower";
}

/**
 * ShortsCaptions — Hormozi-style караоке-капшены для вертикальных шортсов (9:16).
 *
 * Одна композиция = весь трек капшенов одного шортса (alpha-оверлей на всю длину).
 * Активная строка по текущему времени: крупные слова, pop-in spring снизу,
 * выделенные слова — amber с glow, остальные — белые.
 * Terminal Noir: тёмная подложка-«плашка» под текстом для читаемости поверх любого футажа.
 */
export const ShortsCaptions: React.FC<ShortsCaptionsProps> = ({
  lines,
  position = "lower",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const active = lines.find((l) => t >= l.start && t < l.end);
  if (!active) return null;

  const localFrame = frame - Math.round(active.start * fps);
  const words = active.text.split(" ");
  const highlightWords = active.highlight
    ? active.highlight.toLowerCase().split(" ")
    : [];

  // Появление всей плашки
  const blockSpring = spring({
    frame: localFrame,
    fps,
    config: springs.snappy,
    durationInFrames: 10,
  });
  const blockY = interpolate(blockSpring, [0, 1], [60, 0]);
  const blockOpacity = interpolate(blockSpring, [0, 1], [0, 1]);

  const vAlign: React.CSSProperties =
    position === "center"
      ? { top: 0, bottom: 0, justifyContent: "center" }
      : { bottom: "16%", justifyContent: "flex-end" };

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          ...vAlign,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "0 56px",
        }}
      >
        <div
          style={{
            transform: `translateY(${blockY}px)`,
            opacity: blockOpacity,
            backgroundColor: `${palette.bgDeep}D9`,
            border: `2px solid ${palette.accentCyan}55`,
            borderRadius: 24,
            padding: "26px 34px",
            maxWidth: "92%",
            ...glows.textGlow(palette.bgDeep),
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "6px 16px",
              justifyContent: "center",
              alignItems: "baseline",
            }}
          >
            {words.map((word, i) => {
              const clean = word
                .replace(/[.,!?;:«»"()—]/g, "")
                .toLowerCase();
              const isHi = highlightWords.includes(clean);

              // Каждое слово влетает по очереди (караоке-эффект)
              const appearAt = i * 2;
              const wSpring = spring({
                frame: localFrame - appearAt,
                fps,
                config: springs.snappy,
                durationInFrames: 8,
              });
              const wy = interpolate(wSpring, [0, 1], [22, 0]);
              const wo = interpolate(wSpring, [0, 1], [0, 1]);

              return (
                <span
                  key={i}
                  style={{
                    display: "inline-block",
                    transform: `translateY(${wy}px)`,
                    opacity: wo,
                    fontFamily: isHi ? fonts.heading : fonts.body,
                    fontSize: isHi ? 76 : 60,
                    fontWeight: isHi ? 800 : 700,
                    color: isHi ? palette.accentAmber : palette.textHi,
                    lineHeight: 1.15,
                    letterSpacing: "-0.01em",
                    textTransform: "uppercase",
                    ...(isHi
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
      </div>
    </AbsoluteFill>
  );
};
