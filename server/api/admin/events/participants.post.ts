import { requireAdmin } from '../../../utils/requireAdmin'

type AddParticipant = {
  event_id: number
  student_id: string
  lane?: number | null
  bib_number?: string | null
}

export default defineEventHandler(async (event) => {
  const body = await readBody<any>(event)
  const { admin } = await requireAdmin(event, body?.access_token)

  const action = String(body?.action || '').trim()
  const eventId = Number(body?.event_id)

  if (!Number.isFinite(eventId) || eventId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'A valid event ID is required.' })
  }

  const { data: existingEvent, error: eventError } = await admin
    .from('events')
    .select('id')
    .eq('id', eventId)
    .maybeSingle()

  if (eventError || !existingEvent) {
    throw createError({ statusCode: 404, statusMessage: 'Event not found.' })
  }


  if (action === 'load') {
    const { data: currentEvent, error: eventLoadError } = await admin
      .from('events')
      .select('id,name,sport_id,year_level,gender,event_date,start_time,location,teacher_id,status')
      .eq('id', eventId)
      .single()

    if (eventLoadError || !currentEvent) {
      throw createError({ statusCode: 404, statusMessage: eventLoadError?.message || 'Event not found.' })
    }

    const [sportResult, teacherResult, studentsResult, participantsResult, housesResult] = await Promise.all([
      currentEvent.sport_id
        ? admin.from('sports').select('id,name,measurement_type').eq('id', currentEvent.sport_id).maybeSingle()
        : Promise.resolve({ data: null, error: null } as any),
      currentEvent.teacher_id
        ? admin.from('profiles').select('id,first_name,last_name').eq('id', currentEvent.teacher_id).maybeSingle()
        : Promise.resolve({ data: null, error: null } as any),
      admin
        .from('profiles')
        .select('id,first_name,last_name,student_number,year_level,house_id')
        .eq('role', 'student')
        .eq('active', true)
        .order('year_level', { ascending: true })
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true }),
      admin
        .from('event_participants')
        .select('id,event_id,student_id,lane,bib_number')
        .eq('event_id', eventId)
        .order('lane', { ascending: true, nullsFirst: false }),
      admin.from('houses').select('id,name,colour').eq('active', true).order('name'),
    ])

    const firstError =
      sportResult.error ||
      teacherResult.error ||
      studentsResult.error ||
      participantsResult.error ||
      housesResult.error

    if (firstError) {
      throw createError({ statusCode: 400, statusMessage: firstError.message || 'Could not load assignment data.' })
    }

    const houses = housesResult.data || []
    const houseMap = new Map(houses.map((house: any) => [String(house.id), house]))
    const studentMap = new Map(
      (studentsResult.data || []).map((student: any) => [
        student.id,
        { ...student, house: student.house_id ? houseMap.get(String(student.house_id)) || null : null },
      ])
    )

    const students = Array.from(studentMap.values()).filter(
      (student: any) => !currentEvent.year_level || Number(student.year_level) === Number(currentEvent.year_level)
    )

    const participants = (participantsResult.data || []).map((participant: any) => ({
      ...participant,
      student: studentMap.get(participant.student_id) || null,
    }))

    return {
      event: {
        ...currentEvent,
        sport: sportResult.data || null,
        teacher: teacherResult.data || null,
      },
      students,
      participants,
      houses,
    }
  }

  if (action === 'add') {
    const participants = Array.isArray(body?.participants) ? body.participants : []

    if (!participants.length) {
      throw createError({ statusCode: 400, statusMessage: 'Select at least one student.' })
    }

    if (participants.length > 200) {
      throw createError({ statusCode: 400, statusMessage: 'Maximum 200 students can be assigned at once.' })
    }

    const rows: AddParticipant[] = participants.map((participant: any) => ({
      event_id: eventId,
      student_id: String(participant.student_id || '').trim(),
      lane: participant.lane == null ? null : Number(participant.lane),
      bib_number: participant.bib_number ? String(participant.bib_number).trim() : null,
    }))

    if (rows.some((row) => !row.student_id)) {
      throw createError({ statusCode: 400, statusMessage: 'One or more selected students are invalid.' })
    }

    const studentIds = [...new Set(rows.map((row) => row.student_id))]

    const { data: validStudents, error: studentError } = await admin
      .from('profiles')
      .select('id')
      .in('id', studentIds)
      .eq('role', 'student')
      .eq('active', true)

    if (studentError) {
      throw createError({ statusCode: 400, statusMessage: studentError.message })
    }

    const validIds = new Set((validStudents || []).map((student: any) => student.id))
    if (studentIds.some((id) => !validIds.has(id))) {
      throw createError({ statusCode: 400, statusMessage: 'One or more selected students are not active student accounts.' })
    }

    const { data: existingRows, error: existingError } = await admin
      .from('event_participants')
      .select('student_id')
      .eq('event_id', eventId)
      .in('student_id', studentIds)

    if (existingError) {
      throw createError({ statusCode: 400, statusMessage: existingError.message })
    }

    const alreadyAssigned = new Set((existingRows || []).map((row: any) => row.student_id))
    const newRows = rows.filter((row) => !alreadyAssigned.has(row.student_id))

    if (!newRows.length) {
      return { added: 0, skipped: rows.length, message: 'All selected students are already assigned.' }
    }

    const { error } = await admin.from('event_participants').insert(newRows)

    if (error) {
      throw createError({ statusCode: 400, statusMessage: error.message })
    }

    return { added: newRows.length, skipped: rows.length - newRows.length }
  }

  if (action === 'update') {
    const participantId = Number(body?.participant_id)
    if (!Number.isFinite(participantId) || participantId <= 0) {
      throw createError({ statusCode: 400, statusMessage: 'A valid participant ID is required.' })
    }

    const lane = body?.lane == null || body?.lane === '' ? null : Number(body.lane)
    if (lane !== null && (!Number.isFinite(lane) || lane <= 0)) {
      throw createError({ statusCode: 400, statusMessage: 'Lane must be a positive number.' })
    }

    const { error } = await admin
      .from('event_participants')
      .update({
        lane,
        bib_number: body?.bib_number ? String(body.bib_number).trim() : null,
      })
      .eq('id', participantId)
      .eq('event_id', eventId)

    if (error) {
      throw createError({ statusCode: 400, statusMessage: error.message })
    }

    return { updated: true }
  }

  if (action === 'remove') {
    const participantId = Number(body?.participant_id)
    if (!Number.isFinite(participantId) || participantId <= 0) {
      throw createError({ statusCode: 400, statusMessage: 'A valid participant ID is required.' })
    }

    const { error } = await admin
      .from('event_participants')
      .delete()
      .eq('id', participantId)
      .eq('event_id', eventId)

    if (error) {
      throw createError({ statusCode: 400, statusMessage: error.message })
    }

    return { removed: true }
  }

  throw createError({ statusCode: 400, statusMessage: 'Unknown participant action.' })
})
