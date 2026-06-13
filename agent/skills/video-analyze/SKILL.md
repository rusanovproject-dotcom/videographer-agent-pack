---
name: video-analyze
description: >
  Фаза 1: Анализ raw-видеозаписи. Транскрипция через Deepgram, детекция сцен через PySceneDetect,
  поиск тишины через FFmpeg silencedetect, извлечение кейфреймов для визуального анализа.
  Результат: карта мясных моментов с тайм-кодами и scoring.
  Триггеры: «проанализируй видео», «найди интересные моменты», «разбери запись»,
  «что интересного в записи», «карта моментов», «анализ видео».
  НЕ используй для нарезки (-> video-cut) или сборки (-> video-assemble).
---

# Video Analyze — Анализ записи

<!-- Mandatory triggers: проанализируй видео, найди интересные моменты, карта моментов -->

Первая фаза монтажа. Берёшь raw-видео, пропускаешь через 3 анализатора, строишь карту мясных моментов.

## Вход

- Путь к видеофайлу (.mp4, .mkv, .webm, .mov)
- Язык речи (по умолчанию: ru)
- Тип контента (по умолчанию: видеоурок)

## Шаги

### Шаг 1: Проверка инструментов
```bash
which ffmpeg && which ffprobe || echo "BLOCKER: ffmpeg not found"
```
Если не установлен — установи. Deepgram, scenedetect, auto-editor установи через pip если нужны.

**Quality gate:** все инструменты доступны → переходи дальше.

### Шаг 2: Инфо о файле
```bash
ffprobe -v error -show_entries format=duration,size -show_entries stream=codec_name,width,height -of json INPUT
```
Запиши: длительность, разрешение, кодек, размер. Это метаданные для отчёта.

### Шаг 3: Извлечение аудио
```bash
ffmpeg -i INPUT -vn -acodec pcm_s16le -ar 16000 -ac 1 /tmp/video-audio.wav
```
Mono 16kHz — оптимально для Deepgram.

### Шаг 4: Транскрипция (Deepgram Nova-3) — word-level ОБЯЗАТЕЛЬНО

**Deepgram-ключ**: ожидается в переменной окружения `DEEPGRAM_API_KEY` (задай `export DEEPGRAM_API_KEY=...` или положи в свой `.env` и `source` его). Ключ получи на deepgram.com.
**Если получаешь ASR_PAYMENT_REQUIRED** — может быть разовым сбоем: повтори запрос. Если повторяется — кончились кредиты, fallback на whisper.
**Whisper** — только офлайн-fallback при реальном отсутствии кредитов, НЕ дефолт.

Параметры ОБЯЗАТЕЛЬНО включают `words=true` (word-level timestamps) — они нужны для `anchor-overlays.mjs`:

### Шаг 4: Транскрипция (Deepgram Nova-3)

Через curl (быстрый способ) — **words=true обязателен для якорения overlay**:
```bash
curl "https://api.deepgram.com/v1/listen?model=nova-3&language=ru&smart_format=true&punctuate=true&utterances=true&diarize=true&words=true" \
  -H "Authorization: Token $DEEPGRAM_API_KEY" \
  -H "Content-Type: audio/wav" \
  --data-binary @/tmp/video-audio.wav \
  -o /tmp/deepgram/transcript.json
```

Или через Python SDK (если нужен SRT сразу):
```python
from deepgram import DeepgramClient, PrerecordedOptions
from deepgram_captions import DeepgramConverter, srt
import os, json

dg = DeepgramClient(os.environ["DEEPGRAM_API_KEY"])
with open("/tmp/video-audio.wav", "rb") as f:
    source = {"buffer": f.read(), "mimetype": "audio/wav"}

options = PrerecordedOptions(model="nova-3", language="ru", smart_format=True, punctuate=True, utterances=True, diarize=True)
response = dg.listen.rest.v("1").transcribe_file(source, options)

with open("/tmp/deepgram/transcript.json", "w") as f:
    json.dump(response.to_dict(), f, ensure_ascii=False)

# SRT для фазы 3
captions = DeepgramConverter(response)
with open("/tmp/deepgram/subs.srt", "w") as f:
    f.write(srt(captions))
```

Результат: JSON с utterances[].transcript, .start, .end, .speaker и words[].word, .start, .end.

Если deepgram SDK не установлен:
```bash
pip install deepgram-sdk deepgram-captions --break-system-packages
```

Если DEEPGRAM_API_KEY не задан — скажи пользователю: «Нужен API-ключ Deepgram. Получи на deepgram.com и задай: export DEEPGRAM_API_KEY=...»

Для файлов >10 мин: разбей аудио на чанки по 10 мин через FFmpeg, транскрибируй каждый, объедини результаты.

**Quality gate:** JSON с транскриптом существует и содержит utterances или words >0.

### Шаг 5: Детекция тишины (FFmpeg)
```bash
ffmpeg -i INPUT -af silencedetect=n=-30dB:d=2 -f null - 2>&1 | grep -E "silence_(start|end)"
```
Парси вывод → список интервалов тишины (start, end, duration).

### Шаг 6: Детекция сцен (PySceneDetect)
```bash
scenedetect -i INPUT detect-adaptive -t 3.0 list-scenes -o /tmp/scenes/
```
Результат: CSV с границами сцен.

Если scenedetect не установлен:
```bash
pip install scenedetect[opencv] --break-system-packages
```

**Quality gate:** CSV со сценами существует.

### Шаг 7: Извлечение кейфреймов
```bash
mkdir -p /tmp/keyframes
ffmpeg -i INPUT -vf "fps=0.1,scale=640:-1" /tmp/keyframes/frame_%04d.jpg
```
1 кадр каждые 10 секунд, уменьшенный для быстрого анализа.

### Шаг 8: Построение карты моментов

Объедини данные из шагов 4-7:

1. **Транскрипт** — найди сегменты с ключевыми словами из `../../knowledge/montage-patterns.md`
2. **Тишина** — отметь интервалы для удаления
3. **Сцены** — отметь границы сцен
4. **Кейфреймы** — опиши что видишь на ключевых кадрах

Для каждого сегмента видео (по сценам) присвой score 1-10 по таблице из `../../knowledge/montage-patterns.md`.

## Формат вывода

Сохрани в файл `analysis-map.json`:
```json
{
  "source": "input.mp4",
  "duration": "40:12",
  "language": "ru",
  "segments": [
    {
      "id": 1,
      "start": "00:00:15",
      "end": "00:01:42",
      "score": 8,
      "type": "insight",
      "transcript": "Сейчас покажу как это работает...",
      "visual": "Терминал с командами установки"
    }
  ],
  "silence_intervals": [
    {"start": "00:03:15", "end": "00:03:28", "duration": 13}
  ],
  "scene_boundaries": ["00:00:00", "00:01:42", "00:05:30"],
  "recommendations": {
    "highlight_segments": [1, 3, 5, 8],
    "estimated_highlight_duration": "5:34",
    "cut_segments": [2, 4, 6, 7],
    "silence_to_remove": "12:45"
  }
}
```

Также выведи человекочитаемую сводку:
```
=== АНАЛИЗ ВИДЕО ===
Файл: input.mp4 (40:12)
Найдено сегментов: 12
Мясных (score>=6): 5 сегментов, ~5:34
Тишины: 12:45 (31%)
Рекомендуемый highlight: сегменты #1, #3, #5, #8, #11
```

## Ошибки и восстановление

- Deepgram таймаутит на длинном аудио → разбей на чанки по 10 мин через FFmpeg
- scenedetect не находит сцены → снизь threshold: `-t 1.5`
- Нет речи в видео → пропусти шаги 4, используй только визуал и тишину
- Файл повреждён → попробуй `ffmpeg -i INPUT -c copy fixed.mp4` и работай с fixed

## Пример

**Input:** `analyze /recordings/ai-office-install.mp4`

**Output:**
```
=== АНАЛИЗ ВИДЕО ===
Файл: ai-office-install.mp4 (42:18)
Разрешение: 1920x1080, кодек: h264
Найдено сегментов: 15
Мясных (score>=6): 7 сегментов, ~6:12
Тишины: 14:30 (34%)
Сцен: 23 визуальных перехода

Топ-5 моментов:
#3  [02:15-03:40] score=10 "Смотрите, AI Office запустился!" (демонстрация результата)
#7  [12:30-13:15] score=9  "Вот это ключевой момент..." (инсайт)
#11 [25:00-26:20] score=8  "Ошибка! Сейчас починим..." (проблема+решение)
#13 [33:10-34:45] score=8  "Готово, всё работает" (результат)
#1  [00:05-01:30] score=7  "Сегодня будем..." (intro)

Рекомендация: highlight reel ~6 мин из 7 сегментов.
Согласуешь карту? Могу скорректировать порог или добавить/убрать сегменты.
```
