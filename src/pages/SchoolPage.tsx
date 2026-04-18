import { useEffect, useState } from 'react'

import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

type SchoolRecord = {
  id: string
  name: string
  code: string
  timezone: string
}

export function SchoolPage() {
  const { memberships } = useAuth()
  const [schools, setSchools] = useState<SchoolRecord[]>([])

  useEffect(() => {
    const load = async () => {
      const schoolIds = Array.from(new Set(memberships.map((item) => item.school_id)))
      if (schoolIds.length === 0) {
        setSchools([])
        return
      }

      const { data, error } = await supabase
        .from('schools')
        .select('id, name, code, timezone')
        .in('id', schoolIds)
        .order('name')

      if (error) {
        console.error(error)
        return
      }

      setSchools((data ?? []) as SchoolRecord[])
    }

    void load()
  }, [memberships])

  return (
    <div className="page-layout">
      <header className="page-header">
        <div>
          <h2>校区资料</h2>
          <p>先把学校基础档案、时区和校区编码展示出来，后续再补可编辑表单。</p>
        </div>
        <div className="page-tag">School</div>
      </header>

      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>校区名称</th>
              <th>编码</th>
              <th>时区</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {schools.map((school) => (
              <tr key={school.id}>
                <td>{school.name}</td>
                <td>{school.code}</td>
                <td>{school.timezone}</td>
                <td>
                  <span className="status-pill active">可管理</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
