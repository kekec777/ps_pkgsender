#!/bin/sh
set -eu

if [ -z "${PS5_ADDR:-}" ]; then
  export PS5_ADDR="${PS5IP:-192.168.1.110}"
fi

if [ -z "${PS5UPLOAD_RUNTIME_PORT:-}" ]; then
  export PS5UPLOAD_RUNTIME_PORT="9120"
fi

if [ -z "${PS5UPLOAD_ALLOW_IP:-}" ]; then
  export PS5UPLOAD_ALLOW_IP="192.168.1.0/24"
fi

if [ -z "${PS5UPLOAD_PKG_HOST_IP:-}" ]; then
  export PS5UPLOAD_PKG_HOST_IP="${LOCALIP:-192.168.1.202}"
fi

if [ -z "${PS5UPLOAD_WEB_PORT:-}" ]; then
  export PS5UPLOAD_WEB_PORT="19113"
fi

mkdir -p /data /tmp /pkgs
chmod 1777 /data /tmp 2>/dev/null || true

[ -d /pkg_sender/PS4Games ] && ln -sfn /pkg_sender/PS4Games /pkgs/PS4
[ -d /pkg_sender/PS5Games ] && ln -sfn /pkg_sender/PS5Games /pkgs/PS5
[ -d /pkg_sender/PS2Games ] && ln -sfn /pkg_sender/PS2Games /pkgs/PS2
[ -d /pkg_sender/PS1Games ] && ln -sfn /pkg_sender/PS1Games /pkgs/PS1
[ -d /pkg_sender/Retro ] && ln -sfn /pkg_sender/Retro /pkgs/Retro
[ -d /pkg_sender/SwitchGames ] && ln -sfn /pkg_sender/SwitchGames /pkgs/Switch

echo "Starting ps5upload engine/web UI..."
echo "  PS5_ADDR=$PS5_ADDR"
echo "  PS5UPLOAD_RUNTIME_PORT=$PS5UPLOAD_RUNTIME_PORT"
echo "  PS5UPLOAD_WEB_PORT=$PS5UPLOAD_WEB_PORT"
echo "  PS5UPLOAD_ALLOW_IP=$PS5UPLOAD_ALLOW_IP"
echo "  PS5UPLOAD_PKG_HOST_IP=$PS5UPLOAD_PKG_HOST_IP"

ps5upload-engine &
PS5UPLOAD_PID="$!"

echo "Starting PKG Sender..."
npm start &
PKGSENDER_PID="$!"

term_handler() {
  echo "Stopping services..."
  kill "$PKGSENDER_PID" "$PS5UPLOAD_PID" 2>/dev/null || true
  wait "$PKGSENDER_PID" "$PS5UPLOAD_PID" 2>/dev/null || true
  exit 0
}

trap term_handler TERM INT

wait -n "$PKGSENDER_PID" "$PS5UPLOAD_PID"
EXIT_CODE="$?"

echo "One service exited, stopping the other..."
kill "$PKGSENDER_PID" "$PS5UPLOAD_PID" 2>/dev/null || true
wait "$PKGSENDER_PID" "$PS5UPLOAD_PID" 2>/dev/null || true

exit "$EXIT_CODE"
