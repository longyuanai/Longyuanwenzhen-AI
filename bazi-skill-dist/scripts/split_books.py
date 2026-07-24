"""Split large markdown/txt files into ~30KB chunks for LightRAG import."""

import os
from pathlib import Path

EXPORT_DIR = Path.home() / "knowledge-bases/exports/bazi-mingli"
MAX_SIZE = 28000  # ~28KB per chunk (leave margin)

# All source files: (path, display_name)
SOURCES = [
    # 八字经典
    ("/tmp/ziping.md", "子平真诠"),
    ("/tmp/ditiansu.md", "滴天髓阐微"),
    ("/tmp/sanming.md", "三命通会_简体版"),
    ("/tmp/sanming_zhushi.md", "三命通会_注释版"),
    ("/tmp/yuanhai.md", "渊海子平"),
    ("/tmp/qiongtong.md", "穷通宝鉴"),
    ("/tmp/mingli_yueyan.md", "命理约言"),
    ("/tmp/lixuzhong.md", "李虚中命书"),
    # 当代
    ("/tmp/sizhu_yuce.md", "四柱预测学_张博"),
    ("/tmp/sizhu_shaowei.md", "四柱预测学_邵伟华"),
    (str(Path.home() / "Documents/claude-work/命理/books/当代/中国命理学史论.txt"), "中国命理学史论"),
    # 紫微
    (str(Path.home() / "Documents/claude-work/命理/books/紫微/紫微斗数全书.txt"), "紫微斗数全书"),
    ("/tmp/mingli_tianji.md", "命理天机"),
    ("/tmp/ziwei_jingcheng.md", "紫微斗数精成"),
    ("/tmp/ziwei_jiangyi.md", "紫微斗数讲义"),
]


def split_file(src_path, name):
    """Split a file into chunks of ~MAX_SIZE bytes, breaking at paragraph boundaries."""
    content = Path(src_path).read_text(encoding="utf-8")
    size = len(content.encode("utf-8"))

    if size <= MAX_SIZE:
        out = EXPORT_DIR / f"{name}.md"
        out.write_text(content, encoding="utf-8")
        print(f"  {name}: {size//1024}KB (no split needed)")
        return 1

    # Split at double newlines (paragraph boundaries)
    paragraphs = content.split("\n\n")
    chunks = []
    current = []
    current_size = 0

    for para in paragraphs:
        para_size = len(para.encode("utf-8")) + 2  # +2 for \n\n
        if current_size + para_size > MAX_SIZE and current:
            chunks.append("\n\n".join(current))
            current = [para]
            current_size = para_size
        else:
            current.append(para)
            current_size += para_size

    if current:
        chunks.append("\n\n".join(current))

    for i, chunk in enumerate(chunks):
        out = EXPORT_DIR / f"{name}_part{i+1:02d}.md"
        out.write_text(chunk, encoding="utf-8")

    print(f"  {name}: {size//1024}KB -> {len(chunks)} parts")
    return len(chunks)


def main():
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)

    # Clean old files
    for f in EXPORT_DIR.glob("*.md"):
        f.unlink()

    total_files = 0
    for src, name in SOURCES:
        if not Path(src).exists():
            print(f"  SKIP {name}: {src} not found")
            continue
        total_files += split_file(src, name)

    print(f"\nTotal: {total_files} files in {EXPORT_DIR}")


if __name__ == "__main__":
    main()
