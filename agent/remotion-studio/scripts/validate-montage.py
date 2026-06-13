#!/usr/bin/env python3
"""
validate-montage.py — Финальный валидатор монтажа v3.

Пять проверок:
  OVERLAP      — наезд оверлеев друг на друга
  SYNC         — оверлей совпадает с anchor_phrase в РЕАЛЬНОМ финальном транскрипте
                 (ретранскрипция через Deepgram words-level, NOT план-с-планом)
  DENSITY      — нет gap >18 сек без визуального события
  COVERAGE     — ProgressStepper на каждую главу
  INTERSTITIAL — full-screen отбивка не пересекает ui_critical диапазоны
                 (агент вручную помечает диапазоны footage в saturation-plan.md)

Правка ревью #2: INTERSTITIAL реальная — арифметика по ui_critical, НЕ CV/автодетект.
Правка ревью #3: SYNC переписан — сравнивает tс overlay с РЕАЛЬНЫМ финальным транскриптом
                 через Deepgram words (не план-с-планом, не тавтология).

Использование:
    python3 validate-montage.py overlay-timecodes.json final-transcript.json validation-report.md \\
        [--saturation-plan saturation-plan.md] [--tolerance 1.0] [--video-duration 420]

Выход:
    0 — нет Critical нарушений (можно отдавать)
    1 — есть Critical → агент НЕ отдаёт, исправляет

Зависимости: стандартная библиотека Python 3.8+
"""

import json
import sys
import re
import os
import argparse
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any

# ─── Модели ────────────────────────────────────────────────────────────────────

@dataclass
class Overlay:
    component: str
    anchor_phrase: str
    start_sec: float
    end_sec: float

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Overlay":
        return cls(
            component=d.get("component", "?"),
            anchor_phrase=d.get("anchor_phrase", ""),
            start_sec=float(d.get("start_sec", 0)),
            end_sec=float(d.get("end_sec", 0)),
        )


@dataclass
class Interstitial:
    """Full-screen отбивка — сегмент в filelist, НЕ оверлей."""
    label: str
    start_sec: float
    end_sec: float

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Interstitial":
        return cls(
            label=d.get("label", "?"),
            start_sec=float(d.get("start_sec", 0)),
            end_sec=float(d.get("end_sec", 0)),
        )


@dataclass
class UiCritical:
    """Диапазон footage где зритель должен видеть непрерывный UI-экран/действие.
    Агент вручную помечает в saturation-plan.md секции ## ui_critical."""
    label: str
    start_sec: float
    end_sec: float


@dataclass
class Finding:
    severity: str   # Critical | Warning | Info
    rule: str
    details: str
    tc: float


# ─── Загрузчики ────────────────────────────────────────────────────────────────

def load_overlays(path: str) -> List[Overlay]:
    with open(path) as f:
        data = json.load(f)
    raw = data.get("overlays", data) if isinstance(data, dict) else data
    return [Overlay.from_dict(o) for o in raw]


def load_interstitials(path: str) -> List[Interstitial]:
    """Загружает interstitials из overlay-timecodes.json (ключ 'interstitials')."""
    with open(path) as f:
        data = json.load(f)
    return [Interstitial.from_dict(i) for i in data.get("interstitials", [])]


def extract_words_from_deepgram(transcript_path: str) -> List[Dict]:
    """
    Извлекает word-level тайм-коды из финального Deepgram-транскрипта.

    Поддерживаемые форматы:
    - Deepgram API response (results.channels[0].alternatives[0].words)
    - Упрощённый {words: [{word, start, end}]}
    - SRT-файл (fallback, блочная точность)
    """
    with open(transcript_path) as f:
        content = f.read()

    # SRT fallback
    if transcript_path.endswith(".srt") or content.strip().startswith("1\n"):
        return _parse_srt_to_words(content)

    data = json.loads(content)

    # Deepgram API response
    try:
        words = (
            data["results"]["channels"][0]["alternatives"][0]["words"]
        )
        return words  # [{word, start, end, confidence, ...}]
    except (KeyError, IndexError, TypeError):
        pass

    # Упрощённый формат
    if "words" in data:
        return data["words"]

    raise ValueError(
        f"Не могу извлечь word-level тайм-коды из {transcript_path}.\n"
        "Ожидается Deepgram API response с results.channels[0].alternatives[0].words "
        "или формат {words:[{word,start,end}]}. "
        "Для точной SYNC-проверки нужна ретранскрипция финала через Deepgram (words=true)."
    )


def _parse_srt_to_words(srt_text: str) -> List[Dict]:
    """SRT → псевдо-words (блочная точность ~2-3 сек, не word-level)."""
    words = []
    blocks = re.split(r"\n\n+", srt_text.strip())
    for block in blocks:
        lines = block.strip().splitlines()
        if len(lines) < 3:
            continue
        timing = lines[1]
        text = " ".join(lines[2:])
        m = re.match(
            r"(\d+):(\d+):(\d+)[,.](\d+) --> (\d+):(\d+):(\d+)[,.](\d+)",
            timing,
        )
        if not m:
            continue
        g = [int(x) for x in m.groups()]
        start = g[0]*3600 + g[1]*60 + g[2] + g[3]/1000
        end   = g[4]*3600 + g[5]*60 + g[6] + g[7]/1000
        for w in text.lower().split():
            words.append({"word": w, "start": start, "end": end})
    return words


def find_anchor_time(anchor_phrase: str, words: List[Dict]) -> Optional[float]:
    """
    Ищет anchor_phrase в реальном word-level транскрипте финала.
    Возвращает start тайм-код первого слова фразы или None если не найдено.

    Алгоритм:
    1. Фраза разбивается на слова.
    2. Скользящее окно по transcript.words.
    3. Нормализация: lowercase, strip пунктуации.
    """
    phrase_words = [_normalize_word(w) for w in anchor_phrase.lower().split() if w.strip()]
    if not phrase_words:
        return None

    transcript_words = [_normalize_word(w.get("word", "")) for w in words]

    n = len(phrase_words)
    for i in range(len(transcript_words) - n + 1):
        if transcript_words[i:i+n] == phrase_words:
            return float(words[i].get("start", 0))

    # Мягкий поиск: первое слово фразы
    first = phrase_words[0]
    for i, tw in enumerate(transcript_words):
        if tw == first:
            return float(words[i].get("start", 0))

    return None


def _normalize_word(w: str) -> str:
    return re.sub(r"[^\w]", "", w.lower())


def parse_ui_critical_from_plan(plan_path: str) -> List[UiCritical]:
    """
    Парсит секцию ## ui_critical из saturation-plan.md.

    Формат в файле:
    ## ui_critical
    - "открываем настройки": 42.0–58.5
    - "вводим пароль": 120.3–135.0

    Правка ревью #2: агент вручную помечает диапазоны.
    Скрипт проверяет АРИФМЕТИЧЕСКИ — нет CV/автодетекта.
    """
    if not plan_path or not os.path.exists(plan_path):
        return []

    with open(plan_path) as f:
        content = f.read()

    section = re.search(r"## ui_critical\n(.*?)(?=\n## |\Z)", content, re.DOTALL)
    if not section:
        return []

    critical = []
    pattern = re.compile(r'-\s+"([^"]+)":\s*([\d.]+)[–—-]([\d.]+)')
    for m in pattern.finditer(section.group(1)):
        critical.append(UiCritical(
            label=m.group(1),
            start_sec=float(m.group(2)),
            end_sec=float(m.group(3)),
        ))
    return critical


def parse_chapters_from_plan(plan_path: str) -> List[Dict]:
    """
    Парсит таблицу глав из saturation-plan.md для COVERAGE-проверки.

    Формат:
    ## Структура глав
    | 1 | "первые слова" | Тема | ~0:00 |
    """
    if not plan_path or not os.path.exists(plan_path):
        return []

    with open(plan_path) as f:
        content = f.read()

    section = re.search(r"## Структура глав.*?\n(.*?)(?=\n## |\Z)", content, re.DOTALL)
    if not section:
        return []

    chapters = []
    row_pattern = re.compile(r"\|\s*(\d+)\s*\|\s*\"([^\"]+)\"\s*\|\s*([^|]+)\|.*?~(\d+):(\d+)")
    for m in row_pattern.finditer(section.group(1)):
        title = m.group(3).strip()
        minutes, seconds = int(m.group(4)), int(m.group(5))
        start_sec = minutes * 60 + seconds
        chapters.append({"index": int(m.group(1)), "title": title, "start_sec": start_sec})
    return chapters


# ─── Проверки ──────────────────────────────────────────────────────────────────

def check_overlap(overlays: List[Overlay]) -> List[Finding]:
    """
    OVERLAP: пересечение оверлеев по времени > 0.5 сек → Critical.
    Небольшой overlap (≤0.5 сек) допустим при fade-переходе.
    HUD-компоненты (ProgressStepper, CountUpTimer) исключены из overlap-проверки:
    они по дизайну всегда-на-экране и не конкурируют визуально с flash-оверлеями.
    """
    HUD_COMPONENTS = {"ProgressStepper", "CountUpTimer"}
    findings = []
    for i, a in enumerate(overlays):
        if a.component in HUD_COMPONENTS:
            continue
        for b in overlays[i+1:]:
            if b.component in HUD_COMPONENTS:
                continue
            if a.start_sec < b.end_sec and b.start_sec < a.end_sec:
                overlap_sec = min(a.end_sec, b.end_sec) - max(a.start_sec, b.start_sec)
                if overlap_sec > 0.5:
                    findings.append(Finding(
                        severity="Critical",
                        rule="OVERLAP",
                        details=(
                            f"{a.component} [{a.start_sec:.1f}–{a.end_sec:.1f}с] "
                            f"пересекается с {b.component} [{b.start_sec:.1f}–{b.end_sec:.1f}с] "
                            f"на {overlap_sec:.1f} сек"
                        ),
                        tc=a.start_sec,
                    ))
    return findings


def check_sync(overlays: List[Overlay], words: List[Dict], tolerance_sec: float = 1.0) -> List[Finding]:
    """
    SYNC (правка ревью #3): сравнивает тайм-код наложенного оверлея
    с позицией его anchor_phrase в РЕАЛЬНОМ финальном транскрипте (Deepgram words).
    HUD-компоненты (ProgressStepper, CountUpTimer) исключены из SYNC-проверки:
    их тайм-коды определяются границами глав, а не позицией фразы.

    НЕ план-с-планом — это была тавтология в исходном псевдокоде.
    Реальная позиция ищется через скользящее окно по словам финала.
    Допуск: tolerance_sec (дефолт 1.0 сек по решению владельца).
    """
    HUD_COMPONENTS = {"ProgressStepper", "CountUpTimer"}
    findings = []
    for ov in overlays:
        if not ov.anchor_phrase or ov.anchor_phrase in ("start", ""):
            continue  # сквозные (CountUpTimer start) пропускаем
        if ov.component in HUD_COMPONENTS:
            continue  # HUD-компоненты исключены из SYNC-проверки

        real_time = find_anchor_time(ov.anchor_phrase, words)
        if real_time is None:
            findings.append(Finding(
                severity="Warning",
                rule="SYNC",
                details=(
                    f"{ov.component}: anchor_phrase '{ov.anchor_phrase}' "
                    f"не найдена в финальном транскрипте. "
                    f"Проверь что фраза есть в финале после нарезки."
                ),
                tc=ov.start_sec,
            ))
            continue

        diff = abs(ov.start_sec - real_time)
        if diff > tolerance_sec:
            severity = "Critical" if diff > 3.0 else "Warning"
            findings.append(Finding(
                severity=severity,
                rule="SYNC",
                details=(
                    f"{ov.component} anchor='{ov.anchor_phrase}': "
                    f"реальная позиция в финале {real_time:.1f}с, "
                    f"overlay стоит в {ov.start_sec:.1f}с "
                    f"(рассинхрон {diff:.1f}с, допуск {tolerance_sec:.1f}с)"
                ),
                tc=ov.start_sec,
            ))
    return findings


def check_density(overlays: List[Overlay], video_duration_sec: float, max_gap_sec: float = 18.0) -> List[Finding]:
    """
    DENSITY: промежутки >18 сек без визуального события → Warning.
    Порог снижен с 20 до 18 сек (рефайн 3, 2026-05-28) — цель 1/18 сек.
    Сквозные (ProgressStepper, CountUpTimer) не считаются как события.
    """
    findings = []
    passive_components = {"ProgressStepper", "CountUpTimer"}
    events = sorted(
        [ov.start_sec for ov in overlays if ov.component not in passive_components]
    )
    if not events:
        if video_duration_sec > max_gap_sec:
            findings.append(Finding(
                severity="Warning",
                rule="DENSITY",
                details=f"Нет ни одного non-passive события в {video_duration_sec:.0f}с видео",
                tc=0,
            ))
        return findings

    checkpoints = [0.0] + events + [video_duration_sec]
    for i in range(1, len(checkpoints)):
        gap = checkpoints[i] - checkpoints[i-1]
        if gap > max_gap_sec:
            findings.append(Finding(
                severity="Warning",
                rule="DENSITY",
                details=(
                    f"Gap {gap:.0f}с без события: "
                    f"{checkpoints[i-1]:.0f}с–{checkpoints[i]:.0f}с"
                ),
                tc=checkpoints[i-1],
            ))
    return findings


def check_coverage(overlays: List[Overlay], chapters: List[Dict]) -> List[Finding]:
    """
    COVERAGE: каждой главе должен соответствовать ProgressStepper-рендер.
    Допуск: ±2 сек от start_sec главы (якоря могут чуть плавать).
    """
    findings = []
    steppers = [ov for ov in overlays if ov.component == "ProgressStepper"]
    for ch in chapters:
        covered = any(
            abs(s.start_sec - ch["start_sec"]) < 2.0
            for s in steppers
        )
        if not covered:
            findings.append(Finding(
                severity="Critical",
                rule="COVERAGE",
                details=(
                    f"Глава {ch.get('index','?')} ('{ch['title']}', ~{ch['start_sec']:.0f}с) "
                    f"не покрыта ProgressStepper-рендером"
                ),
                tc=ch["start_sec"],
            ))
    return findings


def check_interstitial(
    interstitials: List[Interstitial],
    ui_critical: List[UiCritical],
) -> List[Finding]:
    """
    INTERSTITIAL (правка ревью #2): full-screen отбивка НЕ должна пересекать ui_critical диапазон.

    Проверка АРИФМЕТИЧЕСКАЯ (не CV):
    - Агент вручную помечает диапазоны footage как ui_critical в saturation-plan.md
    - Скрипт проверяет пересечение по тайм-кодам

    Если ui_critical пустой — проверка пропускается (Info).
    """
    findings = []

    if not ui_critical:
        findings.append(Finding(
            severity="Info",
            rule="INTERSTITIAL",
            details=(
                "ui_critical диапазоны не размечены в saturation-plan.md. "
                "Для автопроверки — добавь секцию ## ui_critical с диапазонами footage."
            ),
            tc=0,
        ))
        return findings

    for interstitial in interstitials:
        for crit in ui_critical:
            # Пересечение: interstitial начинается до конца critical AND заканчивается после начала critical
            if interstitial.start_sec < crit.end_sec and interstitial.end_sec > crit.start_sec:
                overlap = min(interstitial.end_sec, crit.end_sec) - max(interstitial.start_sec, crit.start_sec)
                findings.append(Finding(
                    severity="Critical",
                    rule="INTERSTITIAL",
                    details=(
                        f"Отбивка '{interstitial.label}' [{interstitial.start_sec:.1f}–{interstitial.end_sec:.1f}с] "
                        f"пересекает ui_critical '{crit.label}' [{crit.start_sec:.1f}–{crit.end_sec:.1f}с] "
                        f"на {overlap:.1f}с. "
                        f"Сдвинь отбивку ЗА пределы ui_critical диапазона."
                    ),
                    tc=interstitial.start_sec,
                ))
    return findings


# ─── Отчёт ─────────────────────────────────────────────────────────────────────

def generate_report(findings: List[Finding], output_path: str) -> bool:
    """
    Генерирует validation-report.md.
    Возвращает True если нет Critical (exit 0), False если есть (exit 1).
    """
    critical = [f for f in findings if f.severity == "Critical"]
    warnings  = [f for f in findings if f.severity == "Warning"]
    infos     = [f for f in findings if f.severity == "Info"]

    if critical:
        verdict = "FAIL — есть Critical нарушения"
    elif warnings:
        verdict = "PASS с замечаниями"
    else:
        verdict = "PASS — всё чисто"

    lines = [
        "# Отчёт валидации монтажа",
        f"**Вердикт:** {verdict}",
        f"Critical: {len(critical)} | Warning: {len(warnings)} | Info: {len(infos)}",
        "",
        "---",
        "",
    ]

    if critical:
        lines += ["## Critical — нужно исправить до отдачи", ""]
        for f in sorted(critical, key=lambda x: x.tc):
            lines.append(f"- `[{f.tc:.1f}с]` **{f.rule}**: {f.details}")
        lines.append("")

    if warnings:
        lines += ["## Warning — желательно исправить", ""]
        for f in sorted(warnings, key=lambda x: x.tc):
            lines.append(f"- `[{f.tc:.1f}с]` {f.rule}: {f.details}")
        lines.append("")

    if infos:
        lines += ["## Info", ""]
        for f in infos:
            lines.append(f"- {f.rule}: {f.details}")
        lines.append("")

    if not findings:
        lines.append("Нарушений не обнаружено. Видео готово к отдаче.")

    with open(output_path, "w", encoding="utf-8") as fp:
        fp.write("\n".join(lines))

    print(f"\n{'='*60}")
    print(f"validate-montage.py — вердикт: {verdict}")
    print(f"Critical: {len(critical)} | Warning: {len(warnings)} | Info: {len(infos)}")
    print(f"Отчёт сохранён: {output_path}")
    print(f"{'='*60}\n")

    if critical:
        print("Critical нарушения:")
        for c in critical:
            print(f"  [{c.tc:.1f}с] {c.rule}: {c.details}")
        print()

    return len(critical) == 0


# ─── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="validate-montage.py — финальный валидатор монтажа v3"
    )
    parser.add_argument("overlays_json", help="overlay-timecodes.json")
    parser.add_argument("transcript_json", help="final-transcript.json (Deepgram words=true) или .srt")
    parser.add_argument("output_report", help="validation-report.md")
    parser.add_argument("--saturation-plan", default="", help="saturation-plan.md (для ui_critical)")
    parser.add_argument("--tolerance", type=float, default=1.0, help="SYNC tolerance_sec (дефолт 1.0)")
    parser.add_argument("--video-duration", type=float, default=0.0, help="Длина финального видео в сек")

    args = parser.parse_args()

    # Загрузка данных
    print(f"Загружаю оверлеи: {args.overlays_json}")
    overlays = load_overlays(args.overlays_json)

    print(f"Загружаю interstitials из: {args.overlays_json}")
    interstitials = load_interstitials(args.overlays_json)

    print(f"Загружаю транскрипт финала: {args.transcript_json}")
    try:
        words = extract_words_from_deepgram(args.transcript_json)
        word_source = "Deepgram" if not args.transcript_json.endswith(".srt") else "SRT (fallback)"
        print(f"  Слов в транскрипте: {len(words)} (источник: {word_source})")
    except Exception as e:
        print(f"  ПРЕДУПРЕЖДЕНИЕ: {e}")
        words = []

    # Длина видео: из транскрипта или параметра
    video_duration = args.video_duration
    if video_duration <= 0 and words:
        video_duration = float(words[-1].get("end", 0))
    if video_duration <= 0:
        video_duration = max((ov.end_sec for ov in overlays), default=0) + 30

    print(f"  Длина видео: {video_duration:.0f}с")

    # Загрузка ui_critical и глав из плана
    ui_critical = parse_ui_critical_from_plan(args.saturation_plan)
    chapters = parse_chapters_from_plan(args.saturation_plan)
    print(f"  ui_critical диапазонов: {len(ui_critical)}")
    print(f"  Глав в плане: {len(chapters)}")
    print(f"  Оверлеев: {len(overlays)}")
    print(f"  Interstitials: {len(interstitials)}")
    print(f"  SYNC tolerance: {args.tolerance}с\n")

    # Запуск проверок
    findings: List[Finding] = []

    print("Проверка OVERLAP...")
    findings += check_overlap(overlays)

    if words:
        print(f"Проверка SYNC (tolerance={args.tolerance}с)...")
        findings += check_sync(overlays, words, tolerance_sec=args.tolerance)
    else:
        findings.append(Finding(
            severity="Warning",
            rule="SYNC",
            details="Транскрипт финала не загружен — SYNC-проверка пропущена",
            tc=0,
        ))

    print("Проверка DENSITY...")
    findings += check_density(overlays, video_duration)

    print("Проверка COVERAGE...")
    if chapters:
        findings += check_coverage(overlays, chapters)
    else:
        findings.append(Finding(
            severity="Info",
            rule="COVERAGE",
            details=(
                "Главы не найдены в saturation-plan.md. "
                "Добавь секцию '## Структура глав' для проверки ProgressStepper."
            ),
            tc=0,
        ))

    print("Проверка INTERSTITIAL...")
    findings += check_interstitial(interstitials, ui_critical)

    # Генерация отчёта
    ok = generate_report(findings, args.output_report)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
