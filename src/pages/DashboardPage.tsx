import { useEffect, useState } from 'react'

import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

type DashboardMetrics = {
  schoolCount: number
  classCount: number
  teacherCount: number
  studentCount: number
  assignmentCount: number
}

export function DashboardPage() {
  const { memberships } = useAuth()
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    schoolCount: 0,
    classCount: 0,
    teacherCount: 0,
    studentCount: 0,
    assignmentCount: 0,
  })
  const [schoolNames, setSchoolNames] = useState<string[]>([])

  useEffect(() => {
    const load = async () => {
      const schoolIds = Array.from(new Set(memberships.map((item) => item.school_id)))

      if (schoolIds.length === 0) {
        setMetrics({
          schoolCount: 0,
          classCount: 0,
          teacherCount: 0,
          studentCount: 0,
          assignmentCount: 0,
        })
        setSchoolNames([])
        return
      }

      const [schoolsResponse, classesResponse, teachersResponse, studentsResponse, assignmentsResponse] =
        await Promise.all([
          supabase.from('schools').select('id, name').in('id', schoolIds),
          supabase.from('classes').select('id').in('school_id', schoolIds),
          supabase
            .from('memberships')
            .select('id')
            .in('school_id', schoolIds)
            .eq('role', 'teacher')
            .eq('status', 'active'),
          supabase
            .from('memberships')
            .select('id')
            .in('school_id', schoolIds)
            .eq('role', 'student')
            .eq('status', 'active'),
          supabase.from('assignments').select('id').in('school_id', schoolIds),
        ])

      if (
        schoolsResponse.error ||
        classesResponse.error ||
        teachersResponse.error ||
        studentsResponse.error ||
        assignmentsResponse.error
      ) {
        console.error(
          schoolsResponse.error ||
            classesResponse.error ||
            teachersResponse.error ||
            studentsResponse.error ||
            assignmentsResponse.error,
        )
        return
      }

      setSchoolNames((schoolsResponse.data ?? []).map((item) => item.name))
      setMetrics({
        schoolCount: schoolsResponse.data?.length ?? 0,
        classCount: classesResponse.data?.length ?? 0,
        teacherCount: teachersResponse.data?.length ?? 0,
        studentCount: studentsResponse.data?.length ?? 0,
        assignmentCount: assignmentsResponse.data?.length ?? 0,
      })
    }

    void load()
  }, [memberships])

  return (
    <div className="page-layout">
      <header className="page-header">
        <div>
          <h2>管理概览</h2>
          <p>先把校区运营的关键数字和需要每天查看的事项收在同一个入口。</p>
        </div>
        <div className="page-tag">今日看板</div>
      </header>

      <section className="metrics-grid">
        <article className="metric-card">
          <span>校区数</span>
          <strong>{metrics.schoolCount}</strong>
          <p>当前账号可管理的校区范围</p>
        </article>
        <article className="metric-card">
          <span>班级数</span>
          <strong>{metrics.classCount}</strong>
          <p>在读班级与排课对象</p>
        </article>
        <article className="metric-card">
          <span>教师数</span>
          <strong>{metrics.teacherCount}</strong>
          <p>活跃教师及校区管理员</p>
        </article>
        <article className="metric-card">
          <span>学员数</span>
          <strong>{metrics.studentCount}</strong>
          <p>当前已归档到班级的学生</p>
        </article>
      </section>

      <section className="two-column">
        <article className="panel-card">
          <div className="panel-header">
            <h3>校区视角提醒</h3>
            <p>明天我们再细化流程，今天先把主要导航和数据视图落地。</p>
          </div>
          <ul className="info-list">
            <li>
              <div className="info-meta">
                <strong>作业执行总量</strong>
                <span>当前已发布作业 {metrics.assignmentCount} 项</span>
              </div>
              <span className="status-pill active">运行中</span>
            </li>
            <li>
              <div className="info-meta">
                <strong>账号体系</strong>
                <span>教师端与学生端已经共用同一套 Supabase 账号</span>
              </div>
              <span className="status-pill">已接通</span>
            </li>
            <li>
              <div className="info-meta">
                <strong>下一步</strong>
                <span>明天优先补账号创建、班级调整与作业配置表单</span>
              </div>
              <span className="status-pill draft">待细化</span>
            </li>
          </ul>
        </article>

        <article className="school-overview">
          <div className="panel-header">
            <h3>当前可管理校区</h3>
            <p>校区管理员默认只看自己有权限的学校。</p>
          </div>
          <ul className="school-list">
            {schoolNames.map((name) => (
              <li key={name}>
                <div className="info-meta">
                  <strong>{name}</strong>
                  <span>已接入班级、学员和作业视图</span>
                </div>
                <span className="status-pill active">已接通</span>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </div>
  )
}
