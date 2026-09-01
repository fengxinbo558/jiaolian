#!/bin/zsh

PROJECT_DIR="${0:A:h}"
APP_PORT="5173"

cd "$PROJECT_DIR" || exit 1

if ! command -v npm >/dev/null 2>&1; then
  echo "没有找到 Node.js / npm，暂时无法启动网页。"
  echo "请保留这个窗口并联系开发者处理。"
  read -r
  exit 1
fi

echo "正在启动 FORM 私人动作教练……"
npm run dev -- --host 127.0.0.1 --port "$APP_PORT" &
SERVER_PID=$!

for attempt in {1..40}; do
  if curl --silent --fail "http://127.0.0.1:$APP_PORT/" >/dev/null 2>&1; then
    echo "网页已就绪，正在打开浏览器。"
    open "http://localhost:$APP_PORT/"
    wait "$SERVER_PID"
    exit $?
  fi
  sleep 0.25
done

echo "启动失败：请检查上方提示。"
wait "$SERVER_PID"
read -r
