import { useEffect, useState } from "react";
import { Lock, Unlock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  loginTradingOperator,
  refreshTradingAuth,
  subscribeTradingAuth,
  tradingAuthState,
  type TradingAuthState,
} from "@/lib/tradingSession";

/**
 * DESBLOQUEIO DA GRAVAÇÃO DO T4.
 *
 * O token do operador é digitado AQUI, em runtime, e enviado uma única vez ao
 * backend — que responde com um cookie HttpOnly assinado. O segredo não fica
 * no bundle, não vai para localStorage e o JavaScript sequer consegue ler a
 * sessão resultante.
 *
 * A LEITURA e toda a análise visual continuam funcionando sem autenticação:
 * só a PERSISTÊNCIA exige a sessão, então nada de operação ao vivo depende
 * deste cartão para rodar.
 */
export function TradingAuthGate() {
  const [state, setState] = useState<TradingAuthState>(tradingAuthState());
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeTradingAuth(setState);
    void refreshTradingAuth();
    return unsubscribe;
  }, []);

  if (!state.authRequired || state.authenticated) return null;

  const unlock = async () => {
    setBusy(true);
    setError(null);
    const result = await loginTradingOperator(token).catch((raised: unknown) => ({
      ok: false as const,
      error: raised instanceof Error ? raised.message : String(raised),
    }));
    setBusy(false);
    if (result.ok) {
      setToken("");
      return;
    }
    setError(result.error ?? "Não foi possível autenticar.");
  };

  return (
    <Card className="flex flex-wrap items-center gap-2 border-warn/50 bg-warn/10 p-3">
      <Lock className="h-4 w-4 shrink-0 text-warn" />
      <div className="min-w-[220px] flex-1">
        <p className="text-[11px] font-semibold text-warn">
          GRAVAÇÃO BLOQUEADA — sessão de operador necessária
        </p>
        <p className="text-[10px] text-muted-foreground">
          A análise roda normalmente, mas sessões, candles, eventos e backtests não serão
          persistidos até o desbloqueio. O token fica só no servidor.
        </p>
      </div>
      <Input
        type="password"
        value={token}
        placeholder="Token do operador"
        className="h-8 w-56"
        autoComplete="off"
        onChange={(event) => setToken(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void unlock();
        }}
      />
      <Button size="sm" disabled={busy || token.trim().length === 0} onClick={() => void unlock()}>
        <Unlock className="mr-1.5 h-3.5 w-3.5" />
        {busy ? "Validando…" : "Desbloquear"}
      </Button>
      {error && <p className="basis-full text-[10px] text-bear">{error}</p>}
    </Card>
  );
}
