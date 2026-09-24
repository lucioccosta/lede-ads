# Releases — Edge (Proeletronic SB3000)

Artefatos de sideload. APKs **não** entram no Git.

Convenção:

```text
lede-edge-{targetId}-v{X.Y.Z}.apk
```

| targetId | Uso | Flavor | Package | Pasta | Task | GitHub Releases |
|----------|-----|--------|---------|-------|------|-----------------|
| **`sb3000`** | **Produção + OTA** | `prod` | `com.lede.edge` | [`edge/sb3000`](edge/sb3000/) | `exportSb3000Apk` | **Sim** — único asset OTA |
| `sb3000-fios` | Dev local (API Fios) | `fios` | `com.lede.edge.fios` | [`edge/sb3000-fios`](edge/sb3000-fios/) | `exportSb3000FiosApk` | **Não** |
| `sb3000-casa` | Dev local (API Casa) | `casa` | `com.lede.edge.casa` | [`edge/sb3000-casa`](edge/sb3000-casa/) | `exportSb3000CasaApk` | **Não** |

Exemplos:

- `lede-edge-sb3000-v0.5.0.apk` ← publicar na release
- `lede-edge-sb3000-fios-v0.5.0.apk` ← só máquina local
- `lede-edge-sb3000-casa-v0.5.0.apk` ← só máquina local

## Build

```bash
cd apps/edge-android
export JAVA_HOME="/Users/luciocosta/Library/Java/JavaVirtualMachines/jbr-21.0.11/Contents/Home"

./gradlew exportSb3000Apk        # produção → GitHub
./gradlew exportSb3000FiosApk    # LAN Fios (local)
./gradlew exportSb3000CasaApk    # LAN Casa (local)
```

Tag sugerida no GitHub: `edge-v0.5.0` com **apenas** `lede-edge-sb3000-v0.5.0.apk`.

Guia: [`docs/EDGE.md`](../docs/EDGE.md)
