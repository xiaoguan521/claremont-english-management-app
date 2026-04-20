import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

type DashboardMetrics = {
  schoolCount: number
  classCount: number
  teacherCount: number
  studentCount: number
  newStudentsToday: number
  pendingStudentActivations: number
  classesWithoutTeacher: number
  classesWithoutSubmissions: number
  overdueAssignments: number
  aiReviewFailures: number
}

type SchoolRow = {
  id: string
  name: string
}

type ClassRow = {
  id: string
  name: string
  school_id: string
}

type MembershipRow = {
  user_id: string
  class_id: string | null
  school_id: string
  role: string
  status: 'active' | 'invited' | 'disabled'
  created_at?: string
}

type ProfileRow = {
  id: string
  display_name: string | null
}

type AssignmentRow = {
  id: string
  title: string
  class_id: string
  school_id: string
  due_at: string | null
  status: string
}

type SubmissionRow = {
  id: string
  assignment_id: string
  status: string
}

type EvaluationJobRow = {
  submission_id: string
  status: string | null
  last_error: string | null
  updated_at?: string
}

type SchoolWatch = {
  id: string
  name: string
  classCount: number
  studentCount: number
}

type ClassIssue = {
  id: string
  name: string
  schoolId: string
  schoolName: string
  reason: '缺教师' | '无提交'
}

type AssignmentIssue = {
  id: string
  title: string
  classId: string
  className: string
  schoolId: string
  schoolName: string
  dueAt: string | null
}

type ActivationIssue = {
  id: string
  name: string
  schoolId: string
  schoolName: string
}

type AiReviewIssue = {
  id: string
  title: string
  classId: string
  className: string
  schoolId: string
  schoolName: string
  failedCount: number
  lastError: string | null
}

export function DashboardPage() {
  const { memberships } = useAuth()
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    schoolCount: 0,
    classCount: 0,
    teacherCount: 0,
    studentCount: 0,
    newStudentsToday: 0,
    pendingStudentActivations: 0,
    classesWithoutTeacher: 0,
    classesWithoutSubmissions: 0,
    overdueAssignments: 0,
    aiReviewFailures: 0,
  })
  const [schoolWatch, setSchoolWatch] = useState<SchoolWatch[]>([])
  const [classIssues, setClassIssues] = useState<ClassIssue[]>([])
  const [assignmentIssues, setAssignmentIssues] = useState<AssignmentIssue[]>([])
  const [activationIssues, setActivationIssues] = useState<ActivationIssue[]>([])
  const [aiReviewIssues, setAiReviewIssues] = useState<AiReviewIssue[]>([])

  const schoolIds = useMemo(
    () => Array.from(new Set(memberships.map((item) => item.school_id))),
    [memberships],
  )

  useEffect(() => {
    const load = async () => {
      if (schoolIds.length === 0) {
        setMetrics({
          schoolCount: 0,
          classCount: 0,
          teacherCount: 0,
          studentCount: 0,
          newStudentsToday: 0,
          pendingStudentActivations: 0,
          classesWithoutTeacher: 0,
          classesWithoutSubmissions: 0,
          overdueAssignments: 0,
          aiReviewFailures: 0,
        })
        setSchoolWatch([])
        setClassIssues([])
        setAssignmentIssues([])
        setActivationIssues([])
        setAiReviewIssues([])
        return
      }

      const [schoolsResponse, classesResponse, membershipsResponse, assignmentsResponse] =
        await Promise.all([
          supabase.from('schools').select('id, name').in('id', schoolIds),
          supabase.from('classes').select('id, name, school_id').in('school_id', schoolIds),
          supabase
            .from('memberships')
            .select('user_id, class_id, school_id, role, status, created_at')
            .in('school_id', schoolIds)
            .in('role', ['teacher', 'student']),
          supabase
            .from('assignments')
            .select('id, title, class_id, due_at, status')
            .in('school_id', schoolIds),
        ])

      if (
        schoolsResponse.error ||
        classesResponse.error ||
        membershipsResponse.error ||
        assignmentsResponse.error
      ) {
        return
      }

      const schools = (schoolsResponse.data ?? []) as SchoolRow[]
      const classes = (classesResponse.data ?? []) as ClassRow[]
      const membershipRows = (membershipsResponse.data ?? []) as MembershipRow[]
      const assignments = (assignmentsResponse.data ?? []) as AssignmentRow[]

      const assignmentIds = assignments.map((item) => item.id)
      const userIds = Array.from(new Set(membershipRows.map((item) => item.user_id)))

      const [
        { data: submissionData, error: submissionError },
        { data: profileRows, error: profileError },
      ] =
        await Promise.all([
          assignmentIds.length
            ? supabase
                .from('submissions')
                .select('id, assignment_id, status')
                .in('assignment_id', assignmentIds)
            : Promise.resolve({ data: [], error: null }),
          userIds.length
            ? supabase.from('profiles').select('id, display_name').in('id', userIds)
            : Promise.resolve({ data: [], error: null }),
        ])

      if (submissionError || profileError) {
        return
      }

      const submissions = (submissionData ?? []) as SubmissionRow[]
      const submissionIdsFromRows = submissions.map((item) => item.id)
      const { data: evaluationJobRows, error: evaluationJobsError } = submissionIdsFromRows.length
        ? await supabase
            .from('evaluation_jobs')
            .select('submission_id, status, last_error, updated_at')
            .in('submission_id', submissionIdsFromRows)
            .order('updated_at', { ascending: false })
        : { data: [], error: null }

      if (evaluationJobsError) {
        return
      }

      const evaluationJobs = (evaluationJobRows ?? []) as EvaluationJobRow[]
      const profileMap = new Map(
        ((profileRows ?? []) as ProfileRow[]).map((item) => [item.id, item.display_name ?? item.id]),
      )
      const schoolMap = new Map(schools.map((item) => [item.id, item.name]))
      const classMap = new Map(classes.map((item) => [item.id, item]))
      const submissionsByAssignment = new Map<string, number>()
      submissions.forEach((item) => {
        if (item.status === 'draft') return
        submissionsByAssignment.set(
          item.assignment_id,
          (submissionsByAssignment.get(item.assignment_id) ?? 0) + 1,
        )
      })

      const latestEvaluationJobBySubmission = new Map<string, EvaluationJobRow>()
      evaluationJobs.forEach((item) => {
        if (!latestEvaluationJobBySubmission.has(item.submission_id)) {
          latestEvaluationJobBySubmission.set(item.submission_id, item)
        }
      })

      const aiFailedSummaryByAssignment = new Map<
        string,
        { failedCount: number; lastError: string | null }
      >()
      let aiReviewFailures = 0

      submissions.forEach((submission) => {
        const latestJob = latestEvaluationJobBySubmission.get(submission.id)
        if (latestJob?.status !== 'failed') return

        aiReviewFailures += 1
        const current = aiFailedSummaryByAssignment.get(submission.assignment_id) ?? {
          failedCount: 0,
          lastError: null,
        }
        current.failedCount += 1
        current.lastError = current.lastError ?? latestJob.last_error ?? null
        aiFailedSummaryByAssignment.set(submission.assignment_id, current)
      })

      const teacherByClass = new Map<string, number>()
      const studentByClass = new Map<string, number>()
      const studentBySchool = new Map<string, number>()
      let teacherCount = 0
      let studentCount = 0
      let newStudentsToday = 0
      let pendingStudentActivations = 0
      const pendingActivationWatch: ActivationIssue[] = []

      const startOfToday = new Date()
      startOfToday.setHours(0, 0, 0, 0)

      membershipRows.forEach((item) => {
        if (item.role === 'teacher' && item.status === 'active') {
          teacherCount += 1
          if (item.class_id) {
            teacherByClass.set(item.class_id, (teacherByClass.get(item.class_id) ?? 0) + 1)
          }
        }

        if (item.role === 'student') {
          if (item.status === 'active') {
            studentCount += 1
            studentBySchool.set(item.school_id, (studentBySchool.get(item.school_id) ?? 0) + 1)
            if (item.class_id) {
              studentByClass.set(item.class_id, (studentByClass.get(item.class_id) ?? 0) + 1)
            }
            if (item.created_at && new Date(item.created_at) >= startOfToday) {
              newStudentsToday += 1
            }
          }

          if (item.status === 'invited') {
            pendingStudentActivations += 1
            if (pendingActivationWatch.length < 4) {
              pendingActivationWatch.push({
                id: item.user_id,
                name: profileMap.get(item.user_id) ?? item.user_id,
                schoolId: item.school_id,
                schoolName: schoolMap.get(item.school_id) ?? item.school_id,
              })
            }
          }
        }
      })

      const assignmentsByClass = new Map<string, AssignmentRow[]>()
      const overdueWatch: AssignmentIssue[] = []
      let overdueAssignments = 0
      const now = new Date()
      assignments.forEach((item) => {
        const current = assignmentsByClass.get(item.class_id) ?? []
        current.push(item)
        assignmentsByClass.set(item.class_id, current)

        if (item.due_at && new Date(item.due_at) < now && item.status === 'published') {
          overdueAssignments += 1
          if (overdueWatch.length < 4) {
            const classRecord = classMap.get(item.class_id)
            overdueWatch.push({
              id: item.id,
              title: item.title,
              classId: item.class_id,
              className: classRecord?.name ?? item.class_id,
              schoolId: classRecord?.school_id ?? '',
              schoolName: classRecord ? schoolMap.get(classRecord.school_id) ?? classRecord.school_id : '-',
              dueAt: item.due_at,
            })
          }
        }
      })

      const noTeacherClasses: ClassIssue[] = []
      const noSubmissionClasses: ClassIssue[] = []

      classes.forEach((item) => {
        const schoolName = schoolMap.get(item.school_id) ?? item.school_id
        const classAssignments = assignmentsByClass.get(item.id) ?? []
        const noTeacher = (teacherByClass.get(item.id) ?? 0) === 0
        const noSubmission =
          classAssignments.length === 0 ||
          classAssignments.every((assignment) => (submissionsByAssignment.get(assignment.id) ?? 0) === 0)

        if (noTeacher && noTeacherClasses.length < 4) {
          noTeacherClasses.push({
            id: item.id,
            name: item.name,
            schoolId: item.school_id,
            schoolName,
            reason: '缺教师',
          })
        }

        if (noSubmission && noSubmissionClasses.length < 4) {
          noSubmissionClasses.push({
            id: item.id,
            name: item.name,
            schoolId: item.school_id,
            schoolName,
            reason: '无提交',
          })
        }
      })

      setMetrics({
        schoolCount: schools.length,
        classCount: classes.length,
        teacherCount,
        studentCount,
        newStudentsToday,
        pendingStudentActivations,
        classesWithoutTeacher: classes.filter((item) => (teacherByClass.get(item.id) ?? 0) === 0).length,
        classesWithoutSubmissions: classes.filter((item) => {
          const classAssignments = assignmentsByClass.get(item.id) ?? []
          if (classAssignments.length === 0) return true
          return classAssignments.every(
            (assignment) => (submissionsByAssignment.get(assignment.id) ?? 0) === 0,
          )
        }).length,
        overdueAssignments,
        aiReviewFailures,
      })

      setSchoolWatch(
        schools.map((school) => ({
          id: school.id,
          name: school.name,
          classCount: classes.filter((item) => item.school_id === school.id).length,
          studentCount: studentBySchool.get(school.id) ?? 0,
        })),
      )
      setClassIssues([...noTeacherClasses, ...noSubmissionClasses].slice(0, 6))
      setAssignmentIssues(overdueWatch)
      setActivationIssues(pendingActivationWatch)
      setAiReviewIssues(
        assignments
          .map((assignment) => {
            const aiSummary = aiFailedSummaryByAssignment.get(assignment.id)
            if (!aiSummary) return null

            const classRecord = classMap.get(assignment.class_id)
            return {
              id: assignment.id,
              title: assignment.title,
              classId: assignment.class_id,
              className: classRecord?.name ?? assignment.class_id,
              schoolId: classRecord?.school_id ?? assignment.school_id,
              schoolName: classRecord
                ? schoolMap.get(classRecord.school_id) ?? classRecord.school_id
                : schoolMap.get(assignment.school_id) ?? assignment.school_id,
              failedCount: aiSummary.failedCount,
              lastError: aiSummary.lastError,
            }
          })
          .filter(Boolean)
          .sort((left, right) => (right?.failedCount ?? 0) - (left?.failedCount ?? 0))
          .slice(0, 4) as AiReviewIssue[],
      )
    }

    void load()
  }, [memberships, schoolIds])

  return (
    <div className="page-layout">
      <header className="page-header">
        <div>
          <h2>校区经营看板</h2>
          <p>首页就能点进异常班级、待激活学员和逾期作业，不再停留在只读统计。</p>
        </div>
        <div className="page-tag">运营总览</div>
      </header>

      <section className="metrics-grid">
        <MetricLinkCard
          description="需要提醒家长或老师先完成首次登录"
          label="待激活学员"
          to="/students?status=invited"
          value={metrics.pendingStudentActivations}
        />
        <MetricLinkCard
          description="当前还没有绑定任课教师的班级"
          label="教师覆盖不足"
          to="/classes?risk=no_teacher"
          value={metrics.classesWithoutTeacher}
        />
        <MetricLinkCard
          description="有班级但还没有看到有效提交数据"
          label="无提交班级"
          to="/classes?risk=no_submissions"
          value={metrics.classesWithoutSubmissions}
        />
        <MetricLinkCard
          description="已过截止时间但仍处于发布状态"
          label="逾期作业"
          to="/assignments?risk=overdue"
          value={metrics.overdueAssignments}
        />
        <MetricLinkCard
          description="AI 初评失败的提交需要尽快人工接住"
          label="AI 初评失败"
          to="/assignments?risk=ai_failed"
          value={metrics.aiReviewFailures}
        />
      </section>

      <section className="two-column">
        <article className="panel-card">
          <div className="panel-header">
            <h3>今天优先关注</h3>
            <p>看板上的高频异常，直接点就能进对应处理页。</p>
          </div>
          <div className="action-list">
            <ActionItem
              subtitle={`当前有 ${metrics.pendingStudentActivations} 名学员还未完成激活。`}
              title="跟进待激活学员"
              to="/students?status=invited"
              tone={metrics.pendingStudentActivations > 0 ? 'draft' : 'active'}
            />
            <ActionItem
              subtitle={`当前有 ${metrics.classesWithoutTeacher} 个班还没有任课教师。`}
              title="先补教师覆盖不足的班级"
              to="/classes?risk=no_teacher"
              tone="draft"
            />
            <ActionItem
              subtitle={`当前有 ${metrics.classesWithoutSubmissions} 个班级没有看到有效提交。`}
              title="检查无提交班级的作业执行"
              to="/classes?risk=no_submissions"
              tone="active"
            />
            <ActionItem
              subtitle={`当前有 ${metrics.aiReviewFailures} 条 AI 初评失败记录需要人工兜底。`}
              title="优先处理 AI 初评异常作业"
              to="/assignments?risk=ai_failed"
              tone={metrics.aiReviewFailures > 0 ? 'danger' : undefined}
            />
            <ActionItem
              subtitle={`今天新增 ${metrics.newStudentsToday} 个学员账号，确认已发放给家长或老师。`}
              title="跟进今天新建的学生账号"
              to="/students"
            />
          </div>

          <div className="action-links">
            <Link className="quick-link" to="/teachers">
              去教师档案
            </Link>
            <Link className="quick-link" to="/students">
              去学员名单
            </Link>
            <Link className="quick-link" to="/assignments">
              去作业异常
            </Link>
          </div>
        </article>

        <article className="panel-card">
          <div className="panel-header">
            <h3>异常清单</h3>
            <p>用最短路径进入当前真正需要处理的对象。</p>
          </div>

          <DashboardIssueGroup title="班级异常">
            {classIssues.length === 0 ? (
              <div className="empty-inline">当前没有明显的班级异常。</div>
            ) : (
              <ul className="info-list">
                {classIssues.map((item) => (
                  <li key={`${item.reason}-${item.id}`}>
                    <div className="info-meta">
                      <strong>{item.name}</strong>
                      <span>
                        {item.schoolName} · {item.reason}
                      </span>
                    </div>
                    <Link className="quick-link" to={`/classes?classId=${item.id}`}>
                      去处理
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </DashboardIssueGroup>

          <DashboardIssueGroup title="逾期作业">
            {assignmentIssues.length === 0 ? (
              <div className="empty-inline">当前没有逾期作业。</div>
            ) : (
              <ul className="info-list">
                {assignmentIssues.map((item) => (
                  <li key={item.id}>
                    <div className="info-meta">
                      <strong>{item.title}</strong>
                      <span>
                        {item.schoolName} · {item.className}
                        {item.dueAt ? ` · ${new Date(item.dueAt).toLocaleString()}` : ''}
                      </span>
                    </div>
                    <Link className="quick-link" to={`/assignments?classId=${item.classId}&risk=overdue`}>
                      去处理
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </DashboardIssueGroup>

          <DashboardIssueGroup title="AI 初评异常">
            {aiReviewIssues.length === 0 ? (
              <div className="empty-inline">当前没有 AI 初评失败记录。</div>
            ) : (
              <ul className="info-list">
                {aiReviewIssues.map((item) => (
                  <li key={item.id}>
                    <div className="info-meta">
                      <strong>{item.title}</strong>
                      <span>
                        {item.schoolName} · {item.className} · 失败 {item.failedCount} 条
                        {item.lastError ? ` · ${friendlyManagementAiError(item.lastError)}` : ''}
                      </span>
                    </div>
                    <Link
                      className="quick-link"
                      to={`/assignments?assignmentId=${item.id}&risk=ai_failed`}
                    >
                      去处理
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </DashboardIssueGroup>

          <DashboardIssueGroup title="待激活学员">
            {activationIssues.length === 0 ? (
              <div className="empty-inline">当前没有待激活学员。</div>
            ) : (
              <ul className="info-list">
                {activationIssues.map((item) => (
                  <li key={item.id}>
                    <div className="info-meta">
                      <strong>{item.name}</strong>
                      <span>{item.schoolName}</span>
                    </div>
                    <Link className="quick-link" to={`/students?schoolId=${item.schoolId}&status=invited`}>
                      去处理
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </DashboardIssueGroup>
        </article>
      </section>

      <section className="two-column">
        <article className="school-overview">
          <div className="panel-header">
            <h3>校区规模视图</h3>
            <p>快速确认每个校区当前承载的班级和学员规模。</p>
          </div>
          <ul className="school-list">
            {schoolWatch.map((item) => (
              <li key={item.id}>
                <div className="info-meta">
                  <strong>{item.name}</strong>
                  <span>
                    {item.classCount} 个班级 · {item.studentCount} 名学员
                  </span>
                </div>
                <Link className="quick-link" to={`/students?schoolId=${item.id}`}>
                  查看校区
                </Link>
              </li>
            ))}
          </ul>
        </article>

        <section className="metrics-grid secondary-grid">
          <article className="metric-card">
            <span>校区数</span>
            <strong>{metrics.schoolCount}</strong>
            <p>当前账号可管理的校区范围</p>
          </article>
          <article className="metric-card">
            <span>班级数</span>
            <strong>{metrics.classCount}</strong>
            <p>在读班级与教学组织对象</p>
          </article>
          <article className="metric-card">
            <span>教师数</span>
            <strong>{metrics.teacherCount}</strong>
            <p>活跃教师与校区管理员总数</p>
          </article>
          <article className="metric-card">
            <span>学员数</span>
            <strong>{metrics.studentCount}</strong>
            <p>当前已归档到校区范围内的学员</p>
          </article>
        </section>
      </section>
    </div>
  )
}

function friendlyManagementAiError(error: string) {
  const lowered = error.toLowerCase()
  if (lowered.includes('transcription')) {
    return '转写失败'
  }
  if (
    lowered.includes('503') ||
    lowered.includes('temporarily unavailable') ||
    lowered.includes('timeout')
  ) {
    return '上游 AI 暂不可用'
  }
  if (lowered.includes('download')) {
    return '音频附件读取失败'
  }
  return error
}

function MetricLinkCard({
  label,
  value,
  description,
  to,
}: {
  label: string
  value: number
  description: string
  to: string
}) {
  return (
    <Link className="metric-card metric-card-link" to={to}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{description}</p>
    </Link>
  )
}

function ActionItem({
  title,
  subtitle,
  tone,
  to,
}: {
  title: string
  subtitle: string
  tone?: 'active' | 'draft' | 'danger'
  to: string
}) {
  return (
    <Link className="action-item action-item-link" to={to}>
      <div className="info-meta">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      <span className={`status-pill ${tone ?? ''}`.trim()}>
        {tone === 'draft' ? '优先' : tone === 'danger' ? '先处理' : '跟进中'}
      </span>
    </Link>
  )
}

function DashboardIssueGroup({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="dashboard-issue-group">
      <div className="panel-header compact">
        <h3>{title}</h3>
      </div>
      {children}
    </section>
  )
}
