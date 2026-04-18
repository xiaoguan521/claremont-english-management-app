import { useEffect, useState } from 'react'

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

type AssignmentView = AssignmentRow & {
  className: string
}

export function AssignmentsPage() {
  const { memberships } = useAuth()
  const [assignments, setAssignments] = useState<AssignmentView[]>([])

  useEffect(() => {
    const load = async () => {
      const schoolIds = Array.from(new Set(memberships.map((item) => item.school_id)))
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
        console.error(assignmentError)
        return
      }

      const classIds = Array.from(
        new Set((assignmentRows ?? []).map((item) => item.class_id)),
      )
      const { data: classRows, error: classError } = await supabase
        .from('classes')
        .select('id, name')
        .in('id', classIds)

      if (classError) {
        console.error(classError)
        return
      }

      const classMap = new Map(
        ((classRows ?? []) as ClassRow[]).map((item) => [item.id, item.name]),
      )

      setAssignments(
        ((assignmentRows ?? []) as AssignmentRow[]).map((item) => ({
          ...item,
          className: classMap.get(item.class_id) ?? item.class_id,
        })),
      )
    }

    void load()
  }, [memberships])

  return (
    <div className="page-layout">
      <header className="page-header">
        <div>
          <h2>作业总览</h2>
          <p>从校区角度查看班级作业的发布状态，后续继续接完成率和提交进度。</p>
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
                    className={`status-pill ${item.status === 'draft' ? 'draft' : 'active'}`}
                  >
                    {item.status}
                  </span>
                </td>
                <td>{item.due_at ? new Date(item.due_at).toLocaleString() : '未设置'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
