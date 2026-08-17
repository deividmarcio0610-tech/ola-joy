-- Grupos
CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city TEXT,
  description TEXT,
  invite_code TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups TO authenticated;
GRANT ALL ON public.groups TO service_role;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- Group members
CREATE TABLE public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_members TO authenticated;
GRANT ALL ON public.group_members TO service_role;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_group_members_user ON public.group_members(user_id);
CREATE INDEX idx_group_members_group ON public.group_members(group_id);

-- Helper: is user in group?
CREATE OR REPLACE FUNCTION public.is_group_member(_group_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = _group_id AND user_id = _user_id
  )
$$;

-- Policies: groups
CREATE POLICY "Members can view their groups"
  ON public.groups FOR SELECT TO authenticated
  USING (public.is_group_member(id, auth.uid()) OR created_by = auth.uid());

CREATE POLICY "Anyone authenticated can create groups"
  ON public.groups FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Owner can update group"
  ON public.groups FOR UPDATE TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Owner can delete group"
  ON public.groups FOR DELETE TO authenticated
  USING (auth.uid() = created_by);

-- Policies: group_members
CREATE POLICY "Users see their memberships and members of their groups"
  ON public.group_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_group_member(group_id, auth.uid()));

CREATE POLICY "Users can join groups themselves"
  ON public.group_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can leave groups"
  ON public.group_members FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Add group_id to listings
ALTER TABLE public.listings ADD COLUMN group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL;
CREATE INDEX idx_listings_group ON public.listings(group_id);

-- Update listings policy to allow group members to view group-only listings
-- (Existing SELECT policy remains; we assume it allows all active listings.
-- Group listings are still visible to all — group_id is a scope hint.
-- Optionally restrict later; keep open for MVP.)

-- Timestamp trigger
CREATE TRIGGER tg_groups_updated_at
  BEFORE UPDATE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();