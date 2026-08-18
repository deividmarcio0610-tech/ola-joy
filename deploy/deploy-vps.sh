#!/usr/bin/env bash
# =============================================================================
# Deploy do ANALISADOR T4 na VPS — idempotente, para no primeiro erro.
#
# Uso (na VPS, dentro da pasta do projeto, já no commit desejado):
#   bash deploy/deploy-vps.sh
#
# Convivência com outros apps da máquina (valetech, vendas, loja, T4 EDGE):
#   este script NUNCA toca em processo que não seja o seu. Ele confere nome de
#   processo PM2 e porta ANTES de publicar e ABORTA se pertencerem a outro app.
#   Para subir lado a lado, escolha nome/porta próprios:
#     T4_APP_NAME=t4-analisador PORT=8085 bash deploy/deploy-vps.sh
#
# O que ele faz, nesta ordem:
#   1. valida Node >= 22.13 (node:sqlite sem flag) e o .env (tokens obrigatórios);
#   2. confere colisão de nome PM2 e de porta com apps já existentes;
#   3. garante DATA_DIR e faz BACKUP do SQLite antes de qualquer mudança;
#   4. roda os gates: npm ci + typecheck + testes + build (falhou = não publica);
#   5. sobe/reinicia o PM2 com o .env carregado;
#   6. validação pós-deploy via loopback (health, auth, técnica ativa).
#
# Ele NÃO toca em Nginx, SSL, outros sites ou no túnel da GPU.
# =============================================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

APP_NAME="${T4_APP_NAME:-analisador}"
ENTRY="$APP_DIR/.output/server/index.mjs"

log()  { printf '\n\033[1;36m[deploy]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[deploy] atenção:\033[0m %s\n' "$*"; }
fail() { printf '\n\033[1;31m[deploy] ERRO:\033[0m %s\n' "$*" >&2; exit 1; }

# ── 1a. Node ────────────────────────────────────────────────────────────────
# O repositório usa `node:sqlite` (DatabaseSync), sem flag só a partir do 22.13.
# Sem esta checagem, o build passa e o servidor morre no boot com
# "Cannot find module 'node:sqlite'" — erro que não explica a causa.
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
NODE_MINOR="$(node -p 'process.versions.node.split(".")[1]' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 13 ]; }; then
  fail "Node $(node -v 2>/dev/null || echo 'ausente') é insuficiente. O analisador exige Node >= 22.13: o módulo node:sqlite existe desde o 22.5, mas só deixou de precisar da flag --experimental-sqlite no 22.13. Em 22.5–22.12 o build passa e o servidor morre no boot. Instale/ative o Node 22 LTS atual (ex.: nvm install 22 && nvm use 22)."
fi
# Confirma na prática, não só pelo número da versão: distribuições customizadas
# podem compilar sem o módulo.
node -e "require('node:sqlite')" >/dev/null 2>&1 \
  || fail "Este Node não expõe 'node:sqlite' (necessário para o banco do analisador). Atualize para o Node 22.13+ oficial."

# ── 1b. .env ────────────────────────────────────────────────────────────────
[ -f .env ] || fail "Arquivo .env não encontrado em $APP_DIR. Copie de .env.example e preencha (ver docs/DEPLOY.md)."

# Guarda os overrides de LINHA DE COMANDO antes do source: `source .env`
# sobrescreve variáveis já definidas, então sem isto o `PORT=8085 bash
# deploy-vps.sh` do fluxo lado-a-lado era silenciosamente revertido para o
# PORT do .env — o script publicava na porta errada achando que obedeceu.
CLI_APP_NAME="${T4_APP_NAME:-}"
CLI_PORT="${PORT:-}"
CLI_DATA_DIR="${DATA_DIR:-}"

set -a # exporta tudo que o .env definir
# shellcheck disable=SC1091
source .env
set +a

# A escolha explícita de quem chamou o script vence o .env.
if [ -n "$CLI_APP_NAME" ]; then APP_NAME="$CLI_APP_NAME"; fi
if [ -n "$CLI_PORT" ]; then PORT="$CLI_PORT"; fi
if [ -n "$CLI_DATA_DIR" ]; then DATA_DIR="$CLI_DATA_DIR"; fi

# EXPORT explícito: os defaults abaixo precisam existir no ambiente do PM2, não
# só neste shell. Sem export, um .env sem PORT fazia o Nitro subir em 3000
# (default dele) enquanto o script validava 8081 e o Nginx devolvia 502; e um
# .env sem DATA_DIR gravava o banco em ./data dentro da árvore do git, com o
# backup apontando para outro arquivo.
export PORT="${PORT:-8081}"
export DATA_DIR="${DATA_DIR:-/var/lib/analisador}"
# Bind em loopback: quem publica na internet é o Nginx. Sem isto o Nitro
# escuta em 0.0.0.0 e a porta fica alcançável direto, contornando o proxy.
export NITRO_HOST="${NITRO_HOST:-127.0.0.1}"

if [ -z "${ADMIN_TOKEN:-}" ] && [ -z "${OPERATOR_TOKEN:-}" ]; then
  fail "Defina ADMIN_TOKEN (e opcionalmente OPERATOR_TOKEN) no .env — sem eles o navegador não lê nem grava os dados do T4 através do Nginx."
fi

command -v pm2 >/dev/null 2>&1 || fail "pm2 não encontrado no PATH."

# ── 2a. colisão de NOME no PM2 ──────────────────────────────────────────────
# `pm2 restart <nome>` reinicia o script JÁ REGISTRADO naquele nome. Se o nome
# pertencer a OUTRO app (ex.: o T4 EDGE que serve analisador.dvdswap.com.br),
# um "deploy" reiniciaria o app errado e não publicaria nada deste repositório.
EXISTING_SCRIPT="$(pm2 jlist 2>/dev/null | node -e "
  let raw='';
  process.stdin.on('data', (chunk) => (raw += chunk)).on('end', () => {
    try {
      const list = JSON.parse(raw || '[]');
      const found = list.find((item) => item.name === process.argv[1]);
      process.stdout.write(found?.pm2_env?.pm_exec_path || '');
    } catch { process.stdout.write(''); }
  });
" "$APP_NAME" || true)"

if [ -n "$EXISTING_SCRIPT" ] && [ "$EXISTING_SCRIPT" != "$ENTRY" ]; then
  fail "Já existe um processo PM2 chamado '$APP_NAME' apontando para OUTRO aplicativo:
    $EXISTING_SCRIPT
  Este deploy publicaria $ENTRY. Para não derrubar o app existente, rode com um nome próprio:
    T4_APP_NAME=t4-analisador PORT=8085 bash deploy/deploy-vps.sh"
fi

# ── 2b. colisão de PORTA ────────────────────────────────────────────────────
# Porta ocupada por outro app = o Nitro morre no boot com EADDRINUSE, e o
# sintoma (site fora do ar) aparece depois do deploy "ter dado certo".
if [ -z "$EXISTING_SCRIPT" ]; then
  PORT_BUSY="$(node -e "
    const net = require('node:net');
    const socket = net.connect({ host: '127.0.0.1', port: Number(process.argv[1]) });
    socket.setTimeout(1200);
    const done = (value) => { process.stdout.write(value); process.exit(0); };
    socket.on('connect', () => { socket.destroy(); done('busy'); });
    socket.on('error', () => done(''));
    socket.on('timeout', () => { socket.destroy(); done(''); });
  " "$PORT" || true)"
  if [ "$PORT_BUSY" = "busy" ]; then
    fail "A porta $PORT já está em uso por outro serviço nesta VPS (provavelmente o app que já está no ar).
  Escolha uma porta livre para o analisador e aponte o server block do Nginx para ela:
    T4_APP_NAME=t4-analisador PORT=8085 bash deploy/deploy-vps.sh"
  fi
fi

# ── 3. dados persistentes + backup ──────────────────────────────────────────
log "Dados persistentes em $DATA_DIR"
mkdir -p "$DATA_DIR" 2>/dev/null || sudo mkdir -p "$DATA_DIR"
[ -w "$DATA_DIR" ] || fail "$DATA_DIR não é gravável pelo usuário atual (chown antes do deploy)."

DB_FILE="${DATABASE_PATH:-$DATA_DIR/analisador.sqlite}"
if [ -f "$DB_FILE" ]; then
  BACKUP="$DB_FILE.bak.$(date +%Y%m%d%H%M%S)"
  # O banco roda em WAL (PRAGMA journal_mode=WAL): um `cp` do arquivo principal
  # com a aplicação no ar deixa de fora tudo que ainda está no -wal, gerando um
  # backup rasgado ou defasado justamente quando ele mais importa. `VACUUM INTO`
  # produz um snapshot CONSISTENTE, já com o WAL aplicado.
  if node -e "
    const { DatabaseSync } = require('node:sqlite');
    const source = new DatabaseSync(process.argv[1], { readOnly: true });
    source.exec(\`VACUUM INTO '\${process.argv[2].replace(/'/g, \"''\")}'\`);
    source.close();
  " "$DB_FILE" "$BACKUP" 2>/dev/null; then
    log "Backup consistente do banco (VACUUM INTO): $BACKUP"
  else
    # Fallback: copia o trio principal/-wal/-shm para não ficar sem backup.
    cp "$DB_FILE" "$BACKUP"
    [ -f "$DB_FILE-wal" ] && cp "$DB_FILE-wal" "$BACKUP-wal"
    [ -f "$DB_FILE-shm" ] && cp "$DB_FILE-shm" "$BACKUP-shm"
    warn "VACUUM INTO indisponível; backup feito por cópia de arquivo (principal + WAL): $BACKUP"
  fi
  log "A migração para o schema 5 é aditiva (ALTER TABLE) e PRESERVA a técnica ativa."
else
  log "Primeira instalação: banco será criado no boot (técnica semeada = versão do código)."
fi

# ── 4. gates de qualidade ───────────────────────────────────────────────────
log "Instalando dependências (npm ci)…"
npm ci --no-audit --no-fund

log "Gate 1/3: typecheck"
npm run typecheck

log "Gate 2/3: testes"
npm test

log "Gate 3/3: build"
npm run build

[ -f "$ENTRY" ] || fail "Build não gerou $ENTRY."

# ── 5. PM2 ──────────────────────────────────────────────────────────────────
log "Publicando processo PM2 '$APP_NAME' na porta $PORT…"
if [ -n "$EXISTING_SCRIPT" ]; then
  pm2 restart "$APP_NAME" --update-env
else
  pm2 start "$ENTRY" --name "$APP_NAME" --update-env
fi
pm2 save

# ── 6. validação pós-deploy (loopback é autorizado mesmo com token) ─────────
log "Aguardando o servidor responder…"
for _ in $(seq 1 40); do
  curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break
  sleep 0.5
done
curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null || {
  pm2 logs "$APP_NAME" --lines 40 --nostream || true
  fail "/api/health não respondeu 200 — deploy NÃO validado. Log do PM2 acima."
}

AUTH_STATUS=$(curl -s "http://127.0.0.1:$PORT/api/trading/auth/status")
echo "$AUTH_STATUS" | grep -q '"authRequired":true' \
  || fail "auth/status não reporta authRequired=true — confira os tokens no .env. Resposta: $AUTH_STATUS"

TECH=$(curl -s "http://127.0.0.1:$PORT/api/trading/technique-current")
echo "$TECH" | grep -q '"status":"PRODUCTION"' \
  || fail "Nenhuma técnica PRODUCTION ativa — resposta: $TECH"

BOOT=$(curl -s "http://127.0.0.1:$PORT/api/trading/snapshot" | node -e "
  let raw='';
  process.stdin.on('data', (chunk) => (raw += chunk)).on('end', () => {
    try {
      const boot = JSON.parse(raw).database.techniqueBootstrap;
      process.stdout.write(boot.action + (boot.problem ? ' — ' + boot.problem : ''));
    } catch { process.stdout.write('desconhecido'); }
  });
")
AI=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/health/ai")

log "Deploy validado."
printf '  processo PM2:      %s (porta %s)\n' "$APP_NAME" "$PORT"
printf '  health:            200\n'
printf '  auth exigida:      sim\n'
printf '  tecnica ativa:     %s\n' "$(echo "$TECH" | grep -o '"version":"[^"]*"' | head -1)"
printf '  boot da tecnica:   %s\n' "$BOOT"
printf '  health da IA:      HTTP %s %s\n' "$AI" "$([ "$AI" = "200" ] && echo '(GPU ok)' || echo '(GPU fora — sinalizacao, nao falha)')"
printf '\nAponte o Nginx para http://127.0.0.1:%s e teste de fora:\n' "$PORT"
printf '  curl -s -o /dev/null -w "%%{http_code}\\n" https://SEU-DOMINIO/api/trading/snapshot   # deve ser 401\n'
