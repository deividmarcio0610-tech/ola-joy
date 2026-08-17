import { createFileRoute, Link } from "@tanstack/react-router";
import { APP_CONFIG } from "@/lib/app-config";
import { Shield, Lock, Eye, ArrowLeft, Database, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/security")({
  component: SecurityPage,
});

function SecurityPage() {
  return (
    <div className="min-h-screen bg-black text-white p-8 md:p-20 font-sans animate-in fade-in duration-700">
      <div className="max-w-3xl mx-auto space-y-12">
        <Button
          variant="ghost"
          asChild
          className="text-white/40 hover:text-white -ml-4 rounded-full"
        >
          <Link to="/">
            <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
          </Link>
        </Button>

        <div className="space-y-4">
          <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-emerald-500">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight">Segurança & Conformidade</h1>
          <p className="text-white/40 font-medium">Enterprise-grade security by default.</p>
        </div>

        <div className="max-w-3xl space-y-12 text-white/60 leading-relaxed text-sm">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-white">
              <Lock className="w-5 h-5 text-white/40" />
              <h2 className="text-xl font-bold">Proteção de Dados (RLS)</h2>
            </div>
            <p className="bg-white/5 p-6 rounded-2xl border border-white/5">
              Toda a infraestrutura do {APP_CONFIG.name} é construída sobre o Lovable Cloud,
              garantindo isolamento total de dados entre usuários através de políticas de Row-Level
              Security (RLS) rigorosas. Seus dados nunca são acessíveis por outros usuários.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-white">
              <Eye className="w-5 h-5 text-white/40" />
              <h2 className="text-xl font-bold">Memória Privada e RAG</h2>
            </div>
            <p className="bg-white/5 p-6 rounded-2xl border border-white/5">
              Sua "Minha IA" é um silo isolado. A recuperação semântica (RAG) ocorre apenas dentro
              do contexto da sua conta, sem vazamento de contexto para outros usuários ou empresas.
              Não utilizamos seus dados para treinar modelos públicos.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 bg-white/[0.02] border border-white/5 rounded-2xl space-y-3">
              <Database className="w-5 h-5 text-white/20" />
              <h3 className="font-bold text-white text-xs uppercase tracking-widest">
                Criptografia
              </h3>
              <p className="text-xs text-white/40">
                Dados em repouso (AES-256) e em trânsito (TLS 1.3).
              </p>
            </div>
            <div className="p-6 bg-white/[0.02] border border-white/5 rounded-2xl space-y-3">
              <Globe className="w-5 h-5 text-white/20" />
              <h3 className="font-bold text-white text-xs uppercase tracking-widest">Compliance</h3>
              <p className="text-xs text-white/40">
                Alinhado com as melhores práticas de LGPD e GDPR.
              </p>
            </div>
          </div>
        </div>

        <footer className="pt-20 border-t border-white/5 text-[10px] font-bold text-white/20 uppercase tracking-widest text-center">
          {APP_CONFIG.name} Security Architecture
        </footer>
      </div>
    </div>
  );
}
