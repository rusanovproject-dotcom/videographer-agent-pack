---
expires: 2026-09-30
---

# Toolchain — Инструменты видеомонтажа

## Ядро (обязательно)

### FFmpeg
CLI-инструмент для всех видеоопераций.
```bash
# Установка
apt install ffmpeg  # или brew install ffmpeg

# Ключевые команды
ffmpeg -i input.mp4 -ss 00:01:30 -to 00:03:45 -c:v libx264 -c:a aac segment.mp4  # вырезка (НЕ -c copy — сдвигает кадры)
ffmpeg -i input.mp4 -vn -acodec pcm_s16le audio.wav                  # извлечь аудио
ffmpeg -i input.mp4 -af silencedetect=n=-30dB:d=2 -f null - 2>&1     # найти тишину
ffmpeg -f concat -i filelist.txt -c copy merged.mp4                   # склейка
ffmpeg -i input.mp4 -vf fps=0.1 frames/frame_%04d.jpg                # кейфреймы
ffprobe -v error -show_format -show_streams input.mp4                 # инфо о файле
```

> ⚠️ **Рабочие рецепты** (speed-ramp, 9:16-кроп, верификация, libass-fallback) — см. `knowledge/ffmpeg-recipes.md`

**Ограничения Homebrew ffmpeg:**
- **libass НЕ скомпилирован** → `subtitles=` filter не работает. Проверка: `ffmpeg -buildconf 2>&1 | grep libass`. Fallback: `-c:s mov_text` (мягкие субтитры) или Remotion ShortsCaptions.
- **Speed-ramp в один проход** (`-ss/-to` + `filter_complex`) → пустой файл на ffmpeg 8.1.1 / Apple Silicon. Всегда 2 шага: нарезка → ускорение.

**Статус mcp-video:** прямой ffmpeg — легитимный основной путь. mcp-video — апгрейд, не блокер. Субагент в фоновой сессии может не иметь доступа к mcp-video — диагностируй в начале задачи.

### Deepgram (Nova-3)
Транскрипция аудио → текст с таймстемпами. Облачный API, быстрее и точнее локальных моделей.
Nova-3: WER 5.26% — лучший на рынке. Поддержка русского языка.

> ⚠️ **Кредиты могут кончиться** (ASR_PAYMENT_REQUIRED). Держи Whisper как fallback — см. секцию ниже.
> Ключ: переменная окружения `DEEPGRAM_API_KEY` (задай через `export` или свой `.env`)

```bash
# Установка SDK
pip install deepgram-sdk deepgram-captions --break-system-packages

# Через curl (быстрый способ):
curl "https://api.deepgram.com/v1/listen?model=nova-3&language=ru&smart_format=true&punctuate=true&utterances=true&diarize=true" \
  -H "Authorization: Token $DEEPGRAM_API_KEY" \
  -H "Content-Type: audio/wav" \
  --data-binary @audio.wav \
  -o transcript.json

# JSON содержит:
# results.channels[0].alternatives[0].words[].word, .start, .end, .confidence
# results.utterances[].transcript, .start, .end, .speaker

# Извлечь только текст:
cat transcript.json | jq '.results.channels[0].alternatives[0].transcript'
```

Python SDK (полный контроль):
```python
from deepgram import DeepgramClient, PrerecordedOptions
from deepgram_captions import DeepgramConverter, srt

dg = DeepgramClient(os.environ["DEEPGRAM_API_KEY"])
with open("audio.wav", "rb") as f:
    source = {"buffer": f.read(), "mimetype": "audio/wav"}

options = PrerecordedOptions(
    model="nova-3",
    language="ru",
    smart_format=True,
    punctuate=True,
    utterances=True,
    diarize=True,
)
response = dg.listen.rest.v("1").transcribe_file(source, options)

# Генерация SRT субтитров:
captions = DeepgramConverter(response)
srt_content = srt(captions)
with open("subs.srt", "w") as f:
    f.write(srt_content)
```

Ключ API: задай через `export DEEPGRAM_API_KEY=...` или в .env файле.
Лимиты: макс файл 2 GB, таймаут 10 мин на запрос (для длинных видео — разбей на чанки).

### PySceneDetect
Автодетекция смены сцен.
```bash
pip install scenedetect[opencv] --break-system-packages
scenedetect -i input.mp4 detect-adaptive list-scenes -o scenes/
# выдаёт CSV с границами сцен (start_time, end_time)
```

### auto-editor
Автоудаление тишины.
```bash
pip install auto-editor --break-system-packages
auto-editor input.mp4                           # базовая обработка
auto-editor input.mp4 --margin 0.3s             # оставить 0.3с до/после речи
auto-editor input.mp4 --export timeline          # экспорт таймлайна без рендера
```

## Дополнительно (по запросу)

### Editly (декларативный монтаж)
```bash
npm install -g editly
# editly spec.json → output.mp4
```
JSON-спецификация: clips, transitions, text overlays.

### MoviePy (Python)
```python
from moviepy.editor import VideoFileClip, concatenate_videoclips
clip = VideoFileClip("input.mp4").subclip(10, 30)
```

## Проверка доступности

Перед работой всегда проверяй:
```bash
which ffmpeg && ffmpeg -version | head -1
python3 -c "import deepgram; print('deepgram OK')" 2>/dev/null || echo "deepgram not installed"
test -n "$DEEPGRAM_API_KEY" && echo "DEEPGRAM_API_KEY set" || echo "WARNING: DEEPGRAM_API_KEY not set"
which scenedetect || echo "scenedetect not installed"
which auto-editor || echo "auto-editor not installed"
claude mcp list | grep mcp-video || echo "mcp-video not connected"
```

Если инструмент не установлен — установи через pip/apt/npm.

---

## MCP-инструменты (P1 — подключить немедленно)

> Добавлено 2026-05-27 — P1 апгрейд Videographer v2.

### mcp-video (KyaniteLabs) — основной инструмент нарезки

119 typed инструментов для видеомонтажа. Основной путь вместо прямых FFmpeg-команд.

```bash
# Предусловие:
brew install ffmpeg  # если не стоит

# Подключение:
claude mcp add mcp-video -- uvx --from mcp-video mcp-video

# Валидация:
claude mcp list | grep mcp-video
```

Ключевые команды:
- `mcp-video trim` — нарезка сегментов
- `mcp-video silence-remove` — удаление тишины
- `mcp-video speed` — ускорение частей
- `mcp-video concat` — склейка
- `mcp-video crop` — кадрирование (9:16, 1:1)
- `mcp-video normalize` — нормализация под платформу
- `mcp-video add-subtitles` — добавление субтитров (standard / hormozi)

### Deepgram MCP — транскрипция

```bash
claude mcp add deepgram -- deepgram-mcp
# Ключ: задай DEEPGRAM_API_KEY в окружении (или в .env, который ты подхватываешь)
```

### ElevenLabs MCP (P1.5) — субтитры + TTS

Критично для Shorts: субтитры, озвучка, 99 языков.

```bash
uvx elevenlabs-mcp
# Free tier: 10K кредитов
```

---

## MCP-инструменты (P2 — после первых прогонов)

### Pexels MCP — b-roll из стока

```bash
uvx pexels-mcp-server
# Бесплатный ключ на pexels.com/api
```

### gemini-media-mcp — Veo 3.1 AI-видеогенерация

```bash
go install github.com/mordor-forge/gemini-media-mcp/cmd/gemini-media-mcp@latest
# Ключ Gemini уже есть
```

Статус: зрелость под вопросом, регионы ограничены.

---

## MCP-инструменты (P3 — новые ключи)

### fal.ai MCP или Higgsfield MCP — AI-генерация видео

Выбрать один по наличию аккаунта:
- `fal.ai MCP`: `--header "Authorization: Bearer КЛЮЧ"` — Kling/Hailuo/AI-видео
- `Higgsfield MCP`: OAuth без ключей, 30+ моделей

### Runway MCP — elo #1 AI-видео

Официальный CC Skill + MCP. $10 minimum.

---

## Графика и анимация

### Remotion — title cards, animated captions, intro/outro

Использовать ДЛЯ ГРАФИКИ И СУБТИТРОВ, НЕ для нарезки footage.

```bash
npx create-video@latest
npx skills add remotion-dev/skills
```

Лицензия: BUSL (бесплатна до $1M ARR). Альтернатива MIT: Revideo.

### Manim — explainer-анимации для edu-контента

```bash
pip install manim
# Опциональный слой для схем и объяснений
```

---

## Дополнительные инструменты

- **ButterCut** (Ruby, CC-native): анализ footage → FCPXML для Premiere/Resolve. Молодой (496⭐)
- **Whisper (OpenAI, локальный)** — основной fallback при отсутствии Deepgram-кредитов. Модель `medium` даёт приемлемое качество русского языка.
  ```bash
  # Установка whisper.cpp с Metal-ускорением (Apple Silicon)
  brew install cmake
  git clone https://github.com/ggerganov/whisper.cpp && cd whisper.cpp
  cmake -B build -DWHISPER_METAL=1 && cmake --build build -j
  bash models/download-ggml-model.sh medium  # 1.5 GB, один раз
  # Использование:
  ./build/bin/whisper-cli -m models/ggml-medium.bin -f audio.wav -l ru --output-srt

  # Или через Python (медленнее, без Metal):
  pip install openai-whisper
  whisper audio.wav --model medium --language ru --output_format srt
  # Модель кешируется в ~/.cache/whisper/ — повторный запуск не скачивает
  ```
  Скорость: ~8-10 мин на 8-минутный файл (Python). whisper.cpp с Metal — в 3-5x быстрее.
- **SubsAI**: лёгкая генерация SRT/ASS/VTT без тяжёлых зависимостей
- **editly**: JSON5-спека → видео с transitions/text. Альтернативный EDL-подобный инструмент

---

## Антипаттерны (явный список)

- **Sora API** — НЕ ИСПОЛЬЗОВАТЬ (закрывается 24.09.2026)
- **Whisper как основной транскрайбер** — только fallback когда нет Deepgram-кредитов
- **Прямые FFmpeg-команды** — допустимый путь (mcp-video = предпочтительный апгрейд)
- **Filmstrip в каждом кадре** — только в спорных местах score 4-6 (экономия токенов)
- **`-c copy` при нарезке** — режет по ключевым кадрам, сдвигает границы на 1-5 сек
- **`subtitles=` filter** — не работает без libass в Homebrew ffmpeg; fallback: `-c:s mov_text` или Remotion ShortsCaptions
- **Speed-ramp в один проход** (`-ss/-to` + `filter_complex`) — пустой файл на ffmpeg 8.1.1 / Apple Silicon; всегда 2 шага
- **Статичный PNG для верификации анимации** — для spring/flash/ken-burns снимать видео-сэмпл или серию кадров
