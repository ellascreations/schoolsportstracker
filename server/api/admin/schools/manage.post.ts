import { requireAdmin } from '../../../utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const body = await readBody<any>(event)
  const { admin, profile } = await requireAdmin(event, body?.access_token)
  const action = String(body?.action || '')

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
      updated_at: new Date().toISOString(),
    }).eq('id', schoolId).select('*').single()

    if (error) throw createError({ statusCode: 400, statusMessage: error.message })
    return { school: data }
  }

  throw createError({ statusCode: 400, statusMessage: 'Unknown school action.' })
})
