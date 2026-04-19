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
