# Imagem de SESSÃO: executa o Simulador.exe ORIGINAL (Macromedia Flash Player 7
# standalone projector) sob Wine, num display virtual exposto via VNC.
# O programa NÃO vai dentro da imagem: é montado somente-leitura em
# /opt/simulador-src (pasta original, intocada) e copiado para a área
# temporária do container a cada sessão.
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    WINEARCH=win32 \
    WINEPREFIX=/home/sim/.wine \
    WINEDEBUG=-all \
    WINEDLLOVERRIDES="mscoree,mshtml=" \
    LANG=pt_BR.UTF-8

RUN dpkg --add-architecture i386 \
 && apt-get update \
 && apt-get install -y --no-install-recommends \
      wine wine32 libwine libwine:i386 fonts-wine \
      xvfb x11vnc openbox xdotool x11-apps procps ca-certificates locales \
      fonts-liberation fonts-dejavu-core \
 && sed -i 's/# pt_BR.UTF-8/pt_BR.UTF-8/' /etc/locale.gen && locale-gen \
 && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 -s /usr/sbin/nologin sim

# Prefixo Wine (32 bits) pré-criado: evita ~15 s de inicialização por sessão.
USER sim
RUN xvfb-run -a wineboot --init && wineserver -w || true

COPY --chown=sim:sim entrypoint.sh /usr/local/bin/entrypoint.sh
USER root
RUN chmod 0755 /usr/local/bin/entrypoint.sh
USER sim
WORKDIR /home/sim

EXPOSE 5900
HEALTHCHECK --interval=2s --timeout=2s --start-period=3s --retries=40 \
  CMD pgrep -f Simulador.exe >/dev/null && (echo > /dev/tcp/127.0.0.1/5900) || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
