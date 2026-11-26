#!/bin/bash
# Inicia uma sessão isolada: Xvfb (tela virtual) + openbox + x11vnc + Simulador.exe (via Wine).
# Variáveis (injetadas pelo orquestrador): VNC_PASSWORD, ALLOW_IP, SCREEN (ex.: 1280x720)
set -euo pipefail

: "${VNC_PASSWORD:?VNC_PASSWORD obrigatório}"
: "${ALLOW_IP:?ALLOW_IP obrigatório}"
SCREEN="${SCREEN:-1280x720}"

export DISPLAY=:0
SRC=/opt/simulador-src
DST=/home/sim/simulador

[ -f "$SRC/Simulador.exe" ] || { echo "Simulador.exe não encontrado em $SRC" >&2; exit 2; }

# Cópia de trabalho (o original permanece montado somente-leitura e inalterado).
mkdir -p "$DST"
cp -r "$SRC"/. "$DST"/

# Senha em arquivo 0600 removido pelo x11vnc após a leitura (nada de senha em argv).
PWFILE=$(mktemp)
chmod 600 "$PWFILE"
printf '%s\n' "$VNC_PASSWORD" > "$PWFILE"
unset VNC_PASSWORD

Xvfb :0 -screen 0 "${SCREEN}x24" -nolisten tcp &
for _ in $(seq 1 50); do [ -e /tmp/.X11-unix/X0 ] && break; sleep 0.1; done

openbox &

# Aceita conexões apenas do guacd (e do healthcheck local).
x11vnc -display :0 -forever -shared -noxdamage -rfbport 5900 \
       -passwdfile "rm:$PWFILE" -allow "127.0.0.1,${ALLOW_IP}" -quiet &

cd "$DST"
# Ao fechar o programa, o container termina e a sessão é encerrada (reiniciar = nova sessão).
wine "$DST/Simulador.exe"
code=$?
kill $(jobs -p) 2>/dev/null || true
exit $code
