---
name: video-cut
description: >
  Фаза 2: Нарезка видео по EDL-плану. Читает edl.json → транслирует в серию
  mcp-video typed-вызовов (trim / silence-remove / speed / concat).
  FFmpeg — только fallback если mcp-video недоступен.
  MANDATORY TRIGGERS: «нарежь видео», «вырежи моменты», «убери тишину», «удали паузы»,
  «нарезка по тайм-кодам», «обрежь видео», «cut video», «нарезка».
  НЕ используй для анализа (→ video-analyze) или сборки (→ video-assemble).
allowed-tools:
  - Read
  - Write
  - Bash
---

# Video Cut — Нарезка по EDL

<!-- Mandatory triggers: нарежь видео, вырежи моменты, убери тишину, удали паузы -->

Фаза 2 монтажа. Берёшь `edl.json` из video-edl и исполняешь решения через mcp-video.
Ты исполнитель — EDL уже принял решения что резать и почему.

## Вход

- `edl.json` — план монтажа из video-edl (обязателен)
- Путь к исходному видео (берётся из поля `source` в edl.json)
- Рабочая директория для сегментов (по умолчанию `/tmp/video-cut/`)

Если `edl.json` не существует — сказать: «Сначала запусти video-edl для построения плана монтажа».

## Шаги

### Шаг 1: Валидация входных данных

```bash
# Проверить что edl.json существует и валиден:
python3 -c "
import json, sys
with open('edl.json') as f:
    d = json.load(f)
segs = [s for s in d['segments'] if s['keep']]
print(f'Сегментов к нарезке: {len(segs)}')
print(f'Источник: {d[\"source\"]}')
"
```

Проверить что файл источника существует. Если нет — сказать пользователю.

### Шаг 2: Проверка mcp-video

```bash
claude mcp list | grep mcp-video
```

- Найден → основной путь через mcp-video (секция ниже)
- Не найден → fallback на FFmpeg (секция Fallback)

### Шаг 3: Нарезка через mcp-video (основной путь)

Для каждого сегмента с `keep: true` (по порядку id):

```
mcp-video trim \
  --input {edl.source} \
  --start {segment.start_sec} \
  --end {segment.end_sec} \
  --output /tmp/video-cut/seg_{segment.id:03d}.mp4
```

**Quality gate:** каждый сегмент создан и не пустой.

### Шаг 4: Удаление тишины через mcp-video

Для каждого интервала в `edl.silence_remove`:

```
mcp-video silence-remove \
  --input /tmp/video-cut/seg_{id}.mp4 \
  --threshold -30dB \
  --min-silence-duration 2.0 \
  --margin 0.3 \
  --output /tmp/video-cut/seg_{id}_clean.mp4
```

Если `silence_remove` пуст — пропустить шаг.

### Шаг 5: Ускорение скучных частей через mcp-video

Для каждого интервала в `edl.speed_segments`:

```
mcp-video speed \
  --input /tmp/video-cut/seg_{id}.mp4 \
  --factor {speed_segment.speed} \
  --output /tmp/video-cut/seg_{id}_fast.mp4
```

**Правило агрессивной чистки:** `speed_segments` НЕ должен быть пустым если в footage есть:
- набор текста без комментариев >10 сек → x4
- ожидание загрузки / технические паузы >5 сек → x4
- паузы между словами >1.5 сек → вырезать (не ускорять, а резать)

**Quality Gate длины (железное):** финал ≤ 80% исходника.
Если assembled.mp4 ≥ исходника — speed-ramp применён неполно. Вернуться в EDL и разметить
все зоны молчания и загрузки.
Формула: `Целевая_длина = Длина_исходника × 0.8 - N_interstitials × 6`

### Шаг 6: Финальная склейка через mcp-video

```
mcp-video concat \
  --inputs seg_001_clean.mp4 seg_003_clean.mp4 seg_005_clean.mp4 \
  --output /tmp/video-cut/assembled.mp4 \
  --transition crossfade \
  --transition-duration 0.5
```

Порядок inputs = порядок id всех `keep: true` сегментов (после обработки silence/speed).

**Quality gate:** `assembled.mp4` воспроизводится без ошибок.

---

## Fallback на FFmpeg (если mcp-video недоступен)

> Используй ТОЛЬКО если mcp-video не найден. Прямой FFmpeg — не основной путь.

### Trim

```bash
ffmpeg -i {source} \
  -ss {start_sec} -to {end_sec} \
  -c:v libx264 -c:a aac \
  -avoid_negative_ts make_zero \
  /tmp/video-cut/seg_{id:03d}.mp4
```

Важно: `-c:v libx264 -c:a aac` (не `-c copy`) — точная нарезка по кадрам.
`-c copy` режет по ключевым кадрам и может сдвинуть границы на 1–5 секунд.

### Silence remove (FFmpeg)

```bash
ffmpeg -i seg.mp4 \
  -af "silenceremove=start_periods=1:start_silence=0.5:start_threshold=-30dB,\
       silenceremove=stop_periods=-1:stop_silence=0.5:stop_threshold=-30dB" \
  seg_clean.mp4
```

### Speed x4 (FFmpeg) — ОБЯЗАТЕЛЬНО 2 шага

> ⚠️ Speed-ramp в один проход (нарезка + filter_complex) даёт пустой файл на ffmpeg 8.1.1 / Apple Silicon.
> Всегда: сначала нарезать сырой сегмент, затем ускорять отдельной командой.

```bash
# Шаг 1: нарезать сырой сегмент (без фильтров)
ffmpeg -i source.mp4 \
  -ss {start_sec} -to {end_sec} \
  -c:v libx264 -c:a aac \
  -avoid_negative_ts make_zero \
  seg_raw.mp4

# Шаг 2: ускорить отдельно
ffmpeg -i seg_raw.mp4 \
  -filter_complex "[0:v]setpts=0.25*PTS[v];[0:a]atempo=2.0,atempo=2.0[a]" \
  -map "[v]" -map "[a]" \
  seg_fast.mp4
```

`atempo` max 2.0x за проход. Для x4 → два прохода `atempo=2.0,atempo=2.0`. Для x2 → один `atempo=2.0`.

> Полный рецепт: `knowledge/ffmpeg-recipes.md` (Правило 1)

### Concat (FFmpeg)

```bash
# Создать filelist.txt:
# file '/tmp/video-cut/seg_001.mp4'
# file '/tmp/video-cut/seg_003.mp4'
ffmpeg -f concat -safe 0 -i filelist.txt -c copy assembled.mp4
```

---

## Формат вывода

```
/tmp/video-cut/
├── seg_001.mp4          # сегмент 1
├── seg_001_clean.mp4    # после silence-remove
├── seg_003.mp4
├── seg_003_clean.mp4
├── ...
├── assembled.mp4        # финальный файл для video-assemble
└── cut-report.md        # отчёт
```

`cut-report.md`:
```
=== НАРЕЗКА ===
EDL: edl.json | Инструмент: mcp-video (или FFmpeg fallback)
Источник: input.mp4 (40:12)
Сегментов нарезано: 7
Суммарный хронометраж: 5:34
Тишины удалено: 12:45
Ускорено x4: 2 части
Файл: /tmp/video-cut/assembled.mp4
Следующий шаг: video-assemble
```

## Ошибки и восстановление

- `edl.json` отсутствует → «Сначала запусти video-edl»
- mcp-video даёт ошибку на конкретном сегменте → пропустить, записать в cut-report.md как `skipped`
- Сегмент пустой после обработки → пропустить, записать в лог
- assembled.mp4 не воспроизводится → пересобрать через FFmpeg fallback

## Примеры

**Input:** `нарежь видео по /tmp/edl/edl.json`

**Output:**
```
=== НАРЕЗКА ===
Прочитал EDL: 8 сегментов к нарезке.
Инструмент: mcp-video ✓

Нарезаю:
  seg_001 [00:15–01:30] → OK (1:15)
  seg_003 [02:15–03:40] → OK (1:25)
  seg_005 [07:20–08:45] → OK (1:25)
  ...

Тишина удалена: 23 интервала (12:45)
Ускорено x4: 2 части

Склейка → assembled.mp4 (5:12) ✓
Готово к сборке (video-assemble).
```
