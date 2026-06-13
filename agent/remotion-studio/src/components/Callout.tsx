import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { palette, fonts, springs } from "../theme";

export interface CalloutProps {
  /** Координаты подсвечиваемого элемента в % от кадра (0–100) */
  targetX: number;
  targetY: number;
  /** Размер рамки в % от кадра */
  targetWidth: number;
  targetHeight: number;
  /** Подпись возле стрелки (опционально) */
  label?: string;
  /** Откуда летит стрелка: top | bottom | left | right */
  arrowFrom?: "top" | "bottom" | "left" | "right";
  /** Цвет акцента */
  accentColor?: "amber" | "cyan";
  /** Начало анимации (кадр) */
  startFrom?: number;
}

/**
 * Callout — стрелка-указатель + пульсирующая рамка.
 *
 * Анимация:
 * - Рамка-обводка draw-on (stroke растёт) вокруг элемента
 * - Стрелка draw-on указывает на элемент
 * - Рамка pulse (glow дышит)
 * - Подпись fade-in
 *
 * Подсветка поля ввода / кнопки / области экрана. Координаты в % от кадра.
 */
export const Callout: React.FC<CalloutProps> = ({
  targetX,
  targetY,
  targetWidth,
  targetHeight,
  label,
  arrowFrom = "bottom",
  accentColor = "amber",
  startFrom = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const f = Math.max(0, frame - startFrom);

  const accent = accentColor === "amber" ? palette.accentAmber : palette.accentCyan;

  // Рамка draw-on — через stroke-dashoffset SVG rect
  const rectPx = {
    x: (targetX / 100) * width,
    y: (targetY / 100) * height,
    w: (targetWidth / 100) * width,
    h: (targetHeight / 100) * height,
  };
  const perimeter = 2 * (rectPx.w + rectPx.h);
  const drawProgress = interpolate(f, [2, 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Pulse рамки
  const pulse = 0.5 + 0.5 * Math.sin((f / fps) * Math.PI * 2 * 1.2);

  // Стрелка spring
  const arrowSpring = spring({
    frame: f - 8,
    fps,
    config: springs.snappy,
    durationInFrames: 16,
  });
  const arrowProgress = interpolate(arrowSpring, [0, 1], [0, 1]);

  // Подпись
  const labelOpacity = interpolate(f, [16, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Fade-out
  const fadeOut = interpolate(
    f,
    [durationInFrames - 12, durationInFrames - 3],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Геометрия стрелки — летит к ближайшей грани рамки
  const cx = rectPx.x + rectPx.w / 2;
  const cy = rectPx.y + rectPx.h / 2;
  const arrowLen = 120;
  let ax1: number, ay1: number, ax2: number, ay2: number;
  switch (arrowFrom) {
    case "top":
      ax1 = cx; ay1 = rectPx.y - arrowLen - 10; ax2 = cx; ay2 = rectPx.y - 10;
      break;
    case "left":
      ax1 = rectPx.x - arrowLen - 10; ay1 = cy; ax2 = rectPx.x - 10; ay2 = cy;
      break;
    case "right":
      ax1 = rectPx.x + rectPx.w + arrowLen + 10; ay1 = cy; ax2 = rectPx.x + rectPx.w + 10; ay2 = cy;
      break;
    case "bottom":
    default:
      ax1 = cx; ay1 = rectPx.y + rectPx.h + arrowLen + 10; ax2 = cx; ay2 = rectPx.y + rectPx.h + 10;
      break;
  }
  // Текущий конец стрелки (анимируется)
  const curX = ax1 + (ax2 - ax1) * arrowProgress;
  const curY = ay1 + (ay2 - ay1) * arrowProgress;

  // Подпись возле хвоста стрелки
  const labelPos = { x: ax1, y: ay1 };

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent", opacity: fadeOut }}>
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        {/* Рамка-обводка draw-on */}
        <rect
          x={rectPx.x}
          y={rectPx.y}
          width={rectPx.w}
          height={rectPx.h}
          rx={8}
          fill="none"
          stroke={accent}
          strokeWidth={3}
          strokeDasharray={perimeter}
          strokeDashoffset={perimeter * (1 - drawProgress)}
          style={{
            filter: `drop-shadow(0 0 ${10 * pulse}px ${accent})`,
          }}
        />

        {/* Стрелка-линия */}
        {arrowProgress > 0 && (
          <>
            <line
              x1={ax1}
              y1={ay1}
              x2={curX}
              y2={curY}
              stroke={accent}
              strokeWidth={4}
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 6px ${accent}AA)` }}
            />
            {/* Наконечник */}
            {arrowProgress > 0.85 && (
              <polygon
                points={getArrowHead(ax2, ay2, arrowFrom)}
                fill={accent}
                style={{ filter: `drop-shadow(0 0 6px ${accent}AA)` }}
              />
            )}
          </>
        )}
      </svg>

      {/* Подпись */}
      {label && (
        <div
          style={{
            position: "absolute",
            left: labelPos.x,
            top: labelPos.y,
            transform: "translate(-50%, -130%)",
            opacity: labelOpacity,
            fontFamily: fonts.body,
            fontSize: 26,
            fontWeight: 700,
            color: palette.textHi,
            backgroundColor: `${palette.bgPanel}EE`,
            border: `1px solid ${accent}66`,
            borderRadius: 8,
            padding: "8px 16px",
            whiteSpace: "nowrap",
            boxShadow: `0 0 16px ${accent}44`,
          }}
        >
          {label}
        </div>
      )}
    </AbsoluteFill>
  );
};

// Наконечник стрелки (треугольник) в зависимости от направления
function getArrowHead(
  x: number,
  y: number,
  from: "top" | "bottom" | "left" | "right"
): string {
  const s = 12;
  switch (from) {
    case "top":    // указывает вниз
      return `${x},${y + s} ${x - s},${y - s} ${x + s},${y - s}`;
    case "bottom": // указывает вверх
      return `${x},${y - s} ${x - s},${y + s} ${x + s},${y + s}`;
    case "left":   // указывает вправо
      return `${x + s},${y} ${x - s},${y - s} ${x - s},${y + s}`;
    case "right":  // указывает влево
      return `${x - s},${y} ${x + s},${y - s} ${x + s},${y + s}`;
  }
}
