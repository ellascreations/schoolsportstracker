import { requireAdmin } from '../../../utils/requireAdmin'

type TeacherImportRow = {
  first_name?: string
  last_name?: string
  email?: string
  temporary_password?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ rows?: TeacherImportRow[]; access_token?: string }>(event)
  const { admin, profile } = await requireAdmin(event, body?.access_token)

  const rows = Array.isArray(body?.rows) ? body.rows : []

  if (!rows.length) {
    throw createError({ statusCode: 400, statusMessage: 'No teacher rows supplied.' })
  }

  if (rows.length > 20) {
    throw createError({ statusCode: 400, statusMessage: 'Maximum 20 teachers per batch.' })
  }

  const results: any[] = []

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index] || {}
    const rowNumber = index + 2
    const email = String(row.email || '').trim().toLowerCase()
    const firstName = String(row.first_name || '').trim()
    const lastName = String(row.last_name || '').trim()

    if (!email || !firstName || !lastName) {
      results.push({
        row: rowNumber,
        email,
        ok: false,
        error: 'first_name, last_name and email are required.',
      })
      continue
    }

    const { data: existing, error: existingError } = await admin
      .from('profiles')
      .select('id,email,role,active')
      .eq('email', email)
      .eq('school_id', profile.school_id)
      .maybeSingle()

    if (existingError) {
      results.push({ row: rowNumber, email, ok: false, error: existingError.message })
      continue
    }

    if (existing) {
      if (existing.role !== 'teacher') {
        results.push({
          row: rowNumber,
          email,
          ok: false,
          error: `This email already belongs to a ${existing.role} account. Change the role manually in Users & Roles if required.`,
        })
        continue
      }

      const { error: updateError } = await admin
        .from('profiles')
        .update({
          first_name: firstName,
          last_name: lastName,
          school_id: profile.school_id,
          active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)

      results.push(updateError
        ? { row: rowNumber, email, ok: false, error: updateError.message }
        : { row: rowNumber, email, ok: true, action: 'updated' })
      continue
    }

    const password =
      String(row.temporary_password || '').trim() ||
      `Sport!${crypto.randomUUID().replaceAll('-', '').slice(0, 14)}a1`

    const { data: created, error: createUserError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        role: 'teacher',
        school_id: profile.school_id,
      },
    })

    if (createUserError || !created.user) {
      results.push({
        row: rowNumber,
        email,
        ok: false,
        error: createUserError?.message || 'Could not create Auth user.',
      })
      continue
    }

    const { error: profileError } = await admin
      .from('profiles')
      .update({
        first_name: firstName,
        last_name: lastName,
        school_id: profile.school_id,
        role: 'teacher',
        active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', created.user.id)

    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id)
      results.push({ row: rowNumber, email, ok: false, error: profileError.message })
      continue
    }

    results.push({
      row: rowNumber,
      email,
      ok: true,
      action: 'created',
      temporary_password: password,
    })
  }

  return {
    total: results.length,
    successful: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results,
  }
})
