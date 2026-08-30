import { serverSupabaseServiceRole } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const admin = serverSupabaseServiceRole(event)
  const body = await readBody<any>(event)

  const firstName = String(body?.first_name || '').trim()
  const lastName = String(body?.last_name || '').trim()
  const email = String(body?.email || '').trim().toLowerCase()
  const password = String(body?.password || '')
  const schoolId = Number(body?.school_id)

  if (!firstName || !lastName || !email || !Number.isInteger(schoolId)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'First name, last name, school and school email are required.',
    })
  }

  if (password.length < 8) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Password must be at least 8 characters.',
    })
  }

  const emailDomain = email.includes('@') ? email.split('@').pop()!.toLowerCase() : ''

  const [{ data: school, error: schoolError }, { data: domain, error: domainError }, { data: settings, error: settingsError }] =
    await Promise.all([
      admin
        .from('schools')
        .select('id,name,active,teacher_self_registration_mode')
        .eq('id', schoolId)
        .maybeSingle(),
      admin
        .from('school_domains')
        .select('id,domain')
        .eq('school_id', schoolId)
        .eq('active', true)
        .ilike('domain', emailDomain)
        .maybeSingle(),
      admin
        .from('platform_settings')
        .select('teacher_email_verification_required')
        .eq('id', 1)
        .single(),
    ])

  if (schoolError || !school || !school.active) {
    throw createError({ statusCode: 400, statusMessage: 'Selected school is not available.' })
  }

  if (school.teacher_self_registration_mode === 'disabled') {
    throw createError({ statusCode: 403, statusMessage: 'Teacher self-registration is disabled for this school.' })
  }

  if (domainError || !domain) {
    throw createError({
      statusCode: 400,
      statusMessage: `Your email address does not match an approved domain for ${school.name}.`,
    })
  }

  if (settingsError) {
    throw createError({ statusCode: 500, statusMessage: settingsError.message })
  }

  const { data: existingProfile } = await admin
    .from('profiles')
    .select('id,email,role')
    .eq('email', email)
    .maybeSingle()

  if (existingProfile) {
    throw createError({
      statusCode: 409,
      statusMessage: 'An account already exists for this email address. Please sign in instead.',
    })
  }

  const requiresVerification = settings?.teacher_email_verification_required !== false
  const registrationStatus =
    school.teacher_self_registration_mode === 'admin_approval' ? 'pending' : 'approved'
  const active = registrationStatus === 'approved'

  const metadata = {
    first_name: firstName,
    last_name: lastName,
    role: 'teacher',
    school_id: schoolId,
    registration_source: 'self_registration',
  }

  let user: any = null

  if (requiresVerification) {
    const origin = getRequestURL(event).origin
    const { data, error } = await admin.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
        emailRedirectTo: `${origin}/login?verified=1`,
      },
    })

    if (error || !data.user) {
      throw createError({
        statusCode: 400,
        statusMessage: error?.message || 'Could not create teacher registration.',
      })
    }

    // If Supabase returns a session immediately, Confirm Email is disabled in
    // the Supabase Auth project. Remove the account because the Super Admin
    // has explicitly required verification in the Sports Tracker.
    if (data.session) {
      await admin.auth.admin.deleteUser(data.user.id)
      throw createError({
        statusCode: 500,
        statusMessage:
          'Teacher email verification is required in Sports Tracker, but Supabase Confirm Email is disabled. Enable Confirm Email in Supabase Auth, or turn verification off in Super Admin → Schools.',
      })
    }

    user = data.user
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    })

    if (error || !data.user) {
      throw createError({
        statusCode: 400,
        statusMessage: error?.message || 'Could not create teacher registration.',
      })
    }

    user = data.user
  }

  const { error: profileError } = await admin
    .from('profiles')
    .update({
      first_name: firstName,
      last_name: lastName,
      role: 'teacher',
      school_id: schoolId,
      active,
      registration_status: registrationStatus,
      registration_source: 'self_registration',
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (profileError) {
    await admin.auth.admin.deleteUser(user.id)
    throw createError({ statusCode: 400, statusMessage: profileError.message })
  }

  return {
    created: true,
    email_verification_required: requiresVerification,
    approval_required: registrationStatus === 'pending',
    message: requiresVerification
      ? registrationStatus === 'pending'
        ? 'Registration created. Check your school email to verify the address. A School Admin must also approve your account.'
        : 'Registration created. Check your school email to verify the address before signing in.'
      : registrationStatus === 'pending'
        ? 'Registration created. Email verification is disabled, but a School Admin must approve your account before you can sign in.'
        : 'Registration complete. You can sign in now.',
  }
})
