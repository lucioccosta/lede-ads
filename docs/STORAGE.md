# Storage — S3 (Eveo) e disco local

A API grava mídias e screenshots via `StorageService` (`apps/cloud-api/src/storage`).

## Drivers

| `STORAGE_DRIVER` | Comportamento |
|------------------|---------------|
| `s3` | Upload com AWS SDK para endpoint S3-compatible (Eveo) |
| `local` | Grava em `uploads/` e serve em `{PUBLIC_BASE_URL}/uploads/...` |

Se `s3` estiver configurado de forma incompleta, a API faz fallback para `local` e registra um warning no log.

## Eveo (produção)

```env
STORAGE_DRIVER=s3
S3_ENDPOINT=https://object.sp2.eveo.com.br
S3_REGION=us-east-1
S3_BUCKET=lede-arquivos
S3_TENANT=48806696000174
S3_ACCESS_KEY=***
S3_SECRET_KEY=***
S3_PUBLIC_URL=https://object.sp2.eveo.com.br/48806696000174:lede-arquivos
S3_FORCE_PATH_STYLE=true
# Opcional, se o provedor exigir ACL no PUT:
# S3_ACL=public-read
```

### URLs

- API (PutObject): bucket `lede-arquivos` no endpoint Eveo  
- Leitura pública: `{S3_PUBLIC_URL}/{key}`  
  Ex.: `https://object.sp2.eveo.com.br/48806696000174:lede-arquivos/media/...`

Referência do bucket: [ListBucket Eveo](https://object.sp2.eveo.com.br/48806696000174:lede-arquivos/)

### Prefixos de objeto

| Pasta | Uso |
|-------|-----|
| `media/` | Uploads do portal / Cloud Ops |
| `screenshots/` | Capturas do Edge |

## Endpoints

- `POST /api/uploads` — mídia (JWT)  
- `POST /api/edge/screenshot-upload` — screenshot (device token)  

Ambos usam Multer em memória e enviam o buffer ao storage.

## Checklist

1. Bucket com leitura pública (ou CDN) para o Edge baixar mídia  
2. Keys só em ambiente (nunca no Git)  
3. No Dokploy, as mesmas variáveis do `.env.dokploy.example`  
4. Após mudar `S3_*`, reinicie / redeploy a API  
