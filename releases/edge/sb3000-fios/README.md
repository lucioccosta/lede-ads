# Edge — SB3000 Fios (desenvolvimento local)

| Item | Valor |
|------|--------|
| targetId | `sb3000-fios` |
| Flavor | `fios` |
| Package | `com.lede.edge.fios` |
| Hardware | Proeletronic SB3000 |
| API | `http://192.168.77.207:3001/api` |
| APK | `lede-edge-sb3000-fios-v{X.Y.Z}.apk` |
| GitHub Releases / OTA | **Não** — sideload local apenas |
| Launcher escape | `com.a.nova.launcher` |

## Build

```bash
cd apps/edge-android
./gradlew exportSb3000FiosApk
# → releases/edge/sb3000-fios/lede-edge-sb3000-fios-v….apk
```

```bash
./gradlew exportSb3000FiosApk -Plede.fiosApiBaseUrl=http://NOVO_IP:3001/api
```

Guia: [`docs/EDGE.md`](../../docs/EDGE.md)
