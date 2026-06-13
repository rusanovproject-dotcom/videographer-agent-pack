---
expires: 2026-12-31
---

# FFmpeg Recipes — рабочие рецепты из боевого прогона

> Добавлено 2026-05-27. Источник: монтаж VPN-туториала + 3 шортса на Apple Silicon / ffmpeg 8.1.1.
> Все рецепты проверены в боевом прогоне. «Не проверено» — отдельно помечено.

---

## ПРАВИЛО 0 — Контракт порядка файлов v3 (Правка ревью #1)

Добавлено 2026-05-27. Источник: ревью пайплайна v3.

**Пайплайн рендера строго однонаправлен:**

```
склейка (assembled) → overlay (overlaid) → zoom/zoompan (final) → субтитры (output)
```

Overlay-тайм-коды (enable=) ВСЕГДА вычисляются из транскрипта ФИНАЛЬНОГО тайм-лайна
после нарезки (assembled-transcript.json via Deepgram). anchor-overlays.mjs запускается
на assembled.mp4 ПЕРЕД zoom.

**ЗАПРЕЩЕНО накладывать overlay после zoom** — zoom меняет PTS, тайм-коды съезжают.
**ЗАПРЕЩЕНО два overlay-прохода с zoom между ними** — только один filter_complex.

Слитый overlay (все компоненты в один filter_complex):
```bash
ffmpeg -i assembled.mp4 -i ov1.mov -i ov2.mov -i ov3.mov \
  -filter_complex "
    [0:v][1:v]overlay=0:0:enable='between(t,T1,T2)'[v1];
    [v1][2:v]overlay=0:0:enable='between(t,T3,T4)'[v2];
    [v2][3:v]overlay=0:0:enable='between(t,T5,T6)'[vout]
  " -map "[vout]" -map 0:a -c:a copy overlaid.mp4

# Zoom — ПОСЛЕДНИМ после overlaid.mp4
ffmpeg -i overlaid.mp4 -vf "zoompan=..." -c:v libx264 -c:a copy final.mp4
```

---

## ПРАВИЛО 11 — ui_critical: разметка для INTERSTITIAL-проверки (Правка ревью #2)

Добавлено 2026-05-27.

**Проблема:** full-screen отбивка может накрыть важный UI-момент footage (зритель теряет нить).

**Решение:** агент вручную помечает диапазоны footage в saturation-plan.md секция ## ui_critical.
validate-montage.py проверяет АРИФМЕТИЧЕСКИ — никакого CV/автодетекта.

```markdown
## ui_critical
- "открываем настройки VPN": 45.0–62.0
- "вводим данные сервера": 120.0–145.5
- "нажимаем кнопку подключения": 230.0–238.0
```

**Что проверяет validate-montage.py:**
Пересечение любого interstitial-диапазона с ui_critical-диапазоном → Critical нарушение.

**Правило размещения отбивки:**
Отбивка ТОЛЬКО после завершения шага — между «шаг N закончен» и «шаг N+1 начинается».
Якорная фраза отбивки = последние слова шага N.

---

## ПРАВИЛО 1 — Speed-ramp: два шага, не один

**Проблема:** `ffmpeg -i src -ss X -to Y -filter_complex "[v]setpts..."` даёт пустой файл на ffmpeg 8.1.1 / Apple Silicon.

**Причина:** filter_complex не совместим с `-ss/-to` в одном проходе на этой версии.

**Рабочий паттерн — всегда 2 шага:**

```bash
# Шаг 1: нарезка без фильтров
ffmpeg -i source.mp4 \
  -ss {start_sec} -to {end_sec} \
  -c:v libx264 -c:a aac \
  -avoid_negative_ts make_zero \
  segment_raw.mp4

# Шаг 2: ускорение отдельной командой
ffmpeg -i segment_raw.mp4 \
  -filter_complex "[0:v]setpts=0.25*PTS[v];[0:a]atempo=2.0,atempo=2.0[a]" \
  -map "[v]" -map "[a]" \
  segment_fast.mp4
```

**Примечание про atempo:** max 2.0x за проход. Для x4 — два прохода `atempo=2.0,atempo=2.0`. Для x2 — один `atempo=2.0`.

---

## ПРАВИЛО 2 — libass недоступен в Homebrew ffmpeg

**Проблема:** `ffmpeg -vf "subtitles=subs.srt"` падает с «No option name near» или «not found».

**Диагностика:**
```bash
ffmpeg -buildconf 2>&1 | grep libass
# Если пусто — libass не скомпилирован
```

**Fallback 1 — мягкие субтитры (soft subtitles, рекомендуется):**
```bash
ffmpeg -i assembled.mp4 -i subs.srt \
  -c:v copy -c:a copy -c:s mov_text \
  -metadata:s:s:0 language=rus \
  output_with_subs.mp4
# YouTube и большинство плееров читают mov_text
```

**Fallback 2 — drawtext (без SRT, только короткий текст):**
```bash
ffmpeg -i input.mp4 \
  -vf "drawtext=text='Твой текст':fontsize=36:fontcolor=white:x=(w-text_w)/2:y=h-100:enable='between(t,5,10)'" \
  output.mp4
```

**Fallback 3 — Remotion ShortsCaptions (лучший для шортсов):**
Если нужны Hormozi-капшены на вертикальном видео — не тратить время на ffmpeg subtitles.
Использовать компонент `ShortsCaptions` в remotion-studio. Один рендер = весь трек капшенов.
Чанки генерировать через `scripts/srt-to-captions.mjs`.

**Правило:** не пытаться починить libass в Homebrew. Это не стоит времени в боевой сессии.

---

## ПРАВИЛО 3 — Центр-кроп 9:16 (без MediaPipe)

**Геометрия:** `crop=608:1080:X:0,scale=1080:1920`
- 608 = 1080 × (9/16) — ширина кропа при высоте 1080
- X — горизонтальный сдвиг под «звезду кадра»

**Три типичные позиции:**

| Что в кадре | X (от левого края) | Команда |
|-------------|-------------------|---------|
| Терминал/экран по центру | 656 | `crop=608:1080:656:0` |
| Лицо/голова справа | 1290 | `crop=608:1080:1290:0` |
| Окно приложения слева | 180 | `crop=608:1080:180:0` |
| Автоматически (безопасный центр) | `(iw-ow)/2` = 656 | `crop=ih*9/16:ih:(iw-ih*9/16)/2:0` |

**Полная команда (нарезка + кроп + scale за один проход):**
```bash
ffmpeg -i source.mp4 \
  -ss {start_sec} -to {end_sec} \
  -vf "crop=608:1080:{X}:0,scale=1080:1920" \
  -c:v libx264 -c:a aac \
  -avoid_negative_ts make_zero \
  output_9x16.mp4
```

**Бонус:** punch-in кроп (x=1290 при лице справа) убирает тонкие слайверы второго монитора по краям.

---

## ПРАВИЛО 4 — Punch-in зум (zoompan)

**Паттерн: мягкий push-in на говорящей голове:**
```bash
ffmpeg -i input_9x16.mp4 \
  -vf "zoompan=z='min(zoom+0.0006,1.10)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30" \
  -c:v libx264 -c:a aac \
  output_punched.mp4
```

- `zoom+0.0006` — скорость нарастания (мягкий push)
- `max 1.10` — конечный масштаб (10% zoom-in)
- Для ещё мягче (лицо) — `max 1.08`
- Для статичного объекта (экран) — можно убрать zoompan совсем

**Ken Burns (инверсный — из zoom в normal, классика для туториалов):**
```bash
-vf "zoompan=z='if(lte(on,1),1.15,max(1.001,zoom-0.0005))':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30"
```

---

## ПРАВИЛО 5 — Верификация: видео-сэмпл, не PNG

**Проблема:** статичный PNG-кадр не показывает spring-анимации, flash-эффекты, 0.8-секундные элементы.

**Правило:** для Remotion-компонентов с анимацией снимать несколько кадров или короткий MP4-сэмпл.

```bash
# Серия кадров вокруг тайм-кода (для проверки spring-анимации)
ffmpeg -i final.mp4 -ss {tc} -vframes 15 -r 30 check/frame_%03d.png

# Короткий видео-сэмпл (2 сек вокруг вставки)
ffmpeg -i final.mp4 -ss {tc-0.5} -t 2.0 -c:v libx264 -c:a aac check/sample_{tc}.mp4
```

**Смещения для Remotion компонентов:**
| Компонент | Когда снимать кадр |
|-----------|-------------------|
| QuoteCard (spring stiffness 120) | tc + 0.7 сек (spring settle) |
| ShortsCaptions (pop-in) | tc + 0.2 сек |
| ErrorBadge (0.8 сек) | tc + 0.1 и tc + 0.4 сек |
| TitleCard | tc + 0.3 сек |

---

## ПРАВИЛО 6 — LowerThird: снимай кадр до наложения

**Проблема:** если тайм-код вставки попадает на стык сегментов — получаем чёрный кадр.

**Проверка перед финальной сборкой:**
```bash
# Снять кадр в точке вставки и ±1 сек вокруг
ffmpeg -i assembled.mp4 -ss {tc-1} -vframes 3 -r 1 check/lowerthird_check_%d.png
```

Если кадр чёрный или переходный — сдвинуть тайм-код на ±2-3 сек.

---

## ПРАВИЛО 9 — Якорение overlay: НИКОГДА не ручной тайм-код

**Проблема:** тайм-код overlay 25.0 сек задан «на глаз» по плановым секундам EDL.
После hook-prepend (5 сек) + silence_remove MapEurope попала на 25 сек когда говорили «кнопочка плюсик».
Реальные слова «нидерланды польша» — в 47.96 сек. Рассинхрон = **23 сек**.

**Правило:** тайм-коды overlay ВСЕГДА через `anchor_phrase` → `anchor-overlays.mjs`.

**Pipeline после нарезки:**
```bash
# 1. Получить финальный транскрипт (Deepgram с words=true — точнее; SRT — fallback)
source "${ENV_FILE:-.env}"   # файл с DEEPGRAM_API_KEY (или задай переменную заранее)
ffmpeg -i assembled.mp4 -vn -acodec pcm_s16le -ar 16000 -ac 1 /tmp/final.wav
curl "https://api.deepgram.com/v1/listen?model=nova-3&language=ru&words=true&smart_format=true" \
  -H "Authorization: Token $DEEPGRAM_API_KEY" \
  --data-binary @/tmp/final.wav \
  -o /tmp/final-transcript.json

# 2. Создать overlays-anchors.json со списком { component, anchor_phrase, duration_sec, offset_sec, props }

# 3. Вычислить тайм-коды якорением:
node office/agents/videographer/remotion-studio/scripts/anchor-overlays.mjs \
  --anchors overlays-anchors.json \
  --transcript /tmp/final-transcript.json \
  --output overlay-timecodes.json

# 4. Из overlay-timecodes.json взять enable= строки для build-overlay.sh
```

**Если Deepgram недоступен** — передать финальный SRT (`.srt` файл) как `--transcript`:
точность блочная (не word-level), но лучше ручных тайм-кодов.

---

## ПРАВИЛО 10 — ProgressStepper: N глав → N рендеров

**Проблема:** 2 рендера с activeStep=1 и activeStep=3 при 4 главах — шаги 0 и 2 никогда не подсвечивались.

**Правило:** одна глава = один рендер ProgressStepper с соответствующим `activeStep`.
Тайм-коды каждого рендера — через `anchor_phrase` первого слова главы.

```bash
# 4 главы → 4 рендера:
node render.mjs ProgressStepper stepper-step0.mov --props='{"steps":[...],"activeStep":0}'
node render.mjs ProgressStepper stepper-step1.mov --props='{"steps":[...],"activeStep":1}'
node render.mjs ProgressStepper stepper-step2.mov --props='{"steps":[...],"activeStep":2}'
node render.mjs ProgressStepper stepper-step3.mov --props='{"steps":[...],"activeStep":3}'
```

Anchors: {"component":"ProgressStepper-step0","anchor_phrase":"первые слова главы 1",...}
Каждый overlay активен от anchor_phrase своей главы до anchor_phrase следующей.

---

## ПРАВИЛО 7 — mcp-video недоступен субагенту

**Факт:** mcp-video может быть недоступен в фоновом субагенте (запущен в другой сессии).

**Диагностика в начале задачи:**
```bash
claude mcp list | grep mcp-video || echo "mcp-video НЕ доступен — используем ffmpeg fallback"
```

**Статус .mcp.json:** прописан в `workspace/.mcp.json` через `uvx --from mcp-video mcp-video`.
Это должно работать для субагентов. Если не работает — проверить что `.mcp.json` в корне workspace, а не в подпапке.

**Если mcp-video ДОСТУПЕН — использовать для динамики (то что дал бы VPN-ролику):**

| Что нужно | mcp-video инструмент | Что даёт |
|-----------|---------------------|----------|
| Переходы между сегментами | `transitions` (fade/wipe/slide/zoom) | Вместо hard cut — живой переход |
| Цветокоррекция по настроению | `color-grade` | Единый визуальный стиль |
| AI-детекция сцен | `scene-detect` | Точнее PySceneDetect для сложных сцен |
| Динамический зум | `zoom-effect` | Punch-in без ручного zoompan параметра |
| Эффекты на текст | `mograph` | Анимированные плашки без Remotion |
| Скорость + рамп | `speed-ramp` | Плавное ускорение/замедление (лучше ffmpeg) |

**Если mcp-video НЕДОСТУПЕН — зафиксировать в Arsenal Report** что пропущено.

**Как зафиксировать в .mcp.json** (если ещё не прописан):
```bash
claude mcp add mcp-video -- uvx --from mcp-video mcp-video
# Проверить:
cat workspace/.mcp.json | grep mcp-video
```

---

## ПРАВИЛО 12 — Жирные эффекты на чистом ffmpeg (без mcp-video)

> Добавлено 2026-05-28. Источник: рефайн 3 — снятие потолка жирности.
> Все рецепты проверены боевым рендером на реальном уроке (~520 сек, 1920×1080).

**Вывод:** mcp-video недоступен → используй ffmpeg напрямую. Переходы, цветокор, динамика — всё делается без MCP.
Это НЕ fallback деградированного качества — это стандартный арсенал.

---

### 12A — xfade переход между сегментами (+ acrossfade для аудио)

Заменяет hard-cut плавным переходом. Работает в filter_complex при склейке.

```bash
# Пример: два сегмента по 5 сек, xfade начинается за 1 сек до конца clip_a
ffmpeg -y \
  -i clip_a.mp4 -i clip_b.mp4 \
  -filter_complex "
    [0:v][1:v]xfade=transition=wipeleft:duration=1.0:offset=4.0[vout];
    [0:a][1:a]acrossfade=d=1.0[aout]
  " \
  -map "[vout]" -map "[aout]" \
  -c:v libx264 -c:a aac output_xfade.mp4
```

**Варианты transition:** `fade` | `wipeleft` | `wiperight` | `slideup` | `slidedown` | `dissolve` | `distance` | `radial`

**Формула offset:** `offset = длина_clip_a - duration_перехода`

**Для N сегментов (chain):**
```bash
ffmpeg -y -i s1.mp4 -i s2.mp4 -i s3.mp4 -filter_complex "
  [0:v][1:v]xfade=transition=dissolve:duration=0.5:offset=OFFSET_01[v01];
  [v01][2:v]xfade=transition=fade:duration=0.5:offset=OFFSET_02[vout];
  [0:a][1:a]acrossfade=d=0.5[a01];
  [a01][2:a]acrossfade=d=0.5[aout]
" -map "[vout]" -map "[aout]" -c:v libx264 -c:a aac output_chain.mp4
```

**Проверено:** xfade + acrossfade на двух клипах → 9.07 сек финал, без артефактов. ✅

---

### 12B — Цветокор / кинолук Terminal Noir

Тёплый Terminal Noir grade — лёгкий контраст, насыщенность -25%, чуть тепло.
Применяется на весь ролик (один проход после overlay, до субтитров).

```bash
ffmpeg -y -i overlaid.mp4 \
  -vf "
    eq=brightness=0.02:contrast=1.08:saturation=0.75:gamma=1.05,
    colorbalance=rs=0.05:gs=0.0:bs=-0.05:rm=0.03:gm=0.0:bm=-0.03:rh=0.02:gh=0.0:bh=-0.02,
    vignette=PI/5:eval=frame
  " \
  -c:v libx264 -c:a copy final_graded.mp4
```

**Параметры:**
- `eq` — яркость +0.02, контраст +8%, насыщенность -25%, гамма 1.05 (мягче тени)
- `colorbalance` — тёплые тени/мидтоны (rs/rm), синий убран (bs/bm)
- `vignette PI/5` — мягкое затемнение краёв (угол виньетки 36°)

**Холодный вариант (терминал/скринкаст):**
```bash
-vf "eq=contrast=1.1:saturation=0.85:gamma=0.95,colorbalance=bs=0.08:bm=0.05,vignette=PI/6:eval=frame"
```

**Проверено:** colorgrade на 5 сек клипе → правильная длина 5.03 сек, визуальный стиль применён. ✅

---

### 12C — Динамичный zoompan + whip-pan эмуляция

Push-in с синусоидальным pan на стыках сцен — имитирует whip-pan без потери качества.

```bash
# Нежный push-in c лёгким покачиванием (говорящая голова, 1920×1080)
ffmpeg -y -i clip.mp4 \
  -vf "
    zoompan=z='if(lte(on,1),1.0,if(lte(on,90),1.0+0.001*on,min(1.08,zoom))):
             x='iw/2-(iw/zoom/2)+sin(on/30)*10':
             y='ih/2-(ih/zoom/2)':
             d=1:s=1920x1080:fps=30
  " \
  -c:v libx264 -c:a aac output_zoom.mp4
```

**Быстрый whip-pan между сегментами:**
```bash
# 1. Нарезать конец segment_A (последние 0.5 сек) с blur-smear
ffmpeg -y -i seg_a_end.mp4 -vf "mblur=steps=5:angle=60" seg_a_whip.mp4
# 2. Concatenate с резким cut — whip создаётся blur+cut
ffmpeg -f concat -safe 0 -i filelist_whip.txt -c copy assembled_whip.mp4
```

**Глобальный Ken Burns (из zoom → normal, классика интро):**
```bash
-vf "zoompan=z='if(lte(on,1),1.15,max(1.001,zoom-0.0005))':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30"
```

**Проверено:** zoompan с синусоидальным pan → 5.03 сек, без артефактов. ✅

---

### 12D — Glitch / RGB-split акцент (на хук/ошибку)

Короткий глитч-эффект на 2-3 сек: для хука, момента ошибки, «СТОП» в туториале.

```bash
# Применяется ТОЛЬКО на выделенном клипе (не на всём ролике)
ffmpeg -y -i clip_hook_3sec.mp4 \
  -vf "
    rgbashift=rh=4:rv=0:gh=-4:gv=0:bh=0:bv=2,
    noise=alls=8:allf=t+u
  " \
  -c:v libx264 -c:a aac output_glitch.mp4
```

**Параметры:**
- `rgbashift rh=4:gh=-4` — R-канал +4px вправо, G-канал -4px влево → chromatic aberration
- `noise alls=8` — шум 8 единиц, `allf=t+u` — временной + пространственный (мерцает)

**Протокол применения:**
1. Нарезать глитч-сегмент (≤3 сек)
2. Применить rgbashift + noise отдельным проходом
3. Собрать в filelist среди остальных сегментов (hard-cut — не fade!)

**Проверено:** rgbashift + noise на 3 сек клипе → корректный вывод, chromatic shift виден. ✅

---

### 12E — Flash / light-leak на акцентах

Белая вспышка 2-3 кадра на смене сцены или ключевом демо-моменте.

```bash
# Вспышка через overlay: генерируем белый кадр и накладываем с fade
ffmpeg -y -i assembled.mp4 \
  -filter_complex "
    color=white:s=1920x1080:d=0.1[flash];
    [0:v][flash]overlay=0:0:enable='between(t,FLASH_START,FLASH_END)':eof_action=pass[vout]
  " \
  -map "[vout]" -map "0:a" -c:a copy output_flash.mp4
```

**Альтернатива через blend:**
```bash
# Встроенный fade-белый: 3 кадра = 0.1 сек при 30fps
ffmpeg -y -i clip.mp4 \
  -vf "fade=t=in:st=ACCENT_TIME:d=0.1:color=white,fade=t=out:st=ACCENT_TIME+0.1:d=0.1:color=white" \
  -c:v libx264 -c:a aac output_flash_fade.mp4
```

---

### 12F — Speed-ramp плавный (не резкий x4)

Постепенное ускорение через setpts + atempo. Всегда 2 шага (см. Правило 1).

```bash
# Шаг 1: нарезка зоны ожидания/загрузки
ffmpeg -y -i source.mp4 \
  -ss START_SEC -to END_SEC \
  -c:v libx264 -c:a aac -avoid_negative_ts make_zero \
  zone_raw.mp4

# Шаг 2: плавный рамп — x2 для «загрузки», x4 для «набора текста без слов»
# x2:
ffmpeg -y -i zone_raw.mp4 \
  -filter_complex "[0:v]setpts=0.5*PTS[v];[0:a]atempo=2.0[a]" \
  -map "[v]" -map "[a]" zone_x2.mp4

# x4 (два прохода atempo):
ffmpeg -y -i zone_raw.mp4 \
  -filter_complex "[0:v]setpts=0.25*PTS[v];[0:a]atempo=2.0,atempo=2.0[a]" \
  -map "[v]" -map "[a]" zone_x4.mp4
```

**Правило:** применять на ВСЕХ зонах footage с молчанием/загрузкой >10 сек без комментариев.
Прогнать через весь assembled.mp4: разметить зоны → нарезать → ускорить → вернуть в filelist.

---

### Стандартный порядок применения эффектов в пайплайне

```
assembled.mp4
    ↓ [overlay filter_complex — все оверлеи одним проходом]
overlaid.mp4
    ↓ [colorgrade — eq + colorbalance + vignette на весь ролик]
graded.mp4
    ↓ [zoompan / Ken Burns — последним после colour]
final.mp4
    ↓ [субтитры mov_text]
output.mp4
```

**xfade** — на этапе склейки filelist → assembled (не после overlay).
**glitch** — на изолированном сегменте перед сборкой в filelist.
**flash** — через overlay в том же filter_complex где остальные оверлеи.

---

## ПРАВИЛО 8 — render.mjs: форвардинг --props

**Проблема:** динамические Remotion-композиции с `calculateMetadata` не получают props если обёртка render.mjs не прокидывает `--props=<file>`.

**Симптом:** `frame 630 > durationInFrames 90` — композиция использует дефолтную длину вместо реальной.

**Диагностика:**
```bash
# Проверить что render.mjs принимает --props и прокидывает его
grep -n "extraArgs\|propsArg\|--props" render.mjs
```

**Правило:** при любой динамической композиции (calculateMetadata) — передавать `--props=path/to/props.json` и убедиться что render.mjs добавляет его в `extraArgs`.
