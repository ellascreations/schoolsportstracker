import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'

export async function requireAdmin(event: any, bodyAccessToken?: string) {
  const admin = serverSupabaseServiceRole(event)

  let authUser: any = null
  let authSource = ''

  // 1. Preferred path: Supabase session cookie managed by @nuxtjs/supabase.
  try {
    const cookieUser = await serverSupabaseUser(event)
    if (cookieUser?.id) {
      authUser = cookieUser
      authSource = 'cookie'
    }
  } catch (error) {
    console.warn('ADMIN AUTH COOKIE CHECK FAILED:', error)
  }

  // 2. Fallback: standard Authorization: Bearer <token> header.
  if (!authUser) {
    const authorization = String(getHeader(event, 'authorization') || '').trim()
    const bearerToken = authorization.toLowerCase().startsWith('bearer ')
      ? authorization.slice(7).trim()
      : ''

    if (bearerToken) {
      const { data, error } = await admin.auth.getUser(bearerToken)
      if (!error && data?.user) {
        authUser = data.user
        authSource = 'authorization-header'
      } else if (error) {
        console.warn('ADMIN AUTH BEARER CHECK FAILED:', error.message)
      }
    }
  }

  // 3. Final fallback: token supplied in the POST body.
  if (!authUser) {
    const bodyToken = String(bodyAccessToken || '').trim()
    if (bodyToken) {
      const { data, error } = await admin.auth.getUser(bodyToken)
      if (!error && data?.user) {
        authUser = data.user
        authSource = 'request-body'
      } else if (error) {
        console.warn('ADMIN AUTH BODY TOKEN CHECK FAILED:', error.message)
      }
    }
  }

  if (!authUser?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication could not be verified. Please sign out, sign back in, and try again.'
    })
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id,email,role,active,school_id')
    .eq('id', authUser.id)
    .single()

  if (profileError) {
    console.error('ADMIN PROFILE LOOKUP FAILED:', {
      authSource,
      userId: authUser.id,
      error: profileError
    })
    throw createError({
      statusCode: 403,
      statusMessage: 'Your account was authenticated, but the Admin profile could not be verified.'
    })
  }

  if (!profile?.active || !['admin', 'super_admin'].includes(String(profile.role))) {
    console.error('ADMIN ACCESS DENIED:', {
      authSource,
      userId: authUser.id,
      email: authUser.email,
      profile
    })
    throw createError({
      statusCode: 403,
      statusMessage: 'Admin access required.'
    })
  }

  return { admin, authUser, profile, authSource }
}
