import { useState, type FormEvent } from 'react'

import { useAuth } from '../lib/auth'

export function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('admin@claremont.local')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      await signIn(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请重试。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-layout">
      <div className="auth-card">
        <span className="eyebrow">Claremont English</span>
        <h1>校区管理端登录</h1>
        <p className="auth-copy">
          用校区管理员账号登录，查看校区概况、教师、学员与作业执行情况。
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            邮箱
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@claremont.local"
              required
            />
          </label>

          <label>
            密码
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入密码"
              required
            />
          </label>

          {error ? <div className="error-banner">{error}</div> : null}

          <button className="primary-button" disabled={submitting} type="submit">
            {submitting ? '登录中...' : '进入管理后台'}
          </button>
        </form>
      </div>
    </div>
  )
}
