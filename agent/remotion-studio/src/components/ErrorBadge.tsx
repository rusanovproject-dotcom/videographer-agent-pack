import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { palette, fonts, glows, panelStyle } from "../theme";

export interface ErrorBadgeProps {
  /** Текст бейджа */
  text?: string;
  /** Иконка */
  icon?: string;
  /** Позиция: center | topRight | bottomCenter */
  position?: "center" | "topRight" | "bottomCenter";
  /** Цвет: danger (по умолчанию) | amber */
  variant?: "danger" | "amber";
  /** Начало анимации (кадр) */
  startFrom?: number;
}

/**
 * ErrorBadge — вспышка-бейдж ошибки.
 *
 * Анимация (короткая, ~0.8 сек):
 * - Быстрый scale-in (вспышка)
 * - Shake по X (тряска)
 * - Fade-out
 *
 * Для момента ошибки на экране (timeout и т.п.).
 */
export const ErrorBadge: React.FC<ErrorBadgeProps> = ({
  text = "⚠ TIMEOUT",
  icon,
  position = "center",
  variant = "danger",
  startFrom = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = Math.max(0, frame - startFrom);

  const color = variant === "danger" ? palette.danger : palette.accentAmber;

  // ~24 кадра = 0.8 сек при 30 fps
  const totalFrames = Math.round(fps * 0.8);

  // Scale-in вспышка (первые 5 кадров)
  const scaleIn = interpolate(f, [0, 3, 6], [0.4, 1.12, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Opacity: быстро вход, держится, fade-out
  const opacity = interpolate(
    f,
    [0, 3, totalFrames - 6, totalFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Shake — затухающая тряска по X
  const shakeDecay = Math.max(0, 1 - f / (totalFrames * 0.6));
  const shakeX = Math.sin(f * 2.4) * 14 * shakeDecay;

  // Glow pulse
  const glowIntensity = 0.6 + 0.4 * Math.abs(Math.sin(f * 0.8));

  const positionStyle: React.CSSProperties = (() => {
    switch (position) {
      case "topRight":     return { top: "12%", right: "8%" };
      case "bottomCenter": return { bottom: "18%", left: 0, right: 0, justifyContent: "center" };
      case "center":
      default:             return { top: 0, bottom: 0, left: 0, right: 0, justifyContent: "center", alignItems: "center" };
    }
  })();

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      <div
        style={{
          position: "absolute",
          display: "flex",
          ...positionStyle,
        }}
      >
        <div
          style={{
            ...panelStyle,
            opacity,
            transform: `scale(${scaleIn}) translateX(${shakeX}px)`,
            padding: "16px 32px",
            display: "flex",
            alignItems: "center",
            gap: 14,
            backgroundColor: `${color}1A`,
            border: `2px solid ${color}`,
            boxShadow: `0 0 ${18 * glowIntensity}px ${6 * glowIntensity}px ${color}66`,
          }}
        >
          {icon && (
            <span style={{ fontSize: 32, lineHeight: 1 }}>{icon}</span>
          )}
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 34,
              fontWeight: 700,
              color,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              ...glows.textGlow(color),
            }}
          >
            {text}
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
