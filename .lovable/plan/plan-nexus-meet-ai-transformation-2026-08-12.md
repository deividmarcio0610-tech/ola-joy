# Plan: NEXUS MEET AI Transformation

Transform the existing application into **NEXUS MEET AI**, a premium professional assistant platform for meetings, interviews, and professional memory.

## User Review Required

> [!IMPORTANT]
> This will replace the current "Vizin" (marketplace) logic with a new professional SaaS focus. Existing tables (listings, swipes) will remain in the DB but the UI will focus on the new "Nexus Meet AI" features.

## Proposed Changes

### 1. Database & Backend Foundation
- Create new tables via migration:
    - `professional_memories`: For storing user's professional facts, experiences, and projects.
    - `resumes`: For storing parsed resume data and raw documents.
    - `knowledge_chunks`: For semantic search (RAG) preparation.
    - `meetings`: Recording meeting metadata, participants, and status.
    - `transcripts`: Storing real-time and final meeting transcriptions.
    - `atas` (Minutes): AI-generated summaries and decisions.
    - `actions`: Task tracking from meetings.
    - `interview_practices`: Simulation sessions and AI evaluation.
- Set up RLS for all new tables.
- Create private storage buckets for `resumes`, `audios`, and `documents`.

### 2. Branding & Layout Refinement
- Rename project to **NEXUS MEET AI**.
- Apply "Linear + Vercel + Notion" inspired theme:
    - High contrast dark/light support.
    - Refined typography and spacing.
    - Sidebar navigation updates.
- Update `src/routes/_authenticated/route.tsx` to reflect the new menu: Dashboard, Copiloto, Reuniões, Entrevistas, Treinamento, Minha IA, etc.

### 3. Core Features Implementation
- **Copiloto ao Vivo**:
    - New route `src/routes/_authenticated/copiloto.tsx`.
    - Real-time STT interface (UI-first, prepared for streaming).
    - Question detection and AI suggestion display.
    - Teleprompter component.
- **Minha IA & Memória Profissional**:
    - New route `src/routes/_authenticated/minha-ia.tsx`.
    - Interface to input facts and categorize them (Profile, Projects, Skills).
- **Currículo Inteligente**:
    - New route `src/routes/_authenticated/curriculo.tsx`.
    - Document upload and AI parsing logic.
- **Reuniões & Atas**:
    - Enhance existing meetings/dashboard logic to focus on AI summaries and action items.
- **Simulador de Entrevista**:
    - Interactive practice sessions with feedback scores based on STAR method.

### 4. Technical Infrastructure
- `src/lib/ai-assistant.functions.ts`: Core logic for RAG and streaming responses.
- `src/lib/stt-adapters.ts`: Abstraction for different speech-to-text providers.
- `src/routes/diagnostico.tsx`: System health check (Mic, STT, IA, DB).

## Technical Details
- **Stack**: TanStack Start, React 19, Tailwind CSS v4, Supabase (PostgreSQL + pgvector), Gemini 1.5.
- **UI Architecture**: Modular components for teleprompter, transcriptions, and memory cards.
- **Security**: Strict RLS ensuring users only see their own professional data and transcripts.
