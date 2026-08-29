import { requireAdmin } from '../../../utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const body = await readBody<any>(event)
  const { admin, profile } = await requireAdmin(event, body?.access_token)
  const carnivalId = Number(body.carnival_id)

  if (!Number.isInteger(carnivalId)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid carnival ID required.' })
  }

  const { data: carnival, error: carnivalError } = await admin
    .from('carnivals')
    .select('*')
    .eq('id', carnivalId)
    .single()

  if (carnivalError || !carnival) {
    throw createError({ statusCode: 404, statusMessage: carnivalError?.message || 'Carnival not found.' })
  }

  if (profile.role !== 'super_admin' && Number(profile.school_id) !== Number(carnival.host_school_id)) {
    throw createError({ statusCode: 403, statusMessage: 'You cannot generate events for this carnival.' })
  }

  const templateId = Number(body.template_id || carnival.template_id)
  if (!Number.isInteger(templateId)) {
    throw createError({ statusCode: 400, statusMessage: 'Select a carnival template first.' })
  }

  const { data: templateEvents, error: templateError } = await admin
    .from('template_events')
    .select('*')
    .eq('template_id', templateId)
    .eq('active', true)
    .order('sort_order')

  if (templateError) throw createError({ statusCode: 400, statusMessage: templateError.message })
  if (!templateEvents?.length) throw createError({ statusCode: 400, statusMessage: 'The selected template has no events.' })

  const sportsNeeded = [...new Map(templateEvents.map((item: any) => [item.sport_name, item])).values()]
  const sportMap = new Map<string, number>()

  for (const item of sportsNeeded as any[]) {
    const { data: existing } = await admin.from('sports').select('id').eq('name', item.sport_name).maybeSingle()
    if (existing?.id) {
      sportMap.set(item.sport_name, existing.id)
      continue
    }

    const { data: created, error } = await admin.from('sports').insert({
      name: item.sport_name,
      category: item.category,
      measurement_type: item.measurement_type,
      lower_is_better: item.lower_is_better,
      active: true,
    }).select('id').single()

    if (error || !created) throw createError({ statusCode: 400, statusMessage: error?.message || `Could not create sport ${item.sport_name}.` })
    sportMap.set(item.sport_name, created.id)
  }

  const rows: any[] = []
  for (const item of templateEvents as any[]) {
    const years = Array.isArray(item.year_levels) && item.year_levels.length ? item.year_levels : [null]
    const genders = Array.isArray(item.genders) && item.genders.length ? item.genders : ['mixed']

    for (const year of years) {
      for (const gender of genders) {
        const genderLabel = gender === 'female' ? 'Girls' : gender === 'male' ? 'Boys' : gender === 'open' ? 'Open' : 'Mixed'
        const name = year ? `Year ${year} ${genderLabel} ${item.event_name}` : `${genderLabel} ${item.event_name}`
        rows.push({
          carnival_id: carnival.id,
          school_id: carnival.host_school_id,
          name,
          sport_id: sportMap.get(item.sport_name),
          year_level: year,
          gender,
          event_date: carnival.start_date,
          location: carnival.venue,
          status: 'scheduled',
        })
      }
    }
  }

  const { data: existingEvents, error: existingError } = await admin
    .from('events')
    .select('name')
    .eq('carnival_id', carnival.id)

  if (existingError) throw createError({ statusCode: 400, statusMessage: existingError.message })
  const existingNames = new Set((existingEvents || []).map((row: any) => row.name))
  const toInsert = rows.filter((row) => !existingNames.has(row.name))

  if (toInsert.length) {
    const { error: insertError } = await admin.from('events').insert(toInsert)
    if (insertError) throw createError({ statusCode: 400, statusMessage: insertError.message })
  }

  await admin.from('carnivals').update({ template_id: templateId, updated_at: new Date().toISOString() }).eq('id', carnival.id)

  return {
    generated: toInsert.length,
    skipped: rows.length - toInsert.length,
    total_template_events: rows.length,
  }
})
