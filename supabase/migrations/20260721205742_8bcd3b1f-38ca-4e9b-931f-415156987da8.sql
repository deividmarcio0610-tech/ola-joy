-- Restringir função interna de sequência a service_role apenas (usada só por triggers SECURITY DEFINER)
REVOKE EXECUTE ON FUNCTION public.next_internal_code(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_internal_code(text, text) TO service_role;