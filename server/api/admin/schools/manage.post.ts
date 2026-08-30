import { requireAdmin } from '../../../utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const body = await readBody<any>(event)
  const { admin, profile } = await requireAdmin(event, body?.access_token)
  const action = String(body?.action || '')


  if (action === 'add_domain') {
    const schoolId = Number(body.school_id)
    const domain = String(body.domain || '').trim().toLowerCase().replace(/^@/, '')
    if (!Number.isInteger(schoolId) || !domain || !domain.includes('.')) {
      throw createError({ statusCode: 400, statusMessage: 'Valid school and domain are required.' })
    }
    if (profile.role !== 'super_admin' && Number(profile.school_id) !== schoolId) {
      throw createError({ statusCode: 403, statusMessage: 'You can only manage domains for your own school.' })
    }
    const { data, error } = await admin.from('school_domains').insert({ school_id: schoolId, domain, active: true }).select('*').single()
    if (error) throw createError({ statusCode: 400, statusMessage: error.message })
    return { domain: data }
  }

  if (action === 'remove_domain') {
    const domainId = Number(body.domain_id)
    if (!Number.isInteger(domainId)) throw createError({ statusCode: 400, statusMessage: 'Valid domain ID required.' })
    const { data: domain, error: de } = await admin.from('school_domains').select('id,school_id').eq('id', domainId).maybeSingle()
    if (de || !domain) throw createError({ statusCode: 404, statusMessage: 'Domain not found.' })
    if (profile.role !== 'super_admin' && Number(profile.school_id) !== Number(domain.school_id)) {
      throw createError({ statusCode: 403, statusMessage: 'You can only manage domains for your own school.' })
    }
    const { error } = await admin.from('school_domains').delete().eq('id', domainId)
    if (error) throw createError({ statusCode: 400, statusMessage: error.message })
    return { removed: true }
  }

  if (action === 'update_global_registration_settings') {
    if (profile.role !== 'super_admin') {
      throw createError({ statusCode: 403, statusMessage: 'Super Admin access is required.' })
    }
    const { data, error } = await admin.from('platform_settings').update({
      teacher_email_verification_required: body.teacher_email_verification_required !== false,
      updated_at: new Date().toISOString(),
    }).eq('id', 1).select('*').single()
    if (error) throw createError({ statusCode: 400, statusMessage: error.message })
    return { settings: data }
  }

  if (action === 'create') {
    if (profile.role !== 'super_admin') {
      throw createError({ statusCode: 403, statusMessage: 'Super Admin access is required to create schools.' })
    }

    const input = body.school || {}
    const name = String(input.name || '').trim()
    if (!name) throw createError({ statusCode: 400, statusMessage: 'School name is required.' })

    const { data, error } = await admin.from('schools').insert({
      name,
      short_name: String(input.short_name || '').trim() || null,
      email: String(input.email || '').trim() || null,
      phone: String(input.phone || '').trim() || null,
      address: String(input.address || '').trim() || null,
      active: true,
      teacher_self_registration_mode: String(input.teacher_self_registration_mode || 'admin_approval'),
    }).select('*').single()

    if (error) throw createError({ statusCode: 400, statusMessage: error.message })
    return { school: data }
  }

  if (action === 'update') {
    const schoolId = Number(body.school_id)
    if (!Number.isInteger(schoolId)) throw createError({ statusCode: 400, statusMessage: 'Valid school ID required.' })

    if (profile.role !== 'super_admin' && Number(profile.school_id) !== schoolId) {
      throw createError({ statusCode: 403, statusMessage: 'You can only update your own school.' })
    }

    const input = body.school || {}
    const name = String(input.name || '').trim()
    if (!name) throw createError({ statusCode: 400, statusMessage: 'School name is required.' })

    const { data, error } = await admin.from('schools').update({
      name,
      short_name: String(input.short_name || '').trim() || null,
      email: String(input.email || '').trim() || null,
      phone: String(input.phone || '').trim() || null,
      address: String(input.address || '').trim() || null,
      active: input.active !== false,
      teacher_self_registration_mode: String(input.teacher_self_registration_mode || 'admin_approval'),
      updated_at: new Date().toISOString(),
    }).eq('id', schoolId).select('*').single()

    if (error) throw createError({ statusCode: 400, statusMessage: error.message })
    return { school: data }
  }

  throw createError({ statusCode: 400, statusMessage: 'Unknown school action.' })
})
