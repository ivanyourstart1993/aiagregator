'use server';

import { revalidatePath } from 'next/cache';
import {
  ApiError,
  serverApi,
  type AdminEmailCampaignInput,
  type AdminLeadCreateInput,
  type AdminLeadSourceInput,
  type AdminLeadUpdateInput,
  type AdminOutreachAccountInput,
  type AdminOutreachAccountUpdateInput,
  type AdminOutreachTemplateInput,
  type EmailCampaignView,
  type LeadStatus,
  type LeadView,
  type LeadSourceView,
  type OutreachAccountView,
  type OutreachTemplateView,
} from '@/lib/server-api';

export interface MutationResult<T = unknown> {
  ok: boolean;
  code?: string;
  data?: T;
}

function fail<T = unknown>(err: unknown): MutationResult<T> {
  if (err instanceof ApiError) return { ok: false, code: err.code };
  return { ok: false, code: 'internal_error' };
}

// ---- Leads ----

export async function moveLeadAction(
  id: string,
  toStatus: LeadStatus,
  reason?: string,
): Promise<MutationResult<LeadView>> {
  try {
    const data = await serverApi.adminMoveLead(id, { toStatus, reason });
    revalidatePath('/(panel)/crm/leads', 'page');
    revalidatePath(`/(panel)/crm/leads/${id}`, 'page');
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function updateLeadAction(
  id: string,
  input: AdminLeadUpdateInput,
): Promise<MutationResult<LeadView>> {
  try {
    const data = await serverApi.adminUpdateLead(id, input);
    revalidatePath('/(panel)/crm/leads', 'page');
    revalidatePath(`/(panel)/crm/leads/${id}`, 'page');
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function createLeadAction(
  input: AdminLeadCreateInput,
): Promise<MutationResult<LeadView>> {
  try {
    const data = await serverApi.adminCreateLead(input);
    revalidatePath('/(panel)/crm/leads', 'page');
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteLeadAction(id: string): Promise<MutationResult> {
  try {
    await serverApi.adminDeleteLead(id);
    revalidatePath('/(panel)/crm/leads', 'page');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function addLeadNoteAction(
  id: string,
  body: string,
): Promise<MutationResult> {
  try {
    await serverApi.adminAddLeadNote(id, body);
    revalidatePath(`/(panel)/crm/leads/${id}`, 'page');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ---- Lead sources ----

export async function createSourceAction(
  input: AdminLeadSourceInput,
): Promise<MutationResult<LeadSourceView>> {
  try {
    const data = await serverApi.adminCreateLeadSource(input);
    revalidatePath('/(panel)/crm/sources', 'page');
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function updateSourceAction(
  id: string,
  input: Partial<AdminLeadSourceInput>,
): Promise<MutationResult<LeadSourceView>> {
  try {
    const data = await serverApi.adminUpdateLeadSource(id, input);
    revalidatePath('/(panel)/crm/sources', 'page');
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteSourceAction(id: string): Promise<MutationResult> {
  try {
    await serverApi.adminDeleteLeadSource(id);
    revalidatePath('/(panel)/crm/sources', 'page');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function runSourceAction(id: string): Promise<MutationResult> {
  try {
    await serverApi.adminRunLeadSource(id);
    revalidatePath('/(panel)/crm/sources', 'page');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ---- Templates ----

export async function createTemplateAction(
  input: AdminOutreachTemplateInput,
): Promise<MutationResult<OutreachTemplateView>> {
  try {
    const data = await serverApi.adminCreateOutreachTemplate(input);
    revalidatePath('/(panel)/crm/templates', 'page');
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function updateTemplateAction(
  id: string,
  input: Partial<AdminOutreachTemplateInput>,
): Promise<MutationResult<OutreachTemplateView>> {
  try {
    const data = await serverApi.adminUpdateOutreachTemplate(id, input);
    revalidatePath('/(panel)/crm/templates', 'page');
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteTemplateAction(id: string): Promise<MutationResult> {
  try {
    await serverApi.adminDeleteOutreachTemplate(id);
    revalidatePath('/(panel)/crm/templates', 'page');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ---- Outreach accounts ----

export async function createOutreachAccountAction(
  input: AdminOutreachAccountInput,
): Promise<MutationResult<OutreachAccountView>> {
  try {
    const data = await serverApi.adminCreateOutreachAccount(input);
    revalidatePath('/(panel)/crm/accounts', 'page');
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function updateOutreachAccountAction(
  id: string,
  input: AdminOutreachAccountUpdateInput,
): Promise<MutationResult<OutreachAccountView>> {
  try {
    const data = await serverApi.adminUpdateOutreachAccount(id, input);
    revalidatePath('/(panel)/crm/accounts', 'page');
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteOutreachAccountAction(
  id: string,
): Promise<MutationResult> {
  try {
    await serverApi.adminDeleteOutreachAccount(id);
    revalidatePath('/(panel)/crm/accounts', 'page');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ---- Email campaigns ----

export async function createEmailCampaignAction(
  input: AdminEmailCampaignInput,
): Promise<MutationResult<EmailCampaignView>> {
  try {
    const data = await serverApi.adminCreateEmailCampaign(input);
    revalidatePath('/(panel)/crm/campaigns', 'page');
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function updateEmailCampaignAction(
  id: string,
  input: Partial<AdminEmailCampaignInput>,
): Promise<MutationResult<EmailCampaignView>> {
  try {
    const data = await serverApi.adminUpdateEmailCampaign(id, input);
    revalidatePath('/(panel)/crm/campaigns', 'page');
    revalidatePath(`/(panel)/crm/campaigns/${id}`, 'page');
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteEmailCampaignAction(
  id: string,
): Promise<MutationResult> {
  try {
    await serverApi.adminDeleteEmailCampaign(id);
    revalidatePath('/(panel)/crm/campaigns', 'page');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function runEmailCampaignAction(
  id: string,
): Promise<MutationResult<{ queued: number; skipped: number; audienceSize: number }>> {
  try {
    const data = await serverApi.adminRunEmailCampaign(id);
    revalidatePath('/(panel)/crm/campaigns', 'page');
    revalidatePath(`/(panel)/crm/campaigns/${id}`, 'page');
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function pauseEmailCampaignAction(
  id: string,
): Promise<MutationResult<EmailCampaignView>> {
  try {
    const data = await serverApi.adminPauseEmailCampaign(id);
    revalidatePath('/(panel)/crm/campaigns', 'page');
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function sendEmailToLeadAction(
  leadId: string,
  body: { templateSlug?: string; subject?: string; body?: string },
): Promise<MutationResult> {
  try {
    await serverApi.adminSendEmailToLead(leadId, body);
    revalidatePath(`/(panel)/crm/leads/${leadId}`, 'page');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
