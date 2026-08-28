import { requireAdmin } from '../../../utils/requireAdmin'

const allowedStatuses = new Set([
  'scheduled',
  'open',
  'in_progress',
  'completed',
  'cancelled',
])

const allowedGenders = new Set([
  'mixed',
  'female',
  'male',
  'open',
])

export default defineEventHandler(async (event) => {
  const body = await readBody<any>(event)
  const { admin } = await requireAdmin(event, body?.access_token)

  const action = String(body?.action || '').trim().toLowerCase()
  const eventId = Number(body?.event_id)

  if (!Number.isInteger(eventId) || eventId <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'A valid event ID is required.',
    })
  }

  const { data: existingEvent, error: lookupError } = await admin
    .from('events')
    .select('id,name')
    .eq('id', eventId)
    .maybeSingle()

  if (lookupError) {
    throw createError({
      statusCode: 400,
      statusMessage: lookupError.message,
    })
  }

  if (!existingEvent) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Event not found.',
    })
  }

  if (action === 'update') {
    const input = body?.event || {}

    const name = String(input.name || '').trim()
    const sportId = Number(input.sport_id)
    const yearLevel =
      input.year_level === '' || input.year_level == null
        ? null
        : Number(input.year_level)
    const gender = String(input.gender || 'mixed').trim()
    const eventDate = String(input.event_date || '').trim()
    const startTime = String(input.start_time || '').trim() || null
    const location = String(input.location || '').trim() || null
    const teacherId = input.teacher_id ? String(input.teacher_id).trim() : null
    const status = String(input.status || 'scheduled').trim()

    if (!name) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Event name is required.',
      })
    }

    if (!Number.isInteger(sportId) || sportId <= 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Select a valid sport.',
      })
    }

    if (
      yearLevel !== null &&
      (!Number.isInteger(yearLevel) || yearLevel < 1 || yearLevel > 12)
    ) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Year level must be between 1 and 12.',
      })
    }

    if (!allowedGenders.has(gender)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid gender/category.',
      })
    }

    if (!eventDate) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Event date is required.',
      })
    }

    if (!allowedStatuses.has(status)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid event status.',
      })
    }

    const { data: sport, error: sportError } = await admin
      .from('sports')
      .select('id')
      .eq('id', sportId)
      .maybeSingle()

    if (sportError || !sport) {
      throw createError({
        statusCode: 400,
        statusMessage: sportError?.message || 'Selected sport does not exist.',
      })
    }

    if (teacherId) {
      const { data: teacher, error: teacherError } = await admin
        .from('profiles')
        .select('id,role,active')
        .eq('id', teacherId)
        .maybeSingle()

      if (
        teacherError ||
        !teacher ||
        teacher.role !== 'teacher' ||
        !teacher.active
      ) {
        throw createError({
          statusCode: 400,
          statusMessage: teacherError?.message || 'Selected teacher is not an active teacher account.',
        })
      }
    }

    const { data: updated, error: updateError } = await admin
      .from('events')
      .update({
        name,
        sport_id: sportId,
        year_level: yearLevel,
        gender,
        event_date: eventDate,
        start_time: startTime,
        location,
        teacher_id: teacherId,
        status,
      })
      .eq('id', eventId)
      .select('id,name,sport_id,year_level,gender,event_date,start_time,location,teacher_id,status')
      .single()

    if (updateError) {
      throw createError({
        statusCode: 400,
        statusMessage: updateError.message,
      })
    }

    return {
      updated: true,
      event: updated,
      message: 'Event updated successfully.',
    }
  }

  if (action === 'delete') {
    // Remove dependent rows explicitly so deletion works even if the
    // database foreign keys are not configured with ON DELETE CASCADE.
    const { error: resultsError } = await admin
      .from('results')
      .delete()
      .eq('event_id', eventId)

    if (resultsError) {
      throw createError({
        statusCode: 400,
        statusMessage: `Could not remove event results: ${resultsError.message}`,
      })
    }

    const { error: participantsError } = await admin
      .from('event_participants')
      .delete()
      .eq('event_id', eventId)

    if (participantsError) {
      throw createError({
        statusCode: 400,
        statusMessage: `Could not remove event participants: ${participantsError.message}`,
      })
    }

    const { data: deleted, error: deleteError } = await admin
      .from('events')
      .delete()
      .eq('id', eventId)
      .select('id,name')
      .maybeSingle()

    if (deleteError) {
      throw createError({
        statusCode: 400,
        statusMessage: deleteError.message,
      })
    }

    if (!deleted) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Event was not found.',
      })
    }

    return {
      deleted: true,
      event: deleted,
      message: 'Event deleted.',
    }
  }

  throw createError({
    statusCode: 400,
    statusMessage: 'Unknown event management action.',
  })
})
