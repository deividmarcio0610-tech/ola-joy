
UPDATE public.image_providers
SET enabled = true, priority = 1, current_status = 'closed', blocked_until = NULL, consecutive_failures = 0, last_error_type = NULL
WHERE provider_name = 'stability';

UPDATE public.image_providers
SET priority = 2, current_status = 'closed', blocked_until = NULL, consecutive_failures = 0, last_error_type = NULL
WHERE provider_name = 'gemini';
