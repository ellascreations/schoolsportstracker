import { serverSupabaseServiceRole } from '#supabase/server'

const toDateTimeKey = (row: any) => {
  const date = String(row?.event_date || '9999-12-31')
  const time = String(row?.start_time || '23:59:59')
  return `${date}T${time}`
}

export default defineEventHandler(async (event) => {
  const admin = serverSupabaseServiceRole(event)
  const carnivalId = Number(getRouterParam(event, 'id'))
  const query = getQuery(event)
  const displayDate = String(query.date || '').trim()

  if (!Number.isInteger(carnivalId) || carnivalId <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'A valid carnival ID is required.',
    })
  }

  const { data: carnival, error: carnivalError } = await admin
    .from('carnivals')
    .select(`
      id,
      name,
      carnival_type,
      scope,
      scoring_mode,
      start_date,
      end_date,
      venue,
      status,
      host_school_id,
      host_school:schools (
        id,
        name,
        short_name,
        logo_url
      )
    `)
    .eq('id', carnivalId)
    .eq('active', true)
    .maybeSingle()

  if (carnivalError) {
    throw createError({
      statusCode: 500,
      statusMessage: carnivalError.message,
    })
  }

  if (!carnival) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Carnival not found.',
    })
  }

  const { data: eventRows, error: eventsError } = await admin
    .from('events')
    .select(`
      id,
      name,
      event_date,
      start_time,
      location,
      status,
      year_level,
      gender,
      sport_id,
      sport:sports (
        id,
        name,
        measurement_type
      )
    `)
    .eq('carnival_id', carnivalId)

  if (eventsError) {
    throw createError({
      statusCode: 500,
      statusMessage: eventsError.message,
    })
  }

  const allEvents = eventRows || []

  // ---------------------------------------------------------------
  // Current standings
  // ---------------------------------------------------------------
  const leaderboardView =
    carnival.scoring_mode === 'school'
      ? 'carnival_school_leaderboard'
      : 'carnival_house_leaderboard'

  const { data: leaderboardRows, error: leaderboardError } = await admin
    .from(leaderboardView)
    .select('*')
    .eq('carnival_id', carnivalId)
    .order('points', { ascending: false })

  if (leaderboardError) {
    throw createError({
      statusCode: 500,
      statusMessage: leaderboardError.message,
    })
  }

  const standings = (leaderboardRows || []).map((row: any, index: number) => ({
    position: index + 1,
    id: row.school_id || row.house_id,
    name:
      row.school_name ||
      row.short_name ||
      row.name ||
      row.house_name ||
      'Unknown',
    short_name: row.short_name || null,
    colour: row.colour || null,
    points: Number(row.points || row.total_points || 0),
  }))

  // ---------------------------------------------------------------
  // New records for the local display date.
  // The browser passes its local YYYY-MM-DD to avoid server timezone
  // differences for big-screen displays.
  // ---------------------------------------------------------------
  let recordsQuery = admin
    .from('record_top5')
    .select(`
      id,
      record_scope,
      record_rank,
      sport_id,
      sport_name,
      year_level,
      gender,
      holder_name,
      holder_school_name,
      holder_house_name,
      result_value,
      result_display,
      achieved_date,
      event_id,
      carnival_id
    `)
    .eq('carnival_id', carnivalId)
    .eq('record_rank', 1)

  if (displayDate) {
    recordsQuery = recordsQuery.eq('achieved_date', displayDate)
  }

  const { data: recordRows, error: recordsError } = await recordsQuery

  if (recordsError) {
    throw createError({
      statusCode: 500,
      statusMessage: recordsError.message,
    })
  }

  const newRecords = (recordRows || [])
    .map((row: any) => ({
      id: row.id,
      scope: row.record_scope,
      sport_name: row.sport_name,
      year_level: row.year_level,
      gender: row.gender,
      holder_name: row.holder_name,
      school_name: row.holder_school_name,
      house_name: row.holder_house_name,
      result_value: row.result_value,
      result_display: row.result_display,
      achieved_date: row.achieved_date,
      event_id: row.event_id,
    }))
    .slice(0, 8)

  // ---------------------------------------------------------------
  // Last five completed event results
  // ---------------------------------------------------------------
  const completedEvents = [...allEvents]
    .filter((row: any) => String(row.status) === 'completed')
    .sort((a: any, b: any) =>
      toDateTimeKey(b).localeCompare(toDateTimeKey(a))
    )
    .slice(0, 5)

  const completedIds = completedEvents.map((row: any) => row.id)
  let resultRows: any[] = []

  if (completedIds.length) {
    const { data, error } = await admin
      .from('results')
      .select(`
        id,
        event_id,
        student_id,
        position,
        result_value,
        result_display,
        points,
        status
      `)
      .in('event_id', completedIds)
      .eq('status', 'official')
      .not('position', 'is', null)
      .lte('position', 3)
      .order('position', { ascending: true })

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: error.message,
      })
    }

    resultRows = data || []
  }

  const studentIds = [
    ...new Set(
      resultRows
        .map((row: any) => row.student_id)
        .filter(Boolean)
    ),
  ]

  const profileMap = new Map<string, any>()
  const houseIds = new Set<number>()
  const schoolIds = new Set<number>()

  if (studentIds.length) {
    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select('id,first_name,last_name,house_id,school_id')
      .in('id', studentIds)

    if (profilesError) {
      throw createError({
        statusCode: 500,
        statusMessage: profilesError.message,
      })
    }

    for (const profile of profiles || []) {
      profileMap.set(String(profile.id), profile)
      if (profile.house_id) houseIds.add(Number(profile.house_id))
      if (profile.school_id) schoolIds.add(Number(profile.school_id))
    }
  }

  const houseMap = new Map<number, any>()
  if (houseIds.size) {
    const { data: houses, error: housesError } = await admin
      .from('houses')
      .select('id,name,colour')
      .in('id', [...houseIds])

    if (housesError) {
      throw createError({
        statusCode: 500,
        statusMessage: housesError.message,
      })
    }

    for (const house of houses || []) {
      houseMap.set(Number(house.id), house)
    }
  }

  const schoolMap = new Map<number, any>()
  if (schoolIds.size) {
    const { data: schools, error: schoolsError } = await admin
      .from('schools')
      .select('id,name,short_name')
      .in('id', [...schoolIds])

    if (schoolsError) {
      throw createError({
        statusCode: 500,
        statusMessage: schoolsError.message,
      })
    }

    for (const school of schools || []) {
      schoolMap.set(Number(school.id), school)
    }
  }

  const resultByEvent = new Map<number, any[]>()

  for (const row of resultRows) {
    const profile = profileMap.get(String(row.student_id))
    const house = profile?.house_id
      ? houseMap.get(Number(profile.house_id))
      : null
    const school = profile?.school_id
      ? schoolMap.get(Number(profile.school_id))
      : null

    const item = {
      id: row.id,
      position: Number(row.position),
      result_value: row.result_value,
      result_display: row.result_display,
      points: Number(row.points || 0),
      athlete_name: profile
        ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
        : 'Athlete',
      house_name: house?.name || null,
      school_name: school?.short_name || school?.name || null,
    }

    const existing = resultByEvent.get(Number(row.event_id)) || []
    existing.push(item)
    resultByEvent.set(Number(row.event_id), existing)
  }

  const recentResults = completedEvents.map((eventRow: any) => ({
    id: eventRow.id,
    name: eventRow.name,
    event_date: eventRow.event_date,
    start_time: eventRow.start_time,
    sport_name: eventRow.sport?.name || null,
    results: (resultByEvent.get(Number(eventRow.id)) || [])
      .sort((a, b) => a.position - b.position),
  }))

  // ---------------------------------------------------------------
  // Next five events
  // ---------------------------------------------------------------
  const nextEvents = [...allEvents]
    .filter((row: any) =>
      !['completed', 'cancelled', 'in_progress'].includes(
        String(row.status)
      )
    )
    .sort((a: any, b: any) =>
      toDateTimeKey(a).localeCompare(toDateTimeKey(b))
    )
    .slice(0, 5)
    .map((row: any) => ({
      id: row.id,
      name: row.name,
      event_date: row.event_date,
      start_time: row.start_time,
      location: row.location,
      status: row.status,
      sport_name: row.sport?.name || null,
    }))

  return {
    generated_at: new Date().toISOString(),
    display_date: displayDate || null,
    carnival: {
      id: carnival.id,
      name: carnival.name,
      carnival_type: carnival.carnival_type,
      scope: carnival.scope,
      scoring_mode: carnival.scoring_mode,
      start_date: carnival.start_date,
      end_date: carnival.end_date,
      venue: carnival.venue,
      status: carnival.status,
      host_school: carnival.host_school,
    },
    standings,
    new_records: newRecords,
    recent_results: recentResults,
    next_events: nextEvents,
  }
})
