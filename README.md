# API de Ingressos — Sitiolândia Eco Park

Vercel Edge Function que recebe dados de 1 ingresso e devolve PNG renderizado.

## Endpoint

`POST /api/ingresso`

```json
{
  "tipo": "Integral",
  "responsavel": "Ícaro Almeida",
  "data": "28/06/2026 - Domingo",
  "qrcode": "https://.../qrcode.png"
}
```

**Response:** `image/png` binário (PNG do ingresso, 280×470 px)

## Deploy

### Via Vercel CLI (mais rápido)

```bash
npm install -g vercel
vercel login
cd ingresso-api
vercel
# Aceita os defaults. Quando perguntar "Want to modify these settings?", responde N.
vercel --prod
```

A URL final fica tipo `https://ingresso-api-xxxx.vercel.app`. O endpoint é `https://ingresso-api-xxxx.vercel.app/api/ingresso`.

### Via GitHub + Vercel Dashboard

1. `git init` no projeto, commit, push para um repo no GitHub.
2. No dashboard da Vercel → `Add New… → Project` → importa o repo.
3. Aceita os defaults de Framework Preset (Other) e clica Deploy.
4. URL final aparece após o deploy.

## Setup no Bubble — API Connector

| Campo | Valor |
|---|---|
| API Name | `IngressoSitiolandia` |
| Authentication | None or self-handled |
| Use as | Action |
| Name | `Gerar PNG do Ingresso` |
| Method | POST |
| URL | `https://SEU-PROJETO.vercel.app/api/ingresso` |
| Headers | `Content-Type: application/json` |
| Body type | JSON |
| Body | `{"tipo":"<tipo>","responsavel":"<responsavel>","data":"<data>","qrcode":"<qrcode>"}` |
| Parameter types | todos `text` (não marcar Private) |
| **Return type** | **File** ⚠️ |

Marca **Return type: File** — o Bubble salva o PNG no file storage e devolve URL pronta.

## Workflow Bubble 1-a-1

| Step | Ação | Detalhe |
|---|---|---|
| 1-N | (já existente) | Cria ingresso, gera QR, etc |
| N+1 | API Connector — Gerar PNG do Ingresso | passa os 4 campos do ingresso |
| N+2 | Make changes to Ingresso | `imagem = Result of step N+1` |

Depois, no envio do e-mail, `Search for Ingressos's imagem` vira lista de anexos.

## Custos

- Plano **Hobby** da Vercel: 100k execuções/mês grátis
- Cold start: ~300ms
- Warm: ~80-150ms

Para escala de tickets de um parque, sobra orçamento de execuções.
