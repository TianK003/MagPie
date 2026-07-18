-- Magpie initial migration 0009: private diarization storage bucket
-- Transient audio chunks only (<=5MB WAV). No client storage policies: uploads use signed URLs
-- and all access is via the service role (diarize edge fn), which deletes the object after use.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('diarization', 'diarization', false, 5242880, array['audio/wav','audio/x-wav'])
on conflict (id) do nothing;
