import { createFileRoute, Link } from "@tanstack/react-router";
import { APP_CONFIG } from "@/lib/app-config";
import { ArrowLeft, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
});

function PrivacyPage() {
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
          <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-white/40">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight">Política de Privacidade</h1>
          <p className="text-white/40 font-medium">Última atualização: 12 de Agosto de 2026</p>
        </div>

        <div className="space-y-10 text-white/60 leading-relaxed text-sm">
          <section className="space-y-4">
            <p>Sua privacidade é nossa prioridade absoluta no {APP_CONFIG.name}.</p>
            <h2 className="text-xl font-bold text-white mt-8">1. Coleta de Dados</h2>
            <p>
              Coletamos apenas as informações necessárias para o funcionamento do Copiloto e da
              Minha IA, como currículos e registros de reuniões processados sob sua demanda.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-white mt-8">2. Segurança</h2>
            <p>
              Utilizamos Row-Level Security (RLS) e criptografia de ponta a ponta. Seus dados nunca
              são utilizados para treinar modelos globais sem seu consentimento explícito.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-white mt-8">3. Seus Direitos</h2>
            <p>
              Você tem o direito de exportar ou excluir permanentemente todos os seus dados
              armazenados em nossa plataforma a qualquer momento através do seu perfil.
            </p>
          </section>
        </div>

        <footer className="pt-20 border-t border-white/5 text-[10px] font-bold text-white/20 uppercase tracking-widest text-center">
          {APP_CONFIG.name} Security & Compliance Team
        </footer>
      </div>
    </div>
  );
}
