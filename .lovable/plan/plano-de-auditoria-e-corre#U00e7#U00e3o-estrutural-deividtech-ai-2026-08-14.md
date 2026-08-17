# Plano de Auditoria e Correção Estrutural — DEIVIDTECH AI

O objetivo é corrigir falhas de roteamento (404), separar funcionalidades compartilhadas (Teleprompter/Copiloto, Memória/Minha IA), remover branding legado ("Nexus") e garantir que o Dashboard reflita estados reais do sistema.

## 1. Correção de Rotas e Páginas Faltantes (404)
- **Criar rotas e páginas base**:
  - `src/routes/_authenticated/templates.tsx`: Lista de modelos de IA para diferentes contextos.
  - `src/routes/_authenticated/relatorios.tsx`: Visualização de históricos e análises de sessões.
  - `src/routes/_authenticated/configuracoes.tsx`: Painel de ajustes de Copiloto, Áudio, STT e Privacidade.
  - `src/routes/_authenticated/teleprompter.tsx`: Interface dedicada com foco em leitura e respostas do Copiloto.
  - `src/routes/_authenticated/memoria.tsx`: Gerenciamento (CRUD) da base de conhecimento (atualmente unificada em Minha IA).

## 2. Separação de Funcionalidades no Menu
- **Sidebar (`src/routes/_authenticated/route.tsx`)**:
  - Atualizar links de Teleprompter para `/teleprompter`.
  - Atualizar links de Memória para `/memoria`.
  - Garantir que todos os itens apontem para as novas rotas criadas.

## 3. Limpeza de Branding Legado
- **Grep & Replace**: Substituir "Nexus" por "DEIVIDTECH AI" em:
  - `src/routes/_authenticated/minha-ia.tsx`
  - `src/routes/_authenticated/curriculo.tsx`
  - `src/routes/_authenticated/atas.tsx`
  - Qualquer outro arquivo identificado na auditoria inicial.

## 4. Dashboard com Health Checks Reais
- **Refatorar `src/routes/_authenticated/dashboard.tsx`**:
  - Implementar lógica para detectar estado real do Microfone (via `navigator.mediaDevices`).
  - Adicionar estados intermédios: "AGUARDANDO", "TESTANDO", "ONLINE", "OFFLINE".
  - Remover insights fixos/mock que não possuam dados no banco.

## 5. Auditoria de Conteúdo e Internacionalização
- **Traduções**: Alterar "approved" -> "Aprovada", "pending" -> "Pendente" em `src/routes/_authenticated/atas.tsx`.
- **Mocks**: Marcar claramente dados de demonstração em `reunioes.tsx` e `atas.tsx` como "DEMO".

## Detalhes Técnicos
- As rotas serão criadas usando o padrão TanStack Router.
- O redirecionamento de `/` para `/copiloto` em `src/routes/index.tsx` será mantido, mas as rotas diretas devem funcionar após o build.
- O componente `Diagnostico` será usado como referência para os health checks do Dashboard.
