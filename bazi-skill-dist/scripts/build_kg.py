"""
Bazi/Mingli KB graph builder: multi-round entity/relationship extraction with gleaning.

Adapted from OSINT KB builder for Chinese traditional fortune-telling (八字命理) domain.

Usage:
    python3 build_kg.py prepare
    python3 build_kg.py extract --round 1 --parallel 10 --model gpt-4o
    python3 build_kg.py extract --round 2 --parallel 10 --model gemini-flash-lite
    python3 build_kg.py cross-chunk --parallel 10 --model gemini-flash-lite
    python3 build_kg.py merge
"""

import json
import sys
import time
import argparse
import urllib.request
import urllib.error
from pathlib import Path
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

# -- Paths --
SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
KB_DIR = Path.home() / "knowledge-bases/kbs/bazi-mingli"
DATA_DIR = SCRIPT_DIR / "kg_data"

# -- API Config --
# Configure via environment variables or ~/knowledge-bases/.env:
#   LLM_API_KEY        API key (OpenAI key, Gemini key, or compatible)
#   LLM_BASE_URL       OpenAI-compatible API base URL (default: official OpenAI)
#   GEMINI_BASE_URL    Gemini API base URL (default: official Google)
import os
LLM_API_KEY = None
LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "https://api.openai.com/v1")
GEMINI_BASE_URL = os.environ.get(
    "GEMINI_BASE_URL",
    "https://generativelanguage.googleapis.com/v1beta",
)
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash-lite")


def load_api_key():
    global LLM_API_KEY
    env_file = Path.home() / "knowledge-bases/.env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                k = k.strip()
                if k == "LLM_API_KEY":
                    LLM_API_KEY = v.strip()
                elif k in ("LLM_BASE_URL", "GEMINI_BASE_URL", "GEMINI_MODEL"):
                    os.environ[k] = v.strip()
    LLM_API_KEY = LLM_API_KEY or os.environ.get("LLM_API_KEY")
    if not LLM_API_KEY:
        print("ERROR: LLM_API_KEY not found")
        print("Set in ~/knowledge-bases/.env or as environment variable")
        sys.exit(1)


def openai_chat(prompt, model="gpt-4o", max_retries=5):
    """Call OpenAI-compatible chat completion API."""
    payload = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.1,
    }).encode("utf-8")

    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(
                f"{LLM_BASE_URL}/chat/completions",
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {LLM_API_KEY}",
                    "User-Agent": "Mozilla/5.0",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=180) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            return data["choices"][0]["message"]["content"]
        except (urllib.error.HTTPError, urllib.error.URLError) as e:
            status = getattr(e, "code", None)
            if status in (429, 500, 502, 503, 504):
                wait = (attempt + 1) * 8
                print(f"    [retry {attempt+1}] {status}, waiting {wait}s...")
                time.sleep(wait)
                continue
            if attempt < max_retries - 1:
                time.sleep(3)
                continue
            raise
        except Exception:
            if attempt < max_retries - 1:
                time.sleep(3)
                continue
            raise
    return ""


def gemini_chat(prompt, max_retries=3):
    """Call Google Gemini API."""
    payload = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.1},
    }).encode("utf-8")

    url = f"{GEMINI_BASE_URL}/models/{GEMINI_MODEL}:generateContent"

    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(
                f"{url}?key={LLM_API_KEY}",
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "Mozilla/5.0",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            candidates = data.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                if parts:
                    return parts[0].get("text", "")
            return ""
        except (urllib.error.HTTPError, urllib.error.URLError) as e:
            status = getattr(e, "code", None)
            if status in (429, 503):
                wait = (attempt + 1) * 5
                print(f"    [retry {attempt+1}] {status}, waiting {wait}s...")
                time.sleep(wait)
                continue
            if attempt < max_retries - 1:
                time.sleep(2)
                continue
            raise
        except Exception:
            if attempt < max_retries - 1:
                time.sleep(2)
                continue
            raise
    return ""


def llm_call(prompt, model="gpt-4o"):
    """Dispatch LLM call. Supports any OpenAI-compatible endpoint."""
    return openai_chat(prompt, model=model)


# -- Entity types for Bazi/Mingli domain --
ENTITY_TYPES = """
ENTITY TYPES (use exactly these labels, output in Chinese where appropriate):
- TIANGAN: 天干 (甲乙丙丁戊己庚辛壬癸)
- DIZHI: 地支 (子丑寅卯辰巳午未申酉戌亥)
- WUXING: 五行 (金木水火土, 及其生克关系)
- SHISHEN: 十神 (比肩/劫财/食神/伤官/偏财/正财/七杀/正官/偏印/正印)
- GEJU: 格局 (食神生财格/杀印相生格/从财格/专旺格等)
- SHENSHA: 神煞 (天乙贵人/桃花/驿马/羊刃/天医/华盖等)
- CONCEPT: 命理概念 (用神/忌神/调候/通根/透干/身强/身弱/刑冲合害等)
- METHOD: 分析方法 (日主强弱判斷/用神取法/大运排法/流年断法等)
- RULE: 命理法则/口诀 (如"食喜身旺以相生""凶刑后发"等)
- PERSON: 命理学家/历史人物 (徐子平/万民英/任铁樵/沈孝瞻/余春台等)
- BOOK: 命理著作 (子平真诠/滴天髓/三命通会/渊海子平/穷通宝鉴等)
- CHAPTER: 书中章节/篇目 (论食神/论用神/六戊日庚申时断等)
- CASE: 命例/案例 (谢阁老命/某造等)
- ORGAN: 脏腑/身体部位 (肝胆/心小肠/脾胃/肺大肠/肾膀胱等)
- SEASON: 季节/月令 (春/夏/秋/冬/寅月/申月等)
- ZIWEI_STAR: 紫微斗数星曜 (紫微/天机/太阳/武曲/天同/廉贞等)
- ZIWEI_PALACE: 紫微宫位 (命宫/兄弟宫/夫妻宫/子女宫/财帛宫等)
- RELATIONSHIP_TYPE: 干支关系类型 (六合/六冲/三合/三刑/三会/半合/害/破等)
"""

# -- Prompts --
PROMPT_ROUND1 = """你是中国传统命理学知识图谱构建专家。从以下文本中提取所有实体和关系。

{entity_types}

RELATIONSHIP TYPES: GENERATES/生, RESTRAINS/克, PRODUCES/化, CLASHES/冲, COMBINES/合, PUNISHES/刑, HARMS/害, BELONGS_TO/属于, REPRESENTS/代表, GOVERNS/主管, AUTHORED/撰, CITED_IN/见于, APPLIES_WHEN/适用于, CONTRADICTS/矛盾, EXTENDS/补充, REQUIRES/需要, BREAKS/破格, ENHANCES/助

RULES: 实体名用中文保留原文术语, 提取显性和隐性关系, 每块5-20实体5-25关系, weight 0.0-1.0, 提取口诀/法则原文作为RULE类型

SOURCE: {source_id}
BOOK: {book_name}

TEXT:
{text}

Output ONLY valid JSON:
{{"entities": [{{"entity_name": "名称", "entity_type": "TYPE", "description": "简要描述"}}], "relationships": [{{"src_id": "源实体", "tgt_id": "目标实体", "description": "关系含义", "keywords": "关键词1,关键词2", "weight": 0.8}}]}}"""

PROMPT_GLEANING = """你正在审查之前的实体/关系提取结果, 找出遗漏的内容。

已提取实体: {prev_entities}
已提取关系: {prev_relationships}

只提取之前遗漏的:
1. 隐含的五行生克关系链
2. 跨概念关联 (如某口诀与某格局的关系)
3. 条件性关系 (身强时如何, 身弱时如何)
4. 二阶关系 (A->B->C, 提取 A->C)
5. 作者归属和出处

{entity_types}

SOURCE: {source_id} | BOOK: {book_name}

TEXT:
{text}

Output 5-20 NEW entities and 5-20 NEW relationships.
Return ONLY valid JSON:
{{"entities": [{{"entity_name": "名称", "entity_type": "TYPE", "description": "描述"}}], "relationships": [{{"src_id": "源", "tgt_id": "目标", "description": "关系", "keywords": "k1,k2", "weight": 0.8}}]}}"""

PROMPT_CROSS_CHUNK = """找出两个相邻文本块之间的跨块关系。

块A中的实体: {entities_a}
块B中的实体: {entities_b}

{entity_types}

CHUNK A ({source_a}):
{text_a}

CHUNK B ({source_b}):
{text_b}

找出 3-15 个跨块关系:
- A中的概念在B中进一步发展
- A中的法则是B中论述的前提
- 同一实体在A和B中的不同方面
- 不同书/章的观点对比

Return ONLY valid JSON:
{{"entities": [{{"entity_name": "名称", "entity_type": "TYPE", "description": "描述"}}], "relationships": [{{"src_id": "源", "tgt_id": "目标", "description": "跨块关系", "keywords": "k1,k2", "weight": 0.7}}]}}"""


def safe_str(val, default=""):
    if val is None:
        return default
    return str(val).strip() or default


def load_chunks():
    with open(KB_DIR / "kv_store_text_chunks.json") as f:
        return json.load(f)


def book_name_from_doc_id(doc_id):
    name = doc_id.replace(".md", "")
    if "_part" in name:
        name = name[:name.rfind("_part")]
    return name[:80]


def parse_json_response(text):
    text = text.strip()
    if "```json" in text:
        start = text.index("```json") + 7
        end = text.index("```", start)
        text = text[start:end].strip()
    elif "```" in text:
        start = text.index("```") + 3
        end = text.index("```", start)
        text = text[start:end].strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        brace_start = text.find("{")
        brace_end = text.rfind("}")
        if brace_start >= 0 and brace_end > brace_start:
            try:
                return json.loads(text[brace_start:brace_end + 1])
            except json.JSONDecodeError:
                pass
    return None


# ============================================================
# Phase: Prepare
# ============================================================
def cmd_prepare(args):
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    chunks = load_chunks()
    print(f"Loaded {len(chunks)} chunks from KB")

    incremental = getattr(args, "incremental", False)

    # Load existing chunk IDs if incremental
    existing_chunk_ids = set()
    existing_count = 0
    chunks_path = DATA_DIR / "chunks.jsonl"
    if incremental and chunks_path.exists():
        with open(chunks_path) as f:
            for line in f:
                item = json.loads(line)
                existing_chunk_ids.add(item["chunk_id"])
                existing_count += 1
        print(f"Incremental mode: {existing_count} existing chunks, "
              f"looking for new ones...")

    doc_chunks = defaultdict(list)
    for chunk_id, chunk in chunks.items():
        if incremental and chunk_id in existing_chunk_ids:
            continue
        doc_id = chunk.get("full_doc_id", "unknown")
        doc_chunks[doc_id].append({
            "chunk_id": chunk_id,
            "order": chunk.get("chunk_order_index", 0),
            "content": chunk.get("content", ""),
            "doc_id": doc_id,
        })

    for doc_id in doc_chunks:
        doc_chunks[doc_id].sort(key=lambda x: x["order"])

    # For incremental, new items start at existing_count index
    start_index = existing_count if incremental else 0
    items = []
    chunk_map = {}
    for doc_id, chunk_list in doc_chunks.items():
        book = book_name_from_doc_id(doc_id)
        for c in chunk_list:
            if len(c["content"].strip()) < 50:
                continue
            item = {
                "chunk_id": c["chunk_id"],
                "doc_id": doc_id,
                "book_name": book,
                "order": c["order"],
                "content": c["content"],
            }
            chunk_map[c["chunk_id"]] = start_index + len(items)
            items.append(item)

    adjacency = []
    for doc_id, chunk_list in doc_chunks.items():
        valid = [c for c in chunk_list if len(c["content"].strip()) >= 50]
        for i in range(len(valid) - 1):
            a_idx = chunk_map.get(valid[i]["chunk_id"])
            b_idx = chunk_map.get(valid[i + 1]["chunk_id"])
            if a_idx is not None and b_idx is not None:
                adjacency.append({"a": a_idx, "b": b_idx})

    if incremental:
        # Append new chunks
        with open(chunks_path, "a") as f:
            for item in items:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")
        # Append new adjacency pairs
        adj_path = DATA_DIR / "adjacency.json"
        old_adj = []
        if adj_path.exists():
            with open(adj_path) as f:
                old_adj = json.load(f)
        with open(adj_path, "w") as f:
            json.dump(old_adj + adjacency, f)
        print(f"Incremental: appended {len(items)} new chunks "
              f"(index {start_index}-{start_index + len(items) - 1}), "
              f"{len(adjacency)} new adjacent pairs "
              f"(total: {existing_count + len(items)} chunks, "
              f"{len(old_adj) + len(adjacency)} pairs)")
    else:
        with open(DATA_DIR / "chunks.jsonl", "w") as f:
            for item in items:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")
        with open(DATA_DIR / "adjacency.json", "w") as f:
            json.dump(adjacency, f)
        print(f"Prepared {len(items)} chunks, {len(adjacency)} adjacent pairs")


# ============================================================
# Phase: Extract
# ============================================================
def cmd_extract(args):
    round_num = args.round
    parallel = args.parallel
    model = args.model

    items = []
    with open(DATA_DIR / "chunks.jsonl") as f:
        for line in f:
            items.append(json.loads(line))

    print(f"Round {round_num}: {len(items)} chunks, parallel={parallel}, model={model}")

    prev_results = {}
    if round_num > 1:
        for prev_round in range(1, round_num):
            path = DATA_DIR / f"round{prev_round}_results.jsonl"
            if path.exists():
                with open(path) as f:
                    for line in f:
                        r = json.loads(line)
                        idx = r["index"]
                        if idx not in prev_results:
                            prev_results[idx] = {"entities": [], "relationships": []}
                        prev_results[idx]["entities"].extend(r.get("entities", []))
                        prev_results[idx]["relationships"].extend(r.get("relationships", []))
        print(f"  Loaded previous results for {len(prev_results)} chunks")

    output_path = DATA_DIR / f"round{round_num}_results.jsonl"

    done_indices = set()
    if output_path.exists():
        with open(output_path) as f:
            for line in f:
                r = json.loads(line)
                done_indices.add(r["index"])
        print(f"  Resuming: {len(done_indices)} already done")

    todo = []
    for i, item in enumerate(items):
        if i in done_indices:
            continue

        if round_num == 1:
            prompt = PROMPT_ROUND1.format(
                entity_types=ENTITY_TYPES,
                source_id=item["chunk_id"],
                book_name=item["book_name"],
                text=item["content"],
            )
        else:
            prev = prev_results.get(i, {"entities": [], "relationships": []})
            prev_ent_names = [e.get("entity_name", "") for e in prev["entities"] if e.get("entity_name")][:50]
            prev_rel_descs = [f"{r.get('src_id','?')}->{r.get('tgt_id','?')}" for r in prev["relationships"] if r.get('src_id') and r.get('tgt_id')][:50]
            prompt = PROMPT_GLEANING.format(
                entity_types=ENTITY_TYPES,
                prev_entities=", ".join(prev_ent_names) if prev_ent_names else "(none)",
                prev_relationships=", ".join(prev_rel_descs) if prev_rel_descs else "(none)",
                source_id=item["chunk_id"],
                book_name=item["book_name"],
                text=item["content"],
            )

        todo.append({"prompt": prompt, "index": i, "chunk_id": item["chunk_id"]})

    if not todo:
        print("  Nothing to do, all chunks already processed")
        return

    print(f"  Processing {len(todo)} chunks...")

    total = len(todo)
    done_count = 0
    failed_count = 0
    ok_count = 0
    total_ent = 0
    total_rel = 0
    lock = threading.Lock()
    outfile = open(output_path, "a")

    def process_one(task):
        nonlocal done_count, failed_count, ok_count, total_ent, total_rel
        idx = task["index"]
        start = time.time()
        try:
            content = llm_call(task["prompt"], model=model)
            parsed = parse_json_response(content)
            elapsed = time.time() - start

            if parsed:
                result = {
                    "index": idx,
                    "chunk_id": task["chunk_id"],
                    "entities": parsed.get("entities", []),
                    "relationships": parsed.get("relationships", []),
                    "elapsed": round(elapsed, 1),
                }
            else:
                result = {
                    "index": idx,
                    "chunk_id": task["chunk_id"],
                    "entities": [],
                    "relationships": [],
                    "error": "parse_failed",
                    "raw": content[:500] if content else "",
                    "elapsed": round(elapsed, 1),
                }
        except Exception as e:
            result = {
                "index": idx,
                "chunk_id": task["chunk_id"],
                "entities": [],
                "relationships": [],
                "error": str(e)[:200],
                "elapsed": round(time.time() - start, 1),
            }

        with lock:
            outfile.write(json.dumps(result, ensure_ascii=False) + "\n")
            outfile.flush()
            done_count += 1
            if "error" in result:
                failed_count += 1
            else:
                ok_count += 1
                total_ent += len(result["entities"])
                total_rel += len(result["relationships"])
            if done_count % 20 == 0 or done_count == total:
                print(f"  [{done_count}/{total}] ok={ok_count} fail={failed_count} "
                      f"ent={total_ent} rel={total_rel}")
        return result

    rate_delay = max(1.0, 60.0 / parallel)  # e.g. parallel=10 -> 6s between, parallel=60 -> 1s
    print(f"  Rate: 1 request every {rate_delay:.1f}s ({parallel}/min)")
    with ThreadPoolExecutor(max_workers=min(parallel, 10)) as pool:
        futures = []
        for t in todo:
            futures.append(pool.submit(process_one, t))
            time.sleep(rate_delay)
        for f in futures:
            f.result()

    outfile.close()
    print(f"  Round {round_num} done: {ok_count}/{total} ok, "
          f"{total_ent} entities, {total_rel} relationships")


# ============================================================
# Phase: Cross-chunk
# ============================================================
def cmd_cross_chunk(args):
    parallel = args.parallel
    model = args.model

    items = []
    with open(DATA_DIR / "chunks.jsonl") as f:
        for line in f:
            items.append(json.loads(line))

    with open(DATA_DIR / "adjacency.json") as f:
        adjacency = json.load(f)

    chunk_entities = defaultdict(list)
    for round_num in range(1, 4):
        path = DATA_DIR / f"round{round_num}_results.jsonl"
        if path.exists():
            with open(path) as f:
                for line in f:
                    r = json.loads(line)
                    chunk_entities[r["index"]].extend(r.get("entities", []))

    print(f"Cross-chunk: {len(adjacency)} adjacent pairs, parallel={parallel}, model={model}")

    output_path = DATA_DIR / "cross_chunk_results.jsonl"

    done_pairs = set()
    if output_path.exists():
        with open(output_path) as f:
            for line in f:
                r = json.loads(line)
                done_pairs.add((r["a"], r["b"]))
        print(f"  Resuming: {len(done_pairs)} already done")

    todo = []
    for pair in adjacency:
        a, b = pair["a"], pair["b"]
        if (a, b) in done_pairs:
            continue
        if a >= len(items) or b >= len(items):
            continue

        ent_a = [e["entity_name"] for e in chunk_entities.get(a, []) if e.get("entity_name")][:30]
        ent_b = [e["entity_name"] for e in chunk_entities.get(b, []) if e.get("entity_name")][:30]

        if not ent_a and not ent_b:
            continue

        prompt = PROMPT_CROSS_CHUNK.format(
            entity_types=ENTITY_TYPES,
            entities_a=", ".join(ent_a) if ent_a else "(none)",
            entities_b=", ".join(ent_b) if ent_b else "(none)",
            source_a=items[a]["chunk_id"],
            source_b=items[b]["chunk_id"],
            text_a=items[a]["content"],
            text_b=items[b]["content"],
        )

        todo.append({"prompt": prompt, "a": a, "b": b,
                      "chunk_id_a": items[a]["chunk_id"],
                      "chunk_id_b": items[b]["chunk_id"]})

    if not todo:
        print("  Nothing to do")
        return

    print(f"  Processing {len(todo)} pairs...")

    total = len(todo)
    done_count = 0
    failed_count = 0
    ok_count = 0
    total_ent = 0
    total_rel = 0
    lock = threading.Lock()
    outfile = open(output_path, "a")

    def process_one(task):
        nonlocal done_count, failed_count, ok_count, total_ent, total_rel
        start = time.time()
        try:
            content = llm_call(task["prompt"], model=model)
            parsed = parse_json_response(content)
            elapsed = time.time() - start

            if parsed:
                result = {
                    "a": task["a"], "b": task["b"],
                    "chunk_id_a": task["chunk_id_a"],
                    "chunk_id_b": task["chunk_id_b"],
                    "entities": parsed.get("entities", []),
                    "relationships": parsed.get("relationships", []),
                    "elapsed": round(elapsed, 1),
                }
            else:
                result = {
                    "a": task["a"], "b": task["b"],
                    "chunk_id_a": task["chunk_id_a"],
                    "chunk_id_b": task["chunk_id_b"],
                    "entities": [], "relationships": [],
                    "error": "parse_failed",
                    "elapsed": round(elapsed, 1),
                }
        except Exception as e:
            result = {
                "a": task["a"], "b": task["b"],
                "chunk_id_a": task["chunk_id_a"],
                "chunk_id_b": task["chunk_id_b"],
                "entities": [], "relationships": [],
                "error": str(e)[:200],
                "elapsed": round(time.time() - start, 1),
            }

        with lock:
            outfile.write(json.dumps(result, ensure_ascii=False) + "\n")
            outfile.flush()
            done_count += 1
            if "error" in result:
                failed_count += 1
            else:
                ok_count += 1
                total_ent += len(result["entities"])
                total_rel += len(result["relationships"])
            if done_count % 20 == 0 or done_count == total:
                print(f"  [{done_count}/{total}] ok={ok_count} fail={failed_count} "
                      f"ent={total_ent} rel={total_rel}")
        return result

    rate_delay = max(1.0, 60.0 / parallel)
    print(f"  Rate: 1 request every {rate_delay:.1f}s ({parallel}/min)")
    with ThreadPoolExecutor(max_workers=min(parallel, 10)) as pool:
        futures = []
        for t in todo:
            futures.append(pool.submit(process_one, t))
            time.sleep(rate_delay)
        for f in futures:
            f.result()

    outfile.close()
    print(f"  Cross-chunk done: {ok_count}/{total} ok, "
          f"{total_ent} entities, {total_rel} relationships")


# ============================================================
# Phase: Merge
# ============================================================
def cmd_merge(args):
    all_entities = []
    all_relationships = []

    for round_num in range(1, 4):
        path = DATA_DIR / f"round{round_num}_results.jsonl"
        if not path.exists():
            print(f"  Skipping round {round_num} (no results)")
            continue
        count_e, count_r = 0, 0
        with open(path) as f:
            for line in f:
                r = json.loads(line)
                source_id = r.get("chunk_id", "unknown")
                for e in r.get("entities", []):
                    all_entities.append({
                        "entity_name": safe_str(e.get("entity_name")),
                        "entity_type": safe_str(e.get("entity_type"), "UNKNOWN"),
                        "description": safe_str(e.get("description")),
                        "source_id": source_id,
                    })
                    count_e += 1
                for rel in r.get("relationships", []):
                    all_relationships.append({
                        "src_id": safe_str(rel.get("src_id")),
                        "tgt_id": safe_str(rel.get("tgt_id")),
                        "description": safe_str(rel.get("description")),
                        "keywords": safe_str(rel.get("keywords")),
                        "weight": float(rel.get("weight", 0.7)),
                        "source_id": source_id,
                    })
                    count_r += 1
        print(f"  Round {round_num}: {count_e} entities, {count_r} relationships")

    cc_path = DATA_DIR / "cross_chunk_results.jsonl"
    if cc_path.exists():
        count_e, count_r = 0, 0
        with open(cc_path) as f:
            for line in f:
                r = json.loads(line)
                source_id = r.get("chunk_id_a", "unknown")
                for e in r.get("entities", []):
                    all_entities.append({
                        "entity_name": safe_str(e.get("entity_name")),
                        "entity_type": safe_str(e.get("entity_type"), "UNKNOWN"),
                        "description": safe_str(e.get("description")),
                        "source_id": source_id,
                    })
                    count_e += 1
                for rel in r.get("relationships", []):
                    all_relationships.append({
                        "src_id": safe_str(rel.get("src_id")),
                        "tgt_id": safe_str(rel.get("tgt_id")),
                        "description": safe_str(rel.get("description")),
                        "keywords": safe_str(rel.get("keywords")),
                        "weight": float(rel.get("weight", 0.7)),
                        "source_id": source_id,
                    })
                    count_r += 1
        print(f"  Cross-chunk: {count_e} entities, {count_r} relationships")

    print(f"\n  Raw totals: {len(all_entities)} entities, {len(all_relationships)} relationships")

    # Deduplicate entities
    entity_map = {}
    for e in all_entities:
        name = e["entity_name"]
        if not name:
            continue
        norm = name.upper().strip()
        if norm not in entity_map:
            entity_map[norm] = {
                "entity_name": name,
                "entity_type": e["entity_type"],
                "descriptions": [e["description"]],
                "source_ids": [e["source_id"]],
            }
        else:
            existing = entity_map[norm]
            existing["descriptions"].append(e["description"])
            existing["source_ids"].append(e["source_id"])
            if e["entity_type"] != "UNKNOWN" and existing["entity_type"] == "UNKNOWN":
                existing["entity_type"] = e["entity_type"]

    deduped_entities = []
    for norm, e in entity_map.items():
        descs = list(set(d for d in e["descriptions"] if d))
        descs.sort(key=len, reverse=True)
        best_desc = descs[0] if descs else "No description"
        deduped_entities.append({
            "entity_name": e["entity_name"],
            "entity_type": e["entity_type"],
            "description": best_desc,
            "source_id": e["source_ids"][0],
            "mention_count": len(e["descriptions"]),
        })

    # Deduplicate relationships
    rel_map = {}
    for rel in all_relationships:
        src = rel["src_id"].upper().strip()
        tgt = rel["tgt_id"].upper().strip()
        if not src or not tgt or src == tgt:
            continue
        key = (src, tgt)
        if key not in rel_map:
            rel_map[key] = {
                "src_id": rel["src_id"],
                "tgt_id": rel["tgt_id"],
                "descriptions": [rel["description"]],
                "keywords": set(k.strip() for k in rel["keywords"].split(",") if k.strip()),
                "weights": [rel["weight"]],
                "source_ids": [rel["source_id"]],
            }
        else:
            existing = rel_map[key]
            existing["descriptions"].append(rel["description"])
            existing["keywords"].update(k.strip() for k in rel["keywords"].split(",") if k.strip())
            existing["weights"].append(rel["weight"])
            existing["source_ids"].append(rel["source_id"])

    deduped_rels = []
    for key, rel in rel_map.items():
        descs = list(set(d for d in rel["descriptions"] if d))
        descs.sort(key=len, reverse=True)
        best_desc = descs[0] if descs else "related"
        avg_weight = sum(rel["weights"]) / len(rel["weights"])
        boosted_weight = min(1.0, avg_weight + 0.1 * (len(rel["weights"]) - 1))
        deduped_rels.append({
            "src_id": rel["src_id"],
            "tgt_id": rel["tgt_id"],
            "description": best_desc,
            "keywords": ",".join(sorted(rel["keywords"])),
            "weight": round(boosted_weight, 2),
            "source_id": rel["source_ids"][0],
            "mention_count": len(rel["descriptions"]),
        })

    print(f"  After dedup: {len(deduped_entities)} entities, {len(deduped_rels)} relationships")

    # Filter: both endpoints must exist
    entity_name_set = set(entity_map.keys())
    filtered_rels = []
    dropped = 0
    for rel in deduped_rels:
        src_norm = rel["src_id"].upper().strip()
        tgt_norm = rel["tgt_id"].upper().strip()
        if src_norm in entity_name_set and tgt_norm in entity_name_set:
            filtered_rels.append(rel)
        else:
            dropped += 1
    deduped_rels = filtered_rels
    print(f"  After endpoint filter: {len(deduped_rels)} relationships ({dropped} dropped)")

    merged = {
        "entities": deduped_entities,
        "relationships": deduped_rels,
        "stats": {
            "raw_entities": len(all_entities),
            "raw_relationships": len(all_relationships),
            "deduped_entities": len(deduped_entities),
            "deduped_relationships": len(deduped_rels),
        }
    }
    with open(DATA_DIR / "merged.json", "w") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)

    top_ent = sorted(deduped_entities, key=lambda e: e["mention_count"], reverse=True)[:20]
    print("\n  Top 20 entities by mention count:")
    for e in top_ent:
        print(f"    [{e['entity_type']}] {e['entity_name']} (x{e['mention_count']})")


def main():
    load_api_key()

    parser = argparse.ArgumentParser(description="Bazi/Mingli KB graph builder")
    sub = parser.add_subparsers(dest="command")

    p_prepare = sub.add_parser("prepare")
    p_prepare.add_argument("--incremental", action="store_true",
                           help="Append only new chunks (keep existing data)")

    p_extract = sub.add_parser("extract")
    p_extract.add_argument("--round", type=int, required=True, choices=[1, 2, 3])
    p_extract.add_argument("--parallel", type=int, default=10)
    p_extract.add_argument("--model", default="gpt-4o")

    p_cc = sub.add_parser("cross-chunk")
    p_cc.add_argument("--parallel", type=int, default=10)
    p_cc.add_argument("--model", default="gemini-flash-lite")

    sub.add_parser("merge")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        return

    cmd_map = {
        "prepare": cmd_prepare,
        "extract": cmd_extract,
        "cross-chunk": cmd_cross_chunk,
        "merge": cmd_merge,
    }
    cmd_map[args.command](args)


if __name__ == "__main__":
    main()
