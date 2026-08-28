export default defineNuxtRouteMiddleware(async () => {
  const supabase = useSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return navigateTo('/login')
  }
})
