import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { palette, fonts, springs, glows } from "../theme";

export interface MapPoint {
  /** Название точки (страна/город) */
  label: string;
  /** Координаты в % от области карты (0–100) */
  x: number;
  y: number;
  /** Это «домашняя» точка (откуда дуга) */
  origin?: boolean;
}

export interface MapEuropeProps {
  /** Точки серверов */
  points?: MapPoint[];
  /** Рисовать дуги от origin-точки к остальным */
  showArcs?: boolean;
  /** Цвет акцента */
  accentColor?: "cyan" | "amber";
  /** Начало анимации (кадр) */
  startFrom?: number;
}

const DEFAULT_POINTS: MapPoint[] = [
  { label: "Нидерланды", x: 30, y: 38 },
  { label: "Польша", x: 52, y: 36 },
  { label: "Латвия", x: 58, y: 24 },
  { label: "Москва", x: 78, y: 28, origin: true },
];

/**
 * MapEurope — стилизованная карта Европы с точками серверов.
 *
 * Анимация:
 * - Контур-сетка карты fade-in
 * - Точки появляются по очереди (stagger), pulse-ring
 * - Дуги draw-on от origin к точкам
 * - Подписи fade-in рядом с точками
 *
 * Не геометрически точная карта — стилизованная сетка + точки координат.
 */
export const MapEurope: React.FC<MapEuropeProps> = ({
  points = DEFAULT_POINTS,
  showArcs = true,
  accentColor = "cyan",
  startFrom = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const f = Math.max(0, frame - startFrom);

  const accent = accentColor === "cyan" ? palette.accentCyan : palette.accentAmber;

  // Область карты (центр кадра, ~60% ширины)
  const mapW = width * 0.6;
  const mapH = height * 0.6;
  const mapX = (width - mapW) / 2;
  const mapY = (height - mapH) / 2;

  const toPx = (p: MapPoint) => ({
    x: mapX + (p.x / 100) * mapW,
    y: mapY + (p.y / 100) * mapH,
  });

  const origin = points.find((p) => p.origin);

  // Контур-сетка fade
  const gridOpacity = interpolate(f, [0, 14], [0, 0.25], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Сетка-линии (декоративная «карта»)
  const gridLines: React.ReactNode[] = [];
  for (let i = 1; i < 8; i++) {
    gridLines.push(
      <line
        key={`v${i}`}
        x1={mapX + (i / 8) * mapW}
        y1={mapY}
        x2={mapX + (i / 8) * mapW}
        y2={mapY + mapH}
        stroke={accent}
        strokeWidth={1}
      />
    );
  }
  for (let i = 1; i < 6; i++) {
    gridLines.push(
      <line
        key={`h${i}`}
        x1={mapX}
        y1={mapY + (i / 6) * mapH}
        x2={mapX + mapW}
        y2={mapY + (i / 6) * mapH}
        stroke={accent}
        strokeWidth={1}
      />
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      <svg width={width} height={height} style={{ position: "absolute" }}>
        {/* Декоративная сетка */}
        <g opacity={gridOpacity}>{gridLines}</g>

        {/* Рамка области карты */}
        <rect
          x={mapX}
          y={mapY}
          width={mapW}
          height={mapH}
          fill="none"
          stroke={`${accent}44`}
          strokeWidth={2}
          rx={12}
          opacity={gridOpacity * 4}
        />

        {/* Дуги от origin к точкам */}
        {showArcs &&
          origin &&
          points
            .filter((p) => !p.origin)
            .map((p, i) => {
              const o = toPx(origin);
              const t = toPx(p);
              const arcAppear = 18 + i * 6;
              const arcProgress = interpolate(
                f,
                [arcAppear, arcAppear + 14],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              );
              // Квадратичная кривая с подъёмом
              const midX = (o.x + t.x) / 2;
              const midY = Math.min(o.y, t.y) - 80;
              const pathLen = Math.hypot(t.x - o.x, t.y - o.y) * 1.4;
              return (
                <path
                  key={`arc${i}`}
                  d={`M ${o.x} ${o.y} Q ${midX} ${midY} ${t.x} ${t.y}`}
                  fill="none"
                  stroke={accent}
                  strokeWidth={2}
                  strokeDasharray={pathLen}
                  strokeDashoffset={pathLen * (1 - arcProgress)}
                  opacity={0.7}
                  style={{ filter: `drop-shadow(0 0 4px ${accent}88)` }}
                />
              );
            })}

        {/* Точки */}
        {points.map((p, i) => {
          const pos = toPx(p);
          const appearAt = i * 6;
          const ptSpring = spring({
            frame: f - appearAt,
            fps,
            config: springs.snappy,
            durationInFrames: 14,
          });
          const ptScale = interpolate(ptSpring, [0, 1], [0, 1]);
          const ptColor = p.origin ? palette.accentAmber : accent;

          // Pulse-ring
          const ringPhase = ((f - appearAt) / fps) % 1.5;
          const ringScale = 1 + ringPhase * 2.5;
          const ringOpacity = ptSpring > 0.5 ? Math.max(0, 0.5 - ringPhase * 0.35) : 0;

          return (
            <g key={`pt${i}`}>
              {/* Pulse-кольцо */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={8 * ringScale}
                fill="none"
                stroke={ptColor}
                strokeWidth={2}
                opacity={ringOpacity}
              />
              {/* Точка */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={8 * ptScale}
                fill={ptColor}
                style={{ filter: `drop-shadow(0 0 8px ${ptColor})` }}
              />
            </g>
          );
        })}
      </svg>

      {/* Подписи точек */}
      {points.map((p, i) => {
        const pos = toPx(p);
        const appearAt = i * 6 + 4;
        const labelOpacity = interpolate(
          f,
          [appearAt, appearAt + 10],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );
        const ptColor = p.origin ? palette.accentAmber : accent;
        return (
          <div
            key={`lbl${i}`}
            style={{
              position: "absolute",
              left: pos.x + 16,
              top: pos.y - 14,
              opacity: labelOpacity,
              fontFamily: fonts.mono,
              fontSize: 22,
              fontWeight: 500,
              color: palette.textHi,
              backgroundColor: `${palette.bgPanel}CC`,
              border: `1px solid ${ptColor}66`,
              borderRadius: 6,
              padding: "4px 12px",
              whiteSpace: "nowrap",
              ...glows.textGlow(ptColor),
            }}
          >
            {p.label}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
