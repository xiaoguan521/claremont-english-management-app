import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

type DashboardMetrics = {
  schoolCount: number
  classCount: number
  teacherCount: number
  studentCount: number
  newStudentsToday: number
  classesWithoutTeacher: number
  classesWithoutSubmissions: number
  overdueAssignments: number
}

type ClassRow = {
  id: string
  name: string
  school_id: string
}

type MembershipRow = {
  class_id: string | null
  school_id: string
  role: string
  created_at?: string
}

type AssignmentRow = {
  id: string
  title: string
  class_id: string
  due_at: string | null
  status: string
}

type SubmissionRow = {
  assignment_id: string
  status: string
}

type SchoolWatch = {
  name: string
  classCount: number
  studentCount: number
}

export function DashboardPage() {
  const { memberships } = useAuth()
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    schoolCount: 0,
    classCount: 0,
    teacherCount: 0,
    studentCount: 0,
    newStudentsToday: 0,
    classesWithoutTeacher: 0,
    classesWithoutSubmissions: 0,
    overdueAssignments: 0,
  })
  const [schoolWatch, setSchoolWatch] = useState<SchoolWatch[]>([])

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
          classesWithoutTeacher: 0,
          classesWithoutSubmissions: 0,
          overdueAssignments: 0,
        })
        setSchoolWatch([])
        return
      }

      const [schoolsResponse, classesResponse, membershipsResponse, assignmentsResponse] =
        await Promise.all([
          supabase.from('schools').select('id, name').in('id', schoolIds),
          supabase.from('classes').select('id, name, school_id').in('school_id', schoolIds),
          supabase
            .from('memberships')
            .select('class_id, school_id, role, created_at')
            .in('school_id', schoolIds)
            .in('role', ['teacher', 'student'])
            .eq('status', 'active'),
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

      const schools = (schoolsResponse.data ?? []) as { id: string; name: string }[]
      const classes = (classesResponse.data ?? []) as ClassRow[]
      const membershipRows = (membershipsResponse.data ?? []) as MembershipRow[]
      const assignments = (assignmentsResponse.data ?? []) as AssignmentRow[]

      const assignmentIds = assignments.map((item) => item.id)
      const { data: submissionData, error: submissionError } = assignmentIds.length
        ? await supabase
            .from('submissions')
            .select('assignment_id, status')
            .in('assignment_id', assignmentIds)
        : { data: [], error: null }

      if (submissionError) {
        return
      }

      const submissions = (submissionData ?? []) as SubmissionRow[]
      const submissionsByAssignment = new Map<string, number>()
      submissions.forEach((item) => {
        if (item.status === 'draft') return
        submissionsByAssignment.set(
          item.assignment_id,
          (submissionsByAssignment.get(item.assignment_id) ?? 0) + 1,
        )
      })

      const teacherByClass = new Map<string, number>()
      const studentByClass = new Map<string, number>()
      const studentBySchool = new Map<string, number>()
      let teacherCount = 0
      let studentCount = 0
      let newStudentsToday = 0

      const startOfToday = new Date()
      startOfToday.setHours(0, 0, 0, 0)

      membershipRows.forEach((item) => {
        if (item.role === 'teacher') {
          teacherCount += 1
          if (item.class_id) {
            teacherByClass.set(item.class_id, (teacherByClass.get(item.class_id) ?? 0) + 1)
          }
        }

        if (item.role === 'student') {
          studentCount += 1
          studentBySchool.set(item.school_id, (studentBySchool.get(item.school_id) ?? 0) + 1)
          if (item.class_id) {
            studentByClass.set(item.class_id, (studentByClass.get(item.class_id) ?? 0) + 1)
          }
          if (item.created_at && new Date(item.created_at) >= startOfToday) {
            newStudentsToday += 1
          }
        }
      })

      const classesWithoutTeacher = classes.filter(
        (item) => (teacherByClass.get(item.id) ?? 0) === 0,
      ).length

      const assignmentsByClass = new Map<string, AssignmentRow[]>()
      let overdueAssignments = 0
      const now = new Date()
      assignments.forEach((item) => {
        const current = assignmentsByClass.get(item.class_id) ?? []
        current.push(item)
        assignmentsByClass.set(item.class_id, current)

        if (item.due_at && new Date(item.due_at) < now && item.status === 'published') {
          overdueAssignments += 1
        }
      })

      const classesWithoutSubmissions = classes.filter((item) => {
        const classAssignments = assignmentsByClass.get(item.id) ?? []
        if (classAssignments.length === 0) return true
        return classAssignments.every(
          (assignment) => (submissionsByAssignment.get(assignment.id) ?? 0) === 0,
        )
      }).length

      setMetrics({
        schoolCount: schools.length,
        classCount: classes.length,
        teacherCount,
        studentCount,
        newStudentsToday,
        classesWithoutTeacher,
        classesWithoutSubmissions,
        overdueAssignments,
      })

      setSchoolWatch(
        schools.map((school) => ({
          name: school.name,
          classCount: classes.filter((item) => item.school_id === school.id).length,
          studentCount: studentBySchool.get(school.id) ?? 0,
        })),
      )
    }

    void load()
  }, [memberships, schoolIds])

  return (
    <div className="page-layout">
      <header className="page-header">
        <div>
          <h2>校区经营看板</h2>
          <p>先看异常，再看规模数据，管理端每天打开要先知道哪里需要介入。</p>
        </div>
        <div className="page-tag">运营总览</div>
      </header>

      <section className="metrics-grid">
        <article className="metric-card">
          <span>今日新增学员</span>
          <strong>{metrics.newStudentsToday}</strong>
          <p>今天新创建并落班的学生账号</p>
        </article>
        <article className="metric-card">
          <span>教师覆盖不足</span>
          <strong>{metrics.classesWithoutTeacher}</strong>
          <p>当前还没有绑定任课教师的班级</p>
        </article>
        <article className="metric-card">
          <span>无提交班级</span>
          <strong>{metrics.classesWithoutSubmissions}</strong>
          <p>有班级但还没有看到有效提交数据</p>
        </article>
        <article className="metric-card">
          <span>逾期作业</span>
          <strong>{metrics.overdueAssignments}</strong>
          <p>已过截止时间但仍处于发布状态</p>
        </article>
      </section>

      <section className="two-column">
        <article className="panel-card">
          <div className="panel-header">
            <h3>今天优先关注</h3>
            <p>按管理动作来排，不再显示开发过程说明。</p>
          </div>
          <div className="action-list">
            <ActionItem
              title="先补教师覆盖不足的班级"
              subtitle={`当前有 ${metrics.classesWithoutTeacher} 个班还没有任课教师。`}
              tone="draft"
            />
            <ActionItem
              title="检查无提交班级的作业执行"
              subtitle={`当前有 ${metrics.classesWithoutSubmissions} 个班级没有看到有效提交。`}
              tone="active"
            />
            <ActionItem
              title="跟进今天新建的学生账号"
              subtitle={`今天新增 ${metrics.newStudentsToday} 个学员账号，确认已发放给家长或老师。`}
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
              去作业总览
            </Link>
          </div>
        </article>

        <article className="school-overview">
          <div className="panel-header">
            <h3>校区规模视图</h3>
            <p>快速确认每个校区当前承载的班级和学员规模。</p>
          </div>
          <ul className="school-list">
            {schoolWatch.map((item) => (
              <li key={item.name}>
                <div className="info-meta">
                  <strong>{item.name}</strong>
                  <span>
                    {item.classCount} 个班级 · {item.studentCount} 名学员
                  </span>
                </div>
                <span className="status-pill active">已接通</span>
              </li>
            ))}
          </ul>
        </article>
      </section>

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
  tone?: 'active' | 'draft'
}) {
  return (
    <div className="action-item">
      <div className="info-meta">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      <span className={`status-pill ${tone ?? ''}`.trim()}>{tone === 'draft' ? '优先' : '跟进中'}</span>
    </div>
  )
}
