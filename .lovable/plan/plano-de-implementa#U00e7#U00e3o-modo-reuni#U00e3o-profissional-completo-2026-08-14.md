# Plano de Implementação: Modo Reunião Profissional Completo

Implementar o Modo Reunião no DEIVIDTECH AI com transcrição contínua, detecção de perguntas direcionadas ao usuário (Deivid), geração de respostas sugeridas pela IA, extração automática de decisões/ações e geração de ata final estruturada.

## 1. Infraestrutura de Dados e Backend

- **Schema do Banco de Dados**: Criar migração para a tabela `meeting_sessions` para armazenar transcrições, inteligência extraída e referências de ata.
- **Server Functions (`src/lib/meeting.functions.ts`)**:
    - `analyzeMeetingContext`: Detectar perguntas direcionadas ao Deivid via LLM/Regras.
    - `getSuggestedResponse`: Gerar resposta baseada no contexto da reunião e "Minha IA".
    - `extractMeetingIntelligence`: Extrair decisões, ações e pendências incrementalmente.
    - `generateMeetingMinutes`: Consolidar a transcrição e inteligência em uma ata estruturada.

## 2. Interface do Copilot (`src/routes/_authenticated/copiloto.tsx`)

- **Modos de Tema**: Adicionar os novos modos: `REUNIÃO`, `REUNIÃO TÉCNICA`, `APRESENTAÇÃO`, `ENTREVISTA`, `LIVRE`.
- **Layout de Reunião**:
    - Header com Status (MODO, STATUS, DURAÇÃO).
    - Barra Lateral com Tabs: `TRANSCRIÇÃO`, `PERGUNTAS`, `DECISÕES`, `AÇÕES`, `PENDÊNCIAS`, `ATA`.
- **Painel de Pergunta**: Componente `⚡ PERGUNTA PARA VOCÊ` com destaque visual e streaming da resposta sugerida.
- **Transcrição Contínua**: Refatorar o pipeline para garantir que o STT não pare enquanto a IA processa respostas.
- **Diarização (Mock/Prep)**: Estrutura para `speakerId` e rotulagem manual de falantes.

## 3. Gestão de Atas e Persistência

- **Finalização de Reunião**: Fluxo para parar captura, fechar buffers e disparar a geração da ata final.
- **Página de Ata (`src/routes/_authenticated/atas.tsx`)**:
    - Visualização completa da ata gerada (Objetivo, Decisões, Ações, Prazos).
    - Link de rastreabilidade para o trecho exato da transcrição.
    - Funcionalidade de Edição e Exportação (PDF/DOCX).

## Detalhes Técnicos

- **Detecção de Pergunta**: Priorizar menções diretas a "Deivid" e usar contexto recente dos últimos 5 blocos de fala.
- **Performance**: Usar `requestAnimationFrame` para medidores e garantir que chamadas de IA sejam assíncronas para não bloquear o áudio.
- **Integridade**: Garantir que a IA nunca invente informações na ata; usar "Não definido" quando dados estiverem ausentes.

```text
Arquitetura STT/IA:
[Áudio] -> [STT Stream] -> [Transcript Store] -> [Question Detector] -> [AI Suggestion]
                                             -> [Intelligence Extractor] -> [Meeting Intelligence]
```
