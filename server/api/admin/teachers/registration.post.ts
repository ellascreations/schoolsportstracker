import { requireAdmin } from '../../../utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const body = await readBody<any>(event)
  const { admin, profile } = await requireAdmin(event, body?.access_token)

  const teacherId = String(body?.teacher_id || '').trim()
  const action = String(body?.action || '').trim().toLowerCase()

  if (!teacherId || !['approve','reject'].includes(action)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid teacher and action are required.' })
  }

  const { data: teacher, error: teacherError } = await admin
    .from('profiles')
    .select('id,email,role,school_id,registration_status')
    .eq('id', teacherId)
    .maybeSingle()

  if (teacherError || !teacher || teacher.role !== 'teacher') {
    throw createError({ statusCode: 404, statusMessage: 'Teacher registration not found.' })
  }

  if (profile.role !== 'super_admin' && Number(profile.school_id) !== Number(teacher.school_id)) {
    throw createError({ statusCode: 403, statusMessage: 'You can only manage teacher registrations for your own school.' })
  }

  const update = action === 'approve'
    ? { active: true, registration_status: 'approved', updated_at: new Date().toISOString() }
    : { active: false, registration_status: 'rejected', updated_at: new Date().toISOString() }

  const { error } = await admin.from('profiles').update(update).eq('id', teacherId)
  if (error) throw createError({ statusCode: 400, statusMessage: error.message })

  return { ok: true, action }
})
