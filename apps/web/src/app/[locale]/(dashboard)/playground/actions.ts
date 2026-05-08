'use server';

import { ApiError, serverApi, type TaskView } from '@/lib/server-api';

export interface SubmitInput {
  provider: string;
  model: string;
  method: string;
  params: Record<string, unknown>;
}

export interface SubmitResult {
  ok: boolean;
  taskId?: string;
  error?: string;
}

export async function submitGenerationAction(input: SubmitInput): Promise<SubmitResult> {
  try {
    const res = await serverApi.playgroundGenerate(input);
    return { ok: true, taskId: res.task_id };
  } catch (err) {
    if (err instanceof ApiError) {
      return {
        ok: false,
        error: err.message ?? 'submit failed',
      };
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export interface UploadResult {
  ok: boolean;
  url?: string;
  error?: string;
}

export async function uploadImageAction(form: FormData): Promise<UploadResult> {
  try {
    const file = form.get('file');
    if (!(file instanceof File)) {
      return { ok: false, error: 'no file' };
    }
    const mime = (file.type || '').toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
      return { ok: false, error: `unsupported type: ${mime || 'unknown'}` };
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return { ok: false, error: 'file too large (max 15MB)' };
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const res = await serverApi.playgroundUploadImage(buf, mime);
    return { ok: true, url: res.url };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function pollTaskAction(
  id: string,
): Promise<{ ok: true; task: TaskView } | { ok: false; error: string }> {
  try {
    const task = await serverApi.getTask(id);
    return { ok: true, task };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
