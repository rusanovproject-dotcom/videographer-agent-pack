import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { palette, fonts, springs, glows, panelStyle } from "../theme";

export interface LowerThirdProps {
  /** Основной текст (имя, действие) */
  label: string;
  /** Второстепенный текст (должность, описание) */
  sublabel?: string;
  /** Иконка или эмодзи (опционально) */
  icon?: string;
  /** Показывать галочку «готово» в конце */
  showCheck?: boolean;
  /** Начало анимации (кадр) */
  startFrom?: number;
  /** Цвет акцента */
  accentColor?: "cyan" | "amber" | "success";
}

/**
 * LowerThird — нижняя плашка-титр.
 *
 * Анимация:
 * - Slide-in справа (панель)
 * - Иконка появляется первой (fade-in)
 * - Текст typewriter-like (opacity stagger)
 * - Draw-on галочка в конце (если showCheck)
 */
export const LowerThird: React.FC<LowerThirdProps> = ({
  label,
  sublabel,
  icon = "✅",
  showCheck = true,
  startFrom = 0,
  accentColor = "cyan",
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

  // Slide-in справа
  const slideSpring = spring({
    frame: f,
    fps,
    config: springs.default,
    durationInFrames: 20,
  });
  const translateX = interpolate(slideSpring, [0, 1], [400, 0]);
  const panelOpacity = interpolate(slideSpring, [0, 1], [0, 1]);

  // Иконка fade
  const iconOpacity = interpolate(f, [4, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Текст fade
  const labelOpacity = interpolate(f, [8, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const sublabelOpacity = interpolate(f, [14, 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Галочка draw-on — появляется в последнюю треть
  const checkProgress = showCheck
    ? interpolate(f, [durationInFrames * 0.6, durationInFrames * 0.8], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  // Fade-out последние 10 кадров
  const fadeOut = interpolate(
    f,
    [durationInFrames - 14, durationInFrames - 4],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      <div
        style={{
          position: "absolute",
          left: "5%",
          bottom: "8%",
          transform: `translateX(${translateX}px)`,
          opacity: panelOpacity * fadeOut,
        }}
      >
        <div
          style={{
            ...panelStyle,
            display: "flex",
            alignItems: "center",
            gap: 18,
            paddingTop: 16,
            paddingBottom: 16,
            paddingLeft: 20,
            paddingRight: 32,
            borderColor: `${accent}66`,
            minWidth: 360,
          }}
        >
          {/* Вертикальная линия-акцент */}
          <div
            style={{
              width: 3,
              alignSelf: "stretch",
              backgroundColor: accent,
              borderRadius: 2,
              flexShrink: 0,
            }}
          />

          {/* Иконка */}
          <div
            style={{
              opacity: iconOpacity,
              fontSize: 28,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            {icon}
          </div>

          {/* Текст */}
          <div style={{ flex: 1 }}>
            <div
              style={{
                opacity: labelOpacity,
                fontFamily: fonts.body,
                fontSize: 26,
                fontWeight: 700,
                color: palette.textHi,
                lineHeight: 1.2,
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </div>
            {sublabel && (
              <div
                style={{
                  opacity: sublabelOpacity,
                  fontFamily: fonts.body,
                  fontSize: 18,
                  fontWeight: 400,
                  color: palette.textMid,
                  marginTop: 4,
                  whiteSpace: "nowrap",
                }}
              >
                {sublabel}
              </div>
            )}
          </div>

          {/* Draw-on галочка */}
          {showCheck && checkProgress > 0 && (
            <div
              style={{
                opacity: checkProgress,
                fontFamily: fonts.mono,
                fontSize: 22,
                color: palette.success,
                flexShrink: 0,
                ...glows.textGlow(palette.success),
              }}
            >
              ✓
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
