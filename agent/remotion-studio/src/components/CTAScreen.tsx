import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { palette, fonts, springs, glows, panelStyle } from "../theme";

export interface SocialItem {
  /** Иконка/эмодзи или короткий лейбл платформы */
  icon: string;
  /** Подпись (хэндл/название) */
  label: string;
}

export interface CTAScreenProps {
  /** Крупный заголовок CTA */
  title: string;
  /** Строка-призыв под заголовком */
  callToAction?: string;
  /** Ряд соцсетей */
  socials?: SocialItem[];
  /** Финальное значение таймера (замирает на нём), напр. "7:00" */
  frozenTimer?: string;
  /** Цвет акцента */
  accentColor?: "cyan" | "amber";
  /** Начало анимации (кадр) */
  startFrom?: number;
}

/**
 * CTAScreen — финальный экран-призыв.
 *
 * Анимация:
 * - Таймер замирает на финальном значении (frozenTimer) с glow
 * - Заголовок spring-появление
 * - Ряд соцсетей stagger-появление снизу, иконки pulse
 * - Подложка-затемнение для читаемости
 */
export const CTAScreen: React.FC<CTAScreenProps> = ({
  title,
  callToAction,
  socials = [],
  frozenTimer,
  accentColor = "amber",
  startFrom = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = Math.max(0, frame - startFrom);

  const accent = accentColor === "cyan" ? palette.accentCyan : palette.accentAmber;

  // Подложка
  const overlayOpacity = interpolate(f, [0, 14], [0, 0.7], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Таймер «замирает» — появляется с blur-in и держится с pulse
  const timerSpring = spring({
    frame: f,
    fps,
    config: springs.snappy,
    durationInFrames: 16,
  });
  const timerOpacity = interpolate(timerSpring, [0, 1], [0, 1]);
  const timerScale = interpolate(timerSpring, [0, 1], [1.4, 1]);
  const timerGlow = 0.6 + 0.4 * Math.sin((f / fps) * Math.PI * 2 * 0.6);

  // Заголовок
  const titleSpring = spring({
    frame: f - 6,
    fps,
    config: springs.default,
    durationInFrames: 20,
  });
  const titleY = interpolate(titleSpring, [0, 1], [40, 0]);
  const titleOpacity = interpolate(titleSpring, [0, 1], [0, 1]);

  // CTA-строка
  const ctaOpacity = interpolate(f, [18, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      {/* Подложка-затемнение */}
      <AbsoluteFill
        style={{ backgroundColor: palette.bgDeep, opacity: overlayOpacity }}
      />

      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
          gap: 0,
        }}
      >
        {/* Замёрзший таймер */}
        {frozenTimer && (
          <div
            style={{
              opacity: timerOpacity,
              transform: `scale(${timerScale})`,
              fontFamily: fonts.mono,
              fontSize: 56,
              fontWeight: 700,
              color: accent,
              letterSpacing: "0.05em",
              marginBottom: 24,
              display: "flex",
              alignItems: "center",
              gap: 14,
              filter: `drop-shadow(0 0 ${12 * timerGlow}px ${accent}AA)`,
            }}
          >
            <span style={{ fontSize: 44 }}>⏱</span>
            {frozenTimer}
          </div>
        )}

        {/* Заголовок */}
        <div
          style={{
            opacity: titleOpacity,
            transform: `translateY(${titleY}px)`,
            fontFamily: fonts.heading,
            fontSize: 84,
            fontWeight: 800,
            color: palette.textHi,
            textAlign: "center",
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            maxWidth: "80%",
            ...glows.textGlow(palette.textHi),
          }}
        >
          {title}
        </div>

        {/* CTA-строка */}
        {callToAction && (
          <div
            style={{
              opacity: ctaOpacity,
              fontFamily: fonts.body,
              fontSize: 32,
              fontWeight: 500,
              color: accent,
              marginTop: 24,
              ...glows.textGlow(accent),
            }}
          >
            {callToAction}
          </div>
        )}

        {/* Ряд соцсетей */}
        {socials.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: 20,
              marginTop: 48,
            }}
          >
            {socials.map((s, i) => {
              const appearAt = 24 + i * 5;
              const itemSpring = spring({
                frame: f - appearAt,
                fps,
                config: springs.snappy,
                durationInFrames: 14,
              });
              const itemY = interpolate(itemSpring, [0, 1], [30, 0]);
              const itemOpacity = interpolate(itemSpring, [0, 1], [0, 1]);
              // Pulse иконок
              const iconPulse =
                1 + 0.06 * Math.sin((f / fps) * Math.PI * 2 * 1.5 + i);

              return (
                <div
                  key={i}
                  style={{
                    ...panelStyle,
                    opacity: itemOpacity,
                    transform: `translateY(${itemY}px)`,
                    padding: "14px 22px",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    borderColor: `${accent}44`,
                  }}
                >
                  <span
                    style={{
                      fontSize: 26,
                      transform: `scale(${iconPulse})`,
                      lineHeight: 1,
                    }}
                  >
                    {s.icon}
                  </span>
                  <span
                    style={{
                      fontFamily: fonts.mono,
                      fontSize: 20,
                      color: palette.textHi,
                      letterSpacing: "0.02em",
                    }}
                  >
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
