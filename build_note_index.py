from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

DOCS_DIR = Path("docs")
OUTPUT_FILE = DOCS_DIR / "_note-index.json"

index: dict[str, list[str]] = defaultdict(list)

for markdown_file in DOCS_DIR.rglob("*.md"):
    relative_path = markdown_file.relative_to(DOCS_DIR)

    # Docsifyのトップページは検索対象から除外
    if relative_path.as_posix() == "README.md":
        continue

    path_without_extension = relative_path.with_suffix("").as_posix()
    note_name = markdown_file.stem

    index[note_name].append(path_without_extension)

sorted_index = {
    note_name: sorted(paths)
    for note_name, paths in sorted(index.items())
}

OUTPUT_FILE.write_text(
    json.dumps(sorted_index, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

print(f"作成完了: {OUTPUT_FILE}")
print(f"ノート名: {len(sorted_index)}件")
print(
    "Markdownファイル: "
    f"{sum(len(paths) for paths in sorted_index.values())}件"
)
