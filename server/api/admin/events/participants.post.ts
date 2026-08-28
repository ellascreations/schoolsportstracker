import { requireAdmin } from '../../../utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const body = await readBody<any>(event)
  const { admin } = await requireAdmin(event, body?.access_token)

  const action = String(body?.action || '').trim()
  const eventId = Number(body?.event_id)

  if (!Number.isInteger(eventId) || eventId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'A valid event ID is required.' })
  }

  const { data: existingEvent, error: eventError } = await admin
    .from('events')
    .select('id')
    .eq('id', eventId)
    .maybeSingle()

  if (eventError) {
    throw createError({ statusCode: 400, statusMessage: eventError.message })
  }

  if (!existingEvent) {
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
        .select('id,event_id,student_id,lane,bib_number,created_at')
        .eq('event_id', eventId)
        .order('lane', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true }),
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
        {
          ...student,
          house: student.house_id ? houseMap.get(String(student.house_id)) || null : null,
        },
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
    const requested = Array.isArray(body?.participants) ? body.participants : []

    if (!requested.length) {
      throw createError({ statusCode: 400, statusMessage: 'Select at least one student.' })
    }

    if (requested.length > 200) {
      throw createError({ statusCode: 400, statusMessage: 'Maximum 200 students can be assigned at once.' })
    }

    const studentIds = [...new Set(
      requested
        .map((participant: any) => String(participant?.student_id || '').trim())
        .filter(Boolean)
    )]

    if (!studentIds.length) {
      throw createError({ statusCode: 400, statusMessage: 'No valid students were selected.' })
    }

    const { data: validStudents, error: studentError } = await admin
      .from('profiles')
      .select('id')
      .in('id', studentIds)
      .eq('role', 'student')
      .eq('active', true)

    if (studentError) {
      throw createError({ statusCode: 400, statusMessage: studentError.message })
    }

    const validIds = new Set((validStudents || []).map((student: any) => String(student.id)))
    const invalidIds = studentIds.filter((id) => !validIds.has(id))

    if (invalidIds.length) {
      throw createError({
        statusCode: 400,
        statusMessage: `${invalidIds.length} selected student(s) are not active student accounts.`,
      })
    }

    const inserted: any[] = []
    const skipped: string[] = []
    const failed: { student_id: string; error: string }[] = []

    for (const studentId of studentIds) {
      const { data: existing } = await admin
        .from('event_participants')
        .select('id,event_id,student_id,lane,bib_number,created_at')
        .eq('event_id', eventId)
        .eq('student_id', studentId)
        .maybeSingle()

      if (existing) {
        skipped.push(studentId)
        continue
      }

      // Deliberately mirrors the SQL insert that has been proven to work:
      // INSERT INTO event_participants (event_id, student_id) VALUES (...)
      const { data: created, error: insertError } = await admin
        .from('event_participants')
        .insert({
          event_id: eventId,
          student_id: studentId,
        })
        .select('id,event_id,student_id,lane,bib_number,created_at')
        .single()

      if (insertError || !created) {
        failed.push({
          student_id: studentId,
          error: insertError?.message || 'Insert returned no participant row.',
        })
        continue
      }

      inserted.push(created)
    }

    if (!inserted.length && failed.length) {
      throw createError({
        statusCode: 400,
        statusMessage: failed.map((item) => item.error).join(' | '),
      })
    }

    return {
      added: inserted.length,
      skipped: skipped.length,
      failed,
      participants: inserted,
      message: `${inserted.length} student${inserted.length === 1 ? '' : 's'} assigned to event ${eventId}.`,
    }
  }

  if (action === 'update') {
    const participantId = Number(body?.participant_id)
    if (!Number.isInteger(participantId) || participantId <= 0) {
      throw createError({ statusCode: 400, statusMessage: 'A valid participant ID is required.' })
    }

    const lane = body?.lane == null || body?.lane === '' ? null : Number(body.lane)
    if (lane !== null && (!Number.isInteger(lane) || lane <= 0)) {
      throw createError({ statusCode: 400, statusMessage: 'Lane must be a positive whole number.' })
    }

    const { data: updated, error } = await admin
      .from('event_participants')
      .update({
        lane,
        bib_number: body?.bib_number ? String(body.bib_number).trim() : null,
      })
      .eq('id', participantId)
      .eq('event_id', eventId)
      .select('id,event_id,student_id,lane,bib_number,created_at')
      .maybeSingle()

    if (error) {
      throw createError({ statusCode: 400, statusMessage: error.message })
    }

    if (!updated) {
      throw createError({ statusCode: 404, statusMessage: 'Participant assignment was not found.' })
    }

    return { updated: true, participant: updated }
  }

  if (action === 'remove') {
    const participantId = Number(body?.participant_id)
    if (!Number.isInteger(participantId) || participantId <= 0) {
      throw createError({ statusCode: 400, statusMessage: 'A valid participant ID is required.' })
    }

    const { data: removed, error } = await admin
      .from('event_participants')
      .delete()
      .eq('id', participantId)
      .eq('event_id', eventId)
      .select('id')
      .maybeSingle()

    if (error) {
      throw createError({ statusCode: 400, statusMessage: error.message })
    }

    if (!removed) {
      throw createError({ statusCode: 404, statusMessage: 'Participant assignment was not found.' })
    }

    return { removed: true }
  }

  throw createError({ statusCode: 400, statusMessage: 'Unknown participant action.' })
})
