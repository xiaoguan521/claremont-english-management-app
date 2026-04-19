import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { useAuth } from '../lib/auth'
import { copyText, downloadCsv } from '../lib/ops'
import { supabase } from '../lib/supabase'

type AssignmentRow = {
  id: string
  title: string
  class_id: string
  school_id: string
  status: string
  due_at: string | null
}

type ClassRow = {
  id: string
  name: string
  school_id: string
}

type SchoolRow = {
  id: string
  name: string
}

type MembershipRow = {
  user_id: string
  class_id: string | null
  role: string
}

type SubmissionRow = {
  assignment_id: string
  student_id: string
  status: string
}

type ProfileRow = {
  id: string
  display_name: string | null
}

type AssignmentView = AssignmentRow & {
  className: string
  schoolName: string
  submissionRate: number
  pendingCount: number
  submittedCount: number
  expectedStudents: number
  overdue: boolean
  teacherCount: number
  pendingStudentNames: string[]
  riskLabel: string
}

export function AssignmentsPage() {
  const { memberships } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [assignments, setAssignments] = useState<AssignmentView[]>([])
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null)

  const schoolIds = useMemo(
    () => Array.from(new Set(memberships.map((item) => item.school_id))),
    [memberships],
  )
  const focusedClassId = searchParams.get('classId')
  const focusedRisk = searchParams.get('risk')

  const visibleAssignments = useMemo(
    () =>
      assignments.filter((item) => {
        if (focusedClassId && item.class_id !== focusedClassId) return false
        if (focusedRisk === 'overdue' && !item.overdue) return false
        return true
      }),
    [assignments, focusedClassId, focusedRisk],
  )
  const focusedClassName =
    visibleAssignments[0]?.className ??
    assignments.find((item) => item.class_id === focusedClassId)?.className ??
    '当前班级'

  const selectedAssignment = useMemo(
    () =>
      visibleAssignments.find((item) => item.id === selectedAssignmentId) ??
      visibleAssignments[0] ??
      null,
    [selectedAssignmentId, visibleAssignments],
  )

  useEffect(() => {
    const load = async () => {
      if (schoolIds.length === 0) {
        setAssignments([])
        setSelectedAssignmentId(null)
        return
      }

      const { data: assignmentRows, error: assignmentError } = await supabase
        .from('assignments')
        .select('id, title, class_id, school_id, status, due_at')
        .in('school_id', schoolIds)
        .order('created_at', { ascending: false })

      if (assignmentError) {
        return
      }

      const assignmentList = (assignmentRows ?? []) as AssignmentRow[]
      const classIds = Array.from(new Set(assignmentList.map((item) => item.class_id)))
      const assignmentIds = assignmentList.map((item) => item.id)

      const [classResponse, schoolResponse, membershipResponse, submissionsResponse, profileResponse] =
        await Promise.all([
          classIds.length
            ? supabase.from('classes').select('id, name, school_id').in('id', classIds)
            : Promise.resolve({ data: [], error: null }),
          supabase.from('schools').select('id, name').in('id', schoolIds),
          classIds.length
            ? supabase
                .from('memberships')
                .select('user_id, class_id, role')
                .in('class_id', classIds)
                .in('role', ['teacher', 'student'])
                .eq('status', 'active')
            : Promise.resolve({ data: [], error: null }),
          assignmentIds.length
            ? supabase
                .from('submissions')
                .select('assignment_id, student_id, status')
                .in('assignment_id', assignmentIds)
            : Promise.resolve({ data: [], error: null }),
          supabase.from('profiles').select('id, display_name'),
        ])

      if (
        classResponse.error ||
        schoolResponse.error ||
        membershipResponse.error ||
        submissionsResponse.error ||
        profileResponse.error
      ) {
        return
      }

      const classMap = new Map(
        ((classResponse.data ?? []) as ClassRow[]).map((item) => [item.id, item]),
      )
      const schoolMap = new Map(
        ((schoolResponse.data ?? []) as SchoolRow[]).map((item) => [item.id, item.name]),
      )
      const profileMap = new Map(
        ((profileResponse.data ?? []) as ProfileRow[]).map((item) => [item.id, item.display_name ?? item.id]),
      )

      const studentIdsByClass = new Map<string, string[]>()
      const teacherCountByClass = new Map<string, number>()
      ;((membershipResponse.data ?? []) as MembershipRow[]).forEach((item) => {
        if (!item.class_id) return
        if (item.role === 'student') {
          const current = studentIdsByClass.get(item.class_id) ?? []
          current.push(item.user_id)
          studentIdsByClass.set(item.class_id, current)
        }
        if (item.role === 'teacher') {
          teacherCountByClass.set(item.class_id, (teacherCountByClass.get(item.class_id) ?? 0) + 1)
        }
      })

      const submittedStudentIdsByAssignment = new Map<string, Set<string>>()
      const pendingCountByAssignment = new Map<string, number>()
      ;((submissionsResponse.data ?? []) as SubmissionRow[]).forEach((item) => {
        if (item.status === 'draft') return

        const current = submittedStudentIdsByAssignment.get(item.assignment_id) ?? new Set<string>()
        current.add(item.student_id)
        submittedStudentIdsByAssignment.set(item.assignment_id, current)

        if (item.status !== 'completed') {
          pendingCountByAssignment.set(
            item.assignment_id,
            (pendingCountByAssignment.get(item.assignment_id) ?? 0) + 1,
          )
        }
      })

      const now = new Date()
      const nextAssignments = assignmentList.map((item) => {
        const classRecord = classMap.get(item.class_id)
        const studentIds = studentIdsByClass.get(item.class_id) ?? []
        const submittedStudentIds = submittedStudentIdsByAssignment.get(item.id) ?? new Set<string>()
        const expectedStudents = studentIds.length
        const submittedCount = submittedStudentIds.size
        const pendingStudentNames = studentIds
          .filter((studentId) => !submittedStudentIds.has(studentId))
          .map((studentId) => profileMap.get(studentId) ?? studentId)

        const overdue = Boolean(item.due_at) && new Date(item.due_at as string) < now && item.status === 'published'
        const teacherCount = teacherCountByClass.get(item.class_id) ?? 0
        const pendingCount = pendingCountByAssignment.get(item.id) ?? 0

        return {
          ...item,
          className: classRecord?.name ?? item.class_id,
          schoolName: schoolMap.get(item.school_id) ?? item.school_id,
          submissionRate:
            expectedStudents > 0 ? Math.round((submittedCount / expectedStudents) * 100) : 0,
          pendingCount,
          submittedCount,
          expectedStudents,
          overdue,
          teacherCount,
          pendingStudentNames,
          riskLabel: buildRiskLabel({
            overdue,
            teacherCount,
            submittedCount,
            expectedStudents,
            pendingCount,
          }),
        }
      })

      setAssignments(nextAssignments)
      setSelectedAssignmentId((current) => {
        if (current && nextAssignments.some((item) => item.id === current)) return current
        return nextAssignments[0]?.id ?? null
      })
    }

    void load()
  }, [memberships, schoolIds])

  useEffect(() => {
    if (visibleAssignments.length === 0) {
      setSelectedAssignmentId(null)
      return
    }

    if (selectedAssignmentId && visibleAssignments.some((item) => item.id === selectedAssignmentId)) {
      return
    }

    setSelectedAssignmentId(visibleAssignments[0].id)
  }, [selectedAssignmentId, visibleAssignments])

  const handleCopyReminder = async (assignment: AssignmentView) => {
    const reminder = [
      `请协助跟进作业：${assignment.title}`,
      `班级：${assignment.className}`,
      `校区：${assignment.schoolName}`,
      assignment.due_at
        ? `截止时间：${new Date(assignment.due_at).toLocaleString()}`
        : '截止时间：暂未设置',
      `未提交学员：${
        assignment.pendingStudentNames.length > 0
          ? assignment.pendingStudentNames.join('、')
          : '当前无未提交学员'
      }`,
      '请班主任或家长尽快提醒学员完成提交。',
    ].join('\n')

    void copyText(reminder)
  }

  const handleExportPendingList = (assignment: AssignmentView) => {
    const rows = [
      ['作业', '班级', '校区', '截止时间', '学员姓名', '状态'],
      ...assignment.pendingStudentNames.map((name) => [
        assignment.title,
        assignment.className,
        assignment.schoolName,
        assignment.due_at ? new Date(assignment.due_at).toLocaleString() : '未设置',
        name,
        '未提交',
      ]),
    ]

    downloadCsv(`${assignment.className}-${assignment.title}-未交名单.csv`, rows)
  }

  return (
    <div className="page-layout">
      <header className="page-header">
        <div>
          <h2>作业异常工作台</h2>
          <p>先看哪份作业最危险，再看具体是教师覆盖、逾期还是未提交学员的问题。</p>
        </div>
        <div className="page-tag">Assignments</div>
      </header>

      {focusedClassId || focusedRisk ? (
        <div className="filter-banner">
          <div>
            <strong>
              {focusedRisk === 'overdue'
                ? '当前聚焦：逾期作业'
                : `当前聚焦班级：${focusedClassName}`}
            </strong>
            <span>
              {focusedRisk === 'overdue'
                ? '这里只显示已逾期的作业，方便优先处理。'
                : '只展示这个班级的作业，方便一路跟进到底。'}
            </span>
          </div>
          <button
            className="ghost-button compact-button"
            onClick={() => {
              const nextParams = new URLSearchParams(searchParams)
              nextParams.delete('classId')
              nextParams.delete('risk')
              setSearchParams(nextParams)
            }}
            type="button"
          >
            查看全部作业
          </button>
        </div>
      ) : null}

      {visibleAssignments.length === 0 ? (
        <div className="empty-state">当前还没有可见作业。</div>
      ) : (
        <div className="operations-workbench">
          <div className="table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>作业名称</th>
                  <th>班级</th>
                  <th>校区</th>
                  <th>状态</th>
                  <th>提交率</th>
                  <th>待处理</th>
                  <th>风险</th>
                </tr>
              </thead>
              <tbody>
                {visibleAssignments.map((item) => (
                  <tr
                    key={item.id}
                    className={item.id === selectedAssignment?.id ? 'data-row-active' : undefined}
                    onClick={() => setSelectedAssignmentId(item.id)}
                  >
                    <td>{item.title}</td>
                    <td>{item.className}</td>
                    <td>{item.schoolName}</td>
                    <td>
                      <span
                        className={`status-pill ${
                          item.overdue ? 'danger' : item.status === 'draft' ? 'draft' : 'active'
                        }`}
                      >
                        {item.overdue ? '已逾期' : mapAssignmentStatus(item.status)}
                      </span>
                    </td>
                    <td>{item.status === 'draft' ? '-' : `${item.submissionRate}%`}</td>
                    <td>{item.pendingCount > 0 ? `${item.pendingCount} 份` : '无'}</td>
                    <td>{item.riskLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedAssignment ? (
            <aside className="panel-card operations-panel">
              <div className="panel-header">
                <h3>{selectedAssignment.title}</h3>
                <p>
                  {selectedAssignment.className} · {selectedAssignment.schoolName}
                </p>
              </div>

              <div className="operations-metrics">
                <MetricMini label="教师覆盖" value={`${selectedAssignment.teacherCount} 人`} />
                <MetricMini
                  label="已提交"
                  value={`${selectedAssignment.submittedCount}/${selectedAssignment.expectedStudents}`}
                />
                <MetricMini label="待处理" value={`${selectedAssignment.pendingCount} 份`} />
              </div>

              <div className="action-list">
                <ActionItem
                  title={selectedAssignment.overdue ? '作业已逾期，需要跟进' : '截止时间正常'}
                  subtitle={
                    selectedAssignment.due_at
                      ? `截止时间：${new Date(selectedAssignment.due_at).toLocaleString()}`
                      : '当前还没有设置截止时间'
                  }
                  tone={selectedAssignment.overdue ? 'danger' : 'active'}
                />
                <ActionItem
                  title={
                    selectedAssignment.teacherCount === 0
                      ? '当前班级没有绑定任课教师'
                      : `当前班级已有 ${selectedAssignment.teacherCount} 位教师`
                  }
                  subtitle={
                    selectedAssignment.teacherCount === 0
                      ? '优先联系教务补教师，否则这份作业很难被跟进。'
                      : '教师覆盖正常，可以重点跟进提交与点评。'
                  }
                  tone={selectedAssignment.teacherCount === 0 ? 'danger' : 'draft'}
                />
                <ActionItem
                  title={
                    selectedAssignment.pendingStudentNames.length > 0
                      ? `还有 ${selectedAssignment.pendingStudentNames.length} 名学员未提交`
                      : '所有学员都已经提交'
                  }
                  subtitle={
                    selectedAssignment.pendingStudentNames.length > 0
                      ? '可以提醒班主任或家长跟进这些学员。'
                      : '当前不需要催交。'
                  }
                  tone={selectedAssignment.pendingStudentNames.length > 0 ? 'active' : undefined}
                />
              </div>

              <div className="panel-header compact">
                <h3>未提交学员</h3>
                <p>这是当前最需要催交的名单。</p>
              </div>

              <div className="action-button-row">
                <button
                  className="ghost-button compact-button"
                  onClick={() => void handleCopyReminder(selectedAssignment)}
                  type="button"
                >
                  复制催办文案
                </button>
                <button
                  className="ghost-button compact-button"
                  onClick={() => handleExportPendingList(selectedAssignment)}
                  type="button"
                >
                  导出未交名单
                </button>
                <button
                  className="ghost-button compact-button"
                  onClick={() =>
                    navigate(`/classes?classId=${selectedAssignment.class_id}`)
                  }
                  type="button"
                >
                  去看班级状态
                </button>
                <button
                  className="ghost-button compact-button"
                  onClick={() =>
                    navigate(
                      `/students?schoolId=${selectedAssignment.school_id}&classId=${selectedAssignment.class_id}`,
                    )
                  }
                  type="button"
                >
                  去看未交学员
                </button>
                <button
                  className="ghost-button compact-button"
                  onClick={() =>
                    navigate(`/teachers?schoolId=${selectedAssignment.school_id}`)
                  }
                  type="button"
                >
                  去看校区教师
                </button>
              </div>

              {selectedAssignment.pendingStudentNames.length === 0 ? (
                <div className="empty-inline">这份作业当前没有未提交学员。</div>
              ) : (
                <ul className="info-list pending-list">
                  {selectedAssignment.pendingStudentNames.map((name) => (
                    <li key={name}>
                      <div className="info-meta">
                        <strong>{name}</strong>
                        <span>建议联系班主任或家长跟进</span>
                      </div>
                      <span className="status-pill draft">未提交</span>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          ) : null}
        </div>
      )}
    </div>
  )
}

function mapAssignmentStatus(status: string) {
  if (status === 'published') return '已发布'
  if (status === 'closed') return '已截止'
  if (status === 'archived') return '已归档'
  return '草稿'
}

function buildRiskLabel({
  overdue,
  teacherCount,
  submittedCount,
  expectedStudents,
  pendingCount,
}: {
  overdue: boolean
  teacherCount: number
  submittedCount: number
  expectedStudents: number
  pendingCount: number
}) {
  if (teacherCount === 0) return '缺教师'
  if (overdue) return '已逾期'
  if (expectedStudents > 0 && submittedCount === 0) return '零提交'
  if (pendingCount > 0) return '待处理多'
  return '稳定'
}

function MetricMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-mini">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ActionItem({
  title,
  subtitle,
  tone,
}: {
  title: string
  subtitle: string
  tone?: 'draft' | 'active' | 'danger'
}) {
  return (
    <div className="action-item">
      <div className="info-meta">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      {tone ? (
        <span className={`status-pill ${tone === 'danger' ? 'danger' : tone}`}>{tone === 'danger' ? '优先处理' : tone === 'active' ? '跟进中' : '关注'}</span>
      ) : null}
    </div>
  )
}
