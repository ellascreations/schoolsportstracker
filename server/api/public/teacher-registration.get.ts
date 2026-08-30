import { serverSupabaseServiceRole } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const admin = serverSupabaseServiceRole(event)

  const [{ data: settings, error: settingsError }, { data: schools, error: schoolsError }] =
    await Promise.all([
      admin
        .from('platform_settings')
        .select('teacher_email_verification_required')
        .eq('id', 1)
        .single(),
      admin
        .from('schools')
        .select('id,name,short_name,teacher_self_registration_mode')
        .eq('active', true)
        .neq('teacher_self_registration_mode', 'disabled')
        .order('name'),
    ])

  if (settingsError) {
    throw createError({ statusCode: 500, statusMessage: settingsError.message })
  }

  if (schoolsError) {
    throw createError({ statusCode: 500, statusMessage: schoolsError.message })
  }

  const schoolIds = (schools || []).map((school: any) => school.id)
  let domains: any[] = []

  if (schoolIds.length) {
    const { data, error } = await admin
      .from('school_domains')
      .select('school_id,domain')
      .in('school_id', schoolIds)
      .eq('active', true)
      .order('domain')

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }

    domains = data || []
  }

  return {
    teacher_email_verification_required:
      settings?.teacher_email_verification_required !== false,
    schools: (schools || [])
      .map((school: any) => ({
        ...school,
        domains: domains
          .filter((domain: any) => Number(domain.school_id) === Number(school.id))
          .map((domain: any) => domain.domain),
      }))
      .filter((school: any) => school.domains.length > 0),
  }
})
