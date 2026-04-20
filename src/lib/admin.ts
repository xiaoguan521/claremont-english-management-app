import { supabase } from './supabase'

export type ManagedUserPayload = {
  email: string
  password: string
  displayName: string
  phone?: string
  schoolId: string
  role: 'school_admin' | 'teacher' | 'student'
  classId?: string | null
}

export async function createManagedUser(payload: ManagedUserPayload) {
  const { data, error } = await supabase.functions.invoke('admin-create-user', {
    body: payload,
  })

  if (error) {
    throw error
  }

  if (data?.error) {
    throw new Error(data.error as string)
  }

  return data
}

export type ManageMembershipStatusPayload = {
  schoolId: string
  membershipId: string
  nextStatus: 'active' | 'disabled'
}

export type ResetManagedUserPasswordPayload = {
  schoolId: string
  userId: string
  temporaryPassword: string
}

export type ReassignManagedMembershipClassPayload = {
  schoolId: string
  membershipId: string
  classId: string | null
}

async function invokeAdminManager(body: unknown) {
  const { data, error } = await supabase.functions.invoke('admin-manage-user', {
    body: body as Record<string, unknown>,
  })

  if (error) {
    throw error
  }

  if (data?.error) {
    throw new Error(data.error as string)
  }

  return data
}

export async function setManagedMembershipStatus(
  payload: ManageMembershipStatusPayload,
) {
  return invokeAdminManager({
    action: 'set_membership_status',
    ...payload,
  })
}

export async function resetManagedUserPassword(
  payload: ResetManagedUserPasswordPayload,
) {
  return invokeAdminManager({
    action: 'reset_password',
    ...payload,
  })
}

export async function reassignManagedMembershipClass(
  payload: ReassignManagedMembershipClassPayload,
) {
  return invokeAdminManager({
    action: 'reassign_membership_class',
    ...payload,
  })
}

export type SchoolAiConfigSummary = {
  schoolId: string
  providerType: string
  providerLabel: string
  baseUrl: string
  model: string
  enabled: boolean
  apiKeyConfigured: boolean
  apiKeyMasked: string | null
  updatedAt: string | null
}

export type UpsertSchoolAiConfigPayload = {
  schoolId: string
  providerType: string
  providerLabel: string
  baseUrl: string
  model: string
  apiKey?: string
  enabled: boolean
}

async function invokeAdminAiConfig(body: unknown) {
  const { data, error } = await supabase.functions.invoke('admin-ai-config', {
    body: body as Record<string, unknown>,
  })

  if (error) {
    throw error
  }

  if (data?.error) {
    throw new Error(data.error as string)
  }

  return data
}

export async function getSchoolAiConfig(schoolId: string) {
  const data = await invokeAdminAiConfig({
    action: 'get_config',
    schoolId,
  })

  return (data?.config ?? null) as SchoolAiConfigSummary | null
}

export async function upsertSchoolAiConfig(payload: UpsertSchoolAiConfigPayload) {
  const data = await invokeAdminAiConfig({
    action: 'upsert_config',
    ...payload,
  })

  return (data?.config ?? null) as SchoolAiConfigSummary | null
}

export type SchoolSpeechConfigSummary = {
  schoolId: string
  providerType: string
  providerLabel: string
  baseUrl: string
  model: string
  voicePreset: string | null
  responseFormat: string
  enabled: boolean
  apiKeyConfigured: boolean
  apiKeyMasked: string | null
  updatedAt: string | null
}

export type UpsertSchoolSpeechConfigPayload = {
  schoolId: string
  providerType: string
  providerLabel: string
  baseUrl: string
  model: string
  apiKey?: string
  voicePreset?: string
  responseFormat?: string
  enabled: boolean
}

async function invokeAdminSpeechConfig(body: unknown) {
  const { data, error } = await supabase.functions.invoke('admin-speech-config', {
    body: body as Record<string, unknown>,
  })

  if (error) {
    throw error
  }

  if (data?.error) {
    throw new Error(data.error as string)
  }

  return data
}

export async function getSchoolSpeechConfig(schoolId: string) {
  const data = await invokeAdminSpeechConfig({
    action: 'get_config',
    schoolId,
  })

  return (data?.config ?? null) as SchoolSpeechConfigSummary | null
}

export async function upsertSchoolSpeechConfig(
  payload: UpsertSchoolSpeechConfigPayload,
) {
  const data = await invokeAdminSpeechConfig({
    action: 'upsert_config',
    ...payload,
  })

  return (data?.config ?? null) as SchoolSpeechConfigSummary | null
}

type ProcessAiQueuePayload = {
  batchSize?: number
}

type RetryFailedAiReviewsPayload = {
  schoolId: string
  assignmentId?: string
  runNow?: boolean
  batchSize?: number
}

async function invokeAdminAiQueue(body: unknown) {
  const { data, error } = await supabase.functions.invoke('admin-ai-queue', {
    body: body as Record<string, unknown>,
  })

  if (error) {
    throw error
  }

  if (data?.error) {
    throw new Error(data.error as string)
  }

  return data
}

export async function processAiQueueNow(payload: ProcessAiQueuePayload = {}) {
  return invokeAdminAiQueue({
    action: 'process_queue',
    ...payload,
  })
}

export async function scheduleAiReviewWorker() {
  return invokeAdminAiQueue({
    action: 'schedule_worker',
  })
}

export async function retryFailedAiReviews(
  payload: RetryFailedAiReviewsPayload,
) {
  return invokeAdminAiQueue({
    action: 'retry_failed_reviews',
    ...payload,
  })
}
