# Plan: New Professional AI Meeting & Interview SaaS

Create a new, independent corporate platform for recording, transcribing, analyzing, and managing meetings and interviews with AI support.

## Phase 1: Foundation & Auth
- [ ] Initialize new project structure (Next.js/React style within TanStack Start).
- [ ] Database Schema: Organizations, Users, Meetings, Interviews, Candidates, Jobs, Actions, Templates.
- [ ] Authentication: Session management, roles, multi-tenant workspace logic.
- [ ] Landing Page: Premium SaaS design (Linear/Vercel style) with clear CTAs.

## Phase 2: Core Meeting & Transcription Engine
- [ ] Meeting Management: Create, list, details, timer, recording status.
- [ ] Transcription Pipeline: Audio/video upload, STT integration (Whisper/OpenAI), timestamps, and speaker identification.
- [ ] Live Transcription: WebSocket-based chunks processing (if infrastructure allows).

## Phase 3: AI Intelligence & Documentation
- [ ] Meeting AI: Generate executive summaries, decisions, actions, risks, and insights from transcripts.
- [ ] Automatic Minutes (Atas): Professional templates, PDF export, editing, and sharing.
- [ ] Action Plans: Tracking system with status, owners, and deadlines.

## Phase 4: Recruitment & Interview Module
- [ ] Job Management: Vacancy creation with requirements and responsibilities.
- [ ] Candidate Management: Resume upload and parsing (AI extractor).
- [ ] AI Matching: Calculate adherence between vacancy and candidate.
- [ ] Interview Live Room: Split-screen UI (Candidate, Resume, Questions, Notes, IA).
- [ ] Evaluation System: Human + AI analysis, candidate comparison, and final reports.

## Phase 5: Template Engine & Dashboard
- [ ] Professional Template Engine: JSON-based registry for meeting/interview structures.
- [ ] Visual Templates: Corporate Light/Dark, Executive, Minimal.
- [ ] AI Template Generator: Natural language to structured template.
- [ ] Global Analytics Dashboard: KPIs for meetings, interviews, actions, and hiring trends.

## Phase 6: Final Polish & Production
- [ ] Global Search: Indexed search across meetings, transcripts, candidates, etc.
- [ ] Notifications: Alerts for upcoming meetings/interviews and pending actions.
- [ ] Admin & Diagnostics: Usage logs, health checks, and subscription management.
- [ ] Deployment Readiness: Lint, typecheck, tests, and build validation.

## Technical Details
- **Frontend**: TanStack Start (React 19), Tailwind CSS, Framer Motion.
- **Backend**: Server Functions (Cloudflare Workers context), Supabase (PostgreSQL, Auth, Storage).
- **AI**: Gemini 1.5 Pro/Flash for analysis; OpenAI Whisper (via API) for STT.
- **Privacy**: LGPD compliance, data deletion, audit logs.
