import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { palette, fonts, springs, glows, panelStyle } from "../theme";

export interface TitleCardProps {
  /** Основной заголовок */
  title: string;
  /** Подзаголовок (опционально) */
  subtitle?: string;
  /** Цвет акцента: cyan | amber */
  accentColor?: "cyan" | "amber";
  /** Начало анимации (кадр) */
  startFrom?: number;
}

/**
 * TitleCard — открывающий title card.
 *
 * Анимация:
 * - Панель-рамка draw-on (stroke-dashoffset)
 * - Заголовок spring снизу
 * - Подзаголовок fade-in с задержкой
 * - Cyan glow на рамке
 *
 * Прозрачный фон — используется как оверлей поверх видео.
 */
export const TitleCard: React.FC<TitleCardProps> = ({
  title,
  subtitle,
  accentColor = "cyan",
  startFrom = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = Math.max(0, frame - startFrom);

  const accent = accentColor === "cyan" ? palette.accentCyan : palette.accentAmber;

  // Spring — панель снизу вверх
  const panelY = spring({
    frame: f,
    fps,
    config: springs.default,
    durationInFrames: 20,
  });

  // Spring — заголовок, чуть позже
  const titleSpring = spring({
    frame: Math.max(0, f - 4),
    fps,
    config: springs.default,
    durationInFrames: 20,
  });

  // Fade — подзаголовок
  const subtitleOpacity = interpolate(f, [10, 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Draw-on — горизонтальная линия под заголовком
  const lineProgress = interpolate(f, [8, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Glow pulse — синусоида после появления
  const glowIntensity =
    f > 25
      ? 0.6 + 0.4 * Math.sin((f / fps) * Math.PI * 2 * 0.8)
      : 0;

  const panelTranslateY = interpolate(panelY, [0, 1], [60, 0]);
  const panelOpacity = interpolate(panelY, [0, 1], [0, 1]);
  const titleTranslateY = interpolate(titleSpring, [0, 1], [30, 0]);
  const titleOpacity = interpolate(titleSpring, [0, 1], [0, 1]);

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      {/* Центрирование по вертикали, ближе к нижней трети */}
      <div
        style={{
          position: "absolute",
          left: "8%",
          right: "8%",
          bottom: "12%",
        }}
      >
        {/* Панель */}
        <div
          style={{
            ...panelStyle,
            transform: `translateY(${panelTranslateY}px)`,
            opacity: panelOpacity,
            padding: "36px 48px 32px 48px",
            borderColor: `${accent}66`,
            ...glows.cyan(glowIntensity),
          }}
        >
          {/* Линия-акцент слева */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: "20%",
              bottom: "20%",
              width: 4,
              backgroundColor: accent,
              borderRadius: 2,
              ...glows.cyan(glowIntensity + 0.4),
            }}
          />

          {/* Заголовок */}
          <div
            style={{
              transform: `translateY(${titleTranslateY}px)`,
              opacity: titleOpacity,
              fontFamily: fonts.heading,
              fontSize: 64,
              fontWeight: 800,
              color: palette.textHi,
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
              marginBottom: subtitle ? 16 : 0,
              ...glows.textGlow(palette.textHi),
            }}
          >
            {title}
          </div>

          {/* Draw-on линия под заголовком */}
          {subtitle && (
            <div
              style={{
                height: 2,
                backgroundColor: accent,
                width: `${lineProgress * 100}%`,
                marginBottom: 16,
                borderRadius: 1,
                transition: "none",
                ...glows.cyan(0.5),
              }}
            />
          )}

          {/* Подзаголовок */}
          {subtitle && (
            <div
              style={{
                opacity: subtitleOpacity,
                fontFamily: fonts.body,
                fontSize: 28,
                fontWeight: 500,
                color: palette.textMid,
                letterSpacing: "0.01em",
              }}
            >
              {subtitle}
            </div>
          )}
        </div>

        {/* Маленький лейбл-акцент в углу */}
        <div
          style={{
            position: "absolute",
            top: -14,
            right: 24,
            opacity: subtitleOpacity,
            fontFamily: fonts.mono,
            fontSize: 13,
            color: accent,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            ...glows.textGlow(accent),
          }}
        >
          ▶ ВИДЕОГРАФ
        </div>
      </div>
    </AbsoluteFill>
  );
};
