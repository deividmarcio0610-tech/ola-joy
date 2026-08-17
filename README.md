# DEIVIDTECH — Copiloto de reuniões com IA

Aplicação web que captura o áudio de uma reunião, transcreve em tempo real, detecta perguntas
dirigidas a você, sugere respostas e gera a ata ao final — tudo salvo na sua conta.

**Live app**: https://deividtech.lovable.app
Este projeto é editável em [Lovable](https://lovable.dev/projects/9b943160-cf6a-4f89-b705-92c2e627e9df).

## Stack

TanStack Start (SSR + server functions) · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui ·
TanStack Query · Supabase (auth, banco e RLS) · Lovable AI Gateway (transcrição e IA).

## Rodando localmente

Requer Node.js 20+.

```sh
npm install
npm run dev
```

O app sobe em `http://localhost:8080`.

Outros scripts: `npm run build` (build de produção), `npm run preview`, `npm run lint`,
`npm run format`.

## Variáveis de ambiente

As variáveis do Supabase já vêm no `.env` (chaves publicáveis, seguras no cliente):

| Variável | Onde é usada |
| --- | --- |
| `VITE_SUPABASE_URL` / `SUPABASE_URL` | cliente e middleware de autenticação |
| `VITE_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_PUBLISHABLE_KEY` | cliente e middleware de autenticação |
| `VITE_SUPABASE_PROJECT_ID` | referência do projeto |

Além delas, o servidor precisa de uma chave **secreta**, que nunca deve ser commitada nem
prefixada com `VITE_` (senão vaza para o browser):

| Variável | Obrigatória para | Se faltar |
| --- | --- | --- |
| `LOVABLE_API_KEY` | transcrição (STT) e todas as funções de IA | a transcrição falha com `STT_CONFIG` e as telas de IA mostram "IA não configurada" |
| `LOVABLE_AI_MODEL` | opcional; troca o modelo padrão (`google/gemini-2.5-flash`) | usa o padrão |
| `SUPABASE_SERVICE_ROLE_KEY` | opcional; só para rotinas administrativas no servidor | nenhum efeito no app |

No Lovable Cloud a `LOVABLE_API_KEY` é injetada automaticamente. Localmente, exporte antes de
subir o servidor:

```sh
export LOVABLE_API_KEY="sua-chave"
npm run dev
```

## Banco de dados

As migrations ficam em `supabase/migrations` e rodam do zero com `supabase db reset`.
As tabelas usadas pelo app são `meeting_sessions` (reuniões, transcrições, decisões, ações e
pendências), `professional_memories` (memória profissional) e `resumes` (currículo analisado).
Todas têm Row-Level Security por `user_id`: cada usuário só acessa os próprios dados.

`supabase/_arquivo/` guarda um schema antigo e divergente, mantido apenas como referência —
não é aplicado.

## Estrutura

```
src/
  routes/                 # rotas por arquivo (TanStack Router)
    auth.tsx              # login e cadastro
    _authenticated/       # área logada (layout com guarda de sessão)
    api/public/health.ts  # health check
  lib/
    ai-gateway.server.ts  # ponte com o Lovable AI Gateway
    meeting.functions.ts  # detecção de perguntas, resposta sugerida, ata
    meetings.functions.ts # CRUD das reuniões no Supabase
    memory.functions.ts   # memória profissional e currículo
    interview.functions.ts# simulador de entrevistas
    stt.server.ts         # transcrição de áudio
    audio-pipeline.ts     # captura, VAD, resample e WAV no browser
  integrations/supabase/  # cliente, middleware de auth e tipos do banco
```
