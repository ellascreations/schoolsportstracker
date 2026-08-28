import { serverSupabaseServiceRole } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const body = await readBody<any>(event)
  const accessToken = String(body?.access_token || '').trim()

  if (!accessToken) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required.' })
  }

  const admin = serverSupabaseServiceRole(event)

  const { data: authData, error: authError } = await admin.auth.getUser(accessToken)
  const authUser = authData?.user

  if (authError || !authUser) {
    console.error('STUDENT API AUTH ERROR:', authError)
    throw createError({ statusCode: 401, statusMessage: 'Your login session could not be verified.' })
  }

  const { data: requester, error: requesterError } = await admin
    .from('profiles')
    .select('role, active')
    .eq('id', authUser.id)
    .single()

  if (requesterError || !requester?.active || requester.role !== 'admin') {
    console.error('STUDENT ADMIN CHECK ERROR:', {
      requesterError,
      userId: authUser.id,
      email: authUser.email,
      requester
    })
    throw createError({ statusCode: 403, statusMessage: 'Admin access required.' })
  }

  const email = String(body.email || '').trim().toLowerCase()
  const firstName = String(body.first_name || '').trim()
  const lastName = String(body.last_name || '').trim()
  const password = String(body.temporary_password || '').trim() || `Sport!${crypto.randomUUID().replaceAll('-', '').slice(0, 14)}a1`
  if (!email || !firstName || !lastName) throw createError({ statusCode: 400, statusMessage: 'First name, last name and email are required.' })

  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { first_name: firstName, last_name: lastName, role: 'student' } })
  if (error || !created.user) throw createError({ statusCode: 400, statusMessage: error?.message || 'Could not create student.' })

  const { error: profileError } = await admin.from('profiles').update({
    first_name: firstName, last_name: lastName, student_number: body.student_number || null,
    year_level: body.year_level || null, house_id: body.house_id || null, role: 'student', active: true, updated_at: new Date().toISOString()
  }).eq('id', created.user.id)
  if (profileError) { await admin.auth.admin.deleteUser(created.user.id); throw createError({ statusCode: 400, statusMessage: profileError.message }) }

  return { id: created.user.id, email, temporary_password: password }
})
