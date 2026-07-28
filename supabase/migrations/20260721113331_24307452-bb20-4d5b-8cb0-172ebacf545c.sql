UPDATE public.image_providers
SET
  current_status = 'closed',
  blocked_until = NULL,
  consecutive_failures = 0,
  last_error_type = 'CONTENT_REJECTED'
WHERE provider_name = 'stability'
  AND last_error_type = 'AUTHENTICATION_ERROR';