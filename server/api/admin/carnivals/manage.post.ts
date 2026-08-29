import { requireAdmin } from '../../../utils/requireAdmin'

const defaultPoints = [
  [1, 10], [2, 8], [3, 6], [4, 4], [5, 2], [6, 1],
]

export default defineEventHandler(async (event) => {
  const body = await readBody<any>(event)
  const { admin, profile } = await requireAdmin(event, body?.access_token)
  const action = String(body?.action || '')

  if (action === 'create') {
    const input = body.carnival || {}
    const name = String(input.name || '').trim()
    const carnivalType = String(input.carnival_type || 'athletics')
    const scope = String(input.scope || 'school')
    const startDate = String(input.start_date || '').trim()
    const hostSchoolId = profile.role === 'super_admin' && input.host_school_id
      ? Number(input.host_school_id)
      : Number(profile.school_id)

    if (!name || !startDate || !hostSchoolId) {
      throw createError({ statusCode: 400, statusMessage: 'Carnival name, start date and host school are required.' })
    }

    if (scope === 'interschool' && profile.role !== 'super_admin' && Number(profile.school_id) !== hostSchoolId) {
      throw createError({ statusCode: 403, statusMessage: 'Invalid host school.' })
    }

    const templateId = input.template_id ? Number(input.template_id) : null
    const { data: carnival, error } = await admin.from('carnivals').insert({
      name,
      carnival_type: carnivalType,
      scope,
      host_school_id: hostSchoolId,
      template_id: templateId,
      start_date: startDate,
      end_date: String(input.end_date || '').trim() || null,
      venue: String(input.venue || '').trim() || null,
      status: 'draft',
      year: Number(startDate.slice(0, 4)) || new Date().getFullYear(),
      scoring_mode: String(input.scoring_mode || (scope === 'interschool' ? 'school' : 'house')),
    }).select('*').single()

    if (error) throw createError({ statusCode: 400, statusMessage: error.message })

    const schoolIds = new Set<number>([hostSchoolId])
    for (const id of Array.isArray(input.participating_school_ids) ? input.participating_school_ids : []) {
      const parsed = Number(id)
      if (Number.isInteger(parsed)) schoolIds.add(parsed)
    }

    await admin.from('carnival_schools').upsert(
      [...schoolIds].map((schoolId) => ({
        carnival_id: carnival.id,
        school_id: schoolId,
        status: schoolId === hostSchoolId ? 'confirmed' : 'invited',
      })),
      { onConflict: 'carnival_id,school_id' },
    )

    await admin.from('carnival_points_rules').upsert(
      defaultPoints.map(([position, points]) => ({ carnival_id: carnival.id, position, points })),
      { onConflict: 'carnival_id,position' },
    )

    return { carnival }
  }

  if (action === 'update') {
    const carnivalId = Number(body.carnival_id)
    const input = body.carnival || {}
    const { data: carnival } = await admin.from('carnivals').select('*').eq('id', carnivalId).single()
    if (!carnival) throw createError({ statusCode: 404, statusMessage: 'Carnival not found.' })

    if (profile.role !== 'super_admin' && Number(carnival.host_school_id) !== Number(profile.school_id)) {
      throw createError({ statusCode: 403, statusMessage: 'You can only manage carnivals hosted by your school.' })
    }

    const { data, error } = await admin.from('carnivals').update({
      name: String(input.name || carnival.name).trim(),
      start_date: input.start_date || carnival.start_date,
      end_date: input.end_date || null,
      venue: String(input.venue || '').trim() || null,
      status: input.status || carnival.status,
      scoring_mode: input.scoring_mode || carnival.scoring_mode,
      updated_at: new Date().toISOString(),
    }).eq('id', carnivalId).select('*').single()

    if (error) throw createError({ statusCode: 400, statusMessage: error.message })
    return { carnival: data }
  }

  throw createError({ statusCode: 400, statusMessage: 'Unknown carnival action.' })
})
