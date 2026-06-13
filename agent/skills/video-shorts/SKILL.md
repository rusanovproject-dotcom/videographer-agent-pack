---
name: video-shorts
description: >
  Полный pipeline 9:16: virality scoring + автокадрирование + Hormozi-субтитры.
  Берёт raw-видео → выдаёт shorts-output.mp4 + shorts.srt.
  Порог virality ≥8. Хук обязателен в первые 3 сек.
  MANDATORY TRIGGERS: «сделай шортс», «reels», «tiktok клип», «вертикальное видео»,
  «60 секунд», «shorts», «reel», «тикток».
  Отличие от video-social: создаёт новый клип с нуля (не адаптирует готовое).
allowed-tools:
  - Read
  - Write
  - Bash
---

# Video Shorts — 9:16 Pipeline

<!-- Mandatory triggers: сделай шортс, reels, tiktok клип, вертикальное видео, 60 секунд, shorts -->

Полный пайплайн для вертикального контента.
Отличие от video-social: ты создаёшь новый клип с нуля из raw footage, а не адаптируешь готовое.

## Вход

| Параметр | Описание | По умолчанию |
|----------|----------|--------------|
| `source` | Путь к raw-видео | — |
| `topic` | Тема/идея клипа (одна фраза) | — |
| `platform` | shorts / reels / tiktok | shorts |
| `max_duration_sec` | Макс длина | 60 |
| `language` | Язык речи | ru |

## Шаги

### Шаг 1: Загрузка стиля и форматов

Прочитай:
- `../../soul.md` — настройки стиля (дефолты если не заполнен)
- `../../knowledge/formats.md` — параметры платформ
- `../../knowledge/montage-patterns.md` — секция Virality Scoring

### Шаг 2: Анализ footage (через video-analyze)

Запустить video-analyze с параметрами:
```
content_type: shorts
language: {language}
```

Получить `analysis-map.json`.

Если analysis-map.json уже существует — использовать его, не запускать повторно.

### Шаг 2.5: 2-стадийная детекция момента (защита от галлюцинаций таймкодов)

> Паттерн из PromptClip — LLM ищет смысл, таймкоды отдельным детерминированным шагом.

**Стадия 1 — LLM ищет подстроки, не время:**
- Отдать транскрипт чанками → попросить найти точные подстроки для хука/основных блоков
- Возврат: `{"sentences": ["точная строка из транскрипта", ...]}`
- LLM **не пишет числа времени** → ноль галлюцинаций

**Стадия 2 — таймкоды через keyword-search:**
```python
# Найти тайм-код найденной подстроки по word-timestamps из Deepgram/Whisper
for sentence in found_sentences:
    words = sentence.lower().split()[:3]  # первые 3 слова
    for word_entry in transcript_words:
        if word_entry['word'].lower() in words:
            start_time = word_entry['start']
            break
```

**Финальная проверка (обязательно перед резом):**
```bash
# Снять кадр в найденном тайм-коде — убедиться что он совпадает с ожидаемым
ffmpeg -i source.mp4 -ss {found_start} -vframes 1 /tmp/check_{id}.png
```

Все 3 шортса в боевом прогоне: смысловые хуки по транскрипту совпали с реальными кадрами (S3 — ErrorCode 305 на экране синхронен с капшеном «У НАС ТАЙМАУТ»).

### Шаг 3: Virality scoring

Для каждого сегмента из анализа — оценить по 8 типам из `montage-patterns.md` (секция Virality Scoring):

| Тип сигнала | Score |
|-------------|-------|
| Hook moment | 10 |
| Opinion bomb | 10 |
| Revelation | 9 |
| Emotional peak | 9 |
| Conflict/tension | 8 |
| Story peak | 8 |
| Quotable | 7 |
| Practical value | 7 |

**Порог для Shorts: score >= 8** (жёстче чем highlight reel >= 6).

Найти лучший hook-момент (score = 10 предпочтительно, минимум 8).
Если hook не найден → сообщить владельцу ПЕРЕД продолжением: «Хук с score≥8 не найден. Лучший момент — [тайм-код, score=X]. Продолжать с ним?»

### Шаг 4: Построение EDL для shorts (через video-edl)

Передать в video-edl:
```
target_duration_sec: {max_duration_sec}
target_format: 9:16
content_type: shorts
platform: {platform}
```

Обязательные требования к EDL для shorts:
- Первый сегмент = hook (score=10 или лучший доступный)
- Хук умещается в первые 3 сек финального клипа
- Суммарная длина ≤ max_duration_sec
- Минимум 1 сегмент score≥8 помимо хука (если footage позволяет)

Self-eval в video-edl: ось Virality считается строго (не автопасс).

### Шаг 5: Human checkpoint

Показать план владельцу:
```
=== SHORTS ПЛАН ===
Платформа: {platform} | Длина: ~{N} сек | Формат: 9:16

Хук (первые 3 сек):
  [14:23–14:26] «Я уволился с работы за один день» — score=10

Основные блоки:
  [07:15–07:45] Revelation score=9 — «вот что изменило всё»
  [22:10–22:40] Conflict score=8 — «всё пошло не так»

Virality score итогового клипа: 9.2/10
Согласуешь?
```

Получить ОК перед рендером.

### Шаг 6: Нарезка (через video-cut)

Передать `edl.json` в video-cut. Получить `assembled.mp4`.

### Шаг 7: Кадрирование 9:16 (центр-кроп, без MediaPipe)

MediaPipe (авто-трекинг лица) НЕ используется — ад зависимостей на Apple Silicon.
Центр-кроп покрывает 80%+ случаев. Геометрия: `crop=608:1080:X:0,scale=1080:1920`
- 608 = 1080 × 9/16 = ширина для 9:16 при исходной высоте 1080

**Определи X под «звезду кадра»:**
```bash
# Снять кадр и визуально определить X
ffmpeg -i assembled.mp4 -ss 1 -vframes 1 /tmp/shorts/check_frame.png
```

| Что в кадре | Рекомендуемый X |
|-------------|----------------|
| Терминал/экран по центру | 656 (≈ (1920-608)/2) |
| Лицо/голова справа | 1290 |
| Окно приложения слева | 180 |
| Безопасный центр (авто) | `(iw-ow)/2` |

```bash
# Центр-кроп с punch-in зумом (рекомендуется для лица):
ffmpeg -i assembled.mp4 \
  -vf "crop=608:1080:{X}:0,scale=1080:1920,zoompan=z='min(zoom+0.0006,1.08)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30" \
  -c:v libx264 -c:a aac \
  /tmp/shorts/cropped.mp4

# Без зума (для статичного экрана):
ffmpeg -i assembled.mp4 \
  -vf "crop=608:1080:{X}:0,scale=1080:1920" \
  -c:v libx264 -c:a aac \
  /tmp/shorts/cropped.mp4
```

Через mcp-video (если доступен):
```
mcp-video crop \
  --input assembled.mp4 \
  --aspect 9:16 \
  --output /tmp/shorts/cropped.mp4
```

**Quality gate:** `ffprobe /tmp/shorts/cropped.mp4 | grep 1080x1920`

> Рецепты кропа и zoompan: `knowledge/ffmpeg-recipes.md` (Правило 3, 4)

### Шаг 8: Субтитры — Hormozi-стиль через ShortsCaptions

> ⚠️ `subtitles=` filter НЕ работает без libass в Homebrew ffmpeg. Не пытаться.
> Правильный путь для шортсов — Remotion-компонент `ShortsCaptions`.

**Рабочий путь (проверен в боевом прогоне):**

**Шаг 8а — Конвертация SRT в JSON-чанки:**
```bash
# Авто-чанкер: SRT → JSON чанков 2-5 слов + highlight эвристика
# Если SRT для полного видео: --offset = -start_sec_of_short (сдвиг таймингов в 0)
# Например: шортс начинается с raw 372 сек → --offset=-372
node remotion-studio/scripts/srt-to-captions.mjs full-video.srt captions.json --offset=-372.5
# Если SRT уже нарезан под шортс (тайминги с 0):
node remotion-studio/scripts/srt-to-captions.mjs shorts-segment.srt captions.json
```

Формат `captions.json`:
```json
{
  "lines": [
    { "start": 0.3, "end": 2.5, "text": "VPN РАБОТАЕТ", "highlight": "работает" },
    { "start": 2.5, "end": 5.0, "text": "но почему ШВЕЦИЯ?", "highlight": "швеция" }
  ]
}
```

Правила чанкинга:
- 2-5 слов на строку (Hormozi-стиль)
- Не разрезать фразы по смыслу — лучше короткая строка, чем разрыв
- `highlight` — ключевое слово строки (длинное/редкое/смысловое или первое в хуке)

**Шаг 8б — Рендер ShortsCaptions:**
```bash
# Один рендер = весь трек капшенов шортса
node remotion-studio/render.mjs ShortsCaptions captions-overlay.mov --props=captions.json
```

**Шаг 8в — Наложение на кроп:**
```bash
ffmpeg -i cropped.mp4 -i captions-overlay.mov \
  -filter_complex "[0:v][1:v]overlay=0:0" \
  -c:v libx264 -c:a copy \
  /tmp/shorts/shorts-output.mp4
```

**Альтернатива: мягкие субтитры** (если ShortsCaptions недоступен):
```bash
ffmpeg -i cropped.mp4 -i shorts.srt \
  -c:v copy -c:a copy -c:s mov_text \
  /tmp/shorts/shorts-output.mp4
# YouTube читает mov_text, но без Hormozi-стиля
```

Через mcp-video (если поддерживает):
```
mcp-video add-subtitles \
  --input cropped.mp4 \
  --srt shorts.srt \
  --style hormozi \
  --output /tmp/shorts/shorts-output.mp4
```

> Компонент: `remotion-studio/src/components/ShortsCaptions.tsx`
> Авто-чанкер: `remotion-studio/scripts/srt-to-captions.mjs`

### Шаг 9: Финальная нормализация

```
mcp-video normalize \
  --input shorts-output.mp4 \
  --platform {platform} \
  --output /tmp/shorts/final.mp4
```

Параметры из `knowledge/formats.md` для платформы.

## Формат вывода

```
/tmp/shorts/
├── shorts-output.mp4    # финальный вертикальный клип
├── shorts.srt           # субтитры
└── shorts-report.md     # отчёт
```

`shorts-report.md`:
```
=== SHORTS ОТЧЁТ ===
Источник: raw.mp4 (25:30)
Платформа: {platform} | Формат: 1080×1920

Хук: [14:23–14:26] «...» — score=10
Блоков: 5 | Длина итогового клипа: 0:58
Virality score: 9.2/10

Субтитры: hormozi-стиль ✓
Кадрирование: auto-reframe 9:16 ✓

Файлы:
  shorts-output.mp4
  shorts.srt
```

## Ошибки и восстановление

- Хук не найден (score<8) → сообщить владельцу, предложить продолжить с лучшим доступным
- Footage короче max_duration_sec → использовать полностью, без принудительных срезов
- mcp-video crop не поддерживает auto-reframe → использовать центральный кроп (FFmpeg fallback)
- Deepgram недоступен → субтитры пропустить, предупредить в отчёте

## Примеры

**Input:** `сделай шортс из interview.mp4, тема "как я бросил работу"`

**Output:**
```
Анализирую footage...
Нашёл хук: [14:23] «Я уволился с работы за один день» — score=10 ✓
Virality plan: 5 блоков, 0:58

Согласуешь план? (покажу тайм-коды)
```

**Input:** `reels из lesson.mp4, 30 секунд, без субтитров`

**Output:**
```
Ищу лучший 30-секундный момент...
Хук [07:15–07:18] — «вот что изменило всё» — score=9
Блоков: 3, итого 0:29

Субтитры: пропущены по запросу.
Согласуешь?
```
