export default defineNuxtRouteMiddleware(async () => {
  const user = useSupabaseUser()
  if (!user.value) return navigateTo('/login')
  const supabase = useSupabaseClient()
  const { data } = await supabase.from('profiles').select('role').eq('id', user.value.id).single()
  if (!['admin', 'teacher'].includes(data?.role || '')) return navigateTo('/dashboard')
})
