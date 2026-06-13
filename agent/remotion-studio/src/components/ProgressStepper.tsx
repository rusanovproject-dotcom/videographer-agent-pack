import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { palette, fonts, springs, glows, panelStyle } from "../theme";

export interface StepItem {
  label: string;
  sublabel?: string;
}

export interface ProgressStepperProps {
  /** Список шагов */
  steps: StepItem[];
  /** Индекс активного шага (0-based) */
  activeStep: number;
  /** Начало анимации (кадр) */
  startFrom?: number;
  /** Позиция: left | right */
  position?: "left" | "right";
}

/**
 * ProgressStepper — сквозной степпер процесса сбоку кадра.
 *
 * Анимация:
 * - Slide-in слева/справа при появлении
 * - Подсветка активного шага pulse (cyan glow)
 * - Галочки на пройденных шагах
 * - Pulse-анимация активного шага
 */
export const ProgressStepper: React.FC<ProgressStepperProps> = ({
  steps,
  activeStep,
  startFrom = 0,
  position = "left",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = Math.max(0, frame - startFrom);

  // Slide-in
  const slideSpring = spring({
    frame: f,
    fps,
    config: springs.default,
    durationInFrames: 22,
  });
  const translateX = position === "left"
    ? interpolate(slideSpring, [0, 1], [-280, 0])
    : interpolate(slideSpring, [0, 1], [280, 0]);
  const containerOpacity = interpolate(slideSpring, [0, 1], [0, 1]);

  // Pulse для активного шага — синусоида
  const pulseScale = 1 + 0.04 * Math.sin((f / fps) * Math.PI * 2 * 1.2);
  const pulseGlow = 0.5 + 0.5 * Math.sin((f / fps) * Math.PI * 2 * 0.9);

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      <div
        style={{
          position: "absolute",
          top: "50%",
          ...(position === "left" ? { left: "2%" } : { right: "2%" }),
          transform: `translateX(${translateX}px) translateY(-50%)`,
          opacity: containerOpacity,
        }}
      >
        <div
          style={{
            ...panelStyle,
            padding: "20px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 0,
            minWidth: 220,
          }}
        >
          {/* Заголовок */}
          <div
            style={{
              fontFamily: fonts.mono,
              fontSize: 11,
              color: palette.accentCyan,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              marginBottom: 14,
              ...glows.textGlow(palette.accentCyan),
            }}
          >
            ПРОГРЕСС
          </div>

          {steps.map((step, index) => {
            const isDone = index < activeStep;
            const isActive = index === activeStep;
            const isPending = index > activeStep;

            // Stagger появления шагов
            const stepOpacity = interpolate(
              f,
              [index * 3, index * 3 + 12],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );

            return (
              <div
                key={index}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  opacity: stepOpacity,
                  marginBottom: index < steps.length - 1 ? 0 : 0,
                  position: "relative",
                }}
              >
                {/* Вертикальная линия-коннектор */}
                {index < steps.length - 1 && (
                  <div
                    style={{
                      position: "absolute",
                      left: 13,
                      top: 28,
                      width: 2,
                      height: 28,
                      backgroundColor: isDone
                        ? palette.accentCyan
                        : `${palette.textMid}44`,
                    }}
                  />
                )}

                {/* Индикатор шага */}
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 14,
                    border: isDone
                      ? `2px solid ${palette.success}`
                      : isActive
                      ? `2px solid ${palette.accentCyan}`
                      : `2px solid ${palette.textMid}66`,
                    backgroundColor: isDone
                      ? `${palette.success}22`
                      : isActive
                      ? `${palette.accentCyan}22`
                      : "transparent",
                    transform: isActive ? `scale(${pulseScale})` : "scale(1)",
                    ...(isActive ? glows.cyan(pulseGlow) : {}),
                    transition: "border-color 0.3s, background-color 0.3s",
                  }}
                >
                  {isDone ? (
                    <span
                      style={{
                        fontFamily: fonts.mono,
                        fontSize: 12,
                        color: palette.success,
                        lineHeight: 1,
                      }}
                    >
                      ✓
                    </span>
                  ) : (
                    <span
                      style={{
                        fontFamily: fonts.mono,
                        fontSize: 11,
                        color: isActive ? palette.accentCyan : `${palette.textMid}88`,
                        lineHeight: 1,
                      }}
                    >
                      {index + 1}
                    </span>
                  )}
                </div>

                {/* Текст шага */}
                <div style={{ paddingTop: 4 }}>
                  <div
                    style={{
                      fontFamily: fonts.body,
                      fontSize: 15,
                      fontWeight: isActive ? 700 : 500,
                      color: isDone
                        ? palette.textMid
                        : isActive
                        ? palette.textHi
                        : `${palette.textMid}88`,
                      lineHeight: 1.2,
                      ...(isActive ? glows.textGlow(palette.accentCyan) : {}),
                    }}
                  >
                    {step.label}
                  </div>
                  {step.sublabel && (
                    <div
                      style={{
                        fontFamily: fonts.mono,
                        fontSize: 11,
                        color: `${palette.textMid}88`,
                        marginTop: 2,
                      }}
                    >
                      {step.sublabel}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
