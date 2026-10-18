# Edge Android — guia operacional

Player kiosk para **Proeletronic SB3000** (Android 10+).

## Targets e builds

```text
lede-edge-{targetId}-v{X.Y.Z}.apk
```

| targetId | Uso | Flavor | Package | Task | GitHub / OTA |
|----------|-----|--------|---------|------|--------------|
| `sb3000` | Produção | `prod` | `com.lede.edge` | `exportSb3000Apk` | **Sim** |
| `sb3000-fios` | Dev LAN Fios | `fios` | `com.lede.edge.fios` | `exportSb3000FiosApk` | Não |
| `sb3000-casa` | Dev LAN Casa | `casa` | `com.lede.edge.casa` | `exportSb3000CasaApk` | Não |

```bash
cd apps/edge-android
export JAVA_HOME="/Users/luciocosta/Library/Java/JavaVirtualMachines/jbr-21.0.11/Contents/Home"
./gradlew exportSb3000Apk        # → releases/edge/sb3000/ (publicar no GitHub)
./gradlew exportSb3000FiosApk    # → releases/edge/sb3000-fios/ (local)
./gradlew exportSb3000CasaApk    # → releases/edge/sb3000-casa/ (local)
```

APKs **não** vão para o Git. Em produção, publique **apenas** `lede-edge-sb3000-v….apk` em [GitHub Releases](https://github.com/lucioccosta/lede-ads/releases).

## Kiosk

Após o pairing, a `PlayerActivity`:

- entra em modo imersivo
- chama `startLockTask()`
- registra-se como app **Home** (launcher)

A `RootActivity` é a entrada MAIN/HOME/LAUNCHER: encaminha para Player (pareado) ou Pairing.

**Auto-start após reboot:** o `BootReceiver` escuta `BOOT_COMPLETED` e `QUICKBOOT_POWERON` e abre o app com atraso de ~8 s. Defina o LEDE Edge como **launcher padrão**.

### Sair do kiosk

1. **Segure Volume +** e aperte **Voltar** **3** vezes (em até 3 s), **ou**
2. Aperte **Voltar** **7** vezes seguidas (em até 3 s)

Abre o launcher nativo **Nova** (`com.a.nova.launcher`) e remove a task do LEDE.

### Re-parear no aparelho

Aperte **Volume −** **10** vezes seguidas (em até 5 s).

Limpa o token local e abre a tela de pairing (equivalente ao “Re-parear” do Cloud, no Edge). Toast de progresso aos 5 e 8 toques.

### Versões anteriores (sem escape)

```bash
adb connect IP_DO_BOX:5555
adb shell am start -a android.settings.SETTINGS
# ou
adb uninstall com.lede.edge.fios   # ajuste o package do flavor
```

## Telemetria (heartbeat ~30 s)

O Edge envia no heartbeat:

| Métrica | Campos |
|---------|--------|
| Versão | `appVersion`, `appVersionCode`, `appFlavor` |
| CPU | `cpuUsagePercent` |
| RAM | `ramAvailBytes`, `ramTotalBytes` |
| Disco | `freeStorageBytes`, `totalStorageBytes` |
| Uptime | `uptimeMs` |

Exibidos no dashboard **Telas**.

## Device Owner (necessário para OTA silenciosa)

Sem Device Owner, o Android **sempre** pede confirmação (“fontes desconhecidas” / Instalar).
Com Device Owner, o `PackageInstaller` instala e o app reabre sem toque.

Pré-requisito: aparelho sem contas Google (ou factory reset) — o `dpm` falha se já houver usuário/conta.

```bash
# Produção
adb shell dpm set-device-owner com.lede.edge/com.lede.edge.LedeDeviceAdminReceiver

# Dev Fios
adb shell dpm set-device-owner com.lede.edge.fios/com.lede.edge.LedeDeviceAdminReceiver

# Dev Casa
adb shell dpm set-device-owner com.lede.edge.casa/com.lede.edge.LedeDeviceAdminReceiver
```

Libera reboot remoto, lock task e OTA silenciosa. Remover:

```bash
adb shell dpm remove-active-admin com.lede.edge/.LedeDeviceAdminReceiver
```

## Atualização OTA (GitHub Releases)

O Cloud consulta releases (`GITHUB_REPO`, opcional `GITHUB_TOKEN`) e compara com devices **prod** (`appFlavor=prod` → target `sb3000`).

| Flavor | OTA GitHub? |
|--------|-------------|
| `prod` | Sim — `lede-edge-sb3000-v….apk` |
| `fios` / `casa` | Não — só sideload local |

1. Publique `lede-edge-sb3000-v{X.Y.Z}.apk` na release (manual ou via Actions).
2. Em **Telas**, devices desatualizados mostram **Atualização disponível**.
3. **Atualizar** → Edge baixa no heartbeat e instala (`PackageInstaller`).

```bash
GITHUB_REPO=lucioccosta/lede-ads
# GITHUB_TOKEN=ghp_…   # opcional
```

### CI — GitHub Actions

Workflow: [`.github/workflows/edge-sb3000-release.yml`](../.github/workflows/edge-sb3000-release.yml)

**Secrets** (repo → Settings → Secrets and variables → Actions):

| Secret | Obrigatório | Descrição |
|--------|-------------|-----------|
| `LEDE_EDGE_KEYSTORE_BASE64` | sim | `base64` do `apps/edge-android/keystore/lede-edge-sideload.jks` |
| `LEDE_EDGE_STORE_PASSWORD` | não | default `lede-edge` |
| `LEDE_EDGE_KEY_ALIAS` | não | default `lede-edge` |
| `LEDE_EDGE_KEY_PASSWORD` | não | default `lede-edge` |

```bash
# Gerar o secret do keystore (macOS)
base64 -i apps/edge-android/keystore/lede-edge-sideload.jks | pbcopy
# Colar em LEDE_EDGE_KEYSTORE_BASE64
```

**Como publicar uma versão**

1. Suba `versionCode` / `versionName` em `apps/edge-android/app/build.gradle.kts` e faça commit no `main`.
2. Opção A — tag:
   ```bash
   git tag edge-sb3000-v0.5.14
   git push origin edge-sb3000-v0.5.14
   ```
3. Opção B — Actions → **Edge SB3000 Release** → Run workflow (usa a versão do Gradle no commit).

## Instalação no SB3000

1. Ative fontes desconhecidas.
2. Instale o APK (produção ou `sb3000-fios` / `sb3000-casa` para dev).
3. Pareie com o código do Cloud.
4. Escolha LEDE Edge como launcher **Sempre**.
