import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { useAuth } from '../lib/auth'
import { copyText, downloadCsv } from '../lib/ops'
import { supabase } from '../lib/supabase'

type ClassRecord = {
  id: string
  name: string
  code: string
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
  status: 'active' | 'invited' | 'disabled'
}

type ProfileRow = {
  id: string
  display_name: string | null
}

type AssignmentRow = {
  id: string
  class_id: string
  title: string
  status: string
  due_at: string | null
}

type SubmissionRow = {
  assignment_id: string
  status: string
}

type ClassView = ClassRecord & {
  schoolName: string
  teacherCount: number
  studentCount: number
  assignmentCount: number
  publishedAssignmentCount: number
  overdueAssignmentCount: number
  submissionRate: number
  submittedCount: number
  expectedSubmissions: number
  pendingSubmissionCount: number
  riskLabel: string
  latestAssignmentTitle: string
  teacherNames: string[]
  studentNames: string[]
}

export function ClassesPage() {
  const { memberships } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [classes, setClasses] = useState<ClassView[]>([])

  const schoolIds = useMemo(
    () => Array.from(new Set(memberships.map((item) => item.school_id))),
    [memberships],
  )

  const requestedClassId = searchParams.get('classId')
  const selectedClass = useMemo(
    () => classes.find((item) => item.id === requestedClassId) ?? classes[0] ?? null,
    [classes, requestedClassId],
  )

  useEffect(() => {
    const load = async () => {
      if (schoolIds.length === 0) {
        setClasses([])
        return
      }

      const [classesResponse, schoolsResponse, membershipsResponse, assignmentsResponse] =
        await Promise.all([
          supabase
            .from('classes')
            .select('id, name, code, school_id')
            .in('school_id', schoolIds)
            .order('name'),
          supabase.from('schools').select('id, name').in('id', schoolIds),
          supabase
            .from('memberships')
            .select('user_id, class_id, role, status')
            .in('school_id', schoolIds)
            .in('role', ['teacher', 'student'])
            .eq('status', 'active'),
          supabase
            .from('assignments')
            .select('id, class_id, title, status, due_at')
            .in('school_id', schoolIds),
        ])

      if (
        classesResponse.error ||
        schoolsResponse.error ||
        membershipsResponse.error ||
        assignmentsResponse.error
      ) {
        return
      }

      const classRows = (classesResponse.data ?? []) as ClassRecord[]
      const assignments = (assignmentsResponse.data ?? []) as AssignmentRow[]
      const assignmentIds = assignments.map((item) => item.id)
      const membershipRows = (membershipsResponse.data ?? []) as MembershipRow[]
      const memberUserIds = Array.from(new Set(membershipRows.map((item) => item.user_id)))
      const { data: submissionsData, error: submissionsError } = assignmentIds.length
        ? await supabase
            .from('submissions')
            .select('assignment_id, status')
            .in('assignment_id', assignmentIds)
        : { data: [], error: null }
      const { data: profileRows, error: profileError } = memberUserIds.length
        ? await supabase.from('profiles').select('id, display_name').in('id', memberUserIds)
        : { data: [], error: null }

      if (submissionsError || profileError) return

      const schoolMap = new Map(
        ((schoolsResponse.data ?? []) as SchoolRow[]).map((item) => [item.id, item.name]),
      )
      const profileMap = new Map(
        ((profileRows ?? []) as ProfileRow[]).map((item) => [item.id, item.display_name ?? item.id]),
      )

      const counters = new Map<
        string,
        {
          teacherCount: number
          studentCount: number
          assignmentCount: number
          publishedAssignmentCount: number
          overdueAssignmentCount: number
          latestAssignmentTitle: string
          teacherNames: string[]
          studentNames: string[]
        }
      >()

      membershipRows.forEach((item) => {
        if (!item.class_id) return

        const current = counters.get(item.class_id) ?? {
          teacherCount: 0,
          studentCount: 0,
          assignmentCount: 0,
          publishedAssignmentCount: 0,
          overdueAssignmentCount: 0,
          latestAssignmentTitle: '暂无作业',
          teacherNames: [],
          studentNames: [],
        }

        if (item.role === 'teacher') {
          current.teacherCount += 1
          current.teacherNames.push(profileMap.get(item.user_id) ?? item.user_id)
        }
        if (item.role === 'student') {
          current.studentCount += 1
          current.studentNames.push(profileMap.get(item.user_id) ?? item.user_id)
        }
        counters.set(item.class_id, current)
      })

      const now = new Date()
      assignments.forEach((item) => {
        const current = counters.get(item.class_id) ?? {
          teacherCount: 0,
          studentCount: 0,
          assignmentCount: 0,
          publishedAssignmentCount: 0,
          overdueAssignmentCount: 0,
          latestAssignmentTitle: '暂无作业',
          teacherNames: [],
          studentNames: [],
        }

        current.assignmentCount += 1
        if (item.status === 'published') current.publishedAssignmentCount += 1
        if (item.due_at && new Date(item.due_at) < now && item.status === 'published') {
          current.overdueAssignmentCount += 1
        }
        if (current.latestAssignmentTitle === '暂无作业') {
          current.latestAssignmentTitle = item.title
        }
        counters.set(item.class_id, current)
      })

      const assignmentClassMap = new Map(assignments.map((item) => [item.id, item.class_id]))
      const submissionStatsByClass = new Map<string, { submittedCount: number; pendingCount: number }>()
      ;((submissionsData ?? []) as SubmissionRow[]).forEach((item) => {
        const classId = assignmentClassMap.get(item.assignment_id)
        if (!classId || item.status === 'draft') return

        const current = submissionStatsByClass.get(classId) ?? {
          submittedCount: 0,
          pendingCount: 0,
        }
        current.submittedCount += 1
        if (item.status !== 'completed') current.pendingCount += 1
        submissionStatsByClass.set(classId, current)
      })

      setClasses(
        classRows.map((item) => {
          const current = counters.get(item.id) ?? {
            teacherCount: 0,
            studentCount: 0,
            assignmentCount: 0,
            publishedAssignmentCount: 0,
            overdueAssignmentCount: 0,
            latestAssignmentTitle: '暂无作业',
            teacherNames: [],
            studentNames: [],
          }
          const submissionStats = submissionStatsByClass.get(item.id) ?? {
            submittedCount: 0,
            pendingCount: 0,
          }
          const expectedSubmissions = current.studentCount * current.assignmentCount

          return {
            ...item,
            schoolName: schoolMap.get(item.school_id) ?? item.school_id,
            teacherCount: current.teacherCount,
            studentCount: current.studentCount,
            assignmentCount: current.assignmentCount,
            publishedAssignmentCount: current.publishedAssignmentCount,
            overdueAssignmentCount: current.overdueAssignmentCount,
            submittedCount: submissionStats.submittedCount,
            pendingSubmissionCount: submissionStats.pendingCount,
            expectedSubmissions,
            submissionRate:
              expectedSubmissions > 0
                ? Math.round((submissionStats.submittedCount / expectedSubmissions) * 100)
                : 0,
            riskLabel: buildClassRiskLabel({
              teacherCount: current.teacherCount,
              studentCount: current.studentCount,
              assignmentCount: current.assignmentCount,
              overdueAssignmentCount: current.overdueAssignmentCount,
              submissionRate:
                expectedSubmissions > 0
                  ? Math.round((submissionStats.submittedCount / expectedSubmissions) * 100)
                  : 0,
            }),
            latestAssignmentTitle: current.latestAssignmentTitle,
            teacherNames: current.teacherNames,
            studentNames: current.studentNames,
          }
        }),
      )
    }

    void load()
  }, [memberships, schoolIds])

  useEffect(() => {
    if (classes.length === 0) return
    if (requestedClassId && classes.some((item) => item.id === requestedClassId)) return

    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('classId', classes[0].id)
    setSearchParams(nextParams, { replace: true })
  }, [classes, requestedClassId, searchParams, setSearchParams])

  const handleCopySummary = async (classItem: ClassView) => {
    const summary = [
      `班级：${classItem.name}`,
      `校区：${classItem.schoolName}`,
      `教师覆盖：${classItem.teacherCount} 人`,
      `学员规模：${classItem.studentCount} 人`,
      `作业数：${classItem.assignmentCount} 份`,
      `提交率：${classItem.assignmentCount > 0 ? `${classItem.submissionRate}%` : '暂无'}`,
      `逾期作业：${classItem.overdueAssignmentCount} 份`,
      `最近作业：${classItem.latestAssignmentTitle}`,
    ].join('\n')

    void copyText(summary)
  }

  const handleExportMembers = (classItem: ClassView, role: 'teacher' | 'student') => {
    const isTeacher = role === 'teacher'
    const names = isTeacher ? classItem.teacherNames : classItem.studentNames
    const rows = [
      ['班级', '校区', '角色', '姓名'],
      ...names.map((name) => [classItem.name, classItem.schoolName, isTeacher ? '教师' : '学员', name]),
    ]
    downloadCsv(
      `${classItem.name}-${isTeacher ? '教师名单' : '学员名单'}.csv`,
      rows,
    )
  }

  return (
    <div className="page-layout">
      <header className="page-header">
        <div>
          <h2>班级异常工作台</h2>
          <p>把班级承载、教师覆盖、作业执行和提交流水放到同一个视角里看。</p>
        </div>
        <div className="page-tag">Classes</div>
      </header>

      {classes.length === 0 ? (
        <div className="empty-state">当前还没有可见班级。</div>
      ) : (
        <div className="operations-workbench">
          <div className="table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>班级名称</th>
                  <th>班级编码</th>
                  <th>所属校区</th>
                  <th>教师数</th>
                  <th>学员数</th>
                  <th>作业数</th>
                  <th>提交率</th>
                  <th>风险</th>
                </tr>
              </thead>
              <tbody>
                {classes.map((item) => (
                  <tr
                    key={item.id}
                    className={item.id === selectedClass?.id ? 'data-row-active' : undefined}
                    onClick={() => {
                      const nextParams = new URLSearchParams(searchParams)
                      nextParams.set('classId', item.id)
                      setSearchParams(nextParams)
                    }}
                  >
                    <td>{item.name}</td>
                    <td>{item.code}</td>
                    <td>{item.schoolName}</td>
                    <td>{item.teacherCount}</td>
                    <td>{item.studentCount}</td>
                    <td>{item.assignmentCount}</td>
                    <td>{item.assignmentCount > 0 ? `${item.submissionRate}%` : '-'}</td>
                    <td>{item.riskLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedClass ? (
            <aside className="panel-card operations-panel">
              <div className="panel-header">
                <h3>{selectedClass.name}</h3>
                <p>
                  {selectedClass.schoolName} · 班级编码 {selectedClass.code}
                </p>
              </div>

              <div className="operations-metrics">
                <MetricMini label="教师覆盖" value={`${selectedClass.teacherCount} 人`} />
                <MetricMini label="学员规模" value={`${selectedClass.studentCount} 人`} />
                <MetricMini
                  label="提交率"
                  value={selectedClass.assignmentCount > 0 ? `${selectedClass.submissionRate}%` : '-'}
                />
              </div>

              <div className="action-list">
                <ActionItem
                  title={
                    selectedClass.teacherCount === 0
                      ? '当前班级没有任课教师'
                      : `当前班级有 ${selectedClass.teacherCount} 位教师`
                  }
                  subtitle={
                    selectedClass.teacherCount === 0
                      ? '先补教师，再谈作业推进和点评质量。'
                      : '教师覆盖基本正常，可以继续看作业执行。'
                  }
                  tone={selectedClass.teacherCount === 0 ? 'danger' : 'draft'}
                />
                <ActionItem
                  title={
                    selectedClass.assignmentCount === 0
                      ? '当前班级还没有布置作业'
                      : `已布置 ${selectedClass.assignmentCount} 份作业`
                  }
                  subtitle={
                    selectedClass.assignmentCount === 0
                      ? '建议提醒教师尽快创建本周任务。'
                      : `最近关注：${selectedClass.latestAssignmentTitle}`
                  }
                  tone={selectedClass.assignmentCount === 0 ? 'danger' : 'active'}
                />
                <ActionItem
                  title={
                    selectedClass.overdueAssignmentCount > 0
                      ? `${selectedClass.overdueAssignmentCount} 份作业已逾期`
                      : '当前没有逾期作业'
                  }
                  subtitle={
                    selectedClass.pendingSubmissionCount > 0
                      ? `还有 ${selectedClass.pendingSubmissionCount} 份提交待处理。`
                      : '当前没有待处理点评。'
                  }
                  tone={
                    selectedClass.overdueAssignmentCount > 0
                      ? 'danger'
                      : selectedClass.pendingSubmissionCount > 0
                        ? 'active'
                        : undefined
                  }
                />
              </div>

              <div className="panel-header compact">
                <h3>继续处理</h3>
                <p>按当前班级上下文跳到对应页面，不需要重新筛选。</p>
              </div>

              <div className="action-button-row">
                <button
                  className="ghost-button compact-button"
                  onClick={() => void handleCopySummary(selectedClass)}
                  type="button"
                >
                  复制班级摘要
                </button>
                <button
                  className="ghost-button compact-button"
                  onClick={() => handleExportMembers(selectedClass, 'student')}
                  type="button"
                >
                  导出学员名单
                </button>
                <button
                  className="ghost-button compact-button"
                  onClick={() => handleExportMembers(selectedClass, 'teacher')}
                  type="button"
                >
                  导出教师名单
                </button>
              </div>

              <div className="action-button-row">
                <button
                  className="ghost-button compact-button"
                  onClick={() =>
                    navigate(
                      `/assignments?classId=${selectedClass.id}`,
                    )
                  }
                  type="button"
                >
                  看这班的作业
                </button>
                <button
                  className="ghost-button compact-button"
                  onClick={() =>
                    navigate(
                      `/students?schoolId=${selectedClass.school_id}&classId=${selectedClass.id}`,
                    )
                  }
                  type="button"
                >
                  看这班学员
                </button>
                <button
                  className="ghost-button compact-button"
                  onClick={() =>
                    navigate(`/teachers?schoolId=${selectedClass.school_id}`)
                  }
                  type="button"
                >
                  看校区教师
                </button>
              </div>
            </aside>
          ) : null}
        </div>
      )}
    </div>
  )
}

function buildClassRiskLabel({
  teacherCount,
  studentCount,
  assignmentCount,
  overdueAssignmentCount,
  submissionRate,
}: {
  teacherCount: number
  studentCount: number
  assignmentCount: number
  overdueAssignmentCount: number
  submissionRate: number
}) {
  if (teacherCount === 0) return '缺教师'
  if (assignmentCount === 0) return '无作业'
  if (overdueAssignmentCount > 0) return '有逾期'
  if (studentCount > 0 && submissionRate < 60) return '低提交'
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
        <span className={`status-pill ${tone === 'danger' ? 'danger' : tone}`}>
          {tone === 'danger' ? '优先处理' : tone === 'active' ? '跟进中' : '关注'}
        </span>
      ) : null}
    </div>
  )
}
