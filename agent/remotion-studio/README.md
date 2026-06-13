# Remotion Studio — Terminal Noir

Motion graphics библиотека для агента Видеограф.
Стиль: Terminal Noir (тёмный фон, cyan/amber неон, spring-физика).
Все вставки рендерятся с альфа-каналом и накладываются поверх footage через ffmpeg.

**Лицензия:** BUSL-1.1 (бесплатна до $1M ARR) — https://remotion.dev/license

---

## Быстрый старт

```bash
# Установить зависимости (один раз)
npm install

# Убедиться что Chromium скачан (один раз)
npx remotion browser ensure

# Запустить студию (интерактивный предпросмотр)
npx remotion studio

# Рендер TitleCard с альфа-каналом
node render.mjs TitleCard out/titlecard.mov

# Рендер одного кадра PNG для проверки
node render.mjs TitleCard out/titlecard.png --png
```

---

## Готовые компоненты — все 12

Все: HD 1920×1080, 30 fps, прозрачный фон (alpha-оверлей), стиль Terminal Noir.
ID = имя компонента (передаётся в `render.mjs` первым аргументом).

| # | Компонент | Описание | Длит. |
|---|-----------|----------|-------|
| 1 | `TitleCard` | Заголовок + подзаголовок, draw-on рамка, spring снизу, glow | 3 сек |
| 2 | `LowerThird` | Плашка-титр снизу, slide справа, draw-on галочка | 4 сек |
| 3 | `ProgressStepper` | Степпер сбоку: N шагов, подсветка активного, pulse | 10 сек |
| 4 | `CountUpTimer` | Таймер ⏱ count-up, blur-in, прогресс-бар | 7 сек |
| 5 | `KineticText` | Слова влетают по одному, ключевое крупно amber | 3 сек |
| 6 | `QuoteCard` | Карточка-цитата, кавычки draw-on, spring | 4 сек |
| 7 | `ChapterWipe` | Переход-глава: сканер-линия cyan + заголовок | 2.5 сек |
| 8 | `CTAScreen` | Финал: замёрзший таймер + текст + соцсети pulse | 5 сек |
| 9 | `Callout` | Стрелка draw-on + пульсирующая рамка по координатам | 3 сек |
| 10 | `ErrorBadge` | «⚠ TIMEOUT» вспышка + shake + fade | 0.8 сек |
| 11 | `MapEurope` | Карта Европы: точки серверов stagger + дуги | 5 сек |
| 12 | `IconRow` | Ряд иконок stagger + typewriter-подписи | 4 сек |

Параметры (props) каждого компонента — в `skills/video-graphics/SKILL.md`.

**Рендер любого:**
```bash
node render.mjs <CompId> out/<имя>.mov        # ProRes 4444 alpha
node render.mjs <CompId> out/<имя>.png --png  # один кадр PNG
node render.mjs <CompId> out/<имя>.mp4 --mp4  # H.264 без альфы

# Список всех композиций
npm run compositions
```

## Шрифты

Загружаются через `@remotion/google-fonts` (`src/fonts.ts`) — гарантированный шрифт,
не системный fallback. Подмножества latin + cyrillic:
- **Unbounded** — заголовки / title cards
- **Inter** — подписи / lower thirds
- **JetBrains Mono** — технические строки / таймеры

---

## Рендер с альфа-каналом (ProRes 4444)

```bash
# Основная команда — ProRes 4444 с альфой
node render.mjs TitleCard out/titlecard.mov

# Или напрямую через npx remotion
npx remotion render src/index.ts TitleCard out/titlecard.mov \
  --codec=prores \
  --prores-profile=4444 \
  --pixel-format=yuva444p10le \
  --overwrite
```

**Проверка результата:**
```bash
ffprobe -v quiet -show_streams -select_streams v:0 out/titlecard.mov | \
  grep -E "codec_name|profile|pix_fmt|nb_frames|width|height"
```

Ожидаемый вывод:
```
codec_name=prores
profile=4444
pix_fmt=yuva444p12le    # 12-bit YUVA — альфа присутствует
width=1920
height=1080
nb_frames=90
```

---

## Наложение на видео через ffmpeg

**Одна вставка:**
```bash
ffmpeg -i source.mp4 -i out/titlecard.mov \
  -filter_complex "[0:v][1:v]overlay=0:0:enable='between(t,0,3)'" \
  -c:a copy result.mp4
```

**Несколько вставок по раскадровке:**
```bash
ffmpeg -i source.mp4 \
  -i out/titlecard.mov \
  -i out/lowerthird.mov \
  -i out/timer.mov \
  -filter_complex "
    [0:v][1:v]overlay=0:0:enable='between(t,0,3)'[v1];
    [v1][2:v]overlay=0:0:enable='between(t,180,184)'[v2];
    [v2][3:v]overlay=0:0:enable='between(t,0,380)'[vout]
  " \
  -map "[vout]" -map 0:a -c:a copy final.mp4
```

`between(t, START, END)` — тайм-код в секундах финального смонтированного видео.
Тайм-коды берутся из EDL-раскадровки в `videographer-proposal.md`.

---

## Добавить новый компонент

1. Создать `src/components/МойКомпонент.tsx` (пример: `TitleCard.tsx`)
2. Зарегистрировать в `src/Root.tsx`:
   ```tsx
   import { МойКомпонент } from "./components/МойКомпонент";
   // ...
   <Composition
     id="МойКомпонент"
     component={МойКомпонент}
     durationInFrames={90}
     fps={30}
     width={1920}
     height={1080}
     defaultProps={{ ... }}
   />
   ```
3. Рендер: `node render.mjs МойКомпонент out/мой-компонент.mov`

**Правила компонента:**
- `backgroundColor: "transparent"` — обязательно для оверлея
- Props = текст + тайминги + цвет — никакого хардкода текста
- Импортировать цвета только из `../theme` (Terminal Noir)
- Длительность через `useVideoConfig().durationInFrames`

---

## Тема Terminal Noir

Файл: `src/theme.ts`

```typescript
palette.bgDeep      = "#0A0E14"   // фон
palette.accentCyan  = "#2DD4BF"   // основной неон
palette.accentAmber = "#FFB020"   // вторичный акцент
palette.textHi      = "#F0F4F8"   // заголовки
palette.success     = "#34D399"   // успех
palette.danger      = "#FB7185"   // ошибки

fonts.heading = "Unbounded"       // заголовки (кириллица ок)
fonts.mono    = "JetBrains Mono"  // технические строки
fonts.body    = "Inter"           // подписи

springs.default = { stiffness: 120, damping: 14 }
```

---

## Структура

```
remotion-studio/
├── src/
│   ├── index.ts              # entry point
│   ├── Root.tsx              # регистрация 12 композиций
│   ├── theme.ts              # Terminal Noir палитра + spring-пресеты + длительности
│   ├── fonts.ts              # загрузка шрифтов через @remotion/google-fonts
│   └── components/           # 12 компонентов (.tsx)
├── out/                      # рендеры (в .gitignore)
├── render.mjs                # скрипт рендера (ProRes/PNG/MP4)
├── remotion.config.ts
├── package.json
└── README.md
```

---

## Грабли и решения

| Проблема | Решение |
|----------|---------|
| `npx remotion --version` падает без аргументов | Нормально — exit code 1 это лишь «help» без команды. `npx remotion studio` работает корректно |
| ProRes рендер медленный (~12 сек на 90 кадров) | Нормально для первого рендера. Последующие быстрее (кэш бандла) |
| `pix_fmt=yuva444p12le` вместо 10le | Remotion рендерит в 12-bit — это лучше чем 10-bit, альфа присутствует, совместимо с Premiere/Resolve/ffmpeg overlay |
| Шрифты — гарантия нужного, не системного | Решено: `src/fonts.ts` грузит Unbounded / Inter / JetBrains Mono через `loadFont()` из `@remotion/google-fonts` (subsets latin + cyrillic). `theme.ts` реэкспортит — компоненты берут шрифт из темы |
| Chromium не найден | `npx remotion browser ensure` — скачает (~85 МБ) |
