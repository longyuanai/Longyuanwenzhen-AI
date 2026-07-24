#!/usr/bin/env python3
"""
LLM-based OCR for scanned traditional Chinese books.
Uses GPT vision API to transcribe vertical/horizontal ancient text.

Usage:
    # Single page test
    python3 ocr_llm.py input.pdf --page 10 -o test.txt

    # Full book
    python3 ocr_llm.py input.pdf -o output.txt

    # Range
    python3 ocr_llm.py input.pdf --start 5 --end 50 -o output.txt

    # With concurrency
    python3 ocr_llm.py input.pdf -o output.txt -p 3
"""

import json
import sys
import os
import base64
import argparse
import urllib.request
import urllib.error
import concurrent.futures
import time
import io
from pathlib import Path

# Load API config from llm-config.json
CONFIG_PATH = Path(os.path.expanduser("~/tools/llm-config.json"))

def load_config():
    with open(CONFIG_PATH) as f:
        return json.load(f)

def pdf_page_to_base64(pdf_path, page_idx, dpi=200):
    """Render a PDF page to JPEG base64 string."""
    try:
        import pypdfium2 as pdfium
    except ImportError:
        print("pip install pypdfium2", file=sys.stderr)
        sys.exit(1)

    pdf = pdfium.PdfDocument(pdf_path)
    page = pdf[page_idx]
    bitmap = page.render(scale=dpi / 72)
    img = bitmap.to_pil()

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return b64, img.size

SYSTEM_PROMPT = """你是OCR机器。输入图片，输出纯文字。禁止任何解释、注释、标记、格式说明。
竖排：从右到左逐列，每列一行。横排：正常顺序。繁体保持繁体。无法辨认写[?]。只输出原文。"""

def _parse_sse_response(raw):
    """Parse SSE streaming response, extract final completed response."""
    result = None
    for line in raw.split("\n"):
        line = line.strip()
        if line.startswith("data:"):
            try:
                event_data = json.loads(line[5:].strip())
                # Look for response.completed event or any response with output
                if isinstance(event_data, dict):
                    resp = event_data.get("response", event_data)
                    if resp.get("output") and resp.get("status") == "completed":
                        result = resp
            except Exception:
                pass
    return result


def call_vision_api(base64_img, config, page_info=""):
    """Call vision-capable LLM API with a base64 image.

    Configure providers in llm-config.json:
        {
          "providers": {
            "default": {
              "url": "https://api.openai.com/v1/chat/completions",
              "key": "sk-..."
            }
          },
          "model": "gpt-4o"
        }
    """
    providers_cfg = config.get("providers", {})
    providers = [
        (name, p["url"], p["key"])
        for name, p in providers_cfg.items()
        if p.get("key")
    ]

    payload = {
        "model": config.get("model", "gpt-4o"),
        "instructions": SYSTEM_PROMPT,
        "input": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_image",
                        "image_url": f"data:image/jpeg;base64,{base64_img}"
                    },
                    {
                        "type": "input_text",
                        "text": f"转写这一页的全部文字。{page_info}"
                    }
                ]
            }
        ],
        "reasoning": {"effort": "low"},
    }

    data = json.dumps(payload).encode("utf-8")

    for provider_name, url, key in providers:
        if not key:
            continue

        req = urllib.request.Request(
            url, data=data,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {key}",
                "User-Agent": "Mozilla/5.0",
            },
        )

        max_retries = 3
        for attempt in range(max_retries):
            try:
                with urllib.request.urlopen(req, timeout=180) as resp:
                    raw = resp.read().decode("utf-8", errors="replace")

                raw_stripped = raw.strip()
                result = None

                if raw_stripped.startswith("{"):
                    result = json.loads(raw_stripped)
                elif "event:" in raw_stripped or "data:" in raw_stripped:
                    result = _parse_sse_response(raw_stripped)
                    if not result:
                        # Fallback: try last data line
                        for line in reversed(raw_stripped.split("\n")):
                            line = line.strip()
                            if line.startswith("data:") and "{" in line:
                                try:
                                    d = json.loads(line[5:].strip())
                                    if "output" in d.get("response", d):
                                        result = d.get("response", d)
                                        break
                                except:
                                    pass

                if not result:
                    if attempt < max_retries - 1:
                        time.sleep(3)
                        continue
                    return f"[ERROR: no parseable response from {provider_name}]"

                # Extract text
                output = result.get("output", [])
                texts = []
                for item in output:
                    if item.get("type") == "message":
                        for content in item.get("content", []):
                            if content.get("type") == "output_text":
                                texts.append(content["text"])
                if texts:
                    return "\n".join(texts)
                else:
                    if attempt < max_retries - 1:
                        time.sleep(3)
                        continue
                    return f"[ERROR: no text in {provider_name} response]"

            except urllib.error.HTTPError as e:
                if e.code == 429:
                    wait = 10 * (attempt + 1)
                    print(f"  Rate limited on {provider_name}, waiting {wait}s...", file=sys.stderr, flush=True)
                    time.sleep(wait)
                    continue
                elif attempt < max_retries - 1:
                    time.sleep(5)
                    continue
                else:
                    break  # Try next provider
            except Exception as e:
                if attempt < max_retries - 1:
                    time.sleep(5)
                    continue
                else:
                    break  # Try next provider

    return "[ERROR: all providers failed]"

def process_page(args_tuple):
    """Process a single page. Returns (page_idx, text)."""
    pdf_path, page_idx, total, config, dpi = args_tuple

    b64, size = pdf_page_to_base64(pdf_path, page_idx, dpi=dpi)
    text = call_vision_api(b64, config, page_info=f"第{page_idx+1}/{total}页")

    print(f"  Page {page_idx+1}/{total}: {len(text)} chars", flush=True)
    return (page_idx, text)

def main():
    parser = argparse.ArgumentParser(description="LLM-based OCR for scanned books")
    parser.add_argument("pdf", help="Input PDF file")
    parser.add_argument("-o", "--output", help="Output text file", default=None)
    parser.add_argument("--page", type=int, help="Single page (1-indexed)", default=None)
    parser.add_argument("--start", type=int, help="Start page (1-indexed)", default=1)
    parser.add_argument("--end", type=int, help="End page (1-indexed)", default=None)
    parser.add_argument("--dpi", type=int, help="Render DPI", default=300)
    parser.add_argument("-p", "--parallel", type=int, help="Parallel workers", default=1)
    args = parser.parse_args()

    config = load_config()

    try:
        import pypdfium2
    except ImportError:
        print("Installing pypdfium2...", file=sys.stderr)
        os.system(f"{sys.executable} -m pip install pypdfium2 -q")
        import pypdfium2

    pdf = pypdfium2.PdfDocument(args.pdf)
    total = len(pdf)
    print(f"PDF: {args.pdf} ({total} pages)", flush=True)

    # Determine page range
    if args.page:
        pages = [args.page - 1]
    else:
        start = args.start - 1
        end = (args.end if args.end else total)
        pages = list(range(start, min(end, total)))

    print(f"Processing pages: {pages[0]+1}-{pages[-1]+1} ({len(pages)} pages)", flush=True)
    print(f"Parallel: {args.parallel}, DPI: {args.dpi}", flush=True)

    # Process - write incrementally to temp file, assemble at end
    tmp_dir = args.output + ".parts" if args.output else "/tmp/ocr_parts"
    os.makedirs(tmp_dir, exist_ok=True)

    results = {}
    if args.parallel <= 1:
        for pidx in pages:
            idx, text = process_page((args.pdf, pidx, total, config, args.dpi))
            results[idx] = text
            # Write each page immediately
            with open(os.path.join(tmp_dir, f"{idx:05d}.txt"), "w", encoding="utf-8") as pf:
                pf.write(text)
            time.sleep(1)
    else:
        tasks = [(args.pdf, pidx, total, config, args.dpi) for pidx in pages]
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.parallel) as pool:
            futures = {pool.submit(process_page, t): t[1] for t in tasks}
            for future in concurrent.futures.as_completed(futures):
                idx, text = future.result()
                results[idx] = text
                # Write each page immediately
                with open(os.path.join(tmp_dir, f"{idx:05d}.txt"), "w", encoding="utf-8") as pf:
                    pf.write(text)

    # Assemble output from parts
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            for pidx in sorted(results.keys()):
                f.write(f"=== Page {pidx+1}/{total} ===\n{results[pidx]}\n\n")
        # Clean up parts
        import shutil
        shutil.rmtree(tmp_dir, ignore_errors=True)
        print(f"\nDone! Output: {args.output}", flush=True)
    else:
        for pidx in sorted(results.keys()):
            print(f"=== Page {pidx+1}/{total} ===\n{results[pidx]}\n")

if __name__ == "__main__":
    main()
