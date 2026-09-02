# APIs Sitiolândia Eco Park

Vercel Serverless/Edge Functions que geram arquivos (PNG/PDF) a partir de dados enviados pelo Bubble, evitando gerar isso no client-side.

## Endpoints

- [`POST /api/ingresso`](#endpoint-ingresso) — gera o PNG de 1 ingresso
- [`POST /api/relatorio-manutencoes`](#endpoint-relatório-de-manutenções-de-agendamentos) — gera o PDF do relatório de manutenções de agendamentos (múltiplos dias, gráficos de ocupação por parque)

---

## Endpoint: Ingresso

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

### Setup no Bubble — API Connector

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

### Workflow Bubble 1-a-1

| Step | Ação | Detalhe |
|---|---|---|
| 1-N | (já existente) | Cria ingresso, gera QR, etc |
| N+1 | API Connector — Gerar PNG do Ingresso | passa os 4 campos do ingresso |
| N+2 | Make changes to Ingresso | `imagem = Result of step N+1` |

Depois, no envio do e-mail, `Search for Ingressos's imagem` vira lista de anexos.

---

## Endpoint: Relatório de Manutenções de Agendamentos

`POST /api/relatorio-manutencoes`

Gera o PDF completo do relatório (todos os dias do período + página de totalizadores), montado no servidor com `pdf-lib` — substitui a tentativa de gerar via JS no client em cima do repeating group do Bubble (lazy load do RG cortava dados de relatórios longos).

### Request

```json
{
  "periodo_inicio": "13/08/2026",
  "periodo_fim": "30/08/2026",
  "dias": [
    { "dia": "13/08/2026", "capacidade_sitiolandia": 1200, "capacidade_educantaro": 200 },
    { "dia": "25/08/2026", "capacidade_sitiolandia": 1200, "capacidade_educantaro": 200 }
  ],
  "excursoes": [
    {
      "data": "13/08/2026",
      "tipo": "Escola Particular",
      "nome": "COLEGIO MADRE MAZZARELO",
      "agente": "VIA LEÕES",
      "parque": "Sitiolândia",
      "servico_contratado": "Sitiolândia Integral",
      "segmento_grafico": "Sitiolândia Integral",
      "qtd": 75,
      "cadastro": "11/02/2026",
      "manutencao": "Manutenção Pendente"
    }
  ]
}
```

**Duas listas soltas, unidas pela data — repare que a chave tem nomes diferentes em cada lista:**

- `dias[].dia` — a data do dia.
- `excursoes[].data` — a mesma data, só que o campo se chama `data` aqui (não `dia`). É assim que o Bubble consegue mandar; o endpoint faz a junção internamente.

**Regras do payload:**

- `periodo_inicio`/`periodo_fim`: range completo do filtro selecionado pelo usuário — é o que vai no título, independente do que está em `dias`/`excursoes`.
- `dias[]`: pode incluir **todos** os dias do período, mesmo os sem nenhuma excursão — eles não geram card, mas **entram na soma de capacidade do Totalizadores final**.
- `excursoes[].data` **precisa** corresponder a algum `dias[].dia` enviado — se não corresponder, o endpoint devolve **400** nomeando a data problemática, não descarta a excursão silenciosamente.
- `capacidade_sitiolandia`/`capacidade_educantaro`: capacidade **total** do dia (o ocupado é calculado somando `qtd`).
- `parque`: `"Sitiolândia"` ou `"Educântaro"` — decide a barra e a cor do bullet na tabela (verde/azul). Campo obrigatório e **separado** de `servico_contratado` — não derive um do outro.
- `servico_contratado`: texto exato da coluna "Serviço Contratado" da tabela.
- `segmento_grafico`: texto exato do chip colorido embaixo da barra (pode ser igual a `servico_contratado`, como na Sitiolândia, ou diferente, como no Educântaro — "Fund I", "Educação Infantil"). O endpoint agrupa e soma `qtd` por valor distinto dentro de cada parque/dia; cada valor vira um chip com cor própria, consistente em todo o documento.

### Response

```json
{
  "pdf_base64": "JVBERi0xLjcK...",
  "filename": "relatorio-manutencoes-13-08-2026-a-30-08-2026.pdf",
  "mime": "application/pdf",
  "periodo_inicio": "13/08/2026",
  "periodo_fim": "30/08/2026",
  "total_dias": 8,
  "size_bytes": 48213
}
```

Mesmo padrão de resposta do `/api/ingressos-pdf` (base64 dentro de JSON, sem persistir nada em disco).

### Runtime

Roda em **Edge Runtime** (`export const config = { runtime: 'edge' }`), igual aos outros dois endpoints — `pdf-lib` é JS puro e funciona nesse runtime sem problema. Por isso o retorno de `gerarRelatorioPDF` é `Uint8Array`, não `Buffer` (que não é garantido no Edge Runtime): a conversão pra base64 usa a mesma função manual em chunks (`uint8ToBase64`) que já existe no `ingressos-pdf.tsx`, copiada aqui pra manter os dois endpoints independentes.

### Setup no Bubble — API Connector

| Campo | Valor |
|---|---|
| API Name | `IngressoSitiolandia` (mesma API, ação nova) |
| Use as | Action |
| Name | `Gerar PDF do Relatório de Manutenções` |
| Method | POST |
| URL | `https://SEU-PROJETO.vercel.app/api/relatorio-manutencoes` |
| Headers | `Content-Type: application/json` |
| Body type | JSON |
| Body | payload conforme schema acima (monte a lista `dias` dinamicamente no workflow) |
| **Return type** | **JSON** — decodifique `pdf_base64` do mesmo jeito que já faz com o `ingressos-pdf` |

### Erros de payload

Se alguma `excursoes[].data` não corresponder a nenhum `dias[].dia` enviado, o endpoint responde **400** com a mensagem nomeando a(s) data(s) problemática(s) — não descarta a excursão silenciosamente. Trate isso no workflow do Bubble como validação de payload, não como erro genérico de servidor.

### Limitações conhecidas (testado com payload de amostra e com 1 mês real de dados — 30 dias, 73 excursões)

- Um card de dia que não cabe inteiro na página **continua na próxima**, em vez de pular a página inteira: o fragmento de continuação mostra `"DD/MM/AAAA (continuação)"` no lugar do cabeçalho de data completo, e os cantos arredondados só aparecem nas bordas reais do card (topo do primeiro fragmento, base do último) — a borda cortada entre páginas fica reta.
- Truncamento de texto usa largura real medida na fonte (não conta caracteres), mas a pill de "Data do Cadastro / Status da Manutenção" não tem teto de largura — se algum status vier como texto livre muito longo, a pill pode estourar a borda do card.
- Cantos do card usam a técnica de retângulo+círculos do pdf-lib (não há suporte nativo a `border-radius`); visualmente equivalente ao HTML original.
- Se `segmento_grafico` vier como string vazia (`""`), o chip da barra aparece sem texto, só com a quantidade entre parênteses — é um problema de qualidade de dado na origem, não do endpoint; vale validar isso no Bubble antes de enviar.

---

## Deploy (projeto único — os dois endpoints moram no mesmo deploy Vercel)

### Via Vercel CLI (mais rápido)

```bash
npm install -g vercel
vercel login
cd ingresso-sitiolandia
vercel
# Aceita os defaults. Quando perguntar "Want to modify these settings?", responde N.
vercel --prod
```

A URL final fica tipo `https://ingresso-api-xxxx.vercel.app`. Os endpoints ficam em `/api/ingresso` e `/api/relatorio-manutencoes` dessa mesma URL.

### Via GitHub + Vercel Dashboard

1. `git init` no projeto, commit, push para um repo no GitHub.
2. No dashboard da Vercel → `Add New… → Project` → importa o repo.
3. Aceita os defaults de Framework Preset (Other) e clica Deploy.
4. URL final aparece após o deploy.

### Dependências

O endpoint de relatório usa `pdf-lib` (mesma dependência que o `ingressos-pdf` já usa) — confirme que está no `package.json` antes do deploy:

```bash
npm install pdf-lib
```

## Custos

- Plano **Hobby** da Vercel: 100k execuções/mês grátis, compartilhado entre os dois endpoints
- Cold start: ~300ms
- Warm: ~80-150ms (ingresso) / a validar com payload real (relatório — PDF multi-página é mais pesado que PNG único)

Para escala de tickets + relatórios de um parque, sobra orçamento de execuções.
