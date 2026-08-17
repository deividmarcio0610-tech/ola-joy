## Objetivo

Substituir toda a inferência de IA (hoje via Lovable AI Gateway / Gemini em edge functions) por chamadas HTTPS autenticadas a uma API própria na VPS (`https://dvdswap.com.br/api`), que fala com Ollama/gerador local em `127.0.0.1`. Frontend e Worker nunca acessam `127.0.0.1` nem conhecem o endereço do Ollama.

## Arquitetura final

```text
Browser (React)
    ↓ mesma origem
TanStack server route /api/vps/* (Cloudflare Worker)
    ↓ HTTPS + Bearer VALETECH_AI_API_KEY
https://dvdswap.com.br/api/*
    ↓ rede interna
Ollama 127.0.0.1:11434  |  Gerador 127.0.0.1:8188
```

Regras:
- `VALETECH_AI_API_URL` e `VALETECH_AI_API_KEY` ficam **só** em secrets do backend (server-side). Nunca `VITE_*`.
- Browser chama apenas rotas same-origin `/api/vps/*`; o Worker injeta o Bearer e faz proxy pro VPS.
- Sem fallback Gemini. Se VPS offline → mensagem clara + botão "Gerar Depois" desabilitado.
- Timeout HTTP no Worker (~110s) para respeitar limite do Cloudflare; geração pesada = job assíncrono + polling.

## Mudanças de código

### 1. Config central
- `src/lib/vps-ai/config.ts` — server-only. Lê `process.env.VALETECH_AI_API_URL` e `VALETECH_AI_API_KEY` dentro dos handlers.
- `src/lib/vps-ai/client.server.ts` — helper `callVpsAI(path, init, {timeoutMs})` com Bearer, timeout AbortController, validação MIME, bloqueio SSRF (só permite o host configurado).

### 2. Server routes proxy (same-origin, browser chama estas)
Todas em `src/routes/api/vps/`:
- `status.ts` → GET → proxy de `/api/status` (health: ollama, modelo, tempoResposta)
- `modelos.ts` → GET → proxy de `/api/modelos`
- `analisar.ts` → POST → proxy de `/api/analisar` (multipart ou JSON com signed URL da imagem)
- `backtest.ts` → POST → proxy de `/api/backtest`
- `video.ts` → POST → proxy de `/api/video`
- `generate-after.ts` → POST → cria job (`/v1/generate-after`), devolve `{jobId,status}`
- `jobs.$jobId.ts` → GET status, POST `/cancel`, POST `/retry`

Todas exigem sessão autenticada (Supabase `requireSupabaseAuth` equivalente) e validam tamanho/MIME antes de repassar.

### 3. Cliente browser
- `src/lib/vps-ai/api.ts` — wrappers `fetch("/api/vps/...")` tipados: `analyzeImage`, `analyzeText`, `getStatus`, `listModels`, `startGenerateAfter`, `getJob`, `cancelJob`, `retryJob`.
- Hook `useVpsHealth()` — polling do `/api/vps/status`.
- Hook `useVpsJob(jobId)` — polling exponencial até `completed|failed|cancelled`.

### 4. Substituição da camada atual
Refatorar (mantendo assinaturas onde possível) os arquivos que hoje chamam Gemini/Edge:
- `src/lib/iris-analyze.ts` → chama `analyzeImage` da nova API
- `src/lib/n3-kaizen.ts`, `src/lib/inspecao-5s.ts`, `src/lib/analysis-v2.ts` → mesma coisa
- `src/components/kaizen-iris-chat.tsx`, `src/components/record-module.tsx` → usar nova API
- `src/routes/api/chat.ts`, `src/routes/api/iris/kaizen-chat.ts` → proxy para `/api/analisar` (modo texto)
- `src/lib/image-providers/*` → o provider "vps" torna-se o único ativo; providers Gemini/Lovable ficam desativados (código mantido, mas router sempre resolve "vps")

Remover `LOVABLE_API_KEY` de todos os caminhos de análise.

### 5. Botão "Gerar Depois"
Componente `<GenerateAfterButton analysisId imageUrl />`:
- desabilitado se `health.imageGenerator.online === false`
- chama `startGenerateAfter`, mostra progresso via `useVpsJob`, exibe Antes/Depois quando `completed`.

### 6. Painel admin
Nova rota `src/routes/_authenticated/admin/ia-vps.tsx` (apenas role admin):
- Status API / Ollama / Gerador (via `/api/vps/status`)
- Lista de modelos (`/api/vps/modelos`)
- Modelo de visão/texto, modo CPU/GPU, fila, tempos médios
- URL da API (visível); chave **mascarada** (`sk-••••1234`) — vinda de server function que só devolve os 4 últimos caracteres

### 7. Signed URLs para imagens
Ao enviar imagem para análise, o Worker gera signed URL no Supabase Storage (bucket `inspections`, expiração 15 min) e envia só a URL para a VPS. Fallback: base64 se signed URL falhar.

### 8. Erros e fallback
- Se `/api/vps/status` falhar ou `online:false` → banner global "Servidor de IA local indisponível".
- Análise retorna erro estruturado; sem fallback Gemini.
- Todos os erros da VPS repassados com `code`/`message` para a UI.

### 9. Segurança
- Bearer no Worker, nunca no browser
- Timeout 110s no Worker, 120s dentro da VPS
- Validação MIME (image/jpeg,png,webp) e tamanho máx (10 MB) antes do proxy
- Rate limit por usuário (in-memory por Worker, best-effort)
- CORS: rotas same-origin, sem CORS aberto
- Bloqueio SSRF: `callVpsAI` só aceita o host de `VALETECH_AI_API_URL`

### 10. Secret
Gerar `VALETECH_AI_API_KEY` (64 chars) via `generate_secret`. Pedir `VALETECH_AI_API_URL` (dev = `http://localhost:8080`, prod = `https://dvdswap.com.br/api`) via `add_secret` para o usuário confirmar o valor final na form segura.

## Ordem de execução

1. Criar secrets (`VALETECH_AI_API_URL`, `VALETECH_AI_API_KEY`)
2. `src/lib/vps-ai/{config,client.server,api}.ts`
3. Server routes `src/routes/api/vps/*`
4. Hooks `useVpsHealth`, `useVpsJob`
5. Refatorar callers (iris-analyze, n3-kaizen, inspecao-5s, chat)
6. Componente `<GenerateAfterButton />` + integração nos módulos visuais
7. Rota admin `admin/ia-vps.tsx`
8. Banner global de health
9. Remover imports/uso de `LOVABLE_API_KEY` nos caminhos de análise
10. Teste: `/api/vps/status` via `invoke-server-function`; typecheck

## Fora do escopo

- Código da API na VPS (você já hospeda; documentado o contrato dos endpoints acima).
- Nginx/subdomínio (config da VPS).
- Migração de dados; Supabase permanece para auth/DB/storage.
