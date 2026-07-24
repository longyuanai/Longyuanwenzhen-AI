#!/bin/bash
# 如果当前LLM OCR没在跑，自动启动队列中下一本
WORKDIR="/path/to/your/divination-project"
QUEUE="/tmp/ocr_llm_queue.txt"
CURRENT="/tmp/ocr_llm_current.txt"
SCRIPT="$WORKDIR/scripts/ocr_llm.py"

# 初始化队列
if [ ! -f "$QUEUE" ]; then
cat > "$QUEUE" << 'EOF'
books/八字/玉照定真经-郭璞.pdf|books/八字/ocr_output/玉照定真经-郭璞.txt|63
books/八字/神煞探原-梁湘润.pdf|books/八字/ocr_output/神煞探原-梁湘润.txt|165
books/八字/子平母法大流年判例-梁湘润.pdf|books/八字/ocr_output/子平母法大流年判例-梁湘润.txt|262
books/八字/命理新论实例-吴俊民.pdf|books/八字/ocr_output/命理新论实例-吴俊民.txt|203
books/八字/子平基础概要-梁湘润.pdf|books/八字/ocr_output/子平基础概要-梁湘润.txt|210
books/八字/子平教材讲义一-梁湘润.pdf|books/八字/ocr_output/子平教材讲义一-梁湘润.txt|169
books/八字/子平教材讲义二-梁湘润.pdf|books/八字/ocr_output/子平教材讲义二-梁湘润.txt|121
EOF
fi

mkdir -p "$WORKDIR/books/八字/ocr_output"

# 检查是否有ocr_llm.py在跑
if pgrep -f "ocr_llm.py" > /dev/null 2>&1; then
    exit 0  # 还在跑，不启动新的
fi

# 没在跑，取下一本
if [ -s "$QUEUE" ]; then
    NEXT=$(head -1 "$QUEUE")
    PDF=$(echo "$NEXT" | cut -d'|' -f1)
    OUT=$(echo "$NEXT" | cut -d'|' -f2)
    PAGES=$(echo "$NEXT" | cut -d'|' -f3)

    # 移除队首
    tail -n +2 "$QUEUE" > /tmp/_q_tmp && mv /tmp/_q_tmp "$QUEUE"

    BASENAME=$(basename "$PDF" .pdf)
    echo "$BASENAME ($PAGES pages)" > "$CURRENT"

    cd "$WORKDIR"
    nohup python3 "$SCRIPT" "$PDF" -o "$OUT" -p 5 > /tmp/llm_ocr_log.txt 2>&1 &
fi
