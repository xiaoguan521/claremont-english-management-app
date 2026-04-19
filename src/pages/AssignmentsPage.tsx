import { useEffect, useMemo, useState } from 'react'

import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

type AssignmentRow = {
  id: string
  title: string
  class_id: string
  status: string
  due_at: string | null
}

type ClassRow = {
  id: string
  name: string
}

type MembershipRow = {
  class_id: string | null
  role: string
}

type SubmissionRow = {
  assignment_id: string
  status: string
}

type AssignmentView = AssignmentRow & {
  className: string
  submissionRate: number
  pendingCount: number
  overdue: boolean
}

export function AssignmentsPage() {
  const { memberships } = useAuth()
  const [assignments, setAssignments] = useState<AssignmentView[]>([])

  const schoolIds = useMemo(
    () => Array.from(new Set(memberships.map((item) => item.school_id))),
    [memberships],
  )

  useEffect(() => {
    const load = async () => {
      if (schoolIds.length === 0) {
        setAssignments([])
        return
      }

      const { data: assignmentRows, error: assignmentError } = await supabase
        .from('assignments')
        .select('id, title, class_id, status, due_at')
        .in('school_id', schoolIds)
        .order('created_at', { ascending: false })

      if (assignmentError) {
        return
      }

      const assignmentList = (assignmentRows ?? []) as AssignmentRow[]
      const classIds = Array.from(new Set(assignmentList.map((item) => item.class_id)))
      const assignmentIds = assignmentList.map((item) => item.id)

      const [classResponse, membershipResponse, submissionsResponse] = await Promise.all([
        classIds.length
          ? supabase.from('classes').select('id, name').in('id', classIds)
          : Promise.resolve({ data: [], error: null }),
        classIds.length
          ? supabase
              .from('memberships')
              .select('class_id, role')
              .in('class_id', classIds)
              .eq('role', 'student')
              .eq('status', 'active')
          : Promise.resolve({ data: [], error: null }),
        assignmentIds.length
          ? supabase
              .from('submissions')
              .select('assignment_id, status')
              .in('assignment_id', assignmentIds)
          : Promise.resolve({ data: [], error: null }),
      ])

      if (classResponse.error || membershipResponse.error || submissionsResponse.error) {
        return
      }

      const classMap = new Map(
        ((classResponse.data ?? []) as ClassRow[]).map((item) => [item.id, item.name]),
      )
      const studentsByClass = new Map<string, number>()
      ;((membershipResponse.data ?? []) as MembershipRow[]).forEach((item) => {
        if (!item.class_id) return
        studentsByClass.set(item.class_id, (studentsByClass.get(item.class_id) ?? 0) + 1)
      })

      const submittedByAssignment = new Map<string, number>()
      const pendingByAssignment = new Map<string, number>()
      ;((submissionsResponse.data ?? []) as SubmissionRow[]).forEach((item) => {
        if (item.status !== 'draft') {
          submittedByAssignment.set(
            item.assignment_id,
            (submittedByAssignment.get(item.assignment_id) ?? 0) + 1,
          )
        }
        if (item.status !== 'draft' && item.status !== 'completed') {
          pendingByAssignment.set(
            item.assignment_id,
            (pendingByAssignment.get(item.assignment_id) ?? 0) + 1,
          )
        }
      })

      const now = new Date()
      setAssignments(
        assignmentList.map((item) => {
          const expectedStudents = studentsByClass.get(item.class_id) ?? 0
          const submittedCount = submittedByAssignment.get(item.id) ?? 0
          return {
            ...item,
            className: classMap.get(item.class_id) ?? item.class_id,
            submissionRate:
              expectedStudents > 0
                ? Math.round((submittedCount / expectedStudents) * 100)
                : 0,
            pendingCount: pendingByAssignment.get(item.id) ?? 0,
            overdue:
              Boolean(item.due_at) &&
              new Date(item.due_at as string) < now &&
              item.status === 'published',
          }
        }),
      )
    }

    void load()
  }, [memberships, schoolIds])

  return (
    <div className="page-layout">
      <header className="page-header">
        <div>
          <h2>作业总览</h2>
          <p>从校区角度看发布、提交和逾期状态，方便运营和教务一起跟进。</p>
        </div>
        <div className="page-tag">Assignments</div>
      </header>

      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>作业名称</th>
              <th>班级</th>
              <th>状态</th>
              <th>提交率</th>
              <th>待处理</th>
              <th>截止时间</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((item) => (
              <tr key={item.id}>
                <td>{item.title}</td>
                <td>{item.className}</td>
                <td>
                  <span
                    className={`status-pill ${
                      item.overdue ? 'draft' : item.status === 'draft' ? 'draft' : 'active'
                    }`}
                  >
                    {item.overdue ? '已逾期' : mapAssignmentStatus(item.status)}
                  </span>
                </td>
                <td>{item.status === 'draft' ? '-' : `${item.submissionRate}%`}</td>
                <td>{item.pendingCount > 0 ? `${item.pendingCount} 份` : '无'}</td>
                <td>{item.due_at ? new Date(item.due_at).toLocaleString() : '未设置'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function mapAssignmentStatus(status: string) {
  if (status === 'published') return '已发布'
  if (status === 'closed') return '已截止'
  if (status === 'archived') return '已归档'
  return '草稿'
}
