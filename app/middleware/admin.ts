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
    console.error('ADMIN ROLE CHECK ERROR:', error)
    return navigateTo('/dashboard')
  }

  if (!profile?.active || profile.role !== 'admin') {
    return navigateTo('/dashboard')
  }
})
