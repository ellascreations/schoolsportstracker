import { requireAdmin } from '../../../utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const body = await readBody<any>(event)
  const { admin, profile } = await requireAdmin(event, body?.access_token)

  const action = String(body?.action || '').trim().toLowerCase()

  if (action === 'delete') {
    const id = Number(body?.id)
    if (!Number.isInteger(id) || id <= 0) {
      throw createError({ statusCode: 400, statusMessage: 'A valid record performance ID is required.' })
    }

    const { data: row, error: lookupError } = await admin
      .from('record_performances')
      .select('id,record_scope,school_id,manual_entry')
      .eq('id', id)
      .maybeSingle()

    if (lookupError || !row) {
      throw createError({ statusCode: 404, statusMessage: lookupError?.message || 'Record performance not found.' })
    }

    if (!row.manual_entry) {
      throw createError({ statusCode: 400, statusMessage: 'Result-generated performances must be corrected from Result Entry rather than deleted here.' })
    }

    if (profile.role !== 'super_admin' && Number(row.school_id) !== Number(profile.school_id)) {
      throw createError({ statusCode: 403, statusMessage: 'You can only delete historical records for your own school.' })
    }

    const { error } = await admin.from('record_performances').delete().eq('id', id)
    if (error) throw createError({ statusCode: 400, statusMessage: error.message })

    return { deleted: true }
  }

  if (action !== 'create') {
    throw createError({ statusCode: 400, statusMessage: 'Unknown records action.' })
  }

  const scope = String(body?.record_scope || '').trim()
  if (!['school', 'house', 'interschool'].includes(scope)) {
    throw createError({ statusCode: 400, statusMessage: 'Select a valid record scope.' })
  }

  const sportId = Number(body?.sport_id)
  const yearLevel = body?.year_level === '' || body?.year_level == null ? null : Number(body.year_level)
  const gender = String(body?.gender || 'mixed').trim()
  const holderName = String(body?.holder_name || '').trim()
  const rawResultValue = String(body?.result_value ?? '').trim()
  let resultValue = Number(rawResultValue)
  let resultDisplay = String(body?.result_display || '').trim() || null
  const achievedDate = String(body?.achieved_date || '').trim()
  const notes = String(body?.notes || '').trim() || null

  if (!Number.isInteger(sportId) || sportId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Select a sport.' })
  }

  const { data: sport, error: sportError } = await admin
    .from('sports')
    .select('id,name,measurement_type')
    .eq('id', sportId)
    .maybeSingle()

  if (sportError || !sport) {
    throw createError({ statusCode: 400, statusMessage: sportError?.message || 'Sport not found.' })
  }

  if (sport.measurement_type === 'time' && rawResultValue.includes(':')) {
    const bits = rawResultValue.split(':').map(Number)
    if (bits.some(Number.isNaN)) {
      throw createError({ statusCode: 400, statusMessage: 'Time must be seconds or mm:ss.xx.' })
    }
    resultValue = bits.length === 2
      ? bits[0] * 60 + bits[1]
      : bits.length === 3
        ? bits[0] * 3600 + bits[1] * 60 + bits[2]
        : Number.NaN
  }

  if (yearLevel !== null && (!Number.isInteger(yearLevel) || yearLevel < 1 || yearLevel > 12)) {
    throw createError({ statusCode: 400, statusMessage: 'Year level must be between 1 and 12.' })
  }
  if (!holderName) throw createError({ statusCode: 400, statusMessage: 'Record holder name is required.' })
  if (!Number.isFinite(resultValue)) throw createError({ statusCode: 400, statusMessage: 'A valid result value is required.' })
  if (!achievedDate) throw createError({ statusCode: 400, statusMessage: 'The date achieved is required.' })

  if (!resultDisplay) {
    if (sport.measurement_type === 'time') {
      if (resultValue >= 60) {
        const minutes = Math.floor(resultValue / 60)
        const seconds = (resultValue - minutes * 60).toFixed(2).padStart(5, '0')
        resultDisplay = `${minutes}:${seconds}`
      } else {
        resultDisplay = `${resultValue.toFixed(2)} s`
      }
    } else if (sport.measurement_type === 'distance' || sport.measurement_type === 'height') {
      resultDisplay = `${resultValue.toFixed(2)} m`
    } else {
      resultDisplay = String(resultValue)
    }
  }

  let schoolId: number | null = null
  let houseId: number | null = null
  let holderSchoolName: string | null = String(body?.holder_school_name || '').trim() || null
  let holderHouseName: string | null = String(body?.holder_house_name || '').trim() || null

  if (scope === 'school' || scope === 'house') {
    schoolId = profile.role === 'super_admin'
      ? Number(body?.school_id)
      : Number(profile.school_id)

    if (!Number.isInteger(schoolId) || schoolId <= 0) {
      throw createError({ statusCode: 400, statusMessage: 'Select a school.' })
    }

    const { data: school, error: schoolError } = await admin
      .from('schools')
      .select('id,name')
      .eq('id', schoolId)
      .maybeSingle()

    if (schoolError || !school) {
      throw createError({ statusCode: 400, statusMessage: schoolError?.message || 'School not found.' })
    }
    holderSchoolName ||= school.name
  }

  if (scope === 'house') {
    houseId = Number(body?.house_id)
    if (!Number.isInteger(houseId) || houseId <= 0) {
      throw createError({ statusCode: 400, statusMessage: 'Select a house.' })
    }

    const { data: house, error: houseError } = await admin
      .from('houses')
      .select('id,name,school_id')
      .eq('id', houseId)
      .maybeSingle()

    if (houseError || !house || Number(house.school_id) !== schoolId) {
      throw createError({ statusCode: 400, statusMessage: houseError?.message || 'House does not belong to the selected school.' })
    }
    holderHouseName ||= house.name
  }

  if (scope === 'interschool' && profile.role !== 'super_admin') {
    throw createError({ statusCode: 403, statusMessage: 'Only Super Admin can add platform-wide interschool historical records.' })
  }

  const { data, error } = await admin
    .from('record_performances')
    .insert({
      record_scope: scope,
      school_id: scope === 'interschool' ? null : schoolId,
      house_id: scope === 'house' ? houseId : null,
      sport_id: sportId,
      year_level: yearLevel,
      gender,
      student_id: null,
      source_result_id: null,
      event_id: null,
      carnival_id: null,
      holder_name: holderName,
      holder_school_name: holderSchoolName,
      holder_house_name: holderHouseName,
      result_value: resultValue,
      result_display: resultDisplay,
      achieved_date: achievedDate,
      verified: true,
      manual_entry: true,
      notes,
    })
    .select('id')
    .single()

  if (error) throw createError({ statusCode: 400, statusMessage: error.message })

  return { created: true, id: data.id }
})
