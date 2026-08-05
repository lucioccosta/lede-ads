# Edge — ambiente Casa

Build de desenvolvimento para a rede de casa.

| Item | Valor |
|------|--------|
| Package | `com.lede.edge.casa` |
| App name | LEDE Edge Casa |
| API | `http://192.168.10.142:3001/api` |
| Dispositivo | Aquario STV-2000 Plus (Android 10+) |

Pode coexistir com **Fios** e **Prod** no mesmo box (package diferente).

## Build

```bash
cd apps/edge-android
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
./gradlew exportCasaApk
```

APK: `lede-edge-casa-v0.3.3-casa.apk` nesta pasta.

## Sair do kiosk (emergência)

No controle remoto:

1. **Segure Volume +** e aperte **Voltar** 3 vezes (em até 3s), **ou**
2. Aperte **Voltar** 7 vezes seguidas (em até 3s)

O app encerra o lock task e abre o **launcher Aquario** (`com.br.aquariolauncher`).
Pressionar Home de novo volta ao LEDE (se ele continuar como app inicial).

Override da API:

```bash
./gradlew exportCasaApk -Plede.casaApiBaseUrl=http://192.168.10.142:3001/api
```
