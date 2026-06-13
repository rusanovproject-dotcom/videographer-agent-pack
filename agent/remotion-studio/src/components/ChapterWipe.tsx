import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { palette, fonts, springs, glows } from "../theme";

export interface ChapterWipeProps {
  /** Номер главы */
  chapterNumber?: number;
  /** Заголовок главы */
  title: string;
  /** Подзаголовок (опционально) */
  subtitle?: string;
  /** Цвет акцента */
  accentColor?: "cyan" | "amber";
  /** Начало анимации (кадр) */
  startFrom?: number;
}

/**
 * ChapterWipe — переход между главами.
 *
 * Анимация:
 * - Светящаяся линия-сканер cyan проходит слева-направо
 * - За сканером проявляется затемнение + заголовок главы
 * - Текст fade-in по центру (номер главы + название)
 * - Сканер уходит вправо, затемнение и текст fade-out
 *
 * Прозрачный фон под оверлей — затемнение полупрозрачное, не перекрывает футаж целиком.
 */
export const ChapterWipe: React.FC<ChapterWipeProps> = ({
  chapterNumber,
  title,
  subtitle,
  accentColor = "cyan",
  startFrom = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width } = useVideoConfig();
  const f = Math.max(0, frame - startFrom);

  const accent = accentColor === "cyan" ? palette.accentCyan : palette.accentAmber;

  // Фазы: сканер входит (0–25%) → текст держится (25–70%) → сканер уходит (70–100%)
  const enterEnd = durationInFrames * 0.28;
  const holdEnd = durationInFrames * 0.72;

  // Позиция сканера: слева (-5%) → за центр → вправо (105%)
  let scannerX: number;
  if (f < enterEnd) {
    // Входит до центра
    scannerX = interpolate(f, [0, enterEnd], [-0.05, 0.5], {
      extrapolateRight: "clamp",
    });
  } else if (f < holdEnd) {
    // Держится около центра-право (слегка дрейфует)
    scannerX = interpolate(f, [enterEnd, holdEnd], [0.5, 0.55]);
  } else {
    // Уходит вправо
    scannerX = interpolate(f, [holdEnd, durationInFrames], [0.55, 1.08], {
      extrapolateRight: "clamp",
    });
  }

  // Затемнение-подложка: появляется когда сканер прошёл центр, уходит в конце
  const overlayOpacity =
    f < holdEnd
      ? interpolate(f, [4, enterEnd], [0, 0.55], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : interpolate(f, [holdEnd, durationInFrames - 4], [0.55, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

  // Текст
  const textSpring = spring({
    frame: f - enterEnd * 0.6,
    fps,
    config: springs.default,
    durationInFrames: 18,
  });
  const textOpacityIn = interpolate(textSpring, [0, 1], [0, 1]);
  const textOpacityOut =
    f > holdEnd
      ? interpolate(f, [holdEnd, durationInFrames - 6], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;
  const textOpacity = textOpacityIn * textOpacityOut;
  const textX = interpolate(textSpring, [0, 1], [-30, 0]);

  // Glow пульсация сканера
  const scannerGlow = 0.7 + 0.3 * Math.sin((f / fps) * Math.PI * 2 * 2);

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      {/* Затемнение-подложка */}
      <AbsoluteFill
        style={{
          backgroundColor: palette.bgDeep,
          opacity: overlayOpacity,
        }}
      />

      {/* Текст главы */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          paddingLeft: "10%",
        }}
      >
        <div
          style={{
            opacity: textOpacity,
            transform: `translateX(${textX}px)`,
          }}
        >
          {chapterNumber !== undefined && (
            <div
              style={{
                fontFamily: fonts.mono,
                fontSize: 22,
                color: accent,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                marginBottom: 12,
                ...glows.textGlow(accent),
              }}
            >
              Глава {chapterNumber}
            </div>
          )}
          <div
            style={{
              fontFamily: fonts.heading,
              fontSize: 72,
              fontWeight: 800,
              color: palette.textHi,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              ...glows.textGlow(palette.textHi),
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                fontFamily: fonts.body,
                fontSize: 28,
                fontWeight: 500,
                color: palette.textMid,
                marginTop: 16,
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
      </AbsoluteFill>

      {/* Сканер-линия */}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: `${scannerX * 100}%`,
          width: 4,
          backgroundColor: accent,
          boxShadow: `0 0 ${20 * scannerGlow}px ${8 * scannerGlow}px ${accent}AA,
                      0 0 ${48 * scannerGlow}px ${16 * scannerGlow}px ${accent}55`,
        }}
      />
      {/* Мягкий шлейф-градиент слева от сканера */}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: `${scannerX * 100}%`,
          background: `linear-gradient(90deg, transparent 0%, ${accent}11 80%, ${accent}33 100%)`,
          opacity: overlayOpacity > 0 ? 1 : 0,
        }}
      />
    </AbsoluteFill>
  );
};
