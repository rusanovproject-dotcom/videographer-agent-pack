# Форматы платформ

> Параметры для нормализации выходных файлов через mcp-video.
> Sora API — НЕ ИСПОЛЬЗОВАТЬ (закрывается 24.09.2026).

---

## Таблица платформ

| Платформа | Разрешение | FPS | Кодек | Макс длина | Примечание |
|-----------|-----------|-----|-------|------------|------------|
| YouTube | 1920×1080 | 30/60 | h264+aac | нет | 16:9 стандарт |
| YouTube Shorts | 1080×1920 | 30 | h264+aac | 60 сек | 9:16 обязательно, хук в 3 сек |
| Instagram Reels | 1080×1920 | 30 | h264+aac | 90 сек | хук в 3 сек |
| Instagram Post | 1080×1080 | 30 | h264+aac | 60 сек | 1:1 |
| TikTok | 1080×1920 | 30 | h264+aac | 10 мин | вертикальный формат |
| VK Клипы | 1080×1920 | 30 | mp4 | 60 сек | вертикальный формат |

---

## Команды нормализации через mcp-video

### YouTube (16:9, 1080p, 30fps)

```
mcp-video normalize \
  --input assembled.mp4 \
  --platform youtube \
  --resolution 1920x1080 \
  --fps 30 \
  --codec h264 \
  --audio aac \
  --output youtube-output.mp4
```

### YouTube Shorts / Instagram Reels / TikTok (9:16, 1080p, 30fps)

```
mcp-video normalize \
  --input assembled.mp4 \
  --platform shorts \
  --resolution 1080x1920 \
  --fps 30 \
  --codec h264 \
  --audio aac \
  --output shorts-output.mp4
```

Для автокадрирования 16:9 → 9:16:
```
mcp-video crop \
  --input assembled.mp4 \
  --aspect 9:16 \
  --auto-reframe \
  --output cropped.mp4
```

### Instagram Post (1:1, 1080p)

```
mcp-video normalize \
  --input assembled.mp4 \
  --platform instagram \
  --resolution 1080x1080 \
  --fps 30 \
  --codec h264 \
  --audio aac \
  --output post-output.mp4
```

---

## Fallback через FFmpeg

### YouTube нормализация

```bash
ffmpeg -i input.mp4 \
  -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" \
  -r 30 -c:v libx264 -c:a aac \
  youtube-output.mp4
```

### 9:16 кроп (центральный, без auto-reframe)

```bash
ffmpeg -i input.mp4 \
  -vf "crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920" \
  -r 30 -c:v libx264 -c:a aac \
  vertical-output.mp4
```

### 1:1 кроп

```bash
ffmpeg -i input.mp4 \
  -vf "crop=ih:ih:(iw-ih)/2:0,scale=1080:1080" \
  -r 30 -c:v libx264 -c:a aac \
  square-output.mp4
```

---

## Проверка формата (ffprobe)

```bash
ffprobe -v error \
  -select_streams v:0 \
  -show_entries stream=width,height,r_frame_rate,codec_name \
  -of json output.mp4
```

Ожидаемый вывод для YouTube:
```json
{
  "streams": [{
    "codec_name": "h264",
    "width": 1920,
    "height": 1080,
    "r_frame_rate": "30/1"
  }]
}
```

---

## Антипаттерны

- **Sora API** — НЕ ИСПОЛЬЗОВАТЬ (закрывается 24.09.2026)
- `-c copy` при кропе/нормализации — режет по ключевым кадрам, даёт артефакты
- Загружать видео без нормализации на платформу — алгоритмы штрафуют нестандартные форматы
