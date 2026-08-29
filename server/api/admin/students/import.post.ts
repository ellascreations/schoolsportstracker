import { requireAdmin } from '../../../utils/requireAdmin'

type ImportRow = {
  student_number?: string
  first_name?: string
  last_name?: string
  email?: string
  year_level?: number | string | null
  house?: string
  temporary_password?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ rows?: ImportRow[]; access_token?: string }>(event)
  const { admin, profile } = await requireAdmin(event, body?.access_token)

  const rows = Array.isArray(body?.rows) ? body.rows : []
  if (!rows.length) throw createError({ statusCode: 400, statusMessage: 'No student rows supplied.' })
  if (rows.length > 2000) throw createError({ statusCode: 400, statusMessage: 'Maximum 1000 students per import.' })

  const { data: houses } = await admin.from('houses').select('id,name').eq('school_id', profile.school_id)
  const houseMap = new Map((houses || []).map((h: any) => [String(h.name).trim().toLowerCase(), h.id]))

  const results: any[] = []

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index] || {}
    const rowNumber = index + 2
    const email = String(row.email || '').trim().toLowerCase()
    const firstName = String(row.first_name || '').trim()
    const lastName = String(row.last_name || '').trim()
    const studentNumber = String(row.student_number || '').trim() || null
    const yearLevel = row.year_level === '' || row.year_level == null ? null : Number(row.year_level)
    const houseName = String(row.house || '').trim()
    const houseId = houseName ? houseMap.get(houseName.toLowerCase()) : null

    if (!email || !firstName || !lastName) {
      results.push({ row: rowNumber, email, ok: false, error: 'first_name, last_name and email are required.' })
      continue
    }
    if (yearLevel !== null && (!Number.isInteger(yearLevel) || yearLevel < 1 || yearLevel > 12)) {
      results.push({ row: rowNumber, email, ok: false, error: 'year_level must be between 1 and 12.' })
      continue
    }
    if (houseName && !houseId) {
      results.push({ row: rowNumber, email, ok: false, error: `House "${houseName}" was not found.` })
      continue
    }

    let existingProfile: any = null
    const { data: emailMatch } = await admin.from('profiles').select('id,email,student_number').eq('email', email).eq('school_id', profile.school_id).maybeSingle()
    existingProfile = emailMatch
    if (!existingProfile && studentNumber) {
      const { data: numberMatch } = await admin.from('profiles').select('id,email,student_number').eq('student_number', studentNumber).eq('school_id', profile.school_id).maybeSingle()
      existingProfile = numberMatch
    }
    if (existingProfile) {
      const { error: updateError } = await admin.from('profiles').update({
        first_name: firstName,
        last_name: lastName,
        student_number: studentNumber,
        year_level: yearLevel,
        house_id: houseId ?? null,
        school_id: profile.school_id,
        role: 'student',
        active: true,
        updated_at: new Date().toISOString()
      }).eq('id', existingProfile.id)
      results.push(updateError
        ? { row: rowNumber, email, ok: false, error: updateError.message }
        : { row: rowNumber, email, ok: true, action: 'updated' })
      continue
    }

    const password = String(row.temporary_password || '').trim() || `Sport!${crypto.randomUUID().replaceAll('-', '').slice(0, 14)}a1`
    const { data: created, error: createErrorResult } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName, role: 'student', school_id: profile.school_id }
    })

    if (createErrorResult || !created.user) {
      results.push({ row: rowNumber, email, ok: false, error: createErrorResult?.message || 'Could not create Auth user.' })
      continue
    }

    const { error: profileError } = await admin.from('profiles').update({
      first_name: firstName,
      last_name: lastName,
      student_number: studentNumber,
      year_level: yearLevel,
      house_id: houseId ?? null,
      school_id: profile.school_id,
      role: 'student',
      active: true,
      updated_at: new Date().toISOString()
    }).eq('id', created.user.id)

    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id)
      results.push({ row: rowNumber, email, ok: false, error: profileError.message })
      continue
    }

    results.push({ row: rowNumber, email, ok: true, action: 'created', temporary_password: password })
  }

  return {
    total: results.length,
    successful: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    results
  }
})
