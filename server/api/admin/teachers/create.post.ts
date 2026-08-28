import { requireAdmin } from '../../../utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const body = await readBody<any>(event)
  const { admin } = await requireAdmin(event, body?.access_token)

  const email = String(body.email || '').trim().toLowerCase()
  const firstName = String(body.first_name || '').trim()
  const lastName = String(body.last_name || '').trim()
  const password = String(body.temporary_password || '').trim() || `Sport!${crypto.randomUUID().replaceAll('-', '').slice(0, 14)}a1`

  if (!email || !firstName || !lastName) {
    throw createError({ statusCode: 400, statusMessage: 'First name, last name and email are required.' })
  }

  const { data: existing } = await admin.from('profiles').select('id,email,role').eq('email', email).maybeSingle()
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: `An account already exists for ${email}. Use Users & Roles to change the existing account to Teacher.` })
  }

  const { data: created, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { first_name: firstName, last_name: lastName, role: 'teacher' },
  })
  if (error || !created.user) {
    throw createError({ statusCode: 400, statusMessage: error?.message || 'Could not create teacher.' })
  }

  const { error: profileError } = await admin.from('profiles').update({
    first_name: firstName, last_name: lastName, role: 'teacher', active: true,
    updated_at: new Date().toISOString(),
  }).eq('id', created.user.id)

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id)
    throw createError({ statusCode: 400, statusMessage: profileError.message })
  }

  return { id: created.user.id, email, temporary_password: password }
})
