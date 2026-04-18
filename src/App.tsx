import { Navigate, Route, Routes } from 'react-router-dom'

import './app.css'
import { AppShell } from './components/AppShell'
import { useAuth } from './lib/auth'
import { AssignmentsPage } from './pages/AssignmentsPage'
import { ClassesPage } from './pages/ClassesPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { SchoolPage } from './pages/SchoolPage'
import { StudentsPage } from './pages/StudentsPage'
import { TeachersPage } from './pages/TeachersPage'

function ProtectedRoutes() {
  const { isAdmin } = useAuth()

  if (!isAdmin) {
    return (
      <div className="auth-layout">
        <div className="auth-card">
          <span className="eyebrow">Access denied</span>
          <h1>当前账号暂无管理端权限</h1>
          <p className="auth-copy">请确认账号已绑定校区管理员角色。</p>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="/school" element={<SchoolPage />} />
        <Route path="/classes" element={<ClassesPage />} />
        <Route path="/teachers" element={<TeachersPage />} />
        <Route path="/students" element={<StudentsPage />} />
        <Route path="/assignments" element={<AssignmentsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  const { loading, session } = useAuth()

  if (loading) {
    return <div className="screen-state">正在初始化管理端...</div>
  }

  return session ? <ProtectedRoutes /> : <LoginPage />
}

export default App
