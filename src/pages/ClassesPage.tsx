import { useEffect, useState } from 'react'

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

type ClassView = ClassRecord & {
  schoolName: string
  teacherCount: number
  studentCount: number
}

export function ClassesPage() {
  const { memberships } = useAuth()
  const [classes, setClasses] = useState<ClassView[]>([])

  useEffect(() => {
    const load = async () => {
      const schoolIds = Array.from(new Set(memberships.map((item) => item.school_id)))
      if (schoolIds.length === 0) {
        setClasses([])
        return
      }

      const [classesResponse, schoolsResponse, membershipsResponse] = await Promise.all([
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
      ])

      if (classesResponse.error || schoolsResponse.error || membershipsResponse.error) {
        console.error(
          classesResponse.error || schoolsResponse.error || membershipsResponse.error,
        )
        return
      }

      const schoolMap = new Map(
        (schoolsResponse.data ?? []).map((item) => [item.id as string, item.name as string]),
      )

      const counters = new Map<string, { teacherCount: number; studentCount: number }>()
      ;((membershipsResponse.data ?? []) as MembershipCountRow[]).forEach((item) => {
        if (!item.class_id) return

        const current = counters.get(item.class_id) ?? {
          teacherCount: 0,
          studentCount: 0,
        }

        if (item.role === 'teacher') current.teacherCount += 1
        if (item.role === 'student') current.studentCount += 1
        counters.set(item.class_id, current)
      })

      setClasses(
        ((classesResponse.data ?? []) as ClassRecord[]).map((item) => ({
          ...item,
          schoolName: schoolMap.get(item.school_id) ?? item.school_id,
          teacherCount: counters.get(item.id)?.teacherCount ?? 0,
          studentCount: counters.get(item.id)?.studentCount ?? 0,
        })),
      )
    }

    void load()
  }, [memberships])

  return (
    <div className="page-layout">
      <header className="page-header">
        <div>
          <h2>班级编排</h2>
          <p>按校区查看班级结构，后续从这里继续做调班、排班与任课教师绑定。</p>
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
              <th>状态</th>
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
                <td>
                  <span className="status-pill active">在读</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
