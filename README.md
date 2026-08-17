# VisionGuard AI

Plataforma corporativa de Segurança (N3), Supervisão, Meio Ambiente, Kaizen, Inspeção 5S,
Intempéries e ganhos operacionais, com IA de visão hospedada em VPS própria.

Stack: **TanStack Start (SSR) + React 19 + Tailwind v4 + Supabase (Auth/DB/Storage) + API de IA na VPS (Ollama)**.

---

## Arquitetura

```text
Navegador (React 19)
    │  same-origin
    ▼
Servidor TanStack Start (Nitro, preset node-server, PM2 :3002)
    ├── /api/vps/*            → proxy autenticado para a IA da VPS (Bearer server-side)
    ├── /api/public/weather/* → Open-Meteo (cache em memória + fallback stale)
    ├── /api/public/lightning → provedor de descargas (disabled | openweather | blitzortung)
    └── server functions      → Supabase com o JWT do usuário (RLS) ou service role
    │  HTTPS + Bearer
    ▼
API de IA na VPS → Ollama / gerador de imagem em 127.0.0.1
```

Regras que o código impõe:

- `VISION_AI_API_KEY` nunca vai para o navegador. O browser só chama rotas same-origin `/api/vps/*`.
- `callVpsAI` valida o host contra `VISION_AI_API_URL` (allowlist anti-SSRF) e aplica timeout de 110 s.
- Toda server function passa por `requireSupabaseAuth`; o acesso a dados é filtrado por RLS.
- `supabaseAdmin` (service role) só é importado dinamicamente dentro de handlers de servidor.

---

## Rodando localmente

Pré-requisitos: Node 20+ (ou Bun).

```bash
npm ci
cp .env.example .env      # preencha os valores
npm run dev               # http://localhost:8080
```

## Verificações

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # eslint (0 erros esperados)
npm test             # node:test — validação de entrada e sanitização
npm run build        # gera .output/ (Nitro, preset node-server)
```

## Build e execução em produção

```bash
npm ci
npm run build                       # NITRO_PRESET=node-server já é o padrão do vite.config.ts
node .output/server/index.mjs       # ou: npm start
```

O servidor lê `PORT` e `HOST` do ambiente (o deploy usa `127.0.0.1:3002` atrás do Nginx).

> As variáveis `VITE_*` são embutidas no bundle **durante o build**. Mudou uma delas?
> É preciso buildar de novo — reiniciar o processo não basta.

### PM2

```bash
pm2 start "node .output/server/index.mjs" --name vision --update-env
pm2 save
```

O script `/usr/local/bin/deploy-vision` carrega o `.env` (`set -a; . "$APP/.env"; set +a`) antes de
reiniciar o PM2. Sem isso todo `process.env` fica indefinido e as server functions falham com
`Missing Supabase environment variable(s)`.

---

## Variáveis de ambiente

O contrato completo, comentado, está em [`.env.example`](./.env.example). Resumo:

| Variável                                                                                      | Obrigatória | Papel                                                                                                   |
| --------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`              | sim         | Cliente do navegador (protegido por RLS)                                                                |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID`                             | sim         | Mesmos valores, lidos em runtime pelo servidor                                                          |
| `SUPABASE_SERVICE_ROLE_KEY`                                                                   | sim         | Operações administrativas no servidor — ignora RLS, nunca com prefixo `VITE_`                           |
| `VISION_AI_API_URL`, `VISION_AI_API_KEY`                                                      | para IA     | ÍRIS, chat, análise de foto/vídeo e geração "DEPOIS"                                                    |
| `GEMINI_API_KEY`, `OPENAI_API_KEY`, `FAL_API_KEY`, `REPLICATE_API_TOKEN`, `STABILITY_API_KEY` | inativas    | Roteador multiprovedor em `src/lib/image-providers/` — sem rota que o chame desde a migração para a VPS |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`                                      | para push   | Web Push. Gere com `npx web-push generate-vapid-keys`                                                   |
| `LIGHTNING_PROVIDER`, `OPENWEATHER_API_KEY`                                                   | opcional    | Contagem de raios (`disabled` por padrão)                                                               |

`VALETECH_AI_API_URL` / `VALETECH_AI_API_KEY` continuam aceitas como fallback dos nomes `VISION_*`.

### Degradação sem configuração

O app sobe mesmo sem as variáveis opcionais:

- IA não configurada → `/api/vps/*` responde JSON `503 CONFIG_MISSING` e o banner
  "Servidor de IA local indisponível" aparece no topo das telas autenticadas (nada quebra).
- Push sem VAPID → o envio falha com mensagem nomeando a variável ausente.
- Raios com `LIGHTNING_PROVIDER=disabled` → o painel informa o estado real, sem inventar dado.

Já **sem as variáveis do Supabase o app não funciona**: o cliente lança na primeira query.

---

## Banco de dados

Migrações em `supabase/migrations/`, RLS habilitado em todas as tabelas, papéis via
`public.has_role(user_id, role)` (tabela `user_roles` — nunca uma coluna de papel em `profiles`).

> **Atenção ao provisionar um banco novo:** o histórico atual contém um baseline consolidado
> (`20260728*`) que recria tabelas já criadas pelas migrações de julho, então um
> `supabase db push` do zero falha com "relation already exists". Para um ambiente novo, aplique
> apenas o baseline `20260728*` e marque as anteriores como aplicadas
> (`supabase migration repair --status applied <versão>`). O banco de produção existente
> não é afetado.

---

## Estrutura

```text
src/
  routes/
    _authenticated/     # telas protegidas (dashboard, vision, n3, ambiental, kaizen, intempéries…)
    api/vps/            # proxy autenticado para a IA da VPS
    api/public/         # clima, geocoding e descargas atmosféricas
  lib/
    vps-ai/             # config/cliente server-only + api e hooks do browser
    image-providers/    # roteador multi-provider (configurável, hoje sem rota que o consuma)
    reports/            # PDF, DOCX, XLSX, QR code
    weather/, lightning/, push/, environmental/, safety-plan/
  components/           # UI (shadcn) + módulos de registro, VPS e intempéries
  integrations/supabase # cliente do browser, client.server (service role), middlewares de auth
supabase/migrations/    # schema + RLS
tests/                  # node:test
```
