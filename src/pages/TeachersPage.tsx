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
  school_id: string
  class_id: string | null
  role: string
  status: 'active' | 'invited' | 'disabled'
}

type ProfileRow = {
  id: string
  display_name: string | null
  phone: string | null
}

type TeacherView = {
  id: string
  userId: string
  name: string
  phone: string
  role: string
  roleKey: 'teacher' | 'school_admin'
  classId: string | null
  className: string
  schoolId: string
  schoolName: string
  status: 'active' | 'invited' | 'disabled'
}

type SchoolOption = {
  id: string
  name: string
}

type ClassOption = {
  id: string
  name: string
  school_id: string
}

type CreatedAccount = {
  displayName: string
  email: string
  password: string
  schoolName: string
}

export function TeachersPage() {
  const { memberships } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [teachers, setTeachers] = useState<TeacherView[]>([])
  const [schools, setSchools] = useState<SchoolOption[]>([])
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [refreshToken, setRefreshToken] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [lastCreated, setLastCreated] = useState<CreatedAccount | null>(null)
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [teacherClassDrafts, setTeacherClassDrafts] = useState<Record<string, string>>({})
  const [form, setForm] = useState({
    schoolId: '',
    displayName: '',
    phone: '',
    email: '',
    password: '',
    role: 'teacher',
  })

  const schoolIds = useMemo(
    () => Array.from(new Set(memberships.map((item) => item.school_id))),
    [memberships],
  )
  const focusedSchoolId = searchParams.get('schoolId')
  const focusedSchoolName = schools.find((item) => item.id === focusedSchoolId)?.name ?? null
  const visibleTeachers = useMemo(
    () =>
      focusedSchoolId
        ? teachers.filter((item) => item.schoolId === focusedSchoolId)
        : teachers,
    [focusedSchoolId, teachers],
  )

  useEffect(() => {
    const load = async () => {
      if (schoolIds.length === 0) {
        setTeachers([])
        setSchools([])
        setClasses([])
        return
      }

      const [membershipResponse, schoolsResponse, classesResponse] = await Promise.all([
        supabase
          .from('memberships')
          .select('id, user_id, school_id, class_id, role, status')
          .in('school_id', schoolIds)
          .in('role', ['teacher', 'school_admin']),
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
        setForm((current) => ({ ...current, schoolId: nextSchools[0].id }))
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

      setTeachers(
        ((membershipResponse.data ?? []) as MembershipRow[]).map((item) => ({
          id: item.id,
          userId: item.user_id,
          name: profileMap.get(item.user_id)?.display_name ?? '未命名账号',
          phone: profileMap.get(item.user_id)?.phone ?? '-',
          roleKey: item.role as 'teacher' | 'school_admin',
          role: item.role === 'school_admin' ? '校区管理员' : '教师',
          classId: item.class_id,
          className: item.class_id ? classMap.get(item.class_id) ?? item.class_id : '未分配班级',
          schoolId: item.school_id,
          schoolName: schoolMap.get(item.school_id) ?? item.school_id,
          status: item.status,
        })),
      )
    }

    void load()
  }, [form.schoolId, refreshToken, schoolIds])

  const getAvailableClasses = (schoolId: string) =>
    classes.filter((item) => item.school_id === schoolId)

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
        role: form.role as 'teacher' | 'school_admin',
      })

      const schoolName =
        schools.find((item) => item.id === form.schoolId)?.name ?? '当前校区'
      setLastCreated({
        displayName: form.displayName.trim(),
        email: form.email.trim(),
        password: form.password,
        schoolName,
      })
      setFeedback('教师账号已创建并绑定到校区。')
      setForm((current) => ({
        ...current,
        displayName: '',
        phone: '',
        email: '',
        password: '',
        role: 'teacher',
      }))
      setRefreshToken((value) => value + 1)
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : '创建教师账号失败。',
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
    ].join('\n')

    await navigator.clipboard.writeText(content)
    setFeedback(`已复制 ${account.displayName} 的账号信息。`)
  }

  const handleResetPassword = async (teacher: TeacherView) => {
    const temporaryPassword = buildTemporaryPassword('Tea')
    setWorkingId(teacher.id)
    setError(null)
    setFeedback(null)

    try {
      await resetManagedUserPassword({
        schoolId: teacher.schoolId,
        userId: teacher.userId,
        temporaryPassword,
      })
      await navigator.clipboard.writeText(
        [`姓名：${teacher.name}`, `临时密码：${temporaryPassword}`, `所属校区：${teacher.schoolName}`].join(
          '\n',
        ),
      )
      setFeedback(`已重置 ${teacher.name} 的密码，并复制到剪贴板。`)
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : '重置密码失败。',
      )
    } finally {
      setWorkingId(null)
    }
  }

  const handleToggleStatus = async (teacher: TeacherView) => {
    const nextStatus = teacher.status === 'disabled' ? 'active' : 'disabled'
    setWorkingId(teacher.id)
    setError(null)
    setFeedback(null)

    try {
      await setManagedMembershipStatus({
        schoolId: teacher.schoolId,
        membershipId: teacher.id,
        nextStatus,
      })
      setTeachers((current) =>
        current.map((item) =>
          item.id === teacher.id ? { ...item, status: nextStatus } : item,
        ),
      )
      setFeedback(
        `${teacher.name} 已${nextStatus === 'active' ? '启用' : '停用'}。`,
      )
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : '更新账号状态失败。',
      )
    } finally {
      setWorkingId(null)
    }
  }

  const handleReassignClass = async (teacher: TeacherView) => {
    if (teacher.roleKey !== 'teacher') return

    const nextClassId = teacherClassDrafts[teacher.id] ?? teacher.classId ?? ''
    setWorkingId(teacher.id)
    setError(null)
    setFeedback(null)

    try {
      await reassignManagedMembershipClass({
        schoolId: teacher.schoolId,
        membershipId: teacher.id,
        classId: nextClassId || null,
      })
      const nextClassName = nextClassId
        ? classes.find((item) => item.id === nextClassId)?.name ?? nextClassId
        : '未分配班级'

      setTeachers((current) =>
        current.map((item) =>
          item.id === teacher.id
            ? { ...item, classId: nextClassId || null, className: nextClassName }
            : item,
        ),
      )
      setFeedback(`${teacher.name} 的班级归属已更新。`)
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : '调整教师班级失败。',
      )
    } finally {
      setWorkingId(null)
    }
  }

  return (
    <div className="page-layout">
      <header className="page-header">
        <div>
          <h2>教师档案</h2>
          <p>现在除了建号，还可以重置密码、停用或重新启用教师与校区管理员账号。</p>
        </div>
        <div className="page-tag">Teachers</div>
      </header>

      {focusedSchoolName ? (
        <div className="filter-banner">
          <div>
            <strong>当前聚焦校区：{focusedSchoolName}</strong>
            <span>这是从班级或作业工作台带过来的教师视角。</span>
          </div>
          <button
            className="ghost-button compact-button"
            onClick={() => {
              const nextParams = new URLSearchParams(searchParams)
              nextParams.delete('schoolId')
              setSearchParams(nextParams)
            }}
            type="button"
          >
            查看全部教师
          </button>
        </div>
      ) : null}

      <article className="panel-card">
        <div className="panel-header">
          <h3>新增教师账号</h3>
          <p>创建后会同时写入 Supabase Auth、profiles 和 memberships。</p>
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
            角色
            <select
              value={form.role}
              onChange={(event) =>
                setForm((current) => ({ ...current, role: event.target.value }))
              }
            >
              <option value="teacher">教师</option>
              <option value="school_admin">校区管理员</option>
            </select>
          </label>

          <label>
            姓名
            <input
              value={form.displayName}
              onChange={(event) =>
                setForm((current) => ({ ...current, displayName: event.target.value }))
              }
              placeholder="例如：李老师"
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
              placeholder="teacher@example.com"
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
                  {lastCreated.email} · {lastCreated.schoolName}
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
              {submitting ? '创建中...' : '创建教师账号'}
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
              <th>角色</th>
              <th>当前班级</th>
              <th>校区</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {visibleTeachers.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.phone}</td>
                <td>{item.role}</td>
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
                    {item.roleKey === 'teacher' ? (
                      <>
                        <select
                          className="table-action-select"
                          disabled={workingId === item.id}
                          onChange={(event) =>
                            setTeacherClassDrafts((current) => ({
                              ...current,
                              [item.id]: event.target.value,
                            }))
                          }
                          value={teacherClassDrafts[item.id] ?? item.classId ?? ''}
                        >
                          <option value="">未分配班级</option>
                          {getAvailableClasses(item.schoolId).map((classItem) => (
                            <option key={classItem.id} value={classItem.id}>
                              {classItem.name}
                            </option>
                          ))}
                        </select>
                        <button
                          className="ghost-button compact-button"
                          disabled={workingId === item.id}
                          onClick={() => void handleReassignClass(item)}
                          type="button"
                        >
                          保存班级
                        </button>
                      </>
                    ) : null}
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

function formatMembershipStatus(status: TeacherView['status']) {
  if (status === 'disabled') return '已停用'
  if (status === 'invited') return '待激活'
  return '正常'
}
