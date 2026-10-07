#!/bin/bash
# 续编验收：复用 /tmp/metro-cache，长超时 + 进度监控
set +e
cd /Coze/Drive/扣子/lottery-trend-app/client

EXPO_NO_DEPENDENCY_VALIDATION=1 pnpm exec expo start --port 8081 > /tmp/expo3.log 2>&1 &
EXPO_PID=$!
echo "EXPO_PID=$EXPO_PID"

for i in $(seq 1 60); do
  ST=$(curl -s --max-time 3 "http://127.0.0.1:8081/status" 2>/dev/null)
  if echo "$ST" | grep -q "running"; then echo "METRO_READY 第${i}次"; break; fi
  sleep 2
done

HTML=$(curl -s --max-time 60 "http://127.0.0.1:8081/")
SCRIPT=$(echo "$HTML" | grep -oE 'src="/client/index\.bundle[^"]*"' | head -1 | sed 's/^src="//;s/"$//')
echo "BUNDLE_PATH=$SCRIPT"

# 后台请求 bundle，最长 2400 秒
curl -s -o /tmp/bundle3.js -w "BUNDLE_HTTP_CODE=%{http_code}\n" --max-time 2400 "http://127.0.0.1:8081$SCRIPT" > /tmp/curl3_result.log 2>&1 &
CURL_PID=$!

# 进度监控：每 25 秒记录一次
for i in $(seq 1 96); do
  PROG=$(grep -oE '[0-9.]+% \([0-9]+/[0-9]+\)' /tmp/expo3.log | tail -1)
  echo "[$(date +%H:%M:%S)] $PROG"
  if ! kill -0 $CURL_PID 2>/dev/null; then
    echo "CURL_FINISHED"
    break
  fi
  sleep 25
done
wait $CURL_PID 2>/dev/null

cat /tmp/curl3_result.log 2>/dev/null
echo "BUNDLE_SIZE=$(wc -c < /tmp/bundle3.js 2>/dev/null)"

for kw in "Unable to resolve" "SyntaxError" "Module not found" "Cannot find module" "TransformError"; do
  C=$(grep -c "$kw" /tmp/bundle3.js 2>/dev/null)
  echo "ERR[$kw]=$C"
done
echo "BUNDLE_TAIL=$(tail -c 120 /tmp/bundle3.js 2>/dev/null | tr '\n' ' ')"
echo "=== VERIFY3_DONE ==="