#!/usr/bin/env python3
"""Merge multiple .srt files with timestamp offset adjustment."""
import os
import re
import sys
from pathlib import Path

def parse_time(t):
    """Parse SRT timestamp to seconds."""
    h, m, rest = t.split(':')
    s, ms = rest.split(',')
    return int(h)*3600 + int(m)*60 + int(s) + int(ms)/1000

def format_time(seconds):
    """Format seconds to SRT timestamp."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

def parse_srt(filepath):
    """Parse .srt file into list of (start, end, text) tuples."""
    content = Path(filepath).read_text(encoding='utf-8')
    blocks = re.split(r'\n\n+', content.strip())
    subs = []
    for block in blocks:
        lines = block.strip().split('\n')
        if len(lines) >= 3:
            times = lines[1]
            match = re.match(r'(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})', times)
            if match:
                start = parse_time(match.group(1))
                end = parse_time(match.group(2))
                text = '\n'.join(lines[2:])
                subs.append((start, end, text))
    return subs

def merge_srts(srt_dir, output_path):
    """Merge all .srt files in directory with cumulative offset."""
    srt_files = sorted(Path(srt_dir).glob('*.srt'))
    if not srt_files:
        print(f"No .srt files found in {srt_dir}")
        sys.exit(1)

    all_subs = []
    offset = 0.0

    for srt_file in srt_files:
        subs = parse_srt(srt_file)
        if not subs:
            continue
        max_end = 0
        for start, end, text in subs:
            all_subs.append((start + offset, end + offset, text))
            max_end = max(max_end, end)
        offset += max_end

    # Write merged SRT
    with open(output_path, 'w', encoding='utf-8') as f:
        for i, (start, end, text) in enumerate(all_subs, 1):
            f.write(f"{i}\n")
            f.write(f"{format_time(start)} --> {format_time(end)}\n")
            f.write(f"{text}\n\n")

    print(f"Merged {len(srt_files)} files → {len(all_subs)} subtitles → {output_path}")

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: merge-srt.py <srt_dir> --output <output.srt>")
        sys.exit(1)

    srt_dir = sys.argv[1]
    output = sys.argv[sys.argv.index('--output') + 1] if '--output' in sys.argv else 'merged.srt'
    merge_srts(srt_dir, output)
