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
    return { ok: true, taskId: res.task.id };
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
