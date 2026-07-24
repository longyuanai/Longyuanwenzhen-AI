"""
Inject merged entities and relationships into LightRAG bazi-mingli KB.

Usage:
    # 1. 先安装 knowledge-mcp:
    #    uv tool install knowledge-mcp
    # 2. 配置 ~/knowledge-bases/.env (LLM_API_KEY)
    # 3. 配置 ~/knowledge-bases/config.yaml
    # 4. 运行注入脚本:
    python3 inject_kg.py

Configuration via environment variables (override defaults):
    BAZI_KB_NAME      knowledge base name (default: bazi-mingli)
    BAZI_KB_DIR       knowledge base directory (default: ~/knowledge-bases/kbs/<KB_NAME>)
    BAZI_MERGED_PATH  path to merged.json (default: ../lightrag/merged.json)
    BAZI_KMCP_SITE    knowledge-mcp site-packages path (auto-detect if unset)
"""

import sys
import json
import asyncio
import os
import logging
from pathlib import Path

# -- Configurable paths --
SCRIPT_DIR = Path(__file__).parent
KB_NAME = os.environ.get("BAZI_KB_NAME", "bazi-mingli")
KB_DIR = Path(os.environ.get("BAZI_KB_DIR", str(Path.home() / "knowledge-bases/kbs" / KB_NAME)))
MERGED_PATH = Path(os.environ.get("BAZI_MERGED_PATH", str(SCRIPT_DIR.parent / "lightrag" / "merged.json")))
BATCH_SIZE = 500

# -- knowledge-mcp site-packages auto-detect --
KMCP_SITE = os.environ.get("BAZI_KMCP_SITE")
if KMCP_SITE:
    sys.path.insert(0, KMCP_SITE)
else:
    candidates = [
        Path.home() / ".local/share/uv/tools/knowledge-mcp/lib/python3.12/site-packages",
        Path.home() / ".local/share/uv/tools/knowledge-mcp/lib/python3.13/site-packages",
        Path("/opt/homebrew/lib/python3.12/site-packages"),
    ]
    for p in candidates:
        if p.exists():
            sys.path.insert(0, str(p))
            break

logging.basicConfig(level=logging.WARNING)


async def main():
    if not MERGED_PATH.exists():
        print(f"ERROR: merged.json not found at {MERGED_PATH}")
        print(f"Set BAZI_MERGED_PATH or place file at default location.")
        sys.exit(1)

    env_file = Path.home() / "knowledge-bases/.env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ[k.strip()] = v.strip()

    try:
        from knowledge_mcp.config import Config
    except ImportError:
        print("ERROR: knowledge-mcp not found. Install with:")
        print("  uv tool install knowledge-mcp")
        print("Or set BAZI_KMCP_SITE to its site-packages path.")
        sys.exit(1)

    Config.load(Path.home() / "knowledge-bases/config.yaml")
    config = Config.get_instance()

    from knowledge_mcp.openai_func import llm_model_func, embedding_func
    from lightrag import LightRAG

    llm_config = config.lightrag.llm
    llm_kwargs = {}
    if llm_config.kwargs:
        llm_kwargs.update(llm_config.kwargs)

    rag = LightRAG(
        working_dir=str(KB_DIR),
        llm_model_func=llm_model_func,
        llm_model_kwargs=llm_kwargs,
        llm_model_name=llm_config.model_name,
        embedding_func=embedding_func,
        embedding_cache_config={
            "enabled": config.lightrag.embedding_cache.enabled,
            "similarity_threshold": config.lightrag.embedding_cache.similarity_threshold,
        },
        enable_llm_cache=True,
    )

    await rag.initialize_storages()
    print(f"LightRAG initialized: {KB_DIR}")

    with open(MERGED_PATH) as f:
        merged = json.load(f)

    MIN_MENTIONS = 2
    entities = [e for e in merged["entities"] if e.get("mention_count", 1) >= MIN_MENTIONS]
    relationships = merged["relationships"]
    total_ent = len(entities)
    total_rel = len(relationships)
    print(f"Filtered entities: {total_ent} (mention >= {MIN_MENTIONS}, "
          f"dropped {len(merged['entities']) - total_ent})")

    # Normalize endpoints
    name_lookup = {}
    for e in entities:
        norm = e["entity_name"].upper().strip()
        if norm not in name_lookup:
            name_lookup[norm] = e["entity_name"]

    normalized_rels = []
    dropped = 0
    for r in relationships:
        src = name_lookup.get(r["src_id"].upper().strip())
        tgt = name_lookup.get(r["tgt_id"].upper().strip())
        if src and tgt:
            normalized_rels.append({**r, "src_id": src, "tgt_id": tgt})
        else:
            dropped += 1
    relationships = normalized_rels
    total_rel = len(relationships)
    print(f"Normalized relationships: {total_rel} kept, {dropped} dropped")

    print(f"Injecting {total_ent} entities, {total_rel} relationships")

    max_items = max(total_ent, total_rel)
    for start in range(0, max_items, BATCH_SIZE):
        ent_batch = entities[start:start + BATCH_SIZE]
        rel_batch = relationships[start:start + BATCH_SIZE]

        if not ent_batch and not rel_batch:
            break

        custom_kg = {
            "chunks": [],
            "entities": [
                {
                    "entity_name": e["entity_name"],
                    "entity_type": e["entity_type"],
                    "description": e["description"],
                    "source_id": e.get("source_id", "custom_kg"),
                }
                for e in ent_batch
            ],
            "relationships": [
                {
                    "src_id": r["src_id"],
                    "tgt_id": r["tgt_id"],
                    "description": r["description"],
                    "keywords": r["keywords"],
                    "weight": r["weight"],
                    "source_id": r.get("source_id", "custom_kg"),
                }
                for r in rel_batch
            ],
        }

        try:
            await rag.ainsert_custom_kg(custom_kg)
            done = min(start + BATCH_SIZE, max_items)
            print(f"  [{done}/{max_items}] ok "
                  f"({len(ent_batch)} ent, {len(rel_batch)} rel)")
        except Exception as e:
            print(f"  [{start}] ERROR: {e}")
            continue

    print(f"\nDone: {total_ent} entities, {total_rel} relationships injected")


if __name__ == "__main__":
    asyncio.run(main())
