---
name: video-lesson
description: >
  Полный pipeline обработки видеоурока: от raw-записи до готового смонтированного видео.
  Оркестрирует фазы video-analyze → video-cut → video-assemble последовательно.
  Триггеры: «обработай урок», «смонтируй урок», «видеоурок», «обработай запись урока»,
  «сделай из записи урок», «lesson», «урок готов, обработай», «запись занятия».
  Используй этот скилл когда нужно обработать видеоурок целиком — от начала до конца.
  НЕ используй для отдельных операций (анализ/нарезка/сборка) — для них отдельные скиллы.
---

# Video Lesson — Полная обработка видеоурока

<!-- Mandatory triggers: видеоурок, обработай урок, смонтируй урок, запись занятия -->

Мастер-скилл. Берёшь raw-запись урока и получаешь готовое видео. Оркестрирует все 3 фазы.

## Вход

- Путь к raw-записи урока
- Параметры (опционально):
  - Целевой хронометраж (по умолчанию: 20-30% от исходного)
  - Стиль монтажа: `clean` или `pro` (по умолчанию: pro)
  - Язык: ru/en (по умолчанию: ru)
  - Заголовок урока (для intro)

## Пайплайн v3 (8 блоков, 2 чекпоинта)

```
[FOOTAGE]
    ↓
[БЛОК 0] АНАЛИЗ           → analysis-map.json + transcript.json + subs.srt
    ↓
[БЛОК 1] ПЛАН НАСЫЩЕНИЯ   → saturation-plan.md [CHECKPOINT 1 — синхронный, ждёт ОК]
    ↓
[БЛОК 2] EDL + НАРЕЗКА    → edl.json + segments/ + filelist.txt
    ↓
[БЛОК 3] INTERSTITIAL     → interstitial_NN.mp4 (в filelist между footage-сегментами)
    ↓
[БЛОК 4] СКЛЕЙКА          → assembled.mp4 + assembled-transcript.json (Deepgram words=true)
    ↓
[БЛОК 5–6] ВСЕ ОВЕРЛЕИ   → overlay-timecodes.json → overlaid.mp4 (ОДИН filter_complex)
    ↓
zoom/punch-in             → final.mp4   ← ПОСЛЕДНИЙ проход, после overlay
    ↓
[БЛОК 7] СУБТИТРЫ         → output.mp4 + output.srt
    ↓
[БЛОК 8] VALIDATE         → validation-report.md [CHECKPOINT 2 — авто, exit 0 → отдача]
```

**2 чекпоинта (упрощение от ревью):**
- CHECKPOINT 1 (план насыщения) — синхронный, человек в петле
- CHECKPOINT 2 (validate-montage.py) — авто, exit 0 → отдача

CHECKPOINT EDL self-eval (бывший CHECKPOINT 2) — агент делает сам, без остановки на владельца.

## Шаги

### Фаза 0: Подготовка

1. Прочитай `../../knowledge/toolchain.md` — убедись что все инструменты доступны
2. Прочитай `../../knowledge/montage-patterns.md` — освежи паттерны скоринга
3. Создай рабочую директорию:
```bash
WORKDIR="/tmp/video-lesson-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$WORKDIR"/{analysis,segments,output}
```

**Quality gate:** рабочая директория создана, инструменты доступны.

### Фаза 0.5: Проверка инструментов

```bash
# mcp-video
claude mcp list | grep mcp-video || echo "mcp-video НЕ доступен — ffmpeg fallback"

# ffprobe
ffprobe -version | head -1

# Deepgram key
source "${ENV_FILE:-.env}" 2>/dev/null || true   # файл с DEEPGRAM_API_KEY (или задай переменную заранее)
echo "Deepgram key: ${DEEPGRAM_API_KEY:0:8}..."
```

### Фаза 1: Анализ (video-analyze)

Выполни все шаги из `skills/video-analyze/SKILL.md`:
1. ffprobe → метаданные
2. Извлеки аудио → Deepgram → транскрипт
3. silencedetect → карта тишины
4. scenedetect → границы сцен
5. Извлеки кейфреймы → визуальный анализ
6. Построй analysis-map.json

Сохрани результат в `$WORKDIR/analysis/`.

**Quality gate:** analysis-map.json создан, содержит сегменты с scores.

### Фаза 1.5: Plan насыщения (CHECKPOINT 1 — синхронный)

Заполнить `knowledge/saturation-plan.md` из шаблона:
1. Структура глав (по транскрипту) — якорные фразы
2. **ui_critical диапазоны** — вручную пометить UI-действия пользователя
3. Инвентарь: interstitials + оверлеи + KineticText + mcp-video эффекты
4. Плотность: подсчитать события, найти gaps

**[CHECKPOINT 1]** — показать план насыщения владельцу, дождаться явного ОК.
Без ОК — не переходить к Фазе 2.

### Фаза 2: Нарезка (video-cut)

Выполни все шаги из `skills/video-cut/SKILL.md`:
1. Выбери сегменты по карте (mode=highlights, score>=6)
2. Нарежь FFmpeg с перекодированием
3. Удали остаточную тишину (auto-editor или silenceremove)
4. Ускорь скучные части x4 (если есть score 3-5 внутри мясных)
5. Создай filelist.txt

Сохрани в `$WORKDIR/segments/`.

**Quality gate:** все сегменты воспроизводятся, filelist.txt готов.

### Фаза 2.5: Interstitial-сцены (Блок 3)

По saturation-plan.md секция «Full-screen сцены»:

```bash
cd office/agents/videographer/remotion-studio

# Рендер каждой отбивки в MP4 (НЕ ProRes — нет альфа-канала)
node render.mjs FullScreenScene out/interstitial_01.mp4 --mp4 \
  --props='{"variant":"dark-concept","title":"...","body":["..."],"durationSec":6}'

# Проверка: full-frame без альфы
ffprobe -v error -show_entries stream=width,height,codec_name,pix_fmt out/interstitial_01.mp4
```

Вставить в filelist.txt МЕЖДУ footage-сегментами (в точках завершения шага):
```
file 'segments/seg_004.mp4'
file 'out/interstitial_01.mp4'    ← между шагами N и N+1
file 'segments/seg_005.mp4'
```

Пометить в saturation-plan.md каждую отбивку как ✅.

### Фаза 3: Сборка (video-assemble)

Выполни все шаги из `skills/video-assemble/SKILL.md`:
1. Нормализуй сегменты (1920x1080, 30fps, h264, aac)
2. Сгенерируй субтитры (Deepgram на каждый сегмент или подрежь из фазы 1)
3. Склей с переходами (crossfade 0.5s для pro, hard cut для clean)
4. Добавь субтитры (встроенные + .srt)
5. Добавь intro/outro (если стиль pro)
6. Финальная проверка (ffprobe + полное воспроизведение)

Сохрани в `$WORKDIR/output/`.

**Quality gate:** assembled.mp4 готов. assembled-transcript.json готов (Deepgram words=true).

### Фаза 3.5: Все оверлеи (Блоки 5–6 слиты, контракт порядка файлов)

```bash
# 1. anchor-overlays.mjs по assembled-transcript.json (НЕ по zoomed)
node office/agents/videographer/remotion-studio/scripts/anchor-overlays.mjs \
  --anchors overlays-anchors.json \
  --transcript assembled-transcript.json \
  --output overlay-timecodes.json

# 2. Рендер всех оверлеев (KineticText + ProgressStepper + все остальные)
# (каждый через render.mjs ProRes 4444)

# 3. ОДИН filter_complex проход — все оверлеи на assembled.mp4
# (см. video-assemble/SKILL.md Шаг 6.7)
# → overlaid.mp4

# 4. Zoom ПОСЛЕДНИМ — после всех оверлеев
ffmpeg -i overlaid.mp4 \
  -vf "zoompan=z='min(zoom+0.0006,1.10)':..." \
  -c:v libx264 -c:a copy final.mp4
```

### Фаза 3.7: Валидация (CHECKPOINT 2 — авто)

```bash
python3 office/agents/videographer/remotion-studio/scripts/validate-montage.py \
  overlay-timecodes.json \
  assembled-transcript.json \
  validation-report.md \
  --saturation-plan saturation-plan.md \
  --tolerance 1.0 \
  --video-duration $(ffprobe -v error -show_entries format=duration -of csv=p=0 assembled.mp4)

# exit 0 → PASS → переходим к субтитрам
# exit 1 → Critical → смотрим отчёт, исправляем, повторяем
```

**Quality gate:** validate-montage.py exit 0.

### Фаза 4: Доставка

1. Скопируй финальный файл в целевую директорию (рядом с исходным или куда скажет пользователь)
2. Скопируй .srt файл
3. Сгенерируй итоговый отчёт

## Формат вывода

```
{output_dir}/
├── {lesson-name}-edited.mp4    # финальное видео
├── {lesson-name}-edited.srt    # субтитры
└── {lesson-name}-report.md     # полный отчёт
```

Итоговый отчёт:
```
=== ВИДЕОУРОК ОБРАБОТАН ===

Исходный файл: install-lesson.mp4
Хронометраж: 42:18 → 7:45 (удалено 82%)

Фаза 1 (анализ):
  Найдено сегментов: 15
  Мясных (score>=6): 7
  Тишины: 14:30 (34%)

Фаза 2 (нарезка):
  Вырезано: 7 сегментов
  Удалено тишины: 14:30
  Ускорено: 2 сегмента

Фаза 3 (сборка):
  Стиль: pro
  Переходы: crossfade 0.5s
  Субтитры: да
  Intro/outro: да

Итого:
  Файл: install-lesson-edited.mp4
  Длительность: 7:45
  Разрешение: 1920x1080
  Размер: 112 MB
```

## Ошибки и восстановление

- Любая фаза падает → прочитай лог ошибки, попробуй альтернативный путь из соответствующего скилла
- Deepgram не устанавливается → используй только визуальный анализ (scenedetect + кейфреймы)
- Результат слишком длинный → повысь порог score до 7 или 8
- Результат слишком короткий → понизь порог до 5, включи больше сегментов
- Рассинхрон → перекодируй все сегменты с одинаковыми параметрами перед склейкой

## Пример 1: Полная обработка

**Input:** «Обработай мой урок по установке AI Office. Файл: /recordings/lesson-01.mp4. Сделай highlight на 5-7 минут.»

**Output:**
```
Запускаю полный pipeline...

[Фаза 1/3] Анализ...
  ✓ Транскрипт: 342 слова, 15 сегментов
  ✓ Тишина: 14:30 (34%)
  ✓ Сцены: 23 перехода
  ✓ Мясных моментов: 7 (score>=6)

Топ моменты:
  #3  [02:15] score=10 "AI Office запустился!"
  #7  [12:30] score=9  "Ключевой инсайт"
  #11 [25:00] score=8  "Ошибка → решение"

[Фаза 2/3] Нарезка...
  ✓ 7 сегментов вырезаны
  ✓ Тишина удалена
  ✓ 2 сегмента ускорены x4

[Фаза 3/3] Сборка...
  ✓ Нормализация
  ✓ Субтитры сгенерированы
  ✓ Crossfade переходы
  ✓ Intro + outro

Готово!
Файл: lesson-01-edited.mp4 (7:12, 98 MB)
Субтитры: lesson-01-edited.srt
```

## Пример 2: Быстрая очистка

**Input:** «Просто убери паузы из записи, субтитры не нужны.»

**Output:**
```
Запускаю в режиме clean...

[Фаза 1] Анализ тишины...
  ✓ Тишина: 18:20 из 45:00 (41%)

[Фаза 2] Удаление пауз...
  ✓ auto-editor: 45:00 → 26:40

[Фаза 3] Экспорт...
  ✓ Без переходов, без субтитров

Файл: recording-clean.mp4 (26:40, 210 MB)
```
