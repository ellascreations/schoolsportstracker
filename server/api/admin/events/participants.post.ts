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
