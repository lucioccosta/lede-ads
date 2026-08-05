# Edge Android — guia operacional

Player kiosk para smart boxes (ex.: Aquario STV-2000 Plus 4, Android 10+).

## Ambientes e builds

| Flavor | Package | API padrão | Task Gradle | Pasta |
|--------|---------|------------|-------------|-------|
| `casa` | `com.lede.edge.casa` | `http://192.168.10.142:3001/api` | `exportCasaApk` | [`releases/edge/casa`](../releases/edge/casa/) |
| `fios` | `com.lede.edge.fios` | `http://192.168.55.2:3001/api` | `exportFiosApk` | [`releases/edge/fios`](../releases/edge/fios/) |
| `prod` | `com.lede.edge` | `https://api.lede.tv.br/api` | `exportSideloadApk` | [`releases/edge/aquario-stv2000-plus`](../releases/edge/aquario-stv2000-plus/) |

```bash
cd apps/edge-android
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
./gradlew exportCasaApk
./gradlew exportFiosApk
./gradlew exportSideloadApk
```

APKs **não** vão para o Git (`.gitignore`). Em produção, publique em [GitHub Releases](https://github.com/lucioccosta/lede-ads/releases).

## Kiosk

Após o pairing, a `PlayerActivity`:

- entra em modo imersivo
- chama `startLockTask()`
- registra-se como app **Home** (launcher)

Comandos remotos no Cloud (Telas): Re-sync, Screenshot, Reiniciar (reboot exige Device Owner).

### Sair do kiosk (a partir da v0.3.2)

No controle remoto:

1. **Segure Volume +** e aperte **Voltar** **3** vezes (em até 3 s), **ou**
2. Aperte **Voltar** **7** vezes seguidas (em até 3 s)

A partir da **v0.3.3**, o escape abre o launcher nativo **Aquario** (`com.br.aquariolauncher`) e remove a task do LEDE.  
Home de novo (se o LEDE continuar como app inicial) volta ao player.

### Versões anteriores (sem escape)

Não há atalho no app. Recuperação:

```bash
adb connect IP_DO_BOX:5555
adb shell am start -a android.settings.SETTINGS
# ou
adb uninstall com.lede.edge.casa   # ajuste o package do flavor
```

Último recurso: reset de fábrica do Aquario (botão no furo AV + recovery → Wipe data).

## Telemetria (heartbeat ~30 s)

O Edge envia no heartbeat:

| Métrica | Campos |
|---------|--------|
| CPU | `cpuUsagePercent` |
| RAM | `ramAvailBytes`, `ramTotalBytes` |
| Disco | `freeStorageBytes`, `totalStorageBytes` |
| Uptime | `uptimeMs` |

Exibidos no dashboard **Telas** (grade com ícones e barras de uso).

## Device Owner (opcional)

Só um owner por aparelho; idealmente **sem contas** no box (após reset, instale o APK e rode o `dpm` antes de logar Google).

```bash
# Casa (applicationId ≠ namespace — use o caminho completo da classe)
adb shell dpm set-device-owner com.lede.edge.casa/com.lede.edge.LedeDeviceAdminReceiver

# Fios
adb shell dpm set-device-owner com.lede.edge.fios/com.lede.edge.LedeDeviceAdminReceiver

# Prod
adb shell dpm set-device-owner com.lede.edge/com.lede.edge.LedeDeviceAdminReceiver
```

**Importante (Android 10 / Aquario):** só funciona em box **ainda não provisionado** (idealmente logo após reset de fábrica, **sem** conta Google e **antes** de concluir o setup). Em device já em uso, `dpm set-device-owner` falha mesmo com 0 contas.

Fluxo recomendado:
1. Reset de fábrica (recovery / Wipe data).
2. Ligue Wi‑Fi, ative **Opções do desenvolvedor** + **Depuração USB** / ADB rede (pule conta Google se possível).
3. `adb install` do APK LEDE.
4. Rode o `dpm set-device-owner` acima **antes** de adicionar contas.
5. Confirme com `dumpsys device_policy`.

Confirmar:

```bash
adb shell dumpsys device_policy | grep -A2 "Device Owner"
```

Libera reboot remoto e lock task mais forte. Remover:

```bash
adb shell dpm remove-active-admin com.lede.edge.casa/.LedeDeviceAdminReceiver
```

## Instalação manual (Aquario)

1. Ative fontes desconhecidas / instalar apps desconhecidos.
2. Instale o APK (pendrive, rede ou `adb install -r …`).
3. Abra o app, pareie com o código do Cloud.
4. Se o sistema perguntar o launcher padrão, escolha LEDE Edge **somente** em produção/sinalização.

## Reset de fábrica (Aquario STV-2000)

1. Desconecte a energia.
2. Pressione o botão no furo da entrada **AV** (palito).
3. Mantendo pressionado, ligue a energia.
4. No recovery: **Wipe data / factory reset** → **Yes** → **Reboot system now**.
