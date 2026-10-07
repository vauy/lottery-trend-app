#!/usr/bin/env bash

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PREVIEW_DIR="/source/preview"
LOG_DIR="${COZE_LOG_DIR:-$ROOT_DIR/logs}"
LOG_CLIENT_FILE="$LOG_DIR/client.log"
LOG_SERVER_FILE="$LOG_DIR/server.log"
mkdir -p "$LOG_DIR"

# ==================== 配置项 ====================
# Server 服务配置
SERVER_HOST="0.0.0.0"
SERVER_PORT="${SERVER_PORT:-9091}"
# Expo 项目配置
EXPO_HOST="0.0.0.0"
EXPO_DIR="expo"
# DEPLOY_RUN_PORT 是平台注入的对外端口，EXPO_PORT 保留为本地覆盖项。
EXPO_PORT="${DEPLOY_RUN_PORT:-${EXPO_PORT:-5000}}"
COZE_HARDWARE_DID="${COZE_HARDWARE_DID:-}"
if [ -n "${EXPO_PORT:-}" ] && [ -n "${COZE_HARDWARE_DID}" ]; then
  WEB_URL="${COZE_PROJECT_DOMAIN_DEFAULT:-https://preview-${COZE_HARDWARE_DID}-${EXPO_PORT}.dev.coze.site}"
else
  WEB_URL="${COZE_PROJECT_DOMAIN_DEFAULT:-http://127.0.0.1:${SERVER_PORT}}"
fi
ASSUME_YES="1"
EXPO_PUBLIC_BACKEND_BASE_URL="${EXPO_PUBLIC_BACKEND_BASE_URL:-$WEB_URL}"
EXPO_PUBLIC_COZE_PROJECT_ID="${COZE_PROJECT_ID:-}"

EXPO_PACKAGER_PROXY_URL="${EXPO_PUBLIC_BACKEND_BASE_URL}"
export EXPO_PUBLIC_BACKEND_BASE_URL EXPO_PACKAGER_PROXY_URL EXPO_PUBLIC_COZE_PROJECT_ID
# 运行时变量（为避免 set -u 的未绑定错误，预置为空）
SERVER_PID=""
EXPO_PID=""
PNPM_BIN=""

# ==================== 工具函数 ====================
check_command() {
  if ! command -v "$1" &> /dev/null; then
    echo "error:命令 $1 未找到，请先安装"
  fi
}
while [ $# -gt 0 ]; do
  case "$1" in
    -y|--yes)
      ASSUME_YES="1"
      shift
      ;;
    *)
      shift
      ;;
  esac
done
is_port_free() {
  ! lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}
choose_next_free_port() {
  local start=$1
  local p=$start
  while ! is_port_free "$p"; do
    p=$((p+1))
  done
  echo "$p"
}
ensure_port() {
  local var_name=$1
  local port_val=$2
  if is_port_free "$port_val"; then
    echo "端口未占用：$port_val"
    eval "$var_name=$port_val"
  else
    echo "端口已占用：$port_val"
    local choice
    if [ "$ASSUME_YES" = "1" ]; then choice="Y"; else read -r -p "是否关闭该端口的进程？[Y/n] " choice || choice="Y"; fi
    if [ -z "$choice" ] || [ "$choice" = "y" ] || [ "$choice" = "Y" ]; then
      if command -v lsof &> /dev/null; then
        local pids
        pids=$(lsof -t -i tcp:"$port_val" -sTCP:LISTEN 2>/dev/null || true)
        if [ -n "$pids" ]; then
          echo "正在关闭进程：$pids"
          kill -9 $pids 2>/dev/null || echo "关闭进程失败：$pids"
          eval "$var_name=$port_val"
        else
          echo "未获取到占用该端口的进程"
          eval "$var_name=$port_val"
        fi
      else
        echo "缺少 lsof，无法自动关闭进程"
        eval "$var_name=$port_val"
      fi
    else
      local new_port
      new_port=$(choose_next_free_port "$port_val")
      info "使用新的端口：$new_port"
      eval "$var_name=$new_port"
    fi
  fi
}

pipe_to_log() {
  local source="${1:-CLIENT}"
  local raw_log="${2:-}"
  local line clean_line timestamp
  while IFS= read -r line || [ -n "$line" ]; do
    clean_line=$(printf '%s' "$line" | sed 's/\x1b\[[0-9;]*[mA-Za-z]//g')
    if echo "$clean_line" | grep -qE '(^(Web|iOS|Android) node_modules/.*expo-router.*entry\.js.*%|^(Web|iOS|Android) Bundled [0-9]+ms node_modules/.*expo-router.*entry\.js|Logs will appear in the browser)'; then
      continue
    fi
    if [ -n "$raw_log" ]; then
      timestamp=$(date '+%Y-%m-%d %H:%M:%S')
      echo "[$timestamp] $clean_line" >> "$raw_log"
    fi
    printf '[%s] %s\n' "$source" "$clean_line"
  done
}

wait_port_connectable() {
  local host=$1 port=$2 retries=${3:-10}
  for _ in $(seq 1 "$retries"); do
    nc -z -w 1 "$host" "$port" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

# detached 出去的进程没人负责回收，超过这个时长就自己退出，避免端口与内存长期泄露。
MAX_RUNTIME_SECONDS=3600

timeout_watchdog_enabled() {
  [[ -z "${COZE_EVAL:-}" && -z "${COZE_PROJECT_TYPE:-}" ]]
}

# 真正被 detach 的是这层 bash wrapper：它是进程组 leader，组内 watchdog 到点回收整组
# （wrapper -> pnpm -> expo/node）；被包的进程自己先退出时也顺手清空进程组，不留残余。
RUN_WITH_TIMEOUT="$(declare -f timeout_watchdog_enabled)"'
timeout_seconds=$1
shift

"$@" &
child_pid=$!

# 先忽略 TERM，才能在向整组发 TERM（自己也在组里）之后存活下来补一发 KILL。
if timeout_watchdog_enabled; then
( trap "" TERM
  sleep "${timeout_seconds}"
  echo "[dev] 后台进程运行超过 ${timeout_seconds}s，回收进程组 $$。"
  kill -TERM -- "-$$" 2>/dev/null || true
  sleep 5
  kill -KILL -- "-$$" 2>/dev/null || true
) &
fi

wait "${child_pid}"
kill -KILL -- "-$$" 2>/dev/null || true
'

# coze-daemon 会在 runtime shell 退出时清理原进程组。
# 通过 Node detached spawn 创建独立 session/进程组，并将 stdio 直接写入日志。
# 返回的 PID 是 wrapper 的，同时也是整个进程组的 PGID，后续按组回收。
spawn_detached() {
  local cwd="$1"
  local log_file="$2"
  shift 2

  node - "$cwd" "$log_file" \
    /bin/bash -c "${RUN_WITH_TIMEOUT}" detached-runner "${MAX_RUNTIME_SECONDS}" "$@" <<'NODE'
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const [cwd, logFile, command, ...args] = process.argv.slice(2);
if (!cwd || !logFile || !command) {
  throw new Error('spawn_detached 缺少 cwd、log_file 或 command');
}

const logFd = fs.openSync(logFile, 'a');
try {
  const child = spawn(command, args, {
    cwd,
    detached: true,
    env: process.env,
    stdio: ['ignore', logFd, logFd],
  });
  child.unref();
  process.stdout.write(String(child.pid));
} finally {
  fs.closeSync(logFd);
}
NODE
}

stop_detached() {
  local pid="${1:-}"
  if [ -z "$pid" ]; then
    return
  fi

  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  sleep 1
  kill -KILL -- "-$pid" 2>/dev/null || true
}

start_expo() {
  local offline="${1:-0}"
  local -a expo_env
  expo_env=(
    "EXPO_NO_DEPENDENCY_VALIDATION=1"
    "EXPO_PUBLIC_BACKEND_BASE_URL=$EXPO_PUBLIC_BACKEND_BASE_URL"
    "EXPO_PACKAGER_PROXY_URL=$EXPO_PACKAGER_PROXY_URL"
    "EXPO_PUBLIC_COZE_PROJECT_ID=$EXPO_PUBLIC_COZE_PROJECT_ID"
  )
  if [ "$offline" = "1" ]; then
    expo_env+=("EXPO_OFFLINE=1")
  fi

  EXPO_PID="$(spawn_detached \
    "$ROOT_DIR/client" \
    "$LOG_CLIENT_FILE" \
    /usr/bin/env "${expo_env[@]}" \
    "$PNPM_BIN" exec expo start --port "$EXPO_PORT")"
}

detect_expo_fetch_failed() {
  local timeout="${1:-8}"
  local waited=0
  local log_file="$LOG_CLIENT_FILE"
  while [ "$waited" -lt "$timeout" ]; do
    if [ -f "$log_file" ] && tail -n 100 "$log_file" 2>/dev/null | grep -q "TypeError: fetch failed"; then
      return 0
    fi
    sleep 1
    waited=$((waited+1))
  done
  return 1
}

# ==================== 前置检查 ====================
# 关掉nginx进程
ps -ef | grep nginx | grep -v grep | awk '{print $2}' | xargs -r kill -9

echo "检查根目录 pre_install.py"
if [ -f "$PREVIEW_DIR/pre_install.py" ]; then
  echo "执行：python $PREVIEW_DIR/pre_install.py"
  python "$PREVIEW_DIR/pre_install.py" || echo "pre_install.py 执行失败"
fi

echo "检查根目录 post_install.py"
if [ -f "$PREVIEW_DIR/post_install.py" ]; then
  echo "执行：python $PREVIEW_DIR/post_install.py"
  python "$PREVIEW_DIR/post_install.py" || echo "post_install.py 执行失败"
fi

echo "==================== 开始启动 ===================="
echo "开始执行服务启动脚本（start_dev.sh）..."
echo "正在检查依赖命令和目录是否存在..."
# 检查核心命令
check_command "npm"
check_command "pnpm"
check_command "lsof"
check_command "bash"
check_command "node"
PNPM_BIN="$(command -v pnpm)"

# 端口占用预检查与处理
ensure_port SERVER_PORT "$SERVER_PORT"
ensure_port EXPO_PORT "$EXPO_PORT"

echo "==================== 启动 server 服务 ===================="
echo "正在执行：pnpm run dev (server)"
: > "$LOG_SERVER_FILE"
export SERVER_PORT
SERVER_PID="$(spawn_detached \
  "$ROOT_DIR/server" \
  /dev/null \
  "$PNPM_BIN" run dev)"
if [ -z "${SERVER_PID}" ]; then
  echo "无法获取 server 后台进程 PID"
fi
echo "server 服务已启动，进程 ID：${SERVER_PID:-unknown}"

echo "==================== 启动 Expo 项目 ===================="
echo "开始启动 Expo 服务，端口 ${EXPO_PORT}"
: > "$LOG_CLIENT_FILE"
start_expo 0
if detect_expo_fetch_failed 8; then
  echo "Expo 启动检测到网络错误：TypeError: fetch failed，启用离线模式重试"
  stop_detached "$EXPO_PID"
  : > "$LOG_CLIENT_FILE"
  start_expo 1
fi
# 输出以下环境变量，确保 Expo 项目能正确连接到 Server 服务
echo "Expo 环境变量配置："
echo "EXPO_PUBLIC_BACKEND_BASE_URL=${EXPO_PUBLIC_BACKEND_BASE_URL}"
echo "EXPO_PACKAGER_PROXY_URL=${EXPO_PACKAGER_PROXY_URL}"
echo "EXPO_PUBLIC_COZE_PROJECT_ID=${EXPO_PUBLIC_COZE_PROJECT_ID}"
if [ -z "${EXPO_PID}" ]; then
  echo "无法获取 Expo 后台进程 PID"
fi

echo "所有服务已启动。Server PID: ${SERVER_PID}, Expo PID: ${EXPO_PID}"
if timeout_watchdog_enabled; then
  echo "两个服务均在 ${MAX_RUNTIME_SECONDS}s 后自动退出。"
fi

echo "检查 Server 服务端口：$SERVER_HOST:$SERVER_PORT"
if wait_port_connectable "$SERVER_HOST" "$SERVER_PORT" 10 2; then
  echo "端口可连接：$SERVER_HOST:$SERVER_PORT"
else
  echo "端口不可连接：$SERVER_HOST:$SERVER_PORT 10 次）"
fi

echo "检查 Expo 服务端口：$EXPO_HOST:$EXPO_PORT"
if wait_port_connectable "$EXPO_HOST" "$EXPO_PORT" 10 2; then
  echo "端口可连接：$EXPO_HOST:$EXPO_PORT"
else
  echo "端口不可连接：$EXPO_HOST:$EXPO_PORT（已尝试 10 次）"
fi

echo "服务端口检查完成"

echo "检查根目录 post_run.py"
if [ -f "$ROOT_DIR/post_run.py" ]; then
  echo "启动检查中"
  python "$ROOT_DIR/post_run.py" --port "$EXPO_PORT" || echo "post_run.py 执行失败"
  echo "启动检查结束"
fi

echo "==================== 服务启动完成 ===================="
