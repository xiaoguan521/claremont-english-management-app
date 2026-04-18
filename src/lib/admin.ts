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
