-- =============================================================================
-- 0014 — Storage bucket for cloned template artifacts.
--
-- Holds the captured HTML, the CSS bundle, the re-hosted images and fonts, the
-- baseline screenshots, and each generated page's final HTML.
--
-- Private, like 'exports'. Nothing here is ever served to the public from
-- Supabase: the worker reads the bytes with the service-role key and uploads
-- them to Netlify as part of a deploy, so the only public copy is the one on
-- the seller's own site.
--
-- Idempotent: safe to re-run.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('landing-assets', 'landing-assets', false)
on conflict (id) do nothing;
