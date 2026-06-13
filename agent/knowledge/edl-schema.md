# EDL JSON-схема — Edit Decision List

> EDL = план монтажа до рендера. LLM принимает решения (что резать) — mcp-video исполняет (typed команды).
> Никогда не наоборот.

## КОНТРАКТ ПОРЯДКА ФАЙЛОВ — Пайплайн v3 (Правка ревью #1)

```
filelist.txt (footage + interstitials)
    ↓ [mcp-video concat / ffmpeg concat]
assembled.mp4
    ↓ [Deepgram words=true]
assembled-transcript.json
    ↓ [anchor-overlays.mjs]
overlay-timecodes.json
    ↓ [ffmpeg filter_complex — ОДИН проход, ВСЕ оверлеи]
overlaid.mp4
    ↓ [ffmpeg zoompan / mcp-video zoom-effect — ПОСЛЕДНИЙ]
final.mp4
    ↓ [субтитры mov_text]
output.mp4
```

### Правило: overlay ВСЕГДА на assembled.mp4, zoom ПОСЛЕДНИМ

**ЗАПРЕЩЕНО:** накладывать overlay на zoomed.mp4 или делать два overlay-прохода с zoom между ними.

Причина: zoom/zoompan меняет PTS кадров. Тайм-коды overlay вычисляются из
assembled-transcript.json (транскрипт assembled.mp4 до zoom). Если overlay наложен
до zoom — тайм-коды правильные. Если после zoom — нужна ретранскрипция zoomed.mp4,
что не предусмотрено пайплайном.

### Правило: anchor-overlays.mjs запускается на ФИНАЛЬНОМ тайм-лайне после нарезки

```bash
# ПРАВИЛЬНО: по assembled-transcript.json (транскрипт assembled.mp4)
node anchor-overlays.mjs --anchors overlays-anchors.json \
  --transcript assembled-transcript.json --output overlay-timecodes.json

# НЕПРАВИЛЬНО: по EDL-транскрипту до нарезки (тайм-коды сдвинутся)
# node anchor-overlays.mjs --transcript raw-transcript.json  ← НЕЛЬЗЯ
```

### Правило: full-screen interstitials в filelist.txt как обычные mp4

Interstitials вставляются в filelist.txt МЕЖДУ footage-сегментами (в точках завершения шага).
Порядок: footage → interstitial → footage. Concat их без отдельной логики.

```
file 'segments/seg_003.mp4'
file 'out/interstitial_01.mp4'   ← FullScreenScene, рендер MP4 (без альфы)
file 'segments/seg_004.mp4'
```

---

---

## Полная JSON-схема

```json
{
  "source": "input.mp4",
  "target_duration_sec": 300,
  "target_format": "16:9",
  "created_at": "2026-05-27T10:00:00Z",
  "segments": [
    {
      "id": 1,
      "start_sec": 15.0,
      "end_sec": 102.3,
      "keep": true,
      "score": 9,
      "type": "insight",
      "reason": "Ключевой инсайт: объяснение как работает EDL",
      "transcript_excerpt": "Смотрите, это работает..."
    },
    {
      "id": 2,
      "start_sec": 102.3,
      "end_sec": 145.0,
      "keep": false,
      "score": 2,
      "type": "filler",
      "reason": "Ожидание загрузки без комментариев",
      "transcript_excerpt": ""
    }
  ],
  "silence_remove": [
    {
      "start_sec": 45.0,
      "end_sec": 57.3,
      "action": "cut"
    }
  ],
  "speed_segments": [
    {
      "start_sec": 120.0,
      "end_sec": 180.0,
      "speed": 4.0,
      "reason": "Набор текста без комментариев"
    }
  ]
}
```

### Типы сегментов (`type`)

| Тип | Описание |
|-----|----------|
| `hook` | Хук — самый сильный момент, первые 3 сек клипа |
| `insight` | Инсайт, открытие, ключевая мысль |
| `result` | Демонстрация результата |
| `demo` | Активная демонстрация процесса |
| `problem` | Проблема, ошибка, конфликт |
| `transition` | Переход между блоками |
| `filler` | Заполнитель — вырезать |

### Форматы (`target_format`)

`"16:9"` — YouTube, `"9:16"` — Shorts/Reels/TikTok, `"1:1"` — Instagram Post

---

## Алгоритм трансляции EDL → mcp-video вызовы

### Шаг 1: Trim — нарезка сегментов

Для каждого `segment` где `keep: true`:

```
mcp-video trim \
  --input {source} \
  --start {start_sec} \
  --end {end_sec} \
  --output /tmp/edl-segments/seg_{id}.mp4
```

Порядок: по `id` (хронологически). Margin ±0.3 сек уже учтён в `start_sec`/`end_sec`.

### Шаг 2: Silence remove — удаление тишины

Для каждого интервала в `silence_remove`:

```
mcp-video silence-remove \
  --input /tmp/edl-segments/seg_{id}.mp4 \
  --threshold -30dB \
  --min-silence-duration 2.0 \
  --margin 0.3 \
  --output /tmp/edl-segments/seg_{id}_clean.mp4
```

### Шаг 3: Speed — ускорение скучных частей

Для каждого интервала в `speed_segments`:

```
mcp-video speed \
  --input /tmp/edl-segments/seg_{id}.mp4 \
  --factor {speed} \
  --output /tmp/edl-segments/seg_{id}_fast.mp4
```

### Шаг 4: Concat — склейка финала

```
mcp-video concat \
  --inputs seg_001.mp4 seg_003.mp4 seg_007.mp4 \
  --output assembled.mp4 \
  --transition crossfade \
  --transition-duration 0.5
```

Порядок inputs = порядок `id` у `keep: true` сегментов.

---

## Fallback на FFmpeg (если mcp-video недоступен)

Проверка: `claude mcp list | grep mcp-video` → если не найден → fallback.

### Trim (FFmpeg эквивалент)

```bash
ffmpeg -i input.mp4 \
  -ss {start_sec} -to {end_sec} \
  -c:v libx264 -c:a aac \
  -avoid_negative_ts make_zero \
  /tmp/edl-segments/seg_{id}.mp4
```

Важно: `-c:v libx264 -c:a aac` (не `-c copy`) — точная нарезка по кадрам.

### Silence remove (FFmpeg)

```bash
ffmpeg -i seg.mp4 \
  -af "silenceremove=start_periods=1:start_silence=0.5:start_threshold=-30dB,\
       silenceremove=stop_periods=-1:stop_silence=0.5:stop_threshold=-30dB" \
  seg_clean.mp4
```

### Speed (FFmpeg)

```bash
ffmpeg -i seg.mp4 \
  -filter_complex "[0:v]setpts=0.25*PTS[v];[0:a]atempo=4.0[a]" \
  -map "[v]" -map "[a]" \
  seg_fast.mp4
```

Примечание: `atempo` поддерживает max 2.0x за один проход. Для x4: два прохода `atempo=2.0,atempo=2.0`.

### Concat (FFmpeg)

```bash
# Создать filelist.txt:
# file 'seg_001.mp4'
# file 'seg_003.mp4'
ffmpeg -f concat -safe 0 -i filelist.txt -c copy assembled.mp4
```

---

## Word-level якорение оверлеев (обязательно)

> Добавлено 2026-05-27. Источник: провал VPN-туториала — MapEurope появилась на 23 сек
> раньше речи о странах. Причина: тайм-код задан по плановым секундам EDL, а реальный
> тайм-лайн сместился после hook-prepend + silence_remove + speed_segments.

### Правило: тайминг вставки определяется словом в речи, а не плановой секундой.
### Рассинхрон вставки с речью = провал. Это главный баг видеомонтажа.

Каждая вставка (overlay) должна иметь поле `anchor_phrase` — короткую цитату из транскрипта,
ПОСЛЕ которой (или одновременно с которой) должна появиться графика.

```json
{
  "overlays": [
    {
      "id": "map-europe",
      "component": "MapEurope",
      "anchor_phrase": "нидерланды польша",
      "duration_sec": 5,
      "offset_sec": -0.3,
      "props": { "showArcs": true }
    },
    {
      "id": "kinetic-vpn",
      "component": "KineticText",
      "anchor_phrase": "VPN работает",
      "duration_sec": 3.5,
      "offset_sec": 0,
      "props": { "text": "VPN РАБОТАЕТ", "highlight": "работает" }
    }
  ]
}
```

### Поля anchor_phrase

| Поле | Обязательно | Описание |
|------|-------------|---------|
| `anchor_phrase` | ДА | Дословная фраза из транскрипта (2-5 слов). Ищется в финальном SRT/Deepgram. |
| `offset_sec` | нет | Смещение относительно найденной фразы. Отрицательное = появиться чуть раньше слова. |
| `duration_sec` | нет | Длительность показа (сек). По умолчанию из компонента. |

### Pipeline якорения

**После финальной нарезки — ПЕРЕД overlay-сборкой:**

```bash
# 1. Транскрибировать финальный assembled.mp4 (Deepgram — точнее; SRT — как fallback)
# Если Deepgram есть:
source "${ENV_FILE:-.env}"   # файл с DEEPGRAM_API_KEY (или задай переменную заранее)
curl "https://api.deepgram.com/v1/listen?model=nova-3&language=ru&words=true&utterances=true" \
  -H "Authorization: Token $DEEPGRAM_API_KEY" \
  --data-binary @/tmp/final-audio.wav \
  -o /tmp/final-transcript.json

# 2. Якорить overlay-тайм-коды по транскрипту финала:
node office/agents/videographer/remotion-studio/scripts/anchor-overlays.mjs \
  --anchors overlays-anchors.json \
  --transcript /tmp/final-transcript.json \
  --output overlay-timecodes.json

# 3. Использовать overlay-timecodes.json для генерации enable= строк в ffmpeg
```

**Если Deepgram недоступен — fallback на финальный SRT:**
```bash
# Сначала сгенерировать финальный SRT из assembled.mp4 через whisper
python3 -m whisper assembled.mp4 --model medium --language ru --output_format srt -o srt/

# Затем якорить по SRT (точность блочная, не word-level):
node remotion-studio/scripts/anchor-overlays.mjs \
  --anchors overlays-anchors.json \
  --transcript srt/assembled.srt \
  --output overlay-timecodes.json
```

**Ключевое правило:** overlay-тайм-коды НЕ задаются вручную «на глаз».
Они всегда вычисляются из якоря. Исключение только если фраза в транскрипте
отсутствует — тогда тайм-код задаётся с пометкой `"manual": true` и требует
ручной проверки кадром (`ffmpeg -i assembled.mp4 -ss {tc} -vframes 1 check.png`).

---

## Чеклист валидации: EDL ↔ исполнение

> Проблема прогона: EDL JSON и bash-скрипты разъехались (план и реализация не совпадали).
> Обязательная проверка перед передачей в video-cut.

**Перед стартом нарезки (video-cut читает этот чеклист):**

```python
# Простая валидация edl.json перед исполнением
import json, os

with open('edl.json') as f:
    edl = json.load(f)

# 1. Файл источника существует
assert os.path.exists(edl['source']), f"Source не найден: {edl['source']}"

# 2. Сегменты не перекрываются
keeps = sorted([s for s in edl['segments'] if s['keep']], key=lambda x: x['start_sec'])
for i in range(len(keeps)-1):
    assert keeps[i]['end_sec'] <= keeps[i+1]['start_sec'], \
        f"Перекрытие сегментов: {keeps[i]['id']} и {keeps[i+1]['id']}"

# 3. Speed_segments попадают в keep-сегменты
keep_ranges = [(s['start_sec'], s['end_sec']) for s in keeps]
for sp in edl.get('speed_segments', []):
    covered = any(r[0] <= sp['start_sec'] and sp['end_sec'] <= r[1] for r in keep_ranges)
    assert covered, f"Speed segment [{sp['start_sec']}-{sp['end_sec']}] не в keep-сегментах"

# 4. Суммарная длина keep-сегментов в пределах ожидаемого
total = sum(s['end_sec'] - s['start_sec'] for s in keeps)
target = edl.get('target_duration_sec', total)
assert abs(total - target) / target <= 0.3, f"Длина {total:.0f}с vs цель {target:.0f}с (>30%)"

print(f"EDL ОК: {len(keeps)} сегментов, ~{total:.0f}с → цель {target:.0f}с")
```

Если валидация прошла — передать в video-cut. Если нет — исправить EDL.

## Self-eval loop после построения EDL

После генерации EDL — агент оценивает план по 3 осям:

| Ось | Описание | 0-1 |
|-----|----------|-----|
| **Adherence** | EDL соответствует запросу (формат, хронометраж, тип контента) | 0.0-1.0 |
| **Pacing** | Темп: нет кусков >30 сек score<5 подряд, нет резких переходов без мотивации | 0.0-1.0 |
| **Virality** | Для shorts: хук в первые 3 сек, ≥1 момент score≥8, итоговый score ≥8 по 8 типам | 0.0-1.0 |

**Правило:** если суммарный score (Adherence + Pacing + Virality) < 1.5 → пересмотр EDL, retry.
Максимум **2 попытки**. Если после 2 попыток score < 1.5 — показать владельцу с комментарием «что не получилось исправить».

Для нешортс-контента ось Virality = 1.0 автоматически (не применяется).

---

## Пример: полный трейс EDL → вызовы

**Задача:** highlight reel из 40-минутного видео, 5 мин, YouTube 16:9

**EDL (сокращённый):**
```json
{
  "source": "lesson.mp4",
  "target_duration_sec": 300,
  "target_format": "16:9",
  "segments": [
    {"id": 1, "start_sec": 15.0, "end_sec": 90.0, "keep": true, "score": 10, "type": "hook"},
    {"id": 2, "start_sec": 90.0, "end_sec": 150.0, "keep": false, "score": 1, "type": "filler"},
    {"id": 3, "start_sec": 150.0, "end_sec": 320.0, "keep": true, "score": 8, "type": "insight"}
  ]
}
```

**Трейс вызовов:**
```
1. mcp-video trim --input lesson.mp4 --start 15.0 --end 90.0 --output seg_001.mp4
2. mcp-video trim --input lesson.mp4 --start 150.0 --end 320.0 --output seg_003.mp4
3. mcp-video silence-remove --input seg_001.mp4 --threshold -30dB --output seg_001_clean.mp4
4. mcp-video silence-remove --input seg_003.mp4 --threshold -30dB --output seg_003_clean.mp4
5. mcp-video concat --inputs seg_001_clean.mp4 seg_003_clean.mp4 --output assembled.mp4
```

**Self-eval:**
- Adherence: 1.0 (формат 16:9, хронометраж ~4:50 в пределах ±10%)
- Pacing: 0.9 (один переход без мотивации — приемлемо)
- Virality: 1.0 (не shorts — автопасс)
- Итого: 2.9 > 1.5 → ОК, показываем план владельцу
