#!/bin/bash
# OCR Monitor - 监控进度 + 自动启动下一本
# 由cron每3分钟调用一次

WORKDIR="/path/to/your/divination-project"
OUTDIR="$WORKDIR/books/八字/ocr_output"
LOGFILE="/tmp/ocr_monitor_status.txt"
LLM_SCRIPT="$WORKDIR/scripts/ocr_llm.py"
QUEUE_FILE="/tmp/ocr_llm_queue.txt"
CURRENT_FILE="/tmp/ocr_llm_current.txt"

mkdir -p "$OUTDIR"

# 初始化队列（如果不存在）
if [ ! -f "$QUEUE_FILE" ]; then
cat > "$QUEUE_FILE" << 'EOF'
books/八字/玉照定真经-郭璞.pdf|ocr_output/玉照定真经-郭璞.txt|63
books/八字/神煞探原-梁湘润.pdf|ocr_output/神煞探原-梁湘润.txt|165
books/八字/子平母法大流年判例-梁湘润.pdf|ocr_output/子平母法大流年判例-梁湘润.txt|262
books/八字/命理新论实例-吴俊民.pdf|ocr_output/命理新论实例-吴俊民.txt|203
books/八字/子平基础概要-梁湘润.pdf|ocr_output/子平基础概要-梁湘润.txt|210
books/八字/子平教材讲义一-梁湘润.pdf|ocr_output/子平教材讲义一-梁湘润.txt|169
books/八字/子平教材讲义二-梁湘润.pdf|ocr_output/子平教材讲义二-梁湘润.txt|121
EOF
fi

NOW=$(date '+%Y-%m-%d %H:%M:%S')

echo "=== OCR Monitor $NOW ===" > "$LOGFILE"

# --- 线1: GPU OCR 穷通宝鉴评注 ---
echo "" >> "$LOGFILE"
echo "--- GPU OCR (穷通宝鉴评注 336页) ---" >> "$LOGFILE"
GPU_LOG=$(ssh -o ConnectTimeout=5 -o BatchMode=yes win 'powershell -c "if(Test-Path C:\Users\Administrator\ocr_work\ocr_qiongtong_log.txt){Get-Content C:\Users\Administrator\ocr_work\ocr_qiongtong_log.txt -Tail 3}else{echo \"waiting...\"}"' 2>/dev/null | grep -v WARNING | grep -v vulnerable | grep -v upgraded | grep -v pq.html)
echo "$GPU_LOG" >> "$LOGFILE"

# 检查GPU OCR是否完成
if echo "$GPU_LOG" | grep -q "EXITCODE=0"; then
    echo "GPU OCR DONE!" >> "$LOGFILE"
    # 拉取结果
    if [ ! -f "$OUTDIR/穷通宝鉴评注-徐乐吾.txt" ]; then
        scp win:'C:/Users/Administrator/ocr_work/qiongtong.txt' "$OUTDIR/穷通宝鉴评注-徐乐吾.txt" 2>/dev/null
        echo "Result downloaded to $OUTDIR/穷通宝鉴评注-徐乐吾.txt" >> "$LOGFILE"
    fi
fi

# --- 线2: LLM OCR ---
echo "" >> "$LOGFILE"
echo "--- LLM OCR ---" >> "$LOGFILE"

# 检查当前LLM OCR是否在跑
LLM_PID=$(pgrep -f "ocr_llm.py" 2>/dev/null)

if [ -n "$LLM_PID" ]; then
    # 正在跑，报告进度
    CURRENT=$(cat "$CURRENT_FILE" 2>/dev/null || echo "滴天髓补注")
    LLM_LOG=$(tail -3 /tmp/llm_ocr_log.txt 2>/dev/null)
    echo "Running: $CURRENT (PID: $LLM_PID)" >> "$LOGFILE"
    echo "$LLM_LOG" >> "$LOGFILE"
else
    # 没在跑，检查是否有队列
    if [ -s "$QUEUE_FILE" ]; then
        # 取队列第一行
        NEXT=$(head -1 "$QUEUE_FILE")
        PDF=$(echo "$NEXT" | cut -d'|' -f1)
        OUT=$(echo "$NEXT" | cut -d'|' -f2)
        PAGES=$(echo "$NEXT" | cut -d'|' -f3)

        # 从队列中移除
        tail -n +2 "$QUEUE_FILE" > /tmp/ocr_queue_tmp.txt
        mv /tmp/ocr_queue_tmp.txt "$QUEUE_FILE"

        # 记录当前任务
        BASENAME=$(basename "$PDF" .pdf)
        echo "$BASENAME" > "$CURRENT_FILE"

        # 启动
        cd "$WORKDIR"
        nohup python3 "$LLM_SCRIPT" "$PDF" -o "books/八字/$OUT" -p 3 > /tmp/llm_ocr_log.txt 2>&1 &
        echo "Started: $BASENAME ($PAGES pages, PID: $!)" >> "$LOGFILE"
    else
        echo "All LLM OCR jobs done! Queue empty." >> "$LOGFILE"
    fi
fi

# --- 总进度 ---
echo "" >> "$LOGFILE"
echo "--- Completed files ---" >> "$LOGFILE"
ls -lh "$OUTDIR"/*.txt 2>/dev/null >> "$LOGFILE" || echo "(none yet)" >> "$LOGFILE"

echo "" >> "$LOGFILE"
REMAINING=$(wc -l < "$QUEUE_FILE" 2>/dev/null || echo 0)
echo "Queue remaining: $REMAINING books" >> "$LOGFILE"
