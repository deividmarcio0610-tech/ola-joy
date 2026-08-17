import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, LogIn, Mail, Lock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { APP_CONFIG } from "@/lib/app-config";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  // Quem já está autenticado não precisa ver esta tela.
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) {
        navigate({ to: "/copiloto" });
        return;
      }
      setCheckingSession(false);
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/copiloto` },
        });
        if (error) throw error;
        toast.success(
          "Conta criada. Se a confirmação por e-mail estiver ativa, verifique sua caixa de entrada.",
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }

      const { data } = await supabase.auth.getSession();
      if (data.session) {
        navigate({ to: "/copiloto" });
      }
    } catch (err) {
      toast.error(String((err as Error)?.message ?? err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setIsSubmitting(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/copiloto`,
      });
      if (result.error) throw result.error;
      if (!result.redirected) navigate({ to: "/copiloto" });
    } catch (err) {
      toast.error(`Falha no login com Google: ${String((err as Error)?.message ?? err)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 text-emerald-500">
            <Sparkles className="w-5 h-5" />
            <span className="text-[10px] font-bold uppercase tracking-[0.3em]">
              {APP_CONFIG.name}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            {mode === "login" ? "Entrar na sua conta" : "Criar sua conta"}
          </h1>
          <p className="text-sm text-white/40">{APP_CONFIG.motto}</p>
        </div>

        <Card className="bg-white/[0.02] border-white/5 rounded-2xl p-6">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label
                htmlFor="email"
                className="text-[10px] font-bold uppercase tracking-widest text-white/40"
              >
                E-mail
              </Label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@empresa.com"
                  className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/20"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="password"
                className="text-[10px] font-bold uppercase tracking-widest text-white/40"
              >
                Senha
              </Label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo de 6 caracteres"
                  className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/20"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-white text-black hover:bg-white/90 rounded-full font-bold"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <LogIn className="w-4 h-4 mr-2" />
                  {mode === "login" ? "ENTRAR" : "CRIAR CONTA"}
                </>
              )}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3 text-[9px] font-bold uppercase tracking-widest text-white/20">
            <span className="h-px flex-1 bg-white/10" />
            ou
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={handleGoogle}
            className="w-full rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10"
          >
            Continuar com Google
          </Button>

          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="mt-6 w-full text-center text-xs text-white/40 hover:text-white transition-colors"
          >
            {mode === "login" ? "Não tem conta? Cadastre-se" : "Já tem conta? Entrar"}
          </button>
        </Card>

        <p className="text-center text-[10px] text-white/20">
          Ao continuar você concorda com os{" "}
          <Link to="/terms" className="underline hover:text-white/60">
            Termos
          </Link>{" "}
          e a{" "}
          <Link to="/privacy" className="underline hover:text-white/60">
            Política de Privacidade
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
