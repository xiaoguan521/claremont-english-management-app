import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'

import {
  createManagedUser,
  reassignManagedMembershipClass,
  resetManagedUserPassword,
  setManagedMembershipStatus,
} from '../lib/admin'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

type MembershipRow = {
  id: string
  user_id: string
  class_id: string | null
  school_id: string
  status: 'active' | 'invited' | 'disabled'
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
  userId: string
  name: string
  phone: string
  classId: string | null
  className: string
  schoolId: string
  schoolName: string
  status: 'active' | 'invited' | 'disabled'
}

type CreatedAccount = {
  displayName: string
  email: string
  password: string
  schoolName: string
  className: string
}

export function StudentsPage() {
  const { memberships } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [students, setStudents] = useState<StudentView[]>([])
  const [schools, setSchools] = useState<SchoolOption[]>([])
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [refreshToken, setRefreshToken] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [lastCreated, setLastCreated] = useState<CreatedAccount | null>(null)
  const [studentClassDrafts, setStudentClassDrafts] = useState<Record<string, string>>({})
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
  const focusedSchoolId = searchParams.get('schoolId')
  const focusedClassId = searchParams.get('classId')
  const focusedSchoolName = schools.find((item) => item.id === focusedSchoolId)?.name ?? null
  const focusedClassName = classes.find((item) => item.id === focusedClassId)?.name ?? null
  const visibleStudents = useMemo(
    () =>
      students.filter((item) => {
        if (focusedSchoolId && item.schoolId !== focusedSchoolId) return false
        if (focusedClassId && item.classId !== focusedClassId) return false
        return true
      }),
    [focusedClassId, focusedSchoolId, students],
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
          .select('id, user_id, class_id, school_id, status')
          .in('school_id', schoolIds)
          .eq('role', 'student'),
        supabase.from('schools').select('id, name').in('id', schoolIds),
        supabase
          .from('classes')
          .select('id, name, school_id')
          .in('school_id', schoolIds)
          .eq('status', 'active')
          .order('name'),
      ])

      if (membershipResponse.error || schoolsResponse.error || classesResponse.error) {
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
          userId: item.user_id,
          name: profileMap.get(item.user_id)?.display_name ?? '未命名学员',
          phone: profileMap.get(item.user_id)?.phone ?? '-',
          classId: item.class_id,
          className: item.class_id ? classMap.get(item.class_id) ?? item.class_id : '-',
          schoolId: item.school_id,
          schoolName: schoolMap.get(item.school_id) ?? item.school_id,
          status: item.status,
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
    setLastCreated(null)

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

      const schoolName =
        schools.find((item) => item.id === form.schoolId)?.name ?? '当前校区'
      const className =
        classes.find((item) => item.id === form.classId)?.name ?? '当前班级'
      setLastCreated({
        displayName: form.displayName.trim(),
        email: form.email.trim(),
        password: form.password,
        schoolName,
        className,
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

  const handleCopyAccount = async (account: CreatedAccount) => {
    const content = [
      `姓名：${account.displayName}`,
      `登录邮箱：${account.email}`,
      `初始密码：${account.password}`,
      `所属校区：${account.schoolName}`,
      `所属班级：${account.className}`,
    ].join('\n')

    await navigator.clipboard.writeText(content)
    setFeedback(`已复制 ${account.displayName} 的账号信息。`)
  }

  const handleResetPassword = async (student: StudentView) => {
    const temporaryPassword = buildTemporaryPassword('Stu')
    setWorkingId(student.id)
    setError(null)
    setFeedback(null)

    try {
      await resetManagedUserPassword({
        schoolId: student.schoolId,
        userId: student.userId,
        temporaryPassword,
      })
      await navigator.clipboard.writeText(
        [
          `姓名：${student.name}`,
          `临时密码：${temporaryPassword}`,
          `所属校区：${student.schoolName}`,
          `所属班级：${student.className}`,
        ].join('\n'),
      )
      setFeedback(`已重置 ${student.name} 的密码，并复制到剪贴板。`)
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : '重置密码失败。',
      )
    } finally {
      setWorkingId(null)
    }
  }

  const handleToggleStatus = async (student: StudentView) => {
    const nextStatus = student.status === 'disabled' ? 'active' : 'disabled'
    setWorkingId(student.id)
    setError(null)
    setFeedback(null)

    try {
      await setManagedMembershipStatus({
        schoolId: student.schoolId,
        membershipId: student.id,
        nextStatus,
      })
      setStudents((current) =>
        current.map((item) =>
          item.id === student.id ? { ...item, status: nextStatus } : item,
        ),
      )
      setFeedback(
        `${student.name} 已${nextStatus === 'active' ? '启用' : '停用'}。`,
      )
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : '更新账号状态失败。',
      )
    } finally {
      setWorkingId(null)
    }
  }

  const handleMoveStudent = async (student: StudentView) => {
    const nextClassId = studentClassDrafts[student.id] ?? student.classId ?? ''
    setWorkingId(student.id)
    setError(null)
    setFeedback(null)

    try {
      await reassignManagedMembershipClass({
        schoolId: student.schoolId,
        membershipId: student.id,
        classId: nextClassId || null,
      })

      const nextClassName = nextClassId
        ? classes.find((item) => item.id === nextClassId)?.name ?? nextClassId
        : '未分配班级'

      setStudents((current) =>
        current.map((item) =>
          item.id === student.id
            ? { ...item, classId: nextClassId || null, className: nextClassName }
            : item,
        ),
      )
      setFeedback(`${student.name} 已更新到新的班级归属。`)
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : '学生调班失败。',
      )
    } finally {
      setWorkingId(null)
    }
  }

  return (
    <div className="page-layout">
      <header className="page-header">
        <div>
          <h2>学员名单</h2>
          <p>集中查看校区内学员归属，并继续支持重置密码、停用和重新启用账号。</p>
        </div>
        <div className="page-tag">Students</div>
      </header>

      {focusedSchoolName || focusedClassName ? (
        <div className="filter-banner">
          <div>
            <strong>
              当前聚焦：
              {focusedClassName ? `${focusedClassName}` : focusedSchoolName}
            </strong>
            <span>
              {focusedClassName
                ? '只展示这个班级的学员，方便继续处理催交或账号问题。'
                : '只展示当前校区的学员。'}
            </span>
          </div>
          <button
            className="ghost-button compact-button"
            onClick={() => {
              const nextParams = new URLSearchParams(searchParams)
              nextParams.delete('schoolId')
              nextParams.delete('classId')
              setSearchParams(nextParams)
            }}
            type="button"
          >
            查看全部学员
          </button>
        </div>
      ) : null}

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
          {lastCreated ? (
            <div className="success-banner span-2 success-actions">
              <div>
                <strong>{lastCreated.displayName}</strong>
                <span>
                  {lastCreated.email} · {lastCreated.className}
                </span>
              </div>
              <button
                className="ghost-button compact-button"
                onClick={() => void handleCopyAccount(lastCreated)}
                type="button"
              >
                复制账号信息
              </button>
            </div>
          ) : null}

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
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {visibleStudents.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.phone}</td>
                <td>{item.className}</td>
                <td>{item.schoolName}</td>
                <td>
                  <span
                    className={`status-pill ${item.status === 'disabled' ? 'draft' : 'active'}`}
                  >
                    {formatMembershipStatus(item.status)}
                  </span>
                </td>
                <td>
                  <div className="table-actions">
                    <button
                      className="ghost-button compact-button"
                      disabled={workingId === item.id}
                      onClick={() => void handleResetPassword(item)}
                      type="button"
                    >
                      重置密码
                    </button>
                    <button
                      className="ghost-button compact-button"
                      disabled={workingId === item.id}
                      onClick={() => void handleToggleStatus(item)}
                      type="button"
                    >
                      {item.status === 'disabled' ? '启用' : '停用'}
                    </button>
                    <select
                      className="table-action-select"
                      disabled={workingId === item.id}
                      onChange={(event) =>
                        setStudentClassDrafts((current) => ({
                          ...current,
                          [item.id]: event.target.value,
                        }))
                      }
                      value={studentClassDrafts[item.id] ?? item.classId ?? ''}
                    >
                      <option value="">未分配班级</option>
                      {classes
                        .filter((classItem) => classItem.school_id === item.schoolId)
                        .map((classItem) => (
                          <option key={classItem.id} value={classItem.id}>
                            {classItem.name}
                          </option>
                        ))}
                    </select>
                    <button
                      className="ghost-button compact-button"
                      disabled={workingId === item.id}
                      onClick={() => void handleMoveStudent(item)}
                      type="button"
                    >
                      调班
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function buildTemporaryPassword(prefix: string) {
  return `${prefix}@${Math.random().toString(36).slice(2, 6)}${Date.now().toString().slice(-4)}`
}

function formatMembershipStatus(status: StudentView['status']) {
  if (status === 'disabled') return '已停用'
  if (status === 'invited') return '待激活'
  return '正常'
}
