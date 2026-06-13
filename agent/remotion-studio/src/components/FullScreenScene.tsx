import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { palette, fonts, springs, glows } from "../theme";

// ─── Интерфейс ───────────────────────────────────────────────────────────────

export interface FullScreenSceneProps {
  /** Вариант сцены (5 типов Terminal Noir) */
  variant: "dark-concept" | "terminal-demo" | "schema" | "before-after" | "result-reveal";
  /** Крупный заголовок */
  title: string;
  /** Тело: строка или строки терминала */
  body?: string | string[];
  /** Цвет акцента */
  accentColor?: "cyan" | "amber";
  /** Длительность в секундах (дефолт 6, макс 7 для туториалов) */
  durationSec?: number;
  /** Вход */
  enterTransition?: "fade" | "slide-up" | "wipe";
  /** Выход */
  exitTransition?: "fade" | "slide-down" | "wipe";
  /** Начальный кадр */
  startFrom?: number;
}

// ─── Константы ────────────────────────────────────────────────────────────────

const FADE_FRAMES = 9; // 0.3 сек при 30 fps

// ─── Вспомогательные ──────────────────────────────────────────────────────────

function useTransitions(
  frame: number,
  fps: number,
  totalFrames: number,
  enterType: string,
  exitType: string,
) {
  const enterProgress = interpolate(frame, [0, FADE_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const exitStart = totalFrames - FADE_FRAMES;
  const exitProgress = interpolate(frame, [exitStart, totalFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const opacity =
    enterProgress * (1 - exitProgress);

  const enterY =
    enterType === "slide-up"
      ? interpolate(enterProgress, [0, 1], [80, 0])
      : 0;

  const exitY =
    exitType === "slide-down"
      ? interpolate(exitProgress, [0, 1], [0, 80])
      : 0;

  const wipeClip =
    enterType === "wipe"
      ? interpolate(enterProgress, [0, 1], [0, 100])
      : 100;

  return { opacity, enterY, exitY, wipeClip };
}

// ─── Варианты ─────────────────────────────────────────────────────────────────

/** dark-concept — тёмный фон, анимированный заголовок + тело */
const DarkConceptScene: React.FC<{
  title: string;
  body?: string | string[];
  accent: string;
  frame: number;
  fps: number;
}> = ({ title, body, accent, frame, fps }) => {
  const titleSpring = spring({
    frame: Math.max(0, frame - FADE_FRAMES),
    fps,
    config: springs.default,
    durationInFrames: 18,
  });
  const bodyFade = interpolate(frame, [FADE_FRAMES + 10, FADE_FRAMES + 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const titleY = interpolate(titleSpring, [0, 1], [40, 0]);
  const lines = Array.isArray(body) ? body : body ? [body] : [];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "flex-start",
        width: "100%",
        height: "100%",
        padding: "0 160px",
      }}
    >
      {/* Акцентная линия слева */}
      <div
        style={{
          width: 6,
          height: 80,
          backgroundColor: accent,
          borderRadius: 3,
          marginBottom: 32,
          boxShadow: `0 0 16px 4px ${accent}88`,
          opacity: titleSpring,
        }}
      />

      {/* Заголовок */}
      <div
        style={{
          fontFamily: fonts.heading,
          fontSize: 88,
          fontWeight: 800,
          color: palette.textHi,
          lineHeight: 1.1,
          letterSpacing: "-0.02em",
          marginBottom: 40,
          transform: `translateY(${titleY}px)`,
          opacity: titleSpring,
          ...glows.textGlow(palette.textHi),
        }}
      >
        {title}
      </div>

      {/* Тело */}
      {lines.map((line, i) => (
        <div
          key={i}
          style={{
            fontFamily: fonts.body,
            fontSize: 36,
            color: palette.textMid,
            lineHeight: 1.5,
            marginBottom: 8,
            opacity: bodyFade,
            transform: `translateY(${interpolate(bodyFade, [0, 1], [20, 0])}px)`,
          }}
        >
          {line}
        </div>
      ))}
    </div>
  );
};

/** terminal-demo — терминал, код появляется построчно */
const TerminalDemoScene: React.FC<{
  title: string;
  body?: string | string[];
  accent: string;
  frame: number;
  fps: number;
}> = ({ title, body, accent, frame, fps }) => {
  const lines = Array.isArray(body) ? body : body ? [body] : [];
  const promptSpring = spring({
    frame: Math.max(0, frame - FADE_FRAMES),
    fps,
    config: springs.snappy,
    durationInFrames: 12,
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "flex-start",
        width: "100%",
        height: "100%",
        padding: "0 160px",
      }}
    >
      {/* Заголовок-лейбл */}
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 22,
          color: accent,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginBottom: 24,
          opacity: promptSpring,
          ...glows.textGlow(accent),
        }}
      >
        {title}
      </div>

      {/* Терминальное окно */}
      <div
        style={{
          backgroundColor: "#0d1117",
          border: `1px solid ${accent}44`,
          borderRadius: 8,
          padding: "32px 40px",
          width: "100%",
          maxWidth: 1200,
          boxShadow: `0 0 40px ${accent}22`,
        }}
      >
        {/* Шапка терминала */}
        <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
          {["#FF5F57", "#FEBC2E", "#28C840"].map((c, i) => (
            <div
              key={i}
              style={{ width: 14, height: 14, borderRadius: "50%", backgroundColor: c }}
            />
          ))}
        </div>

        {/* Строки кода */}
        {lines.map((line, i) => {
          const lineStart = FADE_FRAMES + i * 6;
          const lineOpacity = interpolate(frame, [lineStart, lineStart + 6], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={i}
              style={{
                fontFamily: fonts.mono,
                fontSize: 28,
                color: i === 0 ? accent : palette.textHi,
                lineHeight: 1.8,
                opacity: lineOpacity,
              }}
            >
              {i === 0 ? "$ " : "  "}{line}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** schema — схема/диаграмма из узлов draw-on */
const SchemaScene: React.FC<{
  title: string;
  body?: string | string[];
  accent: string;
  frame: number;
  fps: number;
}> = ({ title, body, accent, frame, fps }) => {
  const nodes = Array.isArray(body) ? body : body ? [body] : [];
  const titleSpring = spring({
    frame: Math.max(0, frame - FADE_FRAMES),
    fps,
    config: springs.default,
    durationInFrames: 15,
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        width: "100%",
        height: "100%",
        padding: "80px 160px",
      }}
    >
      {/* Заголовок */}
      <div
        style={{
          fontFamily: fonts.heading,
          fontSize: 72,
          fontWeight: 800,
          color: palette.textHi,
          marginBottom: 80,
          opacity: titleSpring,
          textAlign: "center",
          ...glows.textGlow(palette.textHi),
        }}
      >
        {title}
      </div>

      {/* Узлы схемы */}
      <div style={{ display: "flex", gap: 40, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
        {nodes.map((node, i) => {
          const nodeStart = FADE_FRAMES + i * 8;
          const nodeSpring = spring({
            frame: Math.max(0, frame - nodeStart),
            fps,
            config: springs.snappy,
            durationInFrames: 12,
          });
          const showArrow = i < nodes.length - 1;
          return (
            <React.Fragment key={i}>
              <div
                style={{
                  padding: "20px 40px",
                  border: `2px solid ${accent}`,
                  borderRadius: 8,
                  fontFamily: fonts.mono,
                  fontSize: 28,
                  color: palette.textHi,
                  opacity: nodeSpring,
                  transform: `scale(${interpolate(nodeSpring, [0, 1], [0.7, 1])})`,
                  boxShadow: `0 0 20px ${accent}44`,
                  backgroundColor: "#131A24",
                  whiteSpace: "nowrap",
                }}
              >
                {node}
              </div>
              {showArrow && (
                <div
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 36,
                    color: accent,
                    opacity: nodeSpring,
                    ...glows.textGlow(accent),
                  }}
                >
                  →
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

/** before-after — сравнение двух состояний side-by-side */
const BeforeAfterScene: React.FC<{
  title: string;
  body?: string | string[];
  accent: string;
  frame: number;
  fps: number;
}> = ({ title, body, accent, frame, fps }) => {
  const lines = Array.isArray(body) ? body : body ? [body] : [];
  const before = lines[0] ?? "До";
  const after = lines[1] ?? "После";

  const leftSpring = spring({
    frame: Math.max(0, frame - FADE_FRAMES),
    fps,
    config: springs.default,
    durationInFrames: 15,
  });
  const rightSpring = spring({
    frame: Math.max(0, frame - FADE_FRAMES - 8),
    fps,
    config: springs.default,
    durationInFrames: 15,
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: "80px 120px",
      }}
    >
      {/* Заголовок */}
      <div
        style={{
          fontFamily: fonts.heading,
          fontSize: 52,
          fontWeight: 700,
          color: palette.textMid,
          marginBottom: 64,
          textAlign: "center",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        {title}
      </div>

      {/* Side-by-side */}
      <div style={{ display: "flex", gap: 48, flex: 1 }}>
        {/* До */}
        <div
          style={{
            flex: 1,
            border: `2px solid ${palette.danger}66`,
            borderRadius: 12,
            padding: "40px 48px",
            backgroundColor: `${palette.danger}0A`,
            opacity: leftSpring,
            transform: `translateX(${interpolate(leftSpring, [0, 1], [-60, 0])}px)`,
          }}
        >
          <div style={{ fontFamily: fonts.mono, fontSize: 20, color: palette.danger, letterSpacing: "0.1em", marginBottom: 20 }}>
            ✗ ДО
          </div>
          <div style={{ fontFamily: fonts.body, fontSize: 34, color: palette.textHi, lineHeight: 1.4 }}>
            {before}
          </div>
        </div>

        {/* После */}
        <div
          style={{
            flex: 1,
            border: `2px solid ${accent}`,
            borderRadius: 12,
            padding: "40px 48px",
            backgroundColor: `${accent}0A`,
            opacity: rightSpring,
            transform: `translateX(${interpolate(rightSpring, [0, 1], [60, 0])}px)`,
            boxShadow: `0 0 30px ${accent}33`,
          }}
        >
          <div style={{ fontFamily: fonts.mono, fontSize: 20, color: accent, letterSpacing: "0.1em", marginBottom: 20 }}>
            ✓ ПОСЛЕ
          </div>
          <div style={{ fontFamily: fonts.body, fontSize: 34, color: palette.textHi, lineHeight: 1.4 }}>
            {after}
          </div>
        </div>
      </div>
    </div>
  );
};

/** result-reveal — кульминационный reveal: число/факт крупно */
const ResultRevealScene: React.FC<{
  title: string;
  body?: string | string[];
  accent: string;
  frame: number;
  fps: number;
}> = ({ title, body, accent, frame, fps }) => {
  const lines = Array.isArray(body) ? body : body ? [body] : [];
  const subtitle = lines[0] ?? "";

  const scaleSpring = spring({
    frame: Math.max(0, frame - FADE_FRAMES),
    fps,
    config: { stiffness: 200, damping: 12, mass: 1 },
    durationInFrames: 20,
  });
  const subFade = interpolate(frame, [FADE_FRAMES + 14, FADE_FRAMES + 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Пульсирующий glow после появления
  const glowPulse = frame > FADE_FRAMES + 20
    ? 0.8 + 0.6 * Math.sin(((frame - FADE_FRAMES - 20) / fps) * Math.PI * 2 * 0.7)
    : 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        width: "100%",
        height: "100%",
      }}
    >
      {/* Главный результат */}
      <div
        style={{
          fontFamily: fonts.heading,
          fontSize: 180,
          fontWeight: 900,
          color: accent,
          lineHeight: 1,
          textAlign: "center",
          transform: `scale(${interpolate(scaleSpring, [0, 1], [0.4, 1])})`,
          opacity: scaleSpring,
          textShadow: `0 0 ${40 * glowPulse}px ${accent}CC, 0 0 ${80 * glowPulse}px ${accent}66`,
        }}
      >
        {title}
      </div>

      {/* Подпись */}
      {subtitle && (
        <div
          style={{
            marginTop: 40,
            fontFamily: fonts.body,
            fontSize: 44,
            color: palette.textMid,
            opacity: subFade,
            textAlign: "center",
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
};

// ─── Главный компонент ────────────────────────────────────────────────────────

export const FullScreenScene: React.FC<FullScreenSceneProps> = ({
  variant = "dark-concept",
  title,
  body,
  accentColor = "cyan",
  durationSec = 6,
  enterTransition = "fade",
  exitTransition = "fade",
  startFrom = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const f = Math.max(0, frame - startFrom);

  const accent = accentColor === "cyan" ? palette.accentCyan : palette.accentAmber;

  const { opacity, enterY, exitY, wipeClip } = useTransitions(
    f,
    fps,
    durationInFrames,
    enterTransition,
    exitTransition,
  );

  const sceneProps = { title, body, accent, frame: f, fps };

  return (
    <AbsoluteFill
      style={{
        // Полный непрозрачный фон Terminal Noir — ЭТО НЕ ОВЕРЛЕЙ
        backgroundColor: palette.bgDeep,
        opacity,
        transform: `translateY(${enterY + exitY}px)`,
        // wipe: ограничить через clipPath
        clipPath:
          enterTransition === "wipe" && wipeClip < 100
            ? `inset(0 ${100 - wipeClip}% 0 0)`
            : undefined,
      }}
    >
      {variant === "dark-concept" && <DarkConceptScene {...sceneProps} />}
      {variant === "terminal-demo" && <TerminalDemoScene {...sceneProps} />}
      {variant === "schema" && <SchemaScene {...sceneProps} />}
      {variant === "before-after" && <BeforeAfterScene {...sceneProps} />}
      {variant === "result-reveal" && <ResultRevealScene {...sceneProps} />}
    </AbsoluteFill>
  );
};
