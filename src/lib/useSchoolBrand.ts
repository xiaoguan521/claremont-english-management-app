import { useEffect, useMemo, useState } from 'react'

import { supabase } from './supabase'
import { useAuth } from './auth'

type SchoolBrandRecord = {
  school_id: string
  brand_name: string | null
  logo_url: string | null
}

type SchoolBrand = {
  brandName: string
  logoUrl: string
  shellTitle: string
  shellSubtitle: string
  documentTitle: string
  logoFallback: string
}

const defaultBrand: SchoolBrand = {
  brandName: '',
  logoUrl: '',
  shellTitle: '机构管理端',
  shellSubtitle: 'Management',
  documentTitle: '机构管理端',
  logoFallback: '管',
}

export function useSchoolBrand() {
  const { memberships } = useAuth()
  const [brand, setBrand] = useState<SchoolBrand>(defaultBrand)
  const [refreshToken, setRefreshToken] = useState(0)

  const schoolIds = useMemo(
    () => Array.from(new Set(memberships.map((item) => item.school_id).filter(Boolean))),
    [memberships],
  )

  useEffect(() => {
    const handleRefresh = () => setRefreshToken((current) => current + 1)
    window.addEventListener('school-brand-updated', handleRefresh)
    return () => window.removeEventListener('school-brand-updated', handleRefresh)
  }, [])

  useEffect(() => {
    let alive = true

    const loadBrand = async () => {
      if (schoolIds.length === 0) {
        if (alive) {
          setBrand(defaultBrand)
          document.title = defaultBrand.documentTitle
        }
        return
      }

      const { data, error } = await supabase
        .from('school_configs')
        .select('school_id, brand_name, logo_url')
        .in('school_id', schoolIds)

      if (!alive) return

      if (error) {
        setBrand(defaultBrand)
        document.title = defaultBrand.documentTitle
        return
      }

      const rows = (data ?? []) as SchoolBrandRecord[]
      const bySchoolId = new Map(rows.map((item) => [item.school_id, item]))
      const active = schoolIds.map((id) => bySchoolId.get(id)).find(Boolean)
      const brandName = active?.brand_name?.trim() ?? ''
      const logoUrl = active?.logo_url?.trim() ?? ''
      const nextBrand: SchoolBrand = {
        brandName,
        logoUrl,
        shellTitle: brandName ? `${brandName}管理端` : '机构管理端',
        shellSubtitle: 'Management',
        documentTitle: brandName ? `${brandName}管理端` : '机构管理端',
        logoFallback: '管',
      }

      setBrand(nextBrand)
      document.title = nextBrand.documentTitle
    }

    void loadBrand()

    return () => {
      alive = false
    }
  }, [refreshToken, schoolIds])

  return brand
}
