import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { palette, fonts, springs, glows, panelStyle } from "../theme";

export interface IconItem {
  /** Иконка/эмодзи */
  icon: string;
  /** Подпись под иконкой (печатается typewriter) */
  label: string;
}

export interface IconRowProps {
  /** Список иконок */
  items?: IconItem[];
  /** Цвет акцента */
  accentColor?: "cyan" | "amber" | "success";
  /** Начало анимации (кадр) */
  startFrom?: number;
  /** Позиция по вертикали: center | bottom */
  position?: "center" | "bottom";
}

const DEFAULT_ITEMS: IconItem[] = [
  { icon: "🛡", label: "Firewall" },
  { icon: "🔄", label: "Автовосстановление" },
  { icon: "🔑", label: "Защита ключей" },
];

/**
 * IconRow — ряд иконок со stagger-появлением и typewriter-подписями.
 *
 * Анимация:
 * - Иконки выезжают по очереди (stagger spring снизу)
 * - Подписи печатаются по буквам (typewriter)
 * - Лёгкий glow на акцентном цвете
 *
 * Для перечислений: «firewall, защита, backup».
 */
export const IconRow: React.FC<IconRowProps> = ({
  items = DEFAULT_ITEMS,
  accentColor = "cyan",
  startFrom = 0,
  position = "center",
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const f = Math.max(0, frame - startFrom);

  const accent =
    accentColor === "cyan"
      ? palette.accentCyan
      : accentColor === "amber"
      ? palette.accentAmber
      : palette.success;

  // Fade-out
  const fadeOut = interpolate(
    f,
    [durationInFrames - 12, durationInFrames - 3],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const verticalStyle: React.CSSProperties =
    position === "bottom"
      ? { bottom: "12%", top: "auto" }
      : { top: 0, bottom: 0, alignItems: "center" };

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          ...verticalStyle,
          opacity: fadeOut,
        }}
      >
        <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
          {items.map((item, i) => {
            const appearAt = i * 8;
            const itemSpring = spring({
              frame: f - appearAt,
              fps,
              config: springs.default,
              durationInFrames: 18,
            });
            const translateY = interpolate(itemSpring, [0, 1], [50, 0]);
            const opacity = interpolate(itemSpring, [0, 1], [0, 1]);
            const scale = interpolate(itemSpring, [0, 1], [0.7, 1]);

            // Typewriter подписи — начинается после появления иконки
            const typeStart = appearAt + 12;
            const charsShown = Math.max(
              0,
              Math.floor((f - typeStart) / 1.5)
            );
            const shownLabel = item.label.slice(0, charsShown);
            // Курсор мигает пока печатает
            const isTyping = charsShown < item.label.length && f > typeStart;
            const cursor = isTyping && Math.floor(f / 8) % 2 === 0 ? "_" : "";

            return (
              <div
                key={i}
                style={{
                  opacity,
                  transform: `translateY(${translateY}px)`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 16,
                  width: 220,
                }}
              >
                {/* Иконка в круге-панели */}
                <div
                  style={{
                    ...panelStyle,
                    width: 96,
                    height: 96,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 44,
                    transform: `scale(${scale})`,
                    borderColor: `${accent}66`,
                    ...glows.cyan(itemSpring * 0.6),
                  }}
                >
                  {item.icon}
                </div>

                {/* Typewriter-подпись */}
                <div
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 22,
                    fontWeight: 500,
                    color: palette.textHi,
                    textAlign: "center",
                    lineHeight: 1.3,
                    minHeight: 30,
                  }}
                >
                  {shownLabel}
                  <span style={{ color: accent }}>{cursor}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
