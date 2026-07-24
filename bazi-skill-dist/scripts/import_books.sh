#!/bin/bash
# Batch import all split files into bazi-mingli KB
# Run from ~/knowledge-bases/

cd ~/knowledge-bases

EXPORT_DIR="exports/bazi-mingli"
KB="bazi-mingli"
COUNT=0
TOTAL=$(ls "$EXPORT_DIR"/*.md | wc -l | tr -d ' ')

for f in "$EXPORT_DIR"/*.md; do
    COUNT=$((COUNT + 1))
    BASENAME=$(basename "$f")
    echo "[$COUNT/$TOTAL] Importing $BASENAME..."
    echo "add $KB $f text
exit" | knowledge-mcp --config config.yaml shell 2>&1 | grep -E "Adding|success|Error|failed|chunks"
done

echo ""
echo "Done: $COUNT files imported"
