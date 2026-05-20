-- Task 3: Migrate projects.product to NOT NULL.
-- Steps must run in order: backfill first, then constrain, then recreate index.

-- Step 1: backfill existing nulls
UPDATE public.projects SET product = 'N/A' WHERE product IS NULL;

-- Step 2: add NOT NULL constraint and default
ALTER TABLE public.projects
  ALTER COLUMN product SET NOT NULL,
  ALTER COLUMN product SET DEFAULT 'N/A';

-- Step 3: drop old partial unique index (used coalesce for nullable product)
DROP INDEX IF EXISTS projects_unique_active_name;

-- Step 4: recreate without coalesce
CREATE UNIQUE INDEX projects_unique_active_name
  ON public.projects(admin_user_id, lower(name), product)
  WHERE deleted_at IS NULL;
