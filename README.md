# DEIVIDTECH — Copiloto de reuniões com IA

Aplicação web que captura o áudio de uma reunião, transcreve em tempo real, detecta perguntas
dirigidas a você, sugere respostas e gera a ata ao final — tudo salvo na sua conta.

**Live app**: https://deividtech.lovable.app
Este projeto é editável em [Lovable](https://lovable.dev/projects/9b943160-cf6a-4f89-b705-92c2e627e9df).

## Stack

TanStack Start (SSR + server functions) · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui ·
TanStack Query · Supabase (auth, banco e RLS) · vLLM próprio na GPU (inferência e transcrição).

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

### Inferência na sua GPU (vLLM)

Toda a IA — sugestão de resposta, ata, memória, currículo, simulador — e também a
transcrição rodam no **seu** servidor vLLM, acessado pelo túnel da VPS. Nenhuma API de
terceiros é chamada. As variáveis abaixo são lidas **apenas no servidor**; nunca as
prefixe com `VITE_`, senão elas vão parar no bundle do browser.

| Variável | Obrigatória | Para que serve |
| --- | --- | --- |
| `VLLM_BASE_URL` | sim | URL do vLLM, com ou sem `/v1` no fim. Ex.: `https://gpu.suavps.com/v1` |
| `VLLM_API_KEY` | não | Só se o vLLM subiu com `--api-key` (ou se o túnel exige token) |
| `VLLM_MODEL` | não | Id do modelo. Sem isso, usa o primeiro de `/v1/models` |
| `VLLM_TIMEOUT_MS` | não | Espera máxima por geração (padrão `120000`) |
| `VLLM_STT_BASE_URL` | não | URL do servidor de transcrição, se for outro (padrão: `VLLM_BASE_URL`) |
| `VLLM_STT_MODEL` | não | Id do Whisper. Sem isso, procura um modelo com "whisper" no nome |
| `VLLM_STT_API_KEY` | não | Chave só da transcrição (padrão: `VLLM_API_KEY`) |

Exemplo local:

```sh
export VLLM_BASE_URL="https://gpu.suavps.com/v1"
export VLLM_MODEL="Qwen/Qwen2.5-7B-Instruct"
npm run dev
```

Subindo o vLLM na VPS com GPU:

```sh
# Modelo de texto (copiloto, atas, análises)
vllm serve Qwen/Qwen2.5-7B-Instruct --host 0.0.0.0 --port 8000

# Transcrição, em outra porta (o app aceita qualquer servidor compatível com
# /v1/audio/transcriptions: vLLM com Whisper, faster-whisper-server, whisper.cpp)
vllm serve openai/whisper-large-v3-turbo --host 0.0.0.0 --port 8001
```

E no app: `VLLM_BASE_URL=.../v1` para a porta 8000 e `VLLM_STT_BASE_URL=.../v1` para a 8001.

O app não presume que a GPU esteja no ar: `/api/public/health` consulta `/v1/models` pelo
túnel e responde 503 quando o servidor está fora, sem modelo ou com `VLLM_MODEL` divergente,
e a tela `/diagnostico` mostra a latência real medida. Quando a inferência falha, cada tela
exibe o motivo (túnel fora do ar, timeout, fila cheia, credencial recusada) em vez de
mostrar resultado inventado.

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
    vllm.server.ts        # cliente do seu servidor vLLM (GPU)
    meeting.functions.ts  # detecção de perguntas, resposta sugerida, ata
    meetings.functions.ts # CRUD das reuniões no Supabase
    memory.functions.ts   # memória profissional e currículo
    interview.functions.ts# simulador de entrevistas
    stt.server.ts         # transcrição de áudio na sua GPU
    audio-pipeline.ts     # captura, VAD, resample e WAV no browser
  integrations/supabase/  # cliente, middleware de auth e tipos do banco
```
