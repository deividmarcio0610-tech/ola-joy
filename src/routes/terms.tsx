import { createFileRoute, Link } from "@tanstack/react-router";
import { APP_CONFIG } from "@/lib/app-config";
import { ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
});

function TermsPage() {
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
            <FileText className="w-6 h-6" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight">Termos de Uso</h1>
          <p className="text-white/40 font-medium">Última atualização: 12 de Agosto de 2026</p>
        </div>

        <div className="max-w-3xl space-y-10 text-white/60 leading-relaxed text-sm">
          <section className="space-y-4">
            <p>
              Bem-vindo ao {APP_CONFIG.name}. Ao utilizar nossa plataforma, você concorda com os
              termos aqui descritos.
            </p>
            <h2 className="text-xl font-bold text-white mt-8">1. Uso do Copiloto</h2>
            <p>
              Nosso sistema de IA processa áudio e vídeo em tempo real para fins de assistência
              profissional. Você é responsável por garantir que tem permissão para gravar e
              processar as conversas em que utiliza a ferramenta.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-white mt-8">2. Propriedade Intelectual</h2>
            <p>
              Todo o conteúdo gerado pelo usuário e as memórias profissionais pertencem ao usuário,
              sendo protegidos por criptografia e RLS.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-white mt-8">3. Limitação de Responsabilidade</h2>
            <p>
              O {APP_CONFIG.name} é uma ferramenta de assistência. Decisões profissionais tomadas
              com base nas sugestões da IA são de inteira responsabilidade do usuário.
            </p>
          </section>
        </div>

        <footer className="pt-20 border-t border-white/5 text-[10px] font-bold text-white/20 uppercase tracking-widest text-center">
          {APP_CONFIG.name} Legal & Compliance Team
        </footer>
      </div>
    </div>
  );
}
