# Releases — Edge

Artefatos de instalação **manual** (sideload).

Os APKs **não** entram no Git — só docs nesta árvore; builds locais e [GitHub Releases](https://github.com/lucioccosta/lede-ads/releases) para produção.

Documentação operacional: [`docs/EDGE.md`](../docs/EDGE.md)

## Ambientes de desenvolvimento

| Pasta | Package | API padrão |
|-------|---------|------------|
| [`edge/casa`](edge/casa/) | `com.lede.edge.casa` | `http://192.168.10.142:3001/api` |
| [`edge/fios`](edge/fios/) | `com.lede.edge.fios` | `http://192.168.55.2:3001/api` |

```bash
cd apps/edge-android
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
./gradlew exportCasaApk   # → releases/edge/casa/
./gradlew exportFiosApk   # → releases/edge/fios/
```

## Produção (dispositivo)

| Pasta | Dispositivo | API |
|-------|-------------|-----|
| [`edge/aquario-stv2000-plus`](edge/aquario-stv2000-plus/) | Aquario STV-2000 Plus 4 | `https://api.lede.tv.br/api` |

```bash
./gradlew exportSideloadApk   # → releases/edge/aquario-stv2000-plus/
```

## Sair do kiosk (v0.3.2+)

1. Segure **Volume +** + **Voltar** ×3, ou  
2. **Voltar** ×7  

Detalhes e Device Owner: [`docs/EDGE.md`](../docs/EDGE.md).
