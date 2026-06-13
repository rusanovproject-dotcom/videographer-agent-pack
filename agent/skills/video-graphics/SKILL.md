---
name: video-graphics
version: 1.0.0
description: |
  Remotion motion graphics studio для видеографа. Рендерит title cards, lower thirds,
  progress steppers, count-up таймеры и другие анимированные вставки с альфа-каналом
  в стиле Terminal Noir. Вставки накладываются на основное видео через ffmpeg overlay
  по тайм-кодам из EDL-раскадровки.
author: Tech Lead
updated: 2026-05-27
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit

MANDATORY TRIGGERS:
  - "добавь анимацию"
  - "сделай intro"
  - "анимированные субтитры"
  - "title card"
  - "graphics"
  - "lower thirds"
  - "плашка-титр"
  - "степпер"
  - "прогресс сбоку"
  - "таймер count-up"
  - "вставки поверх видео"
  - "motion graphics"
  - "накладывай графику"

anti-triggers:
  - "нарежь видео"
  - "субтитры srt"
  - "склей"
  - "b-roll"
  - "shorts"
---

# video-graphics — Remotion Motion Graphics

## Правила применения (обязательные)

### KineticText — стандарт подчёркивания ключевых слов (не опция)

При обнаружении в транскрипте ключевых слов → добавить KineticText автоматически:
- Числа с единицами: «7 минут», «5 шагов», «3 сервера» → KineticText «7 МИНУТ»
- Топонимы (страны, города, регионы): «Нидерланды», «Латвия» → KineticText «НИДЕРЛАНДЫ»
- Названия инструментов/продуктов: «AmneziaVPN», «Claude», «DNS» → KineticText
- Сильные утверждения: «VPN работает», «подключено», «готово» → KineticText
- Порог: ≥1 KineticText на 60 сек финала. Для 7-минутного видео = минимум 7 штук.

Для якорения используй `anchor_phrase` через `anchor-overlays.mjs` (НЕ ручной тайм-код).

### ProgressStepper — сквозной показ с обновлением activeStep по главам

ProgressStepper работает правильно только если:
1. Показывается на протяжении ВСЕГО видео (или всех глав где активен)
2. `activeStep` меняется при каждой смене главы — для этого рендерится НЕСКОЛЬКО версий (по одной на каждую главу) и каждая накладывается на свой временной промежуток
3. Тайм-коды каждой версии якорятся к `anchor_phrase` первого слова главы

Пример: 4 главы → 4 рендера ProgressStepper с activeStep=0,1,2,3 → 4 overlay с enable= по якорям.

Антипаттерн (был в VPN-прогоне): 2 рендера с activeStep=1 и activeStep=2 при 4 главах — шаги 0 и 3 не подсвечивались, степпер «застывал».

### ffmpeg-эффекты — стандартный арсенал динамики (не fallback)

Все эффекты ниже работают через ffmpeg напрямую. mcp-video и ffmpeg — равнозначные пути.
Диагностика: `claude mcp list | grep mcp-video`. Если недоступен → ffmpeg ПРАВИЛО 12.
Зафиксировать в Arsenal Report что использовал.

**Обязательный минимум на каждый ролик (не опциональный):**
- **xfade** — между ВСЕМИ сегментами при склейке (dissolve / wipeleft / fade, 0.5-1.0 сек)
- **Terminal Noir colorgrade** — eq + colorbalance + vignette на весь ролик после overlay
- **zoompan / Ken Burns** — на каждом смысловом блоке говорящей головы ≥10 сек

**По ситуации:**
- **glitch/rgbashift** — на хуке или моменте ошибки (≤3 сек изолированный клип)
- **flash/fade-white** — на ключевых демо-моментах (2-3 кадра через overlay в filter_complex)
- **speed-ramp x4** — на ВСЕХ зонах молчания/загрузки >10 сек (всегда 2 шага)

Рецепты: `knowledge/ffmpeg-recipes.md` ПРАВИЛО 12 (A–F). Команды копируемые, проверены.

---

---

## Full-screen Interstitial — секция v3

> Правка ревью: interstitial — НЕ отдельный скилл, секция в video-graphics.
> Компонент: `FullScreenScene` (remotion-studio/src/components/FullScreenScene.tsx)

### Что такое interstitial

Full-screen cutaway-сцена — самостоятельный сегмент тайм-лайна с собственным фоном Terminal Noir.
**НЕ оверлей с альфой.** Footage на это время замещается сценой (footage не вырезается — сцена добавляется МЕЖДУ footage-сегментами в filelist.txt).

| | Alpha-оверлей | Interstitial (FullScreenScene) |
|--|--------------|-------------------------------|
| Фон | прозрачный, footage видно | непрозрачный (#0A0E14), свой фон |
| Место в тайм-лайне | поверх footage (enable=) | отдельный сегмент в filelist.txt |
| Рендер | ProRes 4444 + альфа (.mov) | MP4 H.264 без альфы (.mp4) |
| Применение | подчёркивание, статус | объяснение концепции, схема, результат |

### 5 вариантов (variant prop)

| variant | Описание |
|---------|---------|
| `dark-concept` | тёмный фон, анимированный заголовок + тело, акцентная линия |
| `terminal-demo` | терминал, код появляется построчно, заголовок сверху |
| `schema` | узлы схемы с draw-on стрелками, для архитектур/пайплайнов |
| `before-after` | side-by-side сравнение (body[0]=до, body[1]=после) |
| `result-reveal` | число/факт крупно на весь экран, пульсирующий glow |

### Правила частоты и размещения (железные)

1. **Только между шагами** — ЗАПРЕЩЕНО вставлять внутри многошагового UI-процесса
   (например: «открой настройки → [interstitial] → нажми кнопку» — НЕЛЬЗЯ)
2. **Не чаще 1 на 2–3 мин footage**
3. **≤3 отбивки на ролик ~7 мин**
4. **Каждая ≤7 сек** (дефолт 6 сек — durationSec=6)
5. Fade вход/выход 0.3 сек (9 кадров) встроен в компонент

### Рендер и вставка

```bash
cd office/agents/videographer/remotion-studio

# Рендер interstitial в MP4 (НЕ ProRes — нет альфы, MP4 достаточно)
node render.mjs FullScreenScene out/interstitial_01.mp4 --mp4 \
  --props='{"variant":"dark-concept","title":"Как работает VPN","body":["Трафик идёт через туннель","IP провайдера не виден"],"durationSec":6}'

# Проверка: full-frame, нет альфа-канала
ffprobe -v error -show_entries stream=width,height,codec_name,pix_fmt out/interstitial_01.mp4
# Ожидаем: 1920x1080, h264, yuv420p (НЕ yuva — это признак alpha)
```

### Место в filelist.txt (контракт порядка файлов)

```
file 'segments/seg_004.mp4'       ← footage до отбивки (шаг N завершён)
file 'out/interstitial_01.mp4'    ← FullScreenScene (между шагами)
file 'segments/seg_005.mp4'       ← footage после отбивки (шаг N+1 начинается)
```

### INTERSTITIAL-проверка в validate-montage.py

Скрипт проверяет НЕ автоматически — только по размеченным диапазонам:
```
# В saturation-plan.md секция ## ui_critical:
## ui_critical
- "описание UI-действия": START_SEC–END_SEC
```
validate-montage.py сверяет тайм-коды interstitials с ui_critical АРИФМЕТИЧЕСКИ.
Пересечение → Critical нарушение.

---

## Что делает

Рендерит анимированные вставки Motion Graphics в стиле **Terminal Noir**:
- Тёмный фон, неоновый cyan/amber акцент
- Spring-физика (stiffness 120, damping 14)
- Прозрачный фон (alpha-канал) — все вставки — оверлей поверх footage

После рендера каждая вставка накладывается на финальное видео через `ffmpeg overlay`
по тайм-кодам из EDL-раскадровки.

## Remotion-студия

Расположена: `office/agents/videographer/remotion-studio/`

Запуск студии:
```bash
cd office/agents/videographer/remotion-studio
npx remotion studio
```

## Готовые компоненты — все 12 (графический слой закрыт)

Все компоненты HD 1920×1080, 30 fps, прозрачный фон (alpha-оверлей), стиль Terminal Noir.
ID совпадает с именем компонента — передаётся в `render.mjs` первым аргументом.

### Заход 1 — ядро

| Компонент | Описание | Длит. | Ключевые props |
|-----------|----------|-------|----------------|
| `TitleCard` | Заголовок + подзаголовок, draw-on рамка, spring снизу, glow | 3 сек | `title`, `subtitle?`, `accentColor` (cyan/amber), `startFrom` |
| `LowerThird` | Плашка-титр снизу: иконка + текст, slide справа, draw-on галочка | 4 сек | `label`, `sublabel?`, `icon`, `showCheck`, `accentColor` (cyan/amber/success), `startFrom` |
| `ProgressStepper` | Сквозной степпер сбоку: N шагов, подсветка активного, pulse | 10 сек | `steps` (массив `{label, sublabel?}`), `activeStep` (0-based), `position` (left/right), `startFrom` |
| `CountUpTimer` | Таймер ⏱ count-up, blur-in цифр, прогресс-бар | 7 сек | `maxSeconds`, `showIcon`, `frozenAt?`, `position` (4 угла), `label?`, `accentColor`, `startFrom` |

### Заход 2 — полный набор

| Компонент | Описание | Длит. | Ключевые props |
|-----------|----------|-------|----------------|
| `KineticText` | Кинетическая типографика: слова влетают по одному, ключевое крупно amber | 3 сек | `text`, `highlight?` (слово/фраза для выделения), `wordStagger`, `position` (top/center/bottom), `startFrom` |
| `QuoteCard` | Карточка-цитата с кавычками draw-on, spring-появление, glow | 4 сек | `quote`, `author?`, `accentColor` (cyan/amber), `startFrom` |
| `ChapterWipe` | Переход-глава: сканер-линия cyan слева-направо + заголовок главы | 2.5 сек | `chapterNumber?`, `title`, `subtitle?`, `accentColor`, `startFrom` |
| `CTAScreen` | Финальный экран: замёрзший таймер + крупный текст + ряд соцсетей pulse | 5 сек | `title`, `callToAction?`, `socials?` (массив `{icon, label}`), `frozenTimer?`, `accentColor`, `startFrom` |
| `Callout` | Стрелка draw-on + пульсирующая рамка на элемент экрана (по координатам %) | 3 сек | `targetX/Y/Width/Height` (% от кадра), `label?`, `arrowFrom` (top/bottom/left/right), `accentColor` (amber/cyan), `startFrom` |
| `ErrorBadge` | Бейдж «⚠ TIMEOUT»: вспышка scale-in + shake + fade | 0.8 сек | `text`, `icon?`, `position` (center/topRight/bottomCenter), `variant` (danger/amber), `startFrom` |
| `MapEurope` | Стилизованная карта Европы: точки серверов stagger + дуги от origin | 5 сек | `points` (массив `{label, x, y, origin?}`, координаты % от карты), `showArcs`, `accentColor`, `startFrom` |
| `IconRow` | Ряд иконок (щит/backup/ключ) stagger + typewriter-подписи | 4 сек | `items` (массив `{icon, label}`), `accentColor` (cyan/amber/success), `position` (center/bottom), `startFrom` |

**Сквозные правила props:**
- `startFrom` — кадр начала анимации внутри композиции (для синхронизации с футажом).
- `accentColor` — цвет неона из темы Terminal Noir (cyan/amber, у некоторых + success/danger).
- Текст и тайминги — всегда через props, никакого хардкода. Цвета — только из `theme.ts`.

## Workflow агента

### 1. Выбор компонента

Агент смотрит в EDL-раскадровку (`videographer-proposal.md` или `edl.json` секция graphics),
выбирает компонент и параметры props под нужный момент видео.

### 2. Задание props через Root.tsx

Редактирование `src/Root.tsx` — изменить `defaultProps` нужной композиции:

```tsx
<Composition
  id="TitleCard"
  component={TitleCard}
  durationInFrames={90}
  fps={30}
  width={1920}
  height={1080}
  defaultProps={{
    title: "AmneziaVPN за 7 минут",
    subtitle: "Свой VPN без командной строки",
    accentColor: "cyan",
    startFrom: 0,
  }}
/>
```

### 3. Рендер с альфа-каналом

```bash
cd office/agents/videographer/remotion-studio

# ProRes 4444 с альфой — основной формат для оверлея
node render.mjs TitleCard out/titlecard.mov

# PNG один кадр — для быстрой проверки
node render.mjs TitleCard out/titlecard.png --png

# MP4 без альфы — для превью
node render.mjs TitleCard out/titlecard.mp4 --mp4
```

**Рабочая команда ProRes 4444 (проверена):**
```bash
npx remotion render src/index.ts TitleCard out/titlecard.mov \
  --codec=prores \
  --prores-profile=4444 \
  --pixel-format=yuva444p10le \
  --overwrite
```

**Результат ffprobe (что должно быть):**
```
codec_name=prores
profile=4444
pix_fmt=yuva444p12le   # ← это нормально (Remotion рендерит в 12-bit)
width=1920, height=1080
nb_frames=90
codec_tag=ap4h          # ← Apple ProRes 4444
```

### 4. Наложение на видео через ffmpeg overlay

**Одна вставка по тайм-коду (t=0 до t=3 сек):**
```bash
ffmpeg -i source.mp4 -i out/titlecard.mov \
  -filter_complex "[0:v][1:v]overlay=0:0:enable='between(t,0,3)'" \
  -c:a copy result.mp4
```

**Несколько вставок одновременно:**
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

**Связь с EDL-раскадровкой:**
В `videographer-proposal.md` секция «Раскадровка» — тайм-коды финального монтажа.
Каждая вставка (#1–#13) имеет `enable='between(t,START,END)'` по финальным секундам.

### 5. Память агента после задачи

После рендера — append в `MEMORY.md`:
```
[YYYY-MM-DD] video-graphics — отрендерено N вставок, финал: result.mp4
```

## Шрифты (Terminal Noir)

Загружаются через `@remotion/google-fonts` в `src/fonts.ts` — гарантированный шрифт
при рендере, не системный fallback. Подмножества latin + cyrillic.

- **Unbounded** (`fonts.heading`) — заголовки, title cards, kinetic highlight
- **Inter** (`fonts.body`) — подписи, lower thirds
- **JetBrains Mono** (`fonts.mono`) — технические строки, таймеры, лейблы

`theme.ts` реэкспортит `fonts` из `fonts.ts` — компоненты импортируют `fonts` из темы,
шрифт меняется в одном месте.

## Структура файлов студии

```
remotion-studio/
├── src/
│   ├── index.ts              # entry point
│   ├── Root.tsx              # регистрация 12 композиций
│   ├── theme.ts              # Terminal Noir палитра, spring-пресеты, длительности
│   ├── fonts.ts              # загрузка шрифтов через @remotion/google-fonts
│   └── components/
│       ├── TitleCard.tsx         # ✅ Заход 1
│       ├── LowerThird.tsx        # ✅ Заход 1
│       ├── ProgressStepper.tsx   # ✅ Заход 1
│       ├── CountUpTimer.tsx      # ✅ Заход 1
│       ├── KineticText.tsx       # ✅ Заход 2
│       ├── QuoteCard.tsx         # ✅ Заход 2
│       ├── ChapterWipe.tsx       # ✅ Заход 2
│       ├── CTAScreen.tsx         # ✅ Заход 2
│       ├── Callout.tsx           # ✅ Заход 2
│       ├── ErrorBadge.tsx        # ✅ Заход 2
│       ├── MapEurope.tsx         # ✅ Заход 2
│       └── IconRow.tsx           # ✅ Заход 2
├── out/                      # рендеры (в .gitignore)
├── render.mjs                # скрипт рендера (ProRes/PNG/MP4) — любой из 12 по имени
├── remotion.config.ts        # конфиг Remotion
├── package.json
├── tsconfig.json
└── README.md
```

## Лицензия

Remotion — BUSL-1.1 (Business Source License).
Бесплатна до $1M ARR. Подробнее: https://remotion.dev/license

## Ссылки

- Studio README: `remotion-studio/README.md`
- Тема: `remotion-studio/src/theme.ts`
- Раскадровка: `Documents/videographer-proposal.md` секция «Раскадровка — 13 вставок»
- Архитектура агента: `_rebuild/ARCHITECTURE-final.md` секция video-graphics
