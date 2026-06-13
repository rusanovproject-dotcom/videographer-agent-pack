#!/usr/bin/env bash
# Видеограф — режиссёр постпродакшена. Установка в один заход.
# Usage: ./install.sh [путь-к-workspace]   (по умолчанию $HOME/workspace)
# Идемпотентно: повторный запуск не ломает (перекрывает тело ядра, НЕ трогает overrides/memory/failures).
set -euo pipefail

PACK="$(cd "$(dirname "$0")" && pwd)"
WS="${1:-$HOME/workspace}"
AGENT_DIR="$WS/office/agents/videographer"

say() { printf '\033[36m▸ %s\033[0m\n' "$1"; }
ok()  { printf '\033[32m✓ %s\033[0m\n' "$1"; }
warn(){ printf '\033[33m! %s\033[0m\n' "$1"; }

echo ""
say "Видеограф → офис: $WS"

# 0. Проверка структуры офиса
for d in "office/agents" ".claude/agents"; do
  if [ ! -d "$WS/$d" ]; then
    warn "нет $WS/$d — не похоже на AI-офис Claude Code. Создаю $d (если структура другая — ставь вручную по README)."
    mkdir -p "$WS/$d"
  fi
done

# 1. Тело агента (ядро + скиллы + knowledge + remotion-студия)
#    Идемпотентность: НЕ перезаписываем личные файлы владельца, если они уже есть.
say "Копирую тело агента → office/agents/videographer/"
mkdir -p "$AGENT_DIR"
# ядро и материалы — всегда обновляем
cp    "$PACK/agent/CLAUDE.md"            "$AGENT_DIR/CLAUDE.md"
cp    "$PACK/agent/soul.md"              "$AGENT_DIR/soul.md"
cp    "$PACK/agent/architecture.mermaid" "$AGENT_DIR/architecture.mermaid"
cp    "$PACK/agent/ONBOARDING.md"        "$AGENT_DIR/ONBOARDING.md"
cp -R "$PACK/agent/knowledge"            "$AGENT_DIR/"
cp -R "$PACK/agent/skills"               "$AGENT_DIR/"
cp -R "$PACK/agent/remotion-studio"      "$AGENT_DIR/"
# личные файлы — только если их ещё нет (не затираем накопленное)
for f in memory.md failures.md overrides.md; do
  if [ -f "$AGENT_DIR/$f" ]; then
    warn "$f уже есть — не трогаю (твоя память/правила целы)"
  else
    cp "$PACK/agent/$f" "$AGENT_DIR/$f"
  fi
done
ok "тело агента на месте"

# 2. Субагент-обёртка (точка входа для Claude Code)
say "Копирую обёртку → .claude/agents/videographer.md"
cp "$PACK/videographer.md" "$WS/.claude/agents/videographer.md"
ok "обёртка на месте (агент зовётся «Видеограф»)"

# 3. Права на скрипты
chmod +x "$AGENT_DIR/remotion-studio/scripts/"*.mjs 2>/dev/null || true
chmod +x "$AGENT_DIR/remotion-studio/render.mjs"     2>/dev/null || true
ok "скрипты исполняемые"

# 4. Зависимости
echo ""
say "Зависимости:"
command -v ffmpeg  >/dev/null && ok "ffmpeg есть" || warn "ffmpeg НЕТ → brew install ffmpeg (или apt). БЕЗ НЕГО монтаж не работает."
command -v ffprobe >/dev/null && ok "ffprobe есть" || warn "ffprobe нет (идёт с ffmpeg)"
command -v uvx     >/dev/null && ok "uvx есть (для mcp-video)" || warn "uvx нет → pip install uv (нужен для mcp-video)"
command -v npm     >/dev/null && ok "npm есть (для Remotion-графики)" || warn "npm нет → нужен для графики (Remotion). Нарезка/субтитры работают и без него."
[ -n "${DEEPGRAM_API_KEY:-}" ] && ok "DEEPGRAM_API_KEY задан" || warn "DEEPGRAM_API_KEY не задан → транскрипция через Deepgram недоступна (fallback: локальный Whisper)"

# 5. Remotion-студия (опционально, для графики)
echo ""
if command -v npm >/dev/null; then
  say "Хочешь графику (kinetic-текст, плашки, Hormozi-капшены)? Поставь зависимости студии:"
  echo "    cd $AGENT_DIR/remotion-studio && npm install"
else
  warn "npm нет — графика Remotion недоступна, пока не поставишь Node.js"
fi

# 6. Что доделать руками
echo ""
say "Осталось 2 ручных шага (5 минут):"
cat <<EOF
  1. Зарегистрировать Видеографа в роутинге своего офиса (см. README → «Регистрация»):
     • office/AGENTS.md — строка про Видеографа
     • правило роутинга в твоём корневом CLAUDE.md / office/CLAUDE.md:
       «видео / монтаж / нарезка / shorts / reels / субтитры / EDL → Видеограф»
  2. Подключить инструменты: открой Claude Code и скажи
     «Видеограф, представься» — он сам проведёт онбординг и предложит MCP по очереди.

Готово. Первый заход: «Видеограф, обработай урок <путь к видео>».
EOF
echo ""
ok "Видеограф установлен."
