#!/bin/bash
# Pré-renderiza o splash do framebuffer (BGRA 32 bpp) para cada resolução e
# rotação. Mesma composição da SplashView do app: logo com 360 px de largura
# (em 1280×720) centralizado num fundo preto.
#
#   make-splash.sh LOGO.png DESTINO_DIR
set -euo pipefail
LOGO="${1:?logo png}"
OUT="${2:?diretório de saída}"
mkdir -p "$OUT"

render() {  # W H graus
  local W=$1 H=$2 DEG=$3 CW CH LW rot
  # Conteúdo em retrato quando 90/270 (igual ao RotatedBin do app)
  if [ "$DEG" = 90 ] || [ "$DEG" = 270 ]; then CW=$H; CH=$W; else CW=$W; CH=$H; fi
  LW=$(( 360 * CH / 720 ))            # escala com a altura (360 px em 720)
  [ "$LW" -gt $(( CW * 3 / 4 )) ] && LW=$(( CW * 3 / 4 ))
  case $DEG in
    90)  rot=",transpose=1" ;;
    180) rot=",hflip,vflip" ;;
    270) rot=",transpose=2" ;;
    *)   rot="" ;;
  esac
  # Compõe sobre fundo preto (o framebuffer ignora alfa: transparência viraria lixo)
  ffmpeg -v error -y -f lavfi -i "color=c=black:s=${CW}x${CH}" -i "$LOGO" \
    -filter_complex "[1:v]scale=${LW}:-1:flags=lanczos,format=rgba[lg];[0:v][lg]overlay=(W-w)/2:(H-h)/2:format=auto,format=bgra${rot}" \
    -frames:v 1 -pix_fmt bgra -f rawvideo "$OUT/splash-${W}x${H}-${DEG}.bgra"
  # PNG para o splash dentro do cage (imv), mesma composição
  ffmpeg -v error -y -f rawvideo -pix_fmt bgra -s "${W}x${H}" -i "$OUT/splash-${W}x${H}-${DEG}.bgra" \
    -frames:v 1 "$OUT/splash-${W}x${H}-${DEG}.png"
}

for res in 1280x720 1920x1080; do
  for deg in 0 90 180 270; do
    render "${res%x*}" "${res#*x}" "$deg"
  done
done
ls -la "$OUT"
