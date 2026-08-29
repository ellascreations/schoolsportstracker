export default defineNuxtPlugin(() => {
  const supabase = useSupabaseClient()
  const router = useRouter()

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null
  let timeoutMinutes = 5
  let currentUserId: string | null = null
  let isSigningOut = false

  const clearTimer = () => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
      timeoutHandle = null
    }
  }

  const signOutForInactivity = async () => {
    if (isSigningOut || !currentUserId) {
      return
    }

    isSigningOut = true
    clearTimer()

    try {
      await supabase.auth.signOut()

      sessionStorage.setItem(
        'sports_tracker_logout_reason',
        'You were signed out after a period of inactivity.'
      )

      await navigateTo('/login')
    } catch (error) {
      console.error('INACTIVITY LOGOUT ERROR:', error)
    } finally {
      currentUserId = null
      isSigningOut = false
    }
  }

  const restartTimer = () => {
    clearTimer()

    if (!currentUserId || timeoutMinutes <= 0 || isSigningOut) {
      return
    }

    timeoutHandle = setTimeout(
      signOutForInactivity,
      timeoutMinutes * 60 * 1000
    )
  }

  const loadTimeoutForUser = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('idle_timeout_minutes, active')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('INACTIVITY TIMEOUT PROFILE ERROR:', error)
      timeoutMinutes = 5
      restartTimer()
      return
    }

    if (!data?.active) {
      await supabase.auth.signOut()
      currentUserId = null
      clearTimer()
      await navigateTo('/login')
      return
    }

    const configuredMinutes = Number(data?.idle_timeout_minutes)

    timeoutMinutes =
      Number.isFinite(configuredMinutes)
        ? configuredMinutes
        : 5

    restartTimer()
  }

  const activityHandler = () => {
    restartTimer()
  }

  const activityEvents = [
    'pointerdown',
    'keydown',
    'touchstart',
    'scroll',
  ] as const

  for (const eventName of activityEvents) {
    window.addEventListener(
      eventName,
      activityHandler,
      { passive: true }
    )
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      restartTimer()
    }
  })

  const initialise = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      currentUserId = null
      clearTimer()
      return
    }

    currentUserId = user.id
    await loadTimeoutForUser(user.id)
  }

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(async (_event, session) => {
    if (!session?.user) {
      currentUserId = null
      clearTimer()
      return
    }

    currentUserId = session.user.id
    await loadTimeoutForUser(session.user.id)
  })

  router.afterEach(async () => {
    if (currentUserId) {
      await loadTimeoutForUser(currentUserId)
    }
  })

  initialise()

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      clearTimer()
      subscription.unsubscribe()

      for (const eventName of activityEvents) {
        window.removeEventListener(
          eventName,
          activityHandler
        )
      }
    })
  }
})
