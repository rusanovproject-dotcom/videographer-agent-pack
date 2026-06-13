---
name: video-assemble
description: >
  Фаза 3: Сборка финального видео из нарезанных сегментов. Склейка с переходами,
  добавление субтитров, intro/outro, прогресс-бар, watermark. FFmpeg filter_complex.
  Триггеры: «собери видео», «склей сегменты», «добавь субтитры», «добавь переходы»,
  «финальная сборка», «assemble», «монтаж», «смонтируй».
  НЕ используй для анализа (-> video-analyze) или нарезки (-> video-cut).
---

# Video Assemble — Финальная сборка

<!-- Mandatory triggers: собери видео, склей, субтитры, переходы, монтаж, смонтируй -->

Третья фаза монтажа. Берёшь нарезанные сегменты и собираешь финальное видео с эффектами.

## КОНТРАКТ ПОРЯДКА ФАЙЛОВ (Правка ревью #1 — железно)

Пайплайн рендера в v3 строго однонаправлен:

```
filelist.txt (footage + interstitials)
    ↓
склейка → assembled.mp4         [mcp-video concat / ffmpeg concat]
    ↓
ретранскрипция assembled.mp4    [Deepgram words=true → assembled-transcript.json]
    ↓
anchor-overlays.mjs             [якорение по assembled-transcript.json → overlay-timecodes.json]
    ↓
overlay filter_complex          [все оверлеи в ОДИН проход по assembled.mp4 → overlaid.mp4]
    ↓
zoom / zoompan                  [Ken Burns / punch-in ПОСЛЕДНИМ → final.mp4]
    ↓
субтитры                        [mov_text → output.mp4]
```

### Правила которые ЗАПРЕЩЕНО нарушать:

1. **overlay ВСЕГДА накладывается на assembled.mp4** (до zoom), НЕ на zoomed.mp4
2. **zoom / zoompan ПОСЛЕДНИЙ проход** — после всех overlay
3. **overlay-timecodes.json вычисляется из assembled-transcript.json** (не из zoomed, не вручную)
4. **anchor-overlays.mjs запускается ПОСЛЕ ретранскрипции assembled.mp4** (финальный тайм-лайн после нарезки)
5. **ЗАПРЕЩЕНО**: накладывать overlay до zoom и после zoom в разных проходах — это создаёт рассинхрон (zoom меняет timing-кадров)

### Почему этот порядок:

zoom/zoompan (ffmpeg zoompan filter) меняет PTS кадров нарастающим образом. Если сначала наложить overlay по тайм-кодам из assembled.mp4, потом применить zoom — overlay тайм-коды остаются правильными. Если наоборот (overlay после zoom) — нужны тайм-коды из zoomed.mp4, что требует ретранскрипции ещё раз.

Один проход overlay + отдельный проход zoom = правильно.
Два прохода overlay с zoom между ними = рассинхрон.

---

## Вход

- Директория с сегментами и filelist.txt (из video-cut)
- Стиль: `clean` (минимум эффектов) или `pro` (переходы, текст, intro)
- Субтитры: да/нет (по умолчанию: да)
- Заголовок видео (для intro, если стиль pro)

## Шаги

### Шаг 1: Валидация сегментов

```bash
# Проверь что все файлы из filelist.txt существуют и играются
while read line; do
  file=$(echo "$line" | sed "s/file '//;s/'//")
  ffprobe -v error "$file" && echo "OK: $file" || echo "FAIL: $file"
done < filelist.txt
```

**Quality gate:** все файлы валидны.

### Шаг 2: Нормализация сегментов

Все сегменты должны иметь одинаковые параметры:
```bash
ffmpeg -i segment.mp4 -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" -r 30 -c:v libx264 -c:a aac -ar 44100 -ac 2 normalized.mp4
```

Параметры: 1920x1080, 30fps, h264, aac 44100Hz stereo.

**Quality gate:** все нормализованные файлы одного формата.

### Шаг 3: Генерация субтитров

Если субтитры нужны и .srt ещё не создан:

**Вариант 1 (рекомендуемый):** Если SRT уже сгенерирован в video-analyze — подрежь по границам сегментов.

**Вариант 2:** Транскрибируй каждый сегмент через Deepgram:
```python
import os, json
from deepgram import DeepgramClient, PrerecordedOptions
from deepgram_captions import DeepgramConverter, srt

dg = DeepgramClient(os.environ["DEEPGRAM_API_KEY"])
options = PrerecordedOptions(model="nova-3", language="ru", smart_format=True, punctuate=True)

for seg in sorted(glob.glob("segment_*.mp4")):
    # Извлеки аудио из сегмента
    wav = seg.replace(".mp4", ".wav")
    os.system(f'ffmpeg -i {seg} -vn -acodec pcm_s16le -ar 16000 -ac 1 {wav}')

    with open(wav, "rb") as f:
        source = {"buffer": f.read(), "mimetype": "audio/wav"}
    response = dg.listen.rest.v("1").transcribe_file(source, options)

    captions = DeepgramConverter(response)
    srt_file = seg.replace(".mp4", ".srt")
    with open(srt_file, "w") as f:
        f.write(srt(captions))
```

Затем объедини .srt файлы:
```bash
python3 scripts/merge-srt.py /tmp/subs/ --output final_subs.srt
```

### Шаг 4: Склейка (стиль clean)

Простая конкатенация:
```bash
ffmpeg -f concat -safe 0 -i filelist_normalized.txt -c copy assembled.mp4
```

Добавь субтитры:
```bash
# Вариант А: мягкие субтитры (mov_text) — работает без libass, YouTube читает
ffmpeg -i assembled.mp4 -i final_subs.srt \
  -c:v copy -c:a copy -c:s mov_text \
  output.mp4

# Вариант Б: встроенные (burn-in) через subtitles= filter — ТОЛЬКО если ffmpeg скомпилирован с libass
# Проверка: ffmpeg -buildconf 2>&1 | grep libass
# Если libass не найден — НЕ использовать этот вариант, перейти на mov_text или drawtext
ffmpeg -i assembled.mp4 -vf "subtitles=final_subs.srt:force_style='FontSize=22,FontName=Arial,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Shadow=1'" output.mp4
```

> ⚠️ Homebrew ffmpeg собран без libass → `subtitles=` не работает. Используй мягкие субтитры.
> Для Hormozi-стиля в шортсах — использовать Remotion ShortsCaptions (не ffmpeg).
> Рецепты: `knowledge/ffmpeg-recipes.md` (Правило 2)

### Шаг 5: Склейка (стиль pro)

Для переходов нужен filter_complex. Пример с crossfade между 2 сегментами:
```bash
ffmpeg -i seg1.mp4 -i seg2.mp4 -filter_complex \
  "[0:v][1:v]xfade=transition=fade:duration=0.5:offset=OFFSET[v]; \
   [0:a][1:a]acrossfade=d=0.5[a]" \
  -map "[v]" -map "[a]" output.mp4
```

Для 3+ сегментов — строй цепочку xfade последовательно. Каждый offset = сумма длительностей предыдущих минус fade duration.

Для текстовых оверлеев (название главы):
```bash
ffmpeg -i input.mp4 -vf "drawtext=text='Установка AI Office':fontsize=36:fontcolor=white:x=(w-text_w)/2:y=50:enable='between(t,0,3)':fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" output.mp4
```

### Шаг 6: Intro/Outro (стиль pro)

Intro — 3 секунды с заголовком на чёрном фоне:
```bash
ffmpeg -f lavfi -i color=c=black:s=1920x1080:d=3 -vf "drawtext=text='TITLE':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" -c:v libx264 -t 3 -pix_fmt yuv420p intro.mp4
```

Outro — 3 секунды с CTA:
```bash
ffmpeg -f lavfi -i color=c=black:s=1920x1080:d=3 -vf "drawtext=text='Подписывайся':fontsize=36:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2" -c:v libx264 -t 3 -pix_fmt yuv420p outro.mp4
```

Склей: intro + assembled + outro.

### Шаг 6.5: Якорение overlay-тайм-кодов (ОБЯЗАТЕЛЬНО перед наложением)

> Всегда запускается на assembled.mp4 (до zoom). Контракт порядка — выше.

Перед наложением overlay — получить актуальные тайм-коды из финального транскрипта:

```bash
# Транскрибировать финальный assembled.mp4 (Deepgram words=true — предпочтительно)
ffmpeg -i assembled.mp4 -vn -acodec pcm_s16le -ar 16000 -ac 1 /tmp/assembled-audio.wav
source "${ENV_FILE:-.env}"  # файл с DEEPGRAM_API_KEY (или задай переменную заранее)

curl "https://api.deepgram.com/v1/listen?model=nova-3&language=ru&words=true&smart_format=true&punctuate=true" \
  -H "Authorization: Token $DEEPGRAM_API_KEY" \
  --data-binary @/tmp/assembled-audio.wav \
  -o /tmp/assembled-transcript.json

# Якорить overlay:
node office/agents/videographer/remotion-studio/scripts/anchor-overlays.mjs \
  --anchors overlays-anchors.json \
  --transcript /tmp/assembled-transcript.json \
  --output overlay-timecodes.json

# Fallback если Deepgram недоступен: --transcript assembled.srt (SRT-файл)
```

Результат overlay-timecodes.json содержит точные `start_sec`/`end_sec` для каждого overlay.
НЕ задавать тайм-коды вручную. Ручной тайм-код = рассинхрон с речью (доказано на VPN-ролике).

### Шаг 6.7: Слитый overlay-проход (ВСЕ оверлеи в один filter_complex)

**Правка ревью #1:** Блоки 5 и 6 (Графика + KineticText) сливаются в ОДИН ffmpeg-проход.
Два прохода overlay = два прохода рекодирования = потеря качества + время.

```bash
# Пример: TitleCard + 2 KineticText + ProgressStepper в один filter_complex
ffmpeg -i assembled.mp4 \
  -i out/titlecard.mov \
  -i out/kinetic_vpn.mov \
  -i out/kinetic_server.mov \
  -i out/stepper_step0.mov \
  -filter_complex "
    [0:v][1:v]overlay=0:0:enable='between(t,0,3)'[v1];
    [v1][2:v]overlay=0:0:enable='between(t,47.46,50.46)'[v2];
    [v2][3:v]overlay=0:0:enable='between(t,63.1,66.1)'[v3];
    [v3][4:v]overlay=0:0:enable='between(t,0,411)'[vout]
  " \
  -map "[vout]" -map 0:a -c:a copy \
  overlaid.mp4

# ПОТОМ — zoom как последний проход
ffmpeg -i overlaid.mp4 \
  -vf "zoompan=z='min(zoom+0.0006,1.10)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30" \
  -c:v libx264 -c:a copy \
  final.mp4
```

**Тайм-коды enable=** всегда из overlay-timecodes.json (вычислен anchor-overlays.mjs по assembled-transcript.json).

---

### Шаг 7: Финальная проверка

```bash
ffprobe -v error -show_entries format=duration,size -of json output.mp4
# Проверь: длительность ±10% от ожидаемой, файл не пустой
ffmpeg -i output.mp4 -f null - 2>&1 | tail -5
# Проверь: нет ошибок декодирования
```

## Формат вывода

```
output.mp4              # финальное видео
output.srt              # субтитры (отдельный файл)
assemble-report.md      # отчёт сборки
```

assemble-report.md:
```
=== СБОРКА ===
Стиль: pro
Сегментов склеено: 7
Переходы: crossfade 0.5s между каждым
Субтитры: да (встроены + .srt отдельно)
Intro: да (3с, заголовок)
Outro: да (3с, CTA)
Итоговый хронометраж: 7:12
Разрешение: 1920x1080
Размер: 124 MB
Файл: output.mp4
```

## Ошибки и восстановление

- xfade падает → проверь что offset рассчитан правильно (сумма длительностей)
- Субтитры не отображаются → проверь путь к шрифту, попробуй без fontfile
- Рассинхрон аудио/видео → добавь `-async 1` или перекодируй сегменты
- Файл слишком большой → добавь `-crf 23` для сжатия (18=качество, 28=размер)

## Пример

**Input:** `assemble /tmp/video-cut/ --style pro --subtitles yes --title "Установка AI Office v2"`

**Output:**
```
=== СБОРКА ===
Стиль: pro
Intro: "Установка AI Office v2" (3с)
Сегментов: 5 → склеены с crossfade 0.5с
Субтитры: встроены (22px Arial white + outline)
Outro: "Подписывайся" (3с)

Итоговый хронометраж: 8:45
Разрешение: 1920x1080, 30fps
Размер: 98 MB
Файл: /output/ai-office-install-highlight.mp4

Готово! Финальное видео собрано.
```
