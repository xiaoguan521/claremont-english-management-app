import { useEffect, useMemo, useState, type FormEvent } from 'react'

import { useAuth } from '../lib/auth'
import {
  getSchoolAiConfig,
  type SchoolAiConfigSummary,
  upsertSchoolAiConfig,
} from '../lib/admin'
import { supabase } from '../lib/supabase'

type SchoolRecord = {
  id: string
  name: string
  code: string
  timezone: string
}

type AiConfigFormState = {
  providerType: string
  providerLabel: string
  baseUrl: string
  model: string
  apiKey: string
  enabled: boolean
}

const providerOptions = [
  { value: 'openai_compatible', label: 'OpenAI 兼容接口' },
  { value: 'anthropic', label: 'Anthropic 官方接口' },
  { value: 'gemini', label: 'Gemini 官方接口' },
  { value: 'custom', label: '完全自定义' },
]

function defaultLabelForProvider(providerType: string) {
  const option = providerOptions.find((item) => item.value === providerType)
  return option?.label ?? '自定义 AI'
}

function createEmptyForm(): AiConfigFormState {
  return {
    providerType: 'openai_compatible',
    providerLabel: defaultLabelForProvider('openai_compatible'),
    baseUrl: '',
    model: '',
    apiKey: '',
    enabled: true,
  }
}

function formFromConfig(config: SchoolAiConfigSummary | null): AiConfigFormState {
  if (!config) {
    return createEmptyForm()
  }

  return {
    providerType: config.providerType,
    providerLabel: config.providerLabel,
    baseUrl: config.baseUrl,
    model: config.model,
    apiKey: '',
    enabled: config.enabled,
  }
}

export function SchoolPage() {
  const { memberships } = useAuth()
  const [schools, setSchools] = useState<SchoolRecord[]>([])
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [configLoading, setConfigLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<SchoolAiConfigSummary | null>(null)
  const [form, setForm] = useState<AiConfigFormState>(createEmptyForm)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    const loadSchools = async () => {
      setLoading(true)
      const schoolIds = Array.from(new Set(memberships.map((item) => item.school_id)))
      if (schoolIds.length === 0) {
        setSchools([])
        setSelectedSchoolId(null)
        setLoading(false)
        return
      }

      const { data, error: schoolError } = await supabase
        .from('schools')
        .select('id, name, code, timezone')
        .in('id', schoolIds)
        .order('name')

      if (schoolError) {
        console.error(schoolError)
        setError('校区资料加载失败，请稍后重试。')
        setLoading(false)
        return
      }

      const nextSchools = (data ?? []) as SchoolRecord[]
      setSchools(nextSchools)
      setSelectedSchoolId((current) => {
        if (current && nextSchools.some((school) => school.id === current)) {
          return current
        }
        return nextSchools[0]?.id ?? null
      })
      setLoading(false)
    }

    void loadSchools()
  }, [memberships])

  useEffect(() => {
    if (!selectedSchoolId) {
      setConfig(null)
      setForm(createEmptyForm())
      return
    }

    const loadConfig = async () => {
      setConfigLoading(true)
      setError(null)
      setSuccess(null)
      try {
        const nextConfig = await getSchoolAiConfig(selectedSchoolId)
        setConfig(nextConfig)
        setForm(formFromConfig(nextConfig))
      } catch (loadError) {
        console.error(loadError)
        setError('AI 配置读取失败，请稍后重试。')
        setConfig(null)
        setForm(createEmptyForm())
      } finally {
        setConfigLoading(false)
      }
    }

    void loadConfig()
  }, [selectedSchoolId])

  const selectedSchool = useMemo(
    () => schools.find((school) => school.id === selectedSchoolId) ?? null,
    [schools, selectedSchoolId],
  )

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!selectedSchoolId) {
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const nextConfig = await upsertSchoolAiConfig({
        schoolId: selectedSchoolId,
        providerType: form.providerType,
        providerLabel: form.providerLabel.trim() || defaultLabelForProvider(form.providerType),
        baseUrl: form.baseUrl.trim(),
        model: form.model.trim(),
        apiKey: form.apiKey.trim() || undefined,
        enabled: form.enabled,
      })

      setConfig(nextConfig)
      setForm(formFromConfig(nextConfig))
      setSuccess('AI 接入配置已保存，后续评测和生成能力可以按这个校区配置接入。')
    } catch (saveError) {
      console.error(saveError)
      setError(saveError instanceof Error ? saveError.message : '保存失败，请稍后重试。')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="screen-state">正在加载校区资料...</div>
  }

  if (schools.length === 0) {
    return <div className="screen-state">当前账号还没有可管理的校区。</div>
  }

  return (
    <div className="page-layout">
      <header className="page-header">
        <div>
          <h2>校区资料与 AI 配置</h2>
          <p>
            每个校区都可以配置自己的 AI 服务商、Base URL、模型和密钥。后续语音评测、鼓励语和分析能力都会优先读取这里的配置。
          </p>
        </div>
        <div className="page-tag">School + AI</div>
      </header>

      <div className="school-config-layout">
        <section className="panel-card school-selector-card">
          <div className="panel-header">
            <h3>选择校区</h3>
            <p>先选择要管理的校区，再分别保存它们自己的 AI 接口配置。</p>
          </div>

          <div className="school-selection-list">
            {schools.map((school) => {
              const isActive = school.id === selectedSchoolId
              return (
                <button
                  key={school.id}
                  type="button"
                  className={`school-selection-item ${isActive ? 'active' : ''}`}
                  onClick={() => setSelectedSchoolId(school.id)}
                >
                  <strong>{school.name}</strong>
                  <span>
                    {school.code} · {school.timezone}
                  </span>
                </button>
              )
            })}
          </div>

          {selectedSchool ? (
            <div className="school-meta-card">
              <span className="status-pill active">当前校区</span>
              <strong>{selectedSchool.name}</strong>
              <p>
                校区编码：{selectedSchool.code}
                <br />
                时区：{selectedSchool.timezone}
              </p>
            </div>
          ) : null}
        </section>

        <section className="panel-card">
          <div className="panel-header">
            <h3>AI 接入配置</h3>
            <p>
              支持 OpenAI 兼容接口，也可以配置其它厂商的官方地址。密钥只会加密保存，页面不会回显原文。
            </p>
          </div>

          {configLoading ? <div className="success-banner">正在读取当前校区配置...</div> : null}
          {error ? <div className="error-banner">{error}</div> : null}
          {success ? <div className="success-banner">{success}</div> : null}

          <div className="ai-config-summary">
            <span
              className={`status-pill ${
                config ? (config.enabled ? 'active' : 'draft') : 'draft'
              }`}
            >
              {config ? (config.enabled ? '已启用' : '已暂停') : '尚未配置'}
            </span>
            <span>
              {config?.apiKeyConfigured
                ? `已保存密钥 ${config.apiKeyMasked ?? ''}`
                : '还没有保存 API Key'}
            </span>
            <span>{config?.updatedAt ? `最近更新：${config.updatedAt}` : '首次保存后会显示更新时间'}</span>
          </div>

          <form className="inline-form" onSubmit={handleSubmit}>
            <label>
              API 协议类型
              <select
                value={form.providerType}
                onChange={(event) => {
                  const nextType = event.target.value
                  setForm((current) => ({
                    ...current,
                    providerType: nextType,
                    providerLabel:
                      current.providerLabel.trim() === '' ||
                      current.providerLabel === defaultLabelForProvider(current.providerType)
                        ? defaultLabelForProvider(nextType)
                        : current.providerLabel,
                  }))
                }}
              >
                {providerOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              接入名称
              <input
                value={form.providerLabel}
                onChange={(event) =>
                  setForm((current) => ({ ...current, providerLabel: event.target.value }))
                }
                placeholder="例如：OpenAI 官方 / DeepSeek 校区专线"
              />
            </label>

            <label className="span-2">
              Base URL
              <input
                value={form.baseUrl}
                onChange={(event) =>
                  setForm((current) => ({ ...current, baseUrl: event.target.value }))
                }
                placeholder="例如：https://api.openai.com/v1"
              />
              <span className="field-hint">
                可以填写官方接口，也可以填写你自己的代理网关地址。系统会按校区分别保存。
              </span>
            </label>

            <label>
              默认模型
              <input
                value={form.model}
                onChange={(event) =>
                  setForm((current) => ({ ...current, model: event.target.value }))
                }
                placeholder="例如：gpt-4.1-mini / deepseek-chat"
              />
            </label>

            <label>
              启用状态
              <select
                value={form.enabled ? 'enabled' : 'disabled'}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    enabled: event.target.value === 'enabled',
                  }))
                }
              >
                <option value="enabled">启用</option>
                <option value="disabled">暂停</option>
              </select>
            </label>

            <label className="span-2">
              API Key
              <input
                type="password"
                value={form.apiKey}
                onChange={(event) =>
                  setForm((current) => ({ ...current, apiKey: event.target.value }))
                }
                placeholder={config?.apiKeyConfigured ? '留空表示保持当前密钥不变' : '首次保存必须填写'}
              />
              <span className="field-hint">
                {config?.apiKeyConfigured
                  ? `当前已保存：${config.apiKeyMasked ?? '••••'}，只有重新填写时才会替换。`
                  : '首次启用这个校区的 AI 能力时，需要先填写一次有效密钥。'}
              </span>
            </label>

            <div className="span-2 form-actions">
              <button
                type="button"
                className="ghost-button compact-button"
                onClick={() => {
                  setError(null)
                  setSuccess(null)
                  setForm(formFromConfig(config))
                }}
              >
                恢复当前配置
              </button>
              <button type="submit" className="primary-button" disabled={saving || configLoading}>
                {saving ? '正在保存...' : '保存校区 AI 配置'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
