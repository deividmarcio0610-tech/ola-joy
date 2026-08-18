# Deploy na VPS

> **Escopo fixo desta VPS:** o analisador vive em `/var/www/analisador`, roda
> sob PM2 com o nome `analisador` na porta `8081`, atrás do Nginx existente.
> **Não tocar** nos demais sites da máquina (valetech, vendas, loja) — nem
> nos seus diretórios, nem nos seus blocos de Nginx, nem nos seus processos.

## Pré-requisitos

- **Node.js 22.13+** — o módulo `node:sqlite` existe desde o 22.5, mas só
  dispensa a flag `--experimental-sqlite` a partir do 22.13; em 22.5–22.12 o
  build passa e o servidor morre no boot. O script valida isso e aborta;
- HTTPS no domínio para permitir compartilhamento de tela;
- diretório persistente gravável para SQLite (`/var/lib/analisador`);
- túnel GPU ativo apenas quando a análise por Ollama for necessária.

## Variáveis (produção) — `.env` em `/var/www/analisador/.env`

```env
PORT=8081
DATA_DIR=/var/lib/analisador

# IA na GPU (túnel SSH; nunca exposta ao navegador)
OLLAMA_BASE_URL=http://127.0.0.1:11435
OLLAMA_TEXT_MODEL=qwen3.5:35b
OLLAMA_VISION_MODEL=qwen3.5:35b
OLLAMA_TIMEOUT_MS=300000
AI_TIMEOUT_MS=300000
OLLAMA_HEALTH_TIMEOUT_MS=5000

# ── OBRIGATÓRIAS EM VPS EXPOSTA ─────────────────────────────────────────────
# Sem OPERATOR_TOKEN/ADMIN_TOKEN, o navegador NÃO consegue gravar nem ler os
# dados do T4 através do Nginx (somente loopback funciona). O operador digita
# o token uma vez na interface; o servidor devolve um cookie HttpOnly assinado
# — o token nunca vai ao bundle/localStorage.
ADMIN_TOKEN=defina-um-token-forte           # admin: /claude, /erros, promover/rollback de técnica
OPERATOR_TOKEN=defina-outro-token-forte     # operador: gravação/leitura do T4 (opcional; ADMIN_TOKEN serve)
TRADING_SESSION_SECRET=um-segredo-longo-e-aleatorio   # assinatura das sessões (permite rotacionar tokens)

# Claude Admin (opcional)
# ANTHROPIC_API_KEY=
# ANTHROPIC_MODEL=claude-sonnet-5
# CLAUDE_ADMIN_ALLOW_COMMANDS=1
```

`OLLAMA_VISION_MODEL=qwen3.5:35b` vale porque o qwen3.5:35b instalado na GPU
expõe `capability=vision` (ver `.env.example`). Se a GPU trocar de modelo,
confirme a capacidade multimodal antes de preencher — nunca presuma.

O PM2 não lê `.env` sozinho: o script `deploy/deploy-vps.sh` exporta o arquivo
antes do `pm2 start/restart --update-env`. Se fizer manualmente, use
`set -a; source .env; set +a` antes do comando PM2.

## Caminho recomendado — script pronto

```bash
cd /var/www/analisador
git fetch origin claude/t4-unificacao-finalizacao-tefo0d
git checkout claude/t4-unificacao-finalizacao-tefo0d
git pull origin claude/t4-unificacao-finalizacao-tefo0d
bash deploy/deploy-vps.sh
```

O script é idempotente e **para no primeiro erro**: valida Node ≥ 22.13 e o
`.env`, confere colisão de nome PM2 e de porta, faz backup CONSISTENTE do
SQLite (`VACUUM INTO`, que inclui o WAL), roda os
gates (typecheck + testes + build), sobe/reinicia o PM2 e executa a validação
pós-deploy abaixo. Nada é publicado se um gate falhar.

### Subindo LADO A LADO com um app que já está no ar

Se a máquina já serve outro aplicativo (por exemplo o **T4 EDGE** em
`analisador.dvdswap.com.br`), **não reaproveite o nome nem a porta dele**. O
script detecta os dois casos e aborta com instrução, mas o caminho correto é
escolher identidade própria desde o começo:

```bash
T4_APP_NAME=t4-analisador PORT=8085 DATA_DIR=/var/lib/t4-analisador \
  bash deploy/deploy-vps.sh
```

Estas variáveis de linha de comando **vencem o que estiver no `.env`** — o
script as preserva antes de carregar o arquivo.

Depois aponte um **server block novo** do Nginx (ex.: `t4.dvdswap.com.br`) para
`http://127.0.0.1:8085`. O app antigo continua intocado no domínio dele. Use
também um `DATA_DIR` exclusivo (ex.: `/var/lib/t4-analisador`) para os dois
bancos nunca se misturarem.

## Passo a passo manual (equivalente ao script)

```bash
cd /var/www/analisador

# 1. Dados persistentes + backup do banco antes de qualquer coisa
sudo mkdir -p /var/lib/analisador && sudo chown "$(whoami)" /var/lib/analisador
[ -f /var/lib/analisador/analisador.sqlite ] && \
  cp /var/lib/analisador/analisador.sqlite \
     "/var/lib/analisador/analisador.sqlite.bak.$(date +%Y%m%d%H%M%S)"

# 2. Build validado (não pule os gates)
npm ci            # ou: bun install --frozen-lockfile
npm run typecheck # precisa sair 0
npm test          # precisa sair 0 (328 testes)
npm run build     # precisa sair 0

# 3. Processo PM2 (nome fixo: analisador) com o .env carregado
set -a; source .env; set +a
pm2 restart analisador --update-env 2>/dev/null || \
  pm2 start .output/server/index.mjs --name analisador --update-env
pm2 save
```

A migração do banco (schema 5: auditoria de técnicas) é automática e
idempotente no boot; **a técnica promovida no banco é preservada** —
`STRATEGY_VERSION` do código só semeia banco vazio.

## Validação obrigatória pós-deploy

> Rode NA VPS, contra `127.0.0.1` (loopback é autorizado mesmo com token
> configurado). Pela internet, os mesmos GETs devem responder **401** — isso é
> o certo, não uma falha.

```bash
curl -s http://127.0.0.1:8081/api/health                       # 200, analyzer ok
curl -s http://127.0.0.1:8081/api/health/ai                    # 200 com túnel; 503 sem GPU (sinalização)
curl -s http://127.0.0.1:8081/api/trading/auth/status          # {"authRequired":true,...}
curl -s http://127.0.0.1:8081/api/trading/technique-current    # técnica ativa DO BANCO
curl -s http://127.0.0.1:8081/api/trading/snapshot | grep -o '"status":"PRODUCTION"'

# De fora (troque pelo seu domínio): escrita e leitura anônimas bloqueadas
curl -s -o /dev/null -w '%{http_code}\n' https://SEU-DOMINIO/api/trading/snapshot        # 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://SEU-DOMINIO/api/trading/backtests  # 401/403
```

Na interface: o cartão **“GRAVAÇÃO BLOQUEADA”** aparece no topo — digite o
token uma vez para desbloquear leitura e gravação (cookie de 12 h). A análise
visual funciona mesmo sem desbloquear; só a persistência exige a sessão.

`technique-current` deve mostrar a técnica ativa do banco (`origin:
"BOOTSTRAP"` na primeira instalação; `"PROMOTION"`/`"ROLLBACK"` depois), com
3 contratos e RR mínimo 3. `/api/health` responde 200 mesmo com a IA fora do
ar; só `/api/health/ai` retorna 503 nesse caso — sinalização, não falha.

Teste direto do túnel GPU (na VPS, quando a GPU estiver ligada):

```bash
curl http://127.0.0.1:11435/api/tags
```

## Nginx

Mantenha o domínio/SSL existentes e encaminhe apenas o server block do
analisador para `http://127.0.0.1:8081` (`proxy_pass`). Não altere os blocos
de valetech/vendas/loja. Nunca exponha a porta do Ollama (11435) nem a porta
8081 diretamente à internet.

No bloco do analisador, os cabeçalhos abaixo são **necessários** para a
autenticação (cookie `Secure` + detecção correta de cliente remoto):

```nginx
location / {
    proxy_pass http://127.0.0.1:8081;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    # gravação envia chunks binários de vídeo:
    client_max_body_size 25m;
}
```

## Rollback do deploy

```bash
cd /var/www/analisador
git log --oneline -5                # escolha o commit anterior validado
git checkout <commit-anterior>
npm ci && npm run build
set -a; source .env; set +a
pm2 restart analisador --update-env
```

O banco não precisa de rollback: as migrações são aditivas e a técnica ativa
vive no banco, não no código. Se precisar restaurar dados, use o
`analisador.sqlite.bak.*` criado no passo 1 (com o PM2 parado).
