import { useQuery, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const EXPIRY = 60 * 60 * 4; // 4h — long-lived so URLs stay cacheable while browsing

type Pending = {
  paths: Set<string>;
  resolvers: Map<string, Array<{ resolve: (url: string) => void; reject: (e: unknown) => void }>>;
  timer: ReturnType<typeof setTimeout> | null;
};

const queues = new Map<string, Pending>();

/**
 * Batches many createSignedUrl calls into a single createSignedUrls request per
 * bucket. A feed screen with 30 media items goes from 30 round-trips to 1.
 */
function enqueue(bucket: string, path: string): Promise<string> {
  let q = queues.get(bucket);
  if (!q) {
    q = { paths: new Set(), resolvers: new Map(), timer: null };
    queues.set(bucket, q);
  }
  const queue = q;
  queue.paths.add(path);

  const promise = new Promise<string>((resolve, reject) => {
    const list = queue.resolvers.get(path) ?? [];
    list.push({ resolve, reject });
    queue.resolvers.set(path, list);
  });

  if (!queue.timer) {
    queue.timer = setTimeout(() => flush(bucket), 16);
  }
  return promise;
}

async function flush(bucket: string) {
  const queue = queues.get(bucket);
  if (!queue) return;
  const paths = [...queue.paths];
  const resolvers = queue.resolvers;
  queues.delete(bucket);
  if (queue.timer) clearTimeout(queue.timer);
  if (!paths.length) return;

  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, EXPIRY);
    if (error) throw error;
    const byPath = new Map((data ?? []).map((d) => [d.path ?? "", d.signedUrl]));
    for (const p of paths) {
      const url = byPath.get(p);
      const list = resolvers.get(p) ?? [];
      if (url) list.forEach((r) => r.resolve(url));
      else list.forEach((r) => r.reject(new Error("Could not sign media URL")));
    }
  } catch (e) {
    for (const p of paths) (resolvers.get(p) ?? []).forEach((r) => r.reject(e));
  }
}

export function signedUrlKey(bucket: string, path: string) {
  return ["signed", bucket, path] as const;
}

export function useSignedUrl(bucket: string, path: string | null | undefined) {
  return useQuery({
    queryKey: ["signed", bucket, path],
    enabled: !!path,
    staleTime: (EXPIRY - 300) * 1000,
    gcTime: EXPIRY * 1000,
    retry: 1,
    queryFn: () => enqueue(bucket, path!),
  });
}

export function getSignedUrl(bucket: string, path: string) {
  return enqueue(bucket, path);
}

/** Warm the cache for media the user is about to scroll into. */
export function prefetchSignedUrls(qc: QueryClient, bucket: string, paths: Array<string | null | undefined>) {
  for (const path of paths) {
    if (!path) continue;
    qc.prefetchQuery({
      queryKey: ["signed", bucket, path],
      staleTime: (EXPIRY - 300) * 1000,
      gcTime: EXPIRY * 1000,
      queryFn: () => enqueue(bucket, path),
    });
  }
}

/** Kick the browser into downloading an image before it is rendered. */
export function warmImage(url: string | undefined | null) {
  if (!url || typeof window === "undefined") return;
  const img = new Image();
  img.decoding = "async";
  img.src = url;
}
