import { NavLink, Outlet } from 'react-router-dom'

import { useAuth } from '../lib/auth'
import { useSchoolBrand } from '../lib/useSchoolBrand'

const navigationItems = [
  { to: '/', label: '管理概览', end: true },
  { to: '/school', label: '校区资料' },
  { to: '/classes', label: '班级编排' },
  { to: '/teachers', label: '教师档案' },
  { to: '/students', label: '学员名单' },
  { to: '/assignments', label: '作业异常' },
]

export function AppShell() {
  const { profile, session, signOut } = useAuth()
  const brand = useSchoolBrand()

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-header">
            {brand.logoUrl ? (
              <img
                className="brand-logo"
                src={brand.logoUrl}
                alt={brand.shellTitle}
              />
            ) : (
              <div className="brand-mark">{brand.logoFallback}</div>
            )}
            <div>
              {brand.brandName ? (
                <span className="eyebrow">{brand.brandName}</span>
              ) : null}
              <h1>{brand.shellTitle}</h1>
            </div>
          </div>
          <p>管理班级、教师、学员与机构运行情况。</p>
        </div>

        <div className="user-panel">
          <strong>{profile?.display_name ?? '校区管理员'}</strong>
          <p>{session?.user.email}</p>
        </div>

        <nav className="nav-list">
          {navigationItems.map((item) => (
            <NavLink
              key={item.to}
              className={({ isActive }) =>
                isActive ? 'nav-item active' : 'nav-item'
              }
              end={item.end}
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="ghost-button" onClick={() => void signOut()} type="button">
            退出登录
          </button>
        </div>
      </aside>

      <main className="content-area">
        <Outlet />
      </main>
    </div>
  )
}
