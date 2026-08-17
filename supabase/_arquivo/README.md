# Arquivo

`20260812000000_nexus_meet_ai_base.sql.bak` é uma versão antiga e divergente do schema
(`action_status` em português, `meetings`/`transcripts` sem organização, tabelas
`atas`/`knowledge_chunks` que nunca existiram no banco). Ficava em `supabase/migrations/`
com o MESMO timestamp de `20260812000000_core_schema.sql`; se alguém removesse o `.bak`,
o CLI do Supabase rejeitaria a versão duplicada. Guardado aqui apenas como referência —
não é aplicado.
