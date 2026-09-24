# Edge — SB3000 Casa (desenvolvimento local)

| Item | Valor |
|------|--------|
| targetId | `sb3000-casa` |
| Flavor | `casa` |
| Package | `com.lede.edge.casa` |
| Hardware | Proeletronic SB3000 |
| API | `http://192.168.10.142:3001/api` |
| APK | `lede-edge-sb3000-casa-v{X.Y.Z}.apk` |
| GitHub Releases / OTA | **Não** — sideload local apenas |
| Launcher escape | `com.a.nova.launcher` |

## Build

```bash
cd apps/edge-android
./gradlew exportSb3000CasaApk
# → releases/edge/sb3000-casa/lede-edge-sb3000-casa-v….apk
```

```bash
./gradlew exportSb3000CasaApk -Plede.casaApiBaseUrl=http://NOVO_IP:3001/api
```

Guia: [`docs/EDGE.md`](../../docs/EDGE.md)
