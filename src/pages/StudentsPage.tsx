import { useEffect, useMemo, useState, type FormEvent } from 'react'

import { createManagedUser } from '../lib/admin'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

type MembershipRow = {
  id: string
  user_id: string
  class_id: string | null
  school_id: string
}

type ProfileRow = {
  id: string
  display_name: string | null
  phone: string | null
}

type ClassOption = {
  id: string
  name: string
  school_id: string
}

type SchoolOption = {
  id: string
  name: string
}

type StudentView = {
  id: string
  name: string
  phone: string
  className: string
  schoolName: string
}

export function StudentsPage() {
  const { memberships } = useAuth()
  const [students, setStudents] = useState<StudentView[]>([])
  const [schools, setSchools] = useState<SchoolOption[]>([])
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [refreshToken, setRefreshToken] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [form, setForm] = useState({
    schoolId: '',
    classId: '',
    displayName: '',
    phone: '',
    email: '',
    password: '',
  })

  const schoolIds = useMemo(
    () => Array.from(new Set(memberships.map((item) => item.school_id))),
    [memberships],
  )

  useEffect(() => {
    const load = async () => {
      if (schoolIds.length === 0) {
        setStudents([])
        setSchools([])
        setClasses([])
        return
      }

      const [membershipResponse, schoolsResponse, classesResponse] = await Promise.all([
        supabase
          .from('memberships')
          .select('id, user_id, class_id, school_id')
          .in('school_id', schoolIds)
          .eq('role', 'student')
          .eq('status', 'active'),
        supabase.from('schools').select('id, name').in('id', schoolIds),
        supabase
          .from('classes')
          .select('id, name, school_id')
          .in('school_id', schoolIds)
          .eq('status', 'active')
          .order('name'),
      ])

      if (membershipResponse.error || schoolsResponse.error || classesResponse.error) {
        console.error(
          membershipResponse.error || schoolsResponse.error || classesResponse.error,
        )
        return
      }

      const nextSchools = (schoolsResponse.data ?? []) as SchoolOption[]
      const nextClasses = (classesResponse.data ?? []) as ClassOption[]
      setSchools(nextSchools)
      setClasses(nextClasses)

      if (nextSchools.length > 0 && !form.schoolId) {
        const defaultSchoolId = nextSchools[0].id
        const defaultClassId =
          nextClasses.find((item) => item.school_id === defaultSchoolId)?.id ?? ''
        setForm((current) => ({
          ...current,
          schoolId: defaultSchoolId,
          classId: current.classId || defaultClassId,
        }))
      }

      const userIds = Array.from(
        new Set((membershipResponse.data ?? []).map((item) => item.user_id)),
      )

      const { data: profileRows, error: profileError } = await supabase
        .from('profiles')
        .select('id, display_name, phone')
        .in('id', userIds)

      if (profileError) {
        console.error(profileError)
        return
      }

      const profileMap = new Map(
        ((profileRows ?? []) as ProfileRow[]).map((item) => [item.id, item]),
      )
      const schoolMap = new Map(nextSchools.map((item) => [item.id, item.name]))
      const classMap = new Map(nextClasses.map((item) => [item.id, item.name]))

      setStudents(
        ((membershipResponse.data ?? []) as MembershipRow[]).map((item) => ({
          id: item.id,
          name: profileMap.get(item.user_id)?.display_name ?? '未命名学员',
          phone: profileMap.get(item.user_id)?.phone ?? '-',
          className: item.class_id ? classMap.get(item.class_id) ?? item.class_id : '-',
          schoolName: schoolMap.get(item.school_id) ?? item.school_id,
        })),
      )
    }

    void load()
  }, [form.schoolId, refreshToken, schoolIds])

  const availableClasses = classes.filter((item) => item.school_id === form.schoolId)

  useEffect(() => {
    if (availableClasses.length === 0) {
      return
    }

    const exists = availableClasses.some((item) => item.id === form.classId)
    if (!exists) {
      setForm((current) => ({ ...current, classId: availableClasses[0].id }))
    }
  }, [availableClasses, form.classId])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setFeedback(null)

    try {
      await createManagedUser({
        email: form.email.trim(),
        password: form.password,
        displayName: form.displayName.trim(),
        phone: form.phone.trim(),
        schoolId: form.schoolId,
        classId: form.classId,
        role: 'student',
      })

      setFeedback('学生账号已创建并绑定到班级。')
      setForm((current) => ({
        ...current,
        displayName: '',
        phone: '',
        email: '',
        password: '',
      }))
      setRefreshToken((value) => value + 1)
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : '创建学生账号失败。',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page-layout">
      <header className="page-header">
        <div>
          <h2>学员名单</h2>
          <p>集中查看校区内学员归属，并直接创建学生账号绑定到班级。</p>
        </div>
        <div className="page-tag">Students</div>
      </header>

      <article className="panel-card">
        <div className="panel-header">
          <h3>新增学生账号</h3>
          <p>创建后会自动落到指定校区和班级，学生端可以直接用邮箱密码登录。</p>
        </div>

        <form className="inline-form" onSubmit={handleSubmit}>
          <label>
            所属校区
            <select
              value={form.schoolId}
              onChange={(event) =>
                setForm((current) => ({ ...current, schoolId: event.target.value }))
              }
              required
            >
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            所属班级
            <select
              value={form.classId}
              onChange={(event) =>
                setForm((current) => ({ ...current, classId: event.target.value }))
              }
              required
            >
              {availableClasses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            姓名
            <input
              value={form.displayName}
              onChange={(event) =>
                setForm((current) => ({ ...current, displayName: event.target.value }))
              }
              placeholder="例如：小明"
              required
            />
          </label>

          <label>
            手机号
            <input
              value={form.phone}
              onChange={(event) =>
                setForm((current) => ({ ...current, phone: event.target.value }))
              }
              placeholder="选填"
            />
          </label>

          <label>
            登录邮箱
            <input
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm((current) => ({ ...current, email: event.target.value }))
              }
              placeholder="student@example.com"
              required
            />
          </label>

          <label>
            初始密码
            <input
              type="password"
              value={form.password}
              onChange={(event) =>
                setForm((current) => ({ ...current, password: event.target.value }))
              }
              placeholder="至少 6 位"
              required
            />
          </label>

          {error ? <div className="error-banner span-2">{error}</div> : null}
          {feedback ? <div className="success-banner span-2">{feedback}</div> : null}

          <div className="form-actions span-2">
            <button className="primary-button" disabled={submitting} type="submit">
              {submitting ? '创建中...' : '创建学生账号'}
            </button>
          </div>
        </form>
      </article>

      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>姓名</th>
              <th>手机号</th>
              <th>班级</th>
              <th>校区</th>
            </tr>
          </thead>
          <tbody>
            {students.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.phone}</td>
                <td>{item.className}</td>
                <td>{item.schoolName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
