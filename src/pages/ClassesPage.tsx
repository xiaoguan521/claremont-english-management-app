import { useEffect, useMemo, useState } from 'react'

import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

type ClassRecord = {
  id: string
  name: string
  code: string
  school_id: string
}

type MembershipCountRow = {
  class_id: string | null
  role: string
}

type AssignmentRow = {
  id: string
  class_id: string
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
  submissionRate: number
}

export function ClassesPage() {
  const { memberships } = useAuth()
  const [classes, setClasses] = useState<ClassView[]>([])

  const schoolIds = useMemo(
    () => Array.from(new Set(memberships.map((item) => item.school_id))),
    [memberships],
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
            .select('class_id, role')
            .in('school_id', schoolIds)
            .in('role', ['teacher', 'student'])
            .eq('status', 'active'),
          supabase.from('assignments').select('id, class_id').in('school_id', schoolIds),
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
      const { data: submissionsData, error: submissionsError } = assignmentIds.length
        ? await supabase
            .from('submissions')
            .select('assignment_id, status')
            .in('assignment_id', assignmentIds)
        : { data: [], error: null }

      if (submissionsError) return

      const schoolMap = new Map(
        (schoolsResponse.data ?? []).map((item) => [item.id as string, item.name as string]),
      )

      const counters = new Map<
        string,
        { teacherCount: number; studentCount: number; assignmentCount: number }
      >()
      ;((membershipsResponse.data ?? []) as MembershipCountRow[]).forEach((item) => {
        if (!item.class_id) return

        const current = counters.get(item.class_id) ?? {
          teacherCount: 0,
          studentCount: 0,
          assignmentCount: 0,
        }

        if (item.role === 'teacher') current.teacherCount += 1
        if (item.role === 'student') current.studentCount += 1
        counters.set(item.class_id, current)
      })

      assignments.forEach((item) => {
        const current = counters.get(item.class_id) ?? {
          teacherCount: 0,
          studentCount: 0,
          assignmentCount: 0,
        }
        current.assignmentCount += 1
        counters.set(item.class_id, current)
      })

      const assignmentClassMap = new Map(assignments.map((item) => [item.id, item.class_id]))
      const submittedByClass = new Map<string, number>()
      ;((submissionsData ?? []) as SubmissionRow[]).forEach((item) => {
        const classId = assignmentClassMap.get(item.assignment_id)
        if (!classId || item.status === 'draft') return
        submittedByClass.set(classId, (submittedByClass.get(classId) ?? 0) + 1)
      })

      setClasses(
        classRows.map((item) => {
          const current = counters.get(item.id) ?? {
            teacherCount: 0,
            studentCount: 0,
            assignmentCount: 0,
          }
          const expectedSubmissions = current.studentCount * current.assignmentCount
          const actualSubmissions = submittedByClass.get(item.id) ?? 0

          return {
            ...item,
            schoolName: schoolMap.get(item.school_id) ?? item.school_id,
            teacherCount: current.teacherCount,
            studentCount: current.studentCount,
            assignmentCount: current.assignmentCount,
            submissionRate:
              expectedSubmissions > 0
                ? Math.round((actualSubmissions / expectedSubmissions) * 100)
                : 0,
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
          <h2>班级编排</h2>
          <p>先看班级承载、教师覆盖和作业执行，再决定调班或补教师。</p>
        </div>
        <div className="page-tag">Classes</div>
      </header>

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
            </tr>
          </thead>
          <tbody>
            {classes.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.code}</td>
                <td>{item.schoolName}</td>
                <td>{item.teacherCount}</td>
                <td>{item.studentCount}</td>
                <td>{item.assignmentCount}</td>
                <td>{item.assignmentCount > 0 ? `${item.submissionRate}%` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
