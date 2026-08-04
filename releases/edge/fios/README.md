# Edge — ambiente Fios

Build de desenvolvimento para a rede Fios.

| Item | Valor |
|------|--------|
| Package | `com.lede.edge.fios` |
| App name | LEDE Edge Fios |
| API (padrão) | `http://192.168.55.2:3001/api` |
| Dispositivo | Aquario STV-2000 Plus (Android 10+) |

Pode coexistir com **Casa** e **Prod** no mesmo box (package diferente).

## Build

```bash
cd apps/edge-android
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
./gradlew exportFiosApk
```

Override da API:

```bash
./gradlew exportFiosApk -Plede.fiosApiBaseUrl=http://SEU_IP:3001/api
```

## Sair do kiosk (v0.3.2+)

1. Segure **Volume +** + **Voltar** ×3, ou  
2. **Voltar** ×7  

Guia: [`docs/EDGE.md`](../../../docs/EDGE.md).
