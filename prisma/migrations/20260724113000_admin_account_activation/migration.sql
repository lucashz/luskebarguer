CREATE TABLE IF NOT EXISTS public.admin_activation_tokens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  admin_user_id uuid NOT NULL,
  token_hash text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.admin_activation_tokens
  ADD CONSTRAINT admin_activation_tokens_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX IF NOT EXISTS admin_activation_tokens_token_hash_key
  ON public.admin_activation_tokens USING btree (token_hash);

CREATE INDEX IF NOT EXISTS admin_activation_tokens_admin_user_id_status_created_at_idx
  ON public.admin_activation_tokens USING btree (admin_user_id, status, created_at);

ALTER TABLE public.admin_activation_tokens
  ADD CONSTRAINT admin_activation_tokens_admin_user_id_fkey
  FOREIGN KEY (admin_user_id)
  REFERENCES public.admin_users(id)
  ON DELETE CASCADE;
