import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { palette, fonts, springs, glows, panelStyle } from "../theme";

export interface CountUpTimerProps {
  /** Максимальное значение таймера (секунды) */
  maxSeconds?: number;
  /** Показывать «⏱» иконку */
  showIcon?: boolean;
  /** Начало анимации (кадр) */
  startFrom?: number;
  /** Фиксированное значение (для стоп-кадра в финале) */
  frozenAt?: number;
  /** Позиция: topRight | topLeft | bottomRight | bottomLeft */
  position?: "topRight" | "topLeft" | "bottomRight" | "bottomLeft";
  /** Подпись под таймером */
  label?: string;
  /** Цвет акцента */
  accentColor?: "cyan" | "amber";
}

/**
 * CountUpTimer — счётчик времени ⏱ count-up.
 *
 * Анимация:
 * - Blur-in при появлении (filter blur от 12px до 0)
 * - Цифры считают вверх синхронно с кадрами
 * - На ускоренных участках крутится быстрее (задаётся через frozenAt)
 * - Glow на акцентном цвете
 * - Может «замереть» на финальном значении (frozenAt)
 */
export const CountUpTimer: React.FC<CountUpTimerProps> = ({
  maxSeconds = 420, // 7 минут
  showIcon = true,
  startFrom = 0,
  frozenAt,
  position = "topRight",
  label,
  accentColor = "cyan",
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const f = Math.max(0, frame - startFrom);

  const accent = accentColor === "cyan" ? palette.accentCyan : palette.accentAmber;

  // Blur-in появление
  const appearProgress = interpolate(f, [0, 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const blurAmount = interpolate(appearProgress, [0, 1], [12, 0]);
  const opacity = interpolate(appearProgress, [0, 1], [0, 1]);

  // Подсчёт секунд
  const rawSeconds = frozenAt !== undefined
    ? frozenAt
    : Math.min(maxSeconds, (f / fps) * (maxSeconds / (durationInFrames / fps)));

  const totalSec = Math.floor(rawSeconds);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  const timeStr = `${String(minutes).padStart(1, "0")}:${String(seconds).padStart(2, "0")}`;

  // Glow pulse
  const glowIntensity = f > 16
    ? 0.4 + 0.6 * Math.abs(Math.sin((f / fps) * Math.PI * 2 * 0.4))
    : 0;

  // Digit "tick" — небольшой scale при смене секунды
  const secondFraction = rawSeconds - Math.floor(rawSeconds);
  const tickScale = 1 + 0.03 * interpolate(secondFraction, [0, 0.1, 1], [1, 0, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Позиция
  const positionStyle: React.CSSProperties = (() => {
    switch (position) {
      case "topLeft":    return { top: "4%",  left: "3%" };
      case "bottomRight":return { bottom: "4%", right: "3%" };
      case "bottomLeft": return { bottom: "4%", left: "3%" };
      case "topRight":
      default:           return { top: "4%",  right: "3%" };
    }
  })();

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      <div
        style={{
          position: "absolute",
          ...positionStyle,
          opacity,
          filter: `blur(${blurAmount}px)`,
        }}
      >
        <div
          style={{
            ...panelStyle,
            padding: "10px 20px 10px 16px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            borderColor: `${accent}55`,
          }}
        >
          {/* Иконка */}
          {showIcon && (
            <span
              style={{
                fontSize: 22,
                lineHeight: 1,
                filter: `drop-shadow(0 0 6px ${accent}88)`,
              }}
            >
              ⏱
            </span>
          )}

          {/* Время */}
          <div
            style={{
              fontFamily: fonts.mono,
              fontSize: 34,
              fontWeight: 700,
              color: accent,
              letterSpacing: "0.04em",
              lineHeight: 1,
              transform: `scale(${tickScale})`,
              transformOrigin: "center",
              ...glows.textGlow(accent),
              filter: `drop-shadow(0 0 ${8 * glowIntensity}px ${accent}99)`,
            }}
          >
            {timeStr}
          </div>

          {/* Подпись */}
          {label && (
            <div
              style={{
                fontFamily: fonts.mono,
                fontSize: 12,
                color: palette.textMid,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginLeft: 4,
                alignSelf: "flex-end",
                marginBottom: 2,
              }}
            >
              {label}
            </div>
          )}
        </div>

        {/* Прогресс-бар под таймером */}
        <div
          style={{
            height: 2,
            backgroundColor: `${accent}22`,
            borderRadius: 1,
            marginTop: 3,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${(rawSeconds / maxSeconds) * 100}%`,
              backgroundColor: accent,
              borderRadius: 1,
              boxShadow: `0 0 6px ${accent}AA`,
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
