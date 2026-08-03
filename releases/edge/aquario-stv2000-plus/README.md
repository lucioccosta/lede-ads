# Edge — Aquario STV-2000 Plus 4

Player **LEDE Edge** para o smart box Aquario STV-2000 Plus 4.

| Item | Valor |
|------|--------|
| Modelo | Aquario STV-2000 Plus 4 |
| SO | Android 10 (API 29) |
| CPU | ARM Cortex-A53 |
| ABI | `armeabi-v7a` + `arm64-v8a` |
| Instalação | Manual (sideload), fora da Play Store |
| API | `https://api.lede.tv.br/api` |

## Download

Veja o APK na [última release Edge](https://github.com/lucioccosta/lede-ads/releases?q=edge&expanded=true)  
(arquivo `lede-edge-aquario-stv2000-plus-*.apk`).

## Instalação no box

1. Copie o APK para pendrive ou envie por rede.
2. Ative **Fontes desconhecidas** / **Instalar apps desconhecidos**.
3. Abra o APK e confirme a instalação.
4. Abra **LEDE Edge** e pareie com o código do painel (`https://app.lede.tv.br`).
5. Se o box perguntar o launcher padrão, escolha **LEDE Edge**.

### ADB (opcional)

```bash
adb install -r lede-edge-aquario-stv2000-plus-v0.2.0.apk
```

## Build local

```bash
cd apps/edge-android
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
./gradlew exportSideloadApk
# → releases/edge/aquario-stv2000-plus/lede-edge-aquario-stv2000-plus-v….apk
```

Override de API (ex. LAN):

```bash
./gradlew exportSideloadApk -Plede.apiBaseUrl=http://192.168.x.x:3001/api
```
