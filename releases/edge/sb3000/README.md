# Edge — SB3000 produção

| Item | Valor |
|------|--------|
| targetId | `sb3000` |
| Flavor | `prod` |
| Package | `com.lede.edge` |
| Hardware | Proeletronic SB3000 |
| API | `https://api.lede.tv.br/api` |
| APK | `lede-edge-sb3000-v{X.Y.Z}.apk` |
| GitHub Releases / OTA | **Sim** |
| Launcher escape | `com.a.nova.launcher` |

## Build

**Local**

```bash
cd apps/edge-android
./gradlew exportSb3000Apk
# → releases/edge/sb3000/lede-edge-sb3000-v….apk
```

**GitHub Actions** — workflow `Edge SB3000 Release` (tag `edge-sb3000-v*` ou Run workflow).  
Secrets: ver [`docs/EDGE.md`](../../../docs/EDGE.md) § CI.

Publique **somente** este APK na [GitHub Release](https://github.com/lucioccosta/lede-ads/releases) (produção / OTA).

Guia: [`docs/EDGE.md`](../../../docs/EDGE.md)
