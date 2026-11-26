#!/bin/bash
# Smoke test da Etapa 4: executa o Simulador.exe ORIGINAL numa sessão descartável e captura a tela.
# Uso (na VPS):  bash infra/scripts/smoke-test.sh
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

NAME=intelsim-smoke
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" --init \
  --cap-drop ALL --security-opt no-new-privileges:true --memory 512m --cpus 0.75 \
  -v "$SIM_HOST_PATH":/opt/simulador-src:ro \
  -e VNC_PASSWORD=smoketest -e ALLOW_IP=127.0.0.1 -e SCREEN="${SESSION_SCREEN:-1280x720}" \
  intel-sim-session:latest >/dev/null

echo "Aguardando o simulador abrir (até 60 s)..."
for i in $(seq 1 60); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' "$NAME")" = healthy ] && break
  [ "$(docker inspect -f '{{.State.Running}}' "$NAME")" = true ] || { echo "FALHA: container encerrou"; docker logs "$NAME"; exit 1; }
  sleep 1
done
[ "$(docker inspect -f '{{.State.Health.Status}}' "$NAME")" = healthy ] || { echo "FALHA: não ficou saudável"; docker logs "$NAME"; exit 1; }

sleep 3   # tempo para o SWF desenhar a primeira tela
echo "Processo:"; docker exec "$NAME" pgrep -fa Simulador.exe || true
WINDOWS=$(docker exec -e DISPLAY=:0 "$NAME" xdotool search --onlyvisible --name '.' 2>/dev/null | wc -l)
echo "Janelas visíveis no display virtual: $WINDOWS"
docker exec -e DISPLAY=:0 "$NAME" bash -c 'xwd -root -silent > /tmp/s.xwd' \
  && docker cp "$NAME":/tmp/s.xwd /tmp/intelsim-smoke.xwd \
  && echo "Captura da tela (XWD): /tmp/intelsim-smoke.xwd  (converta: convert /tmp/intelsim-smoke.xwd /tmp/intelsim-smoke.png)"
[ "$WINDOWS" -ge 1 ] || { echo "FALHA: nenhuma janela visível; veja 'docker logs $NAME'"; docker logs "$NAME"; docker rm -f "$NAME" >/dev/null; exit 1; }
echo "OK: Simulador.exe está em execução sob Wine com janela visível. Removendo o container de teste."
docker rm -f "$NAME" >/dev/null
