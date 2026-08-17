import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, { url: string; exp: number }>();

export async function signedUrl(bucket: string, path: string): Promise<string> {
  const key = `${bucket}/${path}`;
  const cached = cache.get(key);
  if (cached && cached.exp > Date.now()) return cached.url;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  const url = data?.signedUrl ?? "";
  cache.set(key, { url, exp: Date.now() + 3500_000 });
  return url;
}

export async function uploadPhoto(bucket: string, userId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}
