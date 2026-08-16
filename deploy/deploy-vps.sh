#!/usr/bin/env bash
# =============================================================================
# Deploy do ANALISADOR T4 na VPS — idempotente, para no primeiro erro.
#
# Uso (na VPS, dentro de /var/www/analisador, já no commit desejado):
#   bash deploy/deploy-vps.sh
#
# O que ele faz, nesta ordem:
#   1. valida o .env (tokens obrigatórios para VPS exposta);
#   2. garante DATA_DIR e faz BACKUP do SQLite antes de qualquer mudança;
#   3. roda os gates: npm ci + typecheck + testes + build (falhou = não publica);
#   4. sobe/reinicia o PM2 `analisador` com o .env carregado;
#   5. validação pós-deploy via loopback (health, auth, técnica ativa).
#
# Ele NÃO toca em Nginx, SSL, outros sites ou no túnel da GPU.
# =============================================================================
set -euo pipefail

APP_NAME="analisador"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

log()  { printf '\n\033[1;36m[deploy]\033[0m %s\n' "$*"; }
fail() { printf '\n\033[1;31m[deploy] ERRO:\033[0m %s\n' "$*" >&2; exit 1; }

# ── 1. .env ──────────────────────────────────────────────────────────────────
[ -f .env ] || fail "Arquivo .env não encontrado em $APP_DIR. Copie de .env.example e preencha (ver docs/DEPLOY.md)."
set -a; # exporta tudo que o .env definir
# shellcheck disable=SC1091
source .env
set +a

PORT="${PORT:-8081}"
DATA_DIR="${DATA_DIR:-/var/lib/analisador}"

if [ -z "${ADMIN_TOKEN:-}" ] && [ -z "${OPERATOR_TOKEN:-}" ]; then
  fail "Defina ADMIN_TOKEN (e opcionalmente OPERATOR_TOKEN) no .env — sem eles o navegador não lê nem grava os dados do T4 através do Nginx."
fi

# ── 2. dados persistentes + backup ───────────────────────────────────────────
log "Dados persistentes em $DATA_DIR"
mkdir -p "$DATA_DIR" 2>/dev/null || sudo mkdir -p "$DATA_DIR"
[ -w "$DATA_DIR" ] || fail "$DATA_DIR não é gravável pelo usuário atual (chown antes do deploy)."

DB_FILE="${DATABASE_PATH:-$DATA_DIR/analisador.sqlite}"
if [ -f "$DB_FILE" ]; then
  BACKUP="$DB_FILE.bak.$(date +%Y%m%d%H%M%S)"
  cp "$DB_FILE" "$BACKUP"
  log "Backup do banco: $BACKUP"
else
  log "Primeira instalação: banco será criado no boot (técnica semeada = T4.0.0)."
fi

# ── 3. gates de qualidade ────────────────────────────────────────────────────
log "Instalando dependências (npm ci)…"
npm ci --no-audit --no-fund

log "Gate 1/3: typecheck"
npm run typecheck

log "Gate 2/3: testes"
npm test

log "Gate 3/3: build"
npm run build

# ── 4. PM2 ───────────────────────────────────────────────────────────────────
command -v pm2 >/dev/null 2>&1 || fail "pm2 não encontrado no PATH."
log "Publicando processo PM2 '$APP_NAME' na porta $PORT…"
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$APP_NAME" --update-env
else
  pm2 start .output/server/index.mjs --name "$APP_NAME" --update-env
fi
pm2 save

# ── 5. validação pós-deploy (loopback é autorizado mesmo com token) ─────────
log "Aguardando o servidor responder…"
for _ in $(seq 1 40); do
  curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break
  sleep 0.5
done
curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null || {
  pm2 logs "$APP_NAME" --lines 30 --nostream || true
  fail "/api/health não respondeu 200 — deploy NÃO validado."
}

AUTH_STATUS=$(curl -s "http://127.0.0.1:$PORT/api/trading/auth/status")
echo "$AUTH_STATUS" | grep -q '"authRequired":true' \
  || fail "auth/status não reporta authRequired=true — confira os tokens no .env. Resposta: $AUTH_STATUS"

TECH=$(curl -s "http://127.0.0.1:$PORT/api/trading/technique-current")
echo "$TECH" | grep -q '"status":"PRODUCTION"' \
  || fail "Nenhuma técnica PRODUCTION ativa — resposta: $TECH"

AI=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/health/ai")

log "Deploy validado."
printf '  health:            200\n'
printf '  auth exigida:      sim\n'
printf '  tecnica ativa:     %s\n' "$(echo "$TECH" | grep -o '"version":"[^"]*"' | head -1)"
printf '  health da IA:      HTTP %s %s\n' "$AI" "$([ "$AI" = "200" ] && echo '(GPU ok)' || echo '(GPU fora — sinalização, não falha)')"
printf '\nDe fora, GET/POST anônimos em /api/trading devem responder 401/403 — teste com:\n'
printf '  curl -s -o /dev/null -w "%%{http_code}\\n" https://SEU-DOMINIO/api/trading/snapshot\n'
