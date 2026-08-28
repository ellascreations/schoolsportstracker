import {
  serverSupabaseClient,
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from '#supabase/server'

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
  const user = await serverSupabaseUser(event)

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication required.',
    })
  }

  /*
   * Use the authenticated client to verify the current user's role.
   * This uses the same logged-in Supabase session as the browser.
   */
  const client = await serverSupabaseClient(event)

  const { data: requester, error: requesterError } = await client
    .from('profiles')
    .select('id, email, role, active')
    .eq('id', user.id)
    .single()

  if (requesterError) {
    console.error('CSV IMPORT ADMIN CHECK ERROR:', requesterError)

    throw createError({
      statusCode: 403,
      statusMessage: 'Could not verify Admin access.',
    })
  }

  if (!requester?.active || requester.role !== 'admin') {
    console.error('CSV IMPORT ACCESS DENIED:', {
      userId: user.id,
      email: user.email,
      profile: requester,
    })

    throw createError({
      statusCode: 403,
      statusMessage: 'Admin access is required.',
    })
  }

  /*
   * Only after we have confirmed that the logged-in user is an Admin
   * do we create the service-role client.
   */
  const admin = serverSupabaseServiceRole(event)

  const body = await readBody<{ rows?: ImportRow[] }>(event)

  const rows = Array.isArray(body?.rows)
    ? body.rows
    : []

  if (!rows.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No student rows supplied.',
    })
  }

  if (rows.length > 1000) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Maximum 1000 students per import.',
    })
  }

  const { data: houses, error: housesError } = await admin
    .from('houses')
    .select('id, name')

  if (housesError) {
    throw createError({
      statusCode: 500,
      statusMessage: housesError.message,
    })
  }

  const houseMap = new Map(
    (houses || []).map((house: any) => [
      String(house.name).trim().toLowerCase(),
      house.id,
    ])
  )

  const results: any[] = []

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index] || {}

    const rowNumber = index + 2

    const email = String(row.email || '')
      .trim()
      .toLowerCase()

    const firstName = String(row.first_name || '').trim()
    const lastName = String(row.last_name || '').trim()

    const studentNumber =
      String(row.student_number || '').trim() || null

    const yearLevel =
      row.year_level === '' || row.year_level == null
        ? null
        : Number(row.year_level)

    const houseName = String(row.house || '').trim()

    const houseId = houseName
      ? houseMap.get(houseName.toLowerCase())
      : null

    // -----------------------------
    // Validation
    // -----------------------------

    if (!email || !firstName || !lastName) {
      results.push({
        row: rowNumber,
        email,
        ok: false,
        error:
          'first_name, last_name and email are required.',
      })

      continue
    }

    if (
      yearLevel !== null &&
      (!Number.isInteger(yearLevel) ||
        yearLevel < 1 ||
        yearLevel > 12)
    ) {
      results.push({
        row: rowNumber,
        email,
        ok: false,
        error:
          'year_level must be between 1 and 12.',
      })

      continue
    }

    if (houseName && !houseId) {
      results.push({
        row: rowNumber,
        email,
        ok: false,
        error: `House "${houseName}" was not found.`,
      })

      continue
    }

    // -----------------------------
    // Existing student
    // -----------------------------

    let existingProfile: any = null

    const { data: emailMatch } = await admin
      .from('profiles')
      .select('id,email,student_number')
      .eq('email', email)
      .maybeSingle()

    existingProfile = emailMatch

    if (!existingProfile && studentNumber) {
      const { data: numberMatch } = await admin
        .from('profiles')
        .select('id,email,student_number')
        .eq('student_number', studentNumber)
        .maybeSingle()

      existingProfile = numberMatch
    }

    if (existingProfile) {
      const { error: updateError } = await admin
        .from('profiles')
        .update({
          first_name: firstName,
          last_name: lastName,
          student_number: studentNumber,
          year_level: yearLevel,
          house_id: houseId ?? null,
          role: 'student',
          active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingProfile.id)

      results.push(
        updateError
          ? {
              row: rowNumber,
              email,
              ok: false,
              error: updateError.message,
            }
          : {
              row: rowNumber,
              email,
              ok: true,
              action: 'updated',
            }
      )

      continue
    }

    // -----------------------------
    // Create new student
    // -----------------------------

    const password =
      String(row.temporary_password || '').trim() ||
      `Sport!${crypto
        .randomUUID()
        .replaceAll('-', '')
        .slice(0, 14)}a1`

    const {
      data: created,
      error: createUserError,
    } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,

      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        role: 'student',
      },
    })

    if (createUserError || !created.user) {
      results.push({
        row: rowNumber,
        email,
        ok: false,
        error:
          createUserError?.message ||
          'Could not create Auth user.',
      })

      continue
    }

    /*
     * The signup trigger should already create the profile.
     * We now fill in the remaining school information.
     */
    const { error: profileError } = await admin
      .from('profiles')
      .update({
        first_name: firstName,
        last_name: lastName,
        student_number: studentNumber,
        year_level: yearLevel,
        house_id: houseId ?? null,
        role: 'student',
        active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', created.user.id)

    if (profileError) {
      // Clean up the Auth account if creating the
      // school profile fails.
      await admin.auth.admin.deleteUser(
        created.user.id
      )

      results.push({
        row: rowNumber,
        email,
        ok: false,
        error: profileError.message,
      })

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

    successful: results.filter(
      (result) => result.ok
    ).length,

    failed: results.filter(
      (result) => !result.ok
    ).length,

    results,
  }
})
