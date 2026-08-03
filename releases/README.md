# Releases — Edge

Artefatos de instalação **manual** (sideload) por tipo de dispositivo.

Os APKs **não** entram no Git — são publicados em [GitHub Releases](https://github.com/lucioccosta/lede-ads/releases).

## Tipos de edge

| Pasta | Dispositivo | minSdk | Status |
|-------|-------------|--------|--------|
| [`edge/aquario-stv2000-plus`](edge/aquario-stv2000-plus/) | Aquario STV-2000 Plus 4 (Android 10) | 29 | Ativo |

## API de produção

```
https://api.lede.tv.br/api
```

## Publicar nova versão

```bash
# 1. Build do tipo desejado (ex.: Aquario)
cd apps/edge-android
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
./gradlew exportSideloadApk

# 2. Tag + Release no GitHub (anexa o APK da pasta do edge)
gh release create edge-v0.2.0 \
  --title "Edge v0.2.0 — Aquario STV-2000 Plus" \
  --notes-file ../../releases/edge/aquario-stv2000-plus/RELEASE_NOTES.md \
  ../../releases/edge/aquario-stv2000-plus/*.apk
```
