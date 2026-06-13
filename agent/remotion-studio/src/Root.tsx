import React from "react";
import { Composition, registerRoot } from "remotion";
import { TitleCard } from "./components/TitleCard";
import { LowerThird } from "./components/LowerThird";
import { ProgressStepper } from "./components/ProgressStepper";
import { CountUpTimer } from "./components/CountUpTimer";
import { KineticText } from "./components/KineticText";
import { QuoteCard } from "./components/QuoteCard";
import { ChapterWipe } from "./components/ChapterWipe";
import { CTAScreen } from "./components/CTAScreen";
import { Callout } from "./components/Callout";
import { ErrorBadge } from "./components/ErrorBadge";
import { MapEurope } from "./components/MapEurope";
import { IconRow } from "./components/IconRow";
import { ShortsCaptions } from "./components/ShortsCaptions";
import { FullScreenScene } from "./components/FullScreenScene";
import { FPS, compositionSizes, durations } from "./theme";

/**
 * Root — регистрация всех 12 Remotion-композиций Terminal Noir.
 *
 * Все композиции HD 1920×1080, 30 fps, прозрачный фон (alpha-оверлей).
 * defaultProps — образцы под тему AmneziaVPN-туториала; агент задаёт свои props.
 */
export const RemotionRoot: React.FC = () => {
  const { width, height } = compositionSizes.hd;
  return (
    <>
      {/* ════════ ЗАХОД 1 ════════ */}

      {/* ─── TitleCard ─────────────────────────────────────────────── */}
      <Composition
        id="TitleCard"
        component={TitleCard}
        durationInFrames={durations.titleCard}
        fps={FPS}
        width={width}
        height={height}
        defaultProps={{
          title: "AmneziaVPN за 7 минут",
          subtitle: "Свой VPN без командной строки",
          accentColor: "cyan" as const,
          startFrom: 0,
        }}
      />

      {/* ─── LowerThird ────────────────────────────────────────────── */}
      <Composition
        id="LowerThird"
        component={LowerThird}
        durationInFrames={durations.lowerThird}
        fps={FPS}
        width={width}
        height={height}
        defaultProps={{
          label: "Подключено · Сервер 2 · Латвия",
          sublabel: "AmneziaVPN — защита активна",
          icon: "✅",
          showCheck: true,
          accentColor: "success" as const,
          startFrom: 0,
        }}
      />

      {/* ─── ProgressStepper ───────────────────────────────────────── */}
      <Composition
        id="ProgressStepper"
        component={ProgressStepper}
        durationInFrames={durations.progressStepper}
        fps={FPS}
        width={width}
        height={height}
        defaultProps={{
          steps: [
            { label: "Сервер", sublabel: "VPS подключён" },
            { label: "Установка", sublabel: "AmneziaVPN" },
            { label: "Проверка", sublabel: "DNS leak test" },
            { label: "Апгрейд", sublabel: "Claude промпт" },
          ],
          activeStep: 1,
          position: "left" as const,
          startFrom: 0,
        }}
      />

      {/* ─── CountUpTimer ──────────────────────────────────────────── */}
      <Composition
        id="CountUpTimer"
        component={CountUpTimer}
        durationInFrames={durations.countUpTimer}
        fps={FPS}
        width={width}
        height={height}
        defaultProps={{
          maxSeconds: 420,
          showIcon: true,
          position: "topRight" as const,
          label: "мин",
          startFrom: 0,
        }}
      />

      {/* ════════ ЗАХОД 2 ════════ */}

      {/* ─── KineticText ───────────────────────────────────────────── */}
      <Composition
        id="KineticText"
        component={KineticText}
        durationInFrames={durations.kineticText}
        fps={FPS}
        width={width}
        height={height}
        defaultProps={{
          text: "иногда проблемы решаются просто — выключи VPN",
          highlight: "выключи VPN",
          wordStagger: 4,
          position: "center" as const,
          startFrom: 0,
        }}
      />

      {/* ─── QuoteCard ─────────────────────────────────────────────── */}
      <Composition
        id="QuoteCard"
        component={QuoteCard}
        durationInFrames={durations.quoteCard}
        fps={FPS}
        width={width}
        height={height}
        defaultProps={{
          quote: "Швеция — не твой выход. Это локация DNS-резолвера.",
          author: "Claude объясняет DNS",
          accentColor: "cyan" as const,
          startFrom: 0,
        }}
      />

      {/* ─── ChapterWipe ───────────────────────────────────────────── */}
      <Composition
        id="ChapterWipe"
        component={ChapterWipe}
        durationInFrames={durations.chapterWipe}
        fps={FPS}
        width={width}
        height={height}
        defaultProps={{
          chapterNumber: 3,
          title: "Проверка: DNS leak test",
          subtitle: "Проверяем, что VPN реально работает",
          accentColor: "cyan" as const,
          startFrom: 0,
        }}
      />

      {/* ─── CTAScreen ─────────────────────────────────────────────── */}
      <Composition
        id="CTAScreen"
        component={CTAScreen}
        durationInFrames={durations.ctaScreen}
        fps={FPS}
        width={width}
        height={height}
        defaultProps={{
          title: "Готово. Свой VPN за 7 минут",
          callToAction: "Ранбук в описании ↓",
          socials: [
            { icon: "▶", label: "YouTube" },
            { icon: "✈", label: "Telegram" },
            { icon: "◎", label: "Instagram" },
          ],
          frozenTimer: "7:00",
          accentColor: "amber" as const,
          startFrom: 0,
        }}
      />

      {/* ─── Callout ───────────────────────────────────────────────── */}
      <Composition
        id="Callout"
        component={Callout}
        durationInFrames={durations.callout}
        fps={FPS}
        width={width}
        height={height}
        defaultProps={{
          targetX: 22,
          targetY: 62,
          targetWidth: 28,
          targetHeight: 8,
          label: "Логин и пароль от сервера",
          arrowFrom: "bottom" as const,
          accentColor: "amber" as const,
          startFrom: 0,
        }}
      />

      {/* ─── ErrorBadge ────────────────────────────────────────────── */}
      <Composition
        id="ErrorBadge"
        component={ErrorBadge}
        durationInFrames={durations.errorBadge}
        fps={FPS}
        width={width}
        height={height}
        defaultProps={{
          text: "⚠ TIMEOUT",
          position: "center" as const,
          variant: "danger" as const,
          startFrom: 0,
        }}
      />

      {/* ─── MapEurope ─────────────────────────────────────────────── */}
      <Composition
        id="MapEurope"
        component={MapEurope}
        durationInFrames={durations.mapEurope}
        fps={FPS}
        width={width}
        height={height}
        defaultProps={{
          points: [
            { label: "Нидерланды", x: 30, y: 38 },
            { label: "Польша", x: 52, y: 36 },
            { label: "Латвия", x: 58, y: 24 },
            { label: "Москва", x: 78, y: 28, origin: true },
          ],
          showArcs: true,
          accentColor: "cyan" as const,
          startFrom: 0,
        }}
      />

      {/* ─── IconRow ───────────────────────────────────────────────── */}
      <Composition
        id="IconRow"
        component={IconRow}
        durationInFrames={durations.iconRow}
        fps={FPS}
        width={width}
        height={height}
        defaultProps={{
          items: [
            { icon: "🛡", label: "Firewall" },
            { icon: "🔄", label: "Автовосстановление" },
            { icon: "🔑", label: "Защита ключей" },
          ],
          accentColor: "cyan" as const,
          position: "center" as const,
          startFrom: 0,
        }}
      />

      {/* ════════ SHORTS (9:16 вертикаль) ════════ */}

      {/* ════════ FULL-SCREEN INTERSTITIAL (v3) ════════ */}

      {/* ─── FullScreenScene — полноэкранная отбивка, НЕ alpha (свой фон Terminal Noir) ─── */}
      {/* 5 вариантов: dark-concept | terminal-demo | schema | before-after | result-reveal */}
      {/* Место в пайплайне: Блок 3. Файл рендерится в MP4 (без альфы) и вставляется в filelist.txt */}
      <Composition
        id="FullScreenScene"
        component={FullScreenScene}
        durationInFrames={180}
        fps={FPS}
        width={compositionSizes.hd.width}
        height={compositionSizes.hd.height}
        defaultProps={{
          variant: "dark-concept" as const,
          title: "Как работает VPN",
          body: ["Трафик → туннель → сервер → интернет", "IP вашего провайдера не виден"],
          accentColor: "cyan" as const,
          durationSec: 6,
          enterTransition: "fade" as const,
          exitTransition: "fade" as const,
          startFrom: 0,
        }}
        calculateMetadata={({ props }) => {
          const dur = (props.durationSec ?? 6) * FPS;
          return { durationInFrames: Math.round(dur) };
        }}
      />

      {/* ─── ShortsCaptions — Hormozi-капшены, alpha-оверлей на весь шортс ─── */}
      <Composition
        id="ShortsCaptions"
        component={ShortsCaptions}
        durationInFrames={60 * FPS}
        fps={FPS}
        width={compositionSizes.vertical.width}
        height={compositionSizes.vertical.height}
        defaultProps={{
          lines: [
            { start: 0.3, end: 2.5, text: "пример капшена", highlight: "капшена" },
          ],
          position: "lower" as const,
        }}
        calculateMetadata={({ props }) => {
          const lines = (props.lines ?? []) as { end: number }[];
          const lastEnd = lines.reduce((m, l) => Math.max(m, l.end), 1);
          return {
            durationInFrames: Math.ceil((lastEnd + 0.5) * FPS),
          };
        }}
      />
    </>
  );
};

registerRoot(RemotionRoot);
