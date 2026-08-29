export default defineNuxtRouteMiddleware(async () => {
  const supabase = useSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return navigateTo('/login')
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role, active')
    .eq('id', user.id)
    .single()

  if (error) {
    console.error('TEACHER ROLE CHECK ERROR:', error)
    return navigateTo('/dashboard')
  }

  if (!profile?.active || !['super_admin', 'admin', 'teacher'].includes(String(profile.role || ''))) {
    return navigateTo('/dashboard')
  }
})
