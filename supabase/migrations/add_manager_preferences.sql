ALTER TABLE public.manager_relationships
ADD COLUMN is_favorite BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT false;
