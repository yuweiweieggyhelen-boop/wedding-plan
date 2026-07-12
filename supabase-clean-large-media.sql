-- One-time cleanup for old workspace states that stored base64 images in JSON.
-- Run this in Supabase SQL Editor if login fails with:
-- "canceling statement due to statement timeout"

update public.wedding_workspaces
set
  state = jsonb_set(
    state - 'cover',
    '{ideas}',
    coalesce(
      (
        select jsonb_agg(
          idea - 'imageData' - 'images' || jsonb_build_object('images', '[]'::jsonb, 'imageData', '')
        )
        from jsonb_array_elements(coalesce(state -> 'ideas', '[]'::jsonb)) as idea
      ),
      '[]'::jsonb
    ),
    true
  ),
  updated_at = now()
where jsonb_typeof(state) = 'object'
  and (
    state ? 'cover'
    or exists (
      select 1
      from jsonb_array_elements(coalesce(state -> 'ideas', '[]'::jsonb)) as idea
      where jsonb_typeof(idea -> 'images') = 'array'
        and jsonb_array_length(idea -> 'images') > 0
    )
  );
