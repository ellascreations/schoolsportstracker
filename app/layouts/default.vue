<script setup lang="ts">
const supabase = useSupabaseClient()
const user = useSupabaseUser()

const profile = ref<any>(null)
const isAdmin = ref(false)
const isSuperAdmin = ref(false)
const isTeacher = ref(false)

const checkRole = async () => {
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    profile.value = null
    isAdmin.value = false
    isSuperAdmin.value = false
    isTeacher.value = false
    return
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name, role, active, school_id, school:schools(name,short_name)')
    .eq('id', authUser.id)
    .single()

  if (error) {
    console.error('HEADER ROLE CHECK ERROR:', error)
    profile.value = null
    isAdmin.value = false
    isSuperAdmin.value = false
    isTeacher.value = false
    return
  }

  profile.value = data

  if (!data?.active) {
    isAdmin.value = false
    isSuperAdmin.value = false
    isTeacher.value = false
    return
  }

  isSuperAdmin.value = data.role === 'super_admin'
  isAdmin.value = data.role === 'admin' || data.role === 'super_admin'
  isTeacher.value = data.role === 'admin' || data.role === 'super_admin' || data.role === 'teacher'
}

const logout = async () => {
  await supabase.auth.signOut()
  profile.value = null
  isAdmin.value = false
  isSuperAdmin.value = false
  isTeacher.value = false
  await navigateTo('/login')
}

onMounted(async () => {
  await checkRole()
})

const {
  data: { subscription },
} = supabase.auth.onAuthStateChange(async () => {
  await checkRole()
})

onUnmounted(() => {
  subscription.unsubscribe()
})
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100">
    <header v-if="user" class="sst-app-header border-b">
      <div class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <NuxtLink
          to="/dashboard"
          class="flex shrink-0 items-center gap-3"
          aria-label="School Sports Tracker dashboard"
        >
          <img
            src="/images/school-sports-tracker-logo.png"
            alt="School Sports Tracker"
            class="h-28 w-28 object-contain drop-shadow-2xl"
          />
        </NuxtLink>

        <nav class="hidden items-center gap-4 md:flex">
          <NuxtLink to="/dashboard" class="sst-nav-link">Dashboard</NuxtLink>
          <NuxtLink to="/events" class="sst-nav-link">Events</NuxtLink>
          <NuxtLink to="/leaderboard" class="sst-nav-link">Leaderboard</NuxtLink>
          <NuxtLink to="/records" class="sst-nav-link">Records</NuxtLink>
          <NuxtLink v-if="profile?.role === 'student'" to="/student" class="sst-nav-link">
            My Results
          </NuxtLink>
          <NuxtLink v-if="isTeacher" to="/teacher" class="sst-nav-link">Teacher</NuxtLink>
          <NuxtLink v-if="isAdmin" to="/admin" class="sst-nav-link">
            Admin
          </NuxtLink>
        </nav>

        <div class="flex items-center gap-3">
          <div class="hidden text-right sm:block">
            <div class="text-sm font-semibold text-slate-100">
              {{ profile?.first_name }} {{ profile?.last_name }}
            </div>
            <div v-if="profile?.school" class="text-xs text-slate-400">
              {{ profile.school.short_name || profile.school.name }}
            </div>
            <div v-if="profile?.role" class="text-xs capitalize text-slate-400">
              {{ String(profile.role).replaceAll('_', ' ') }}
            </div>
          </div>
          <button
            type="button"
            class="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
            @click="logout"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>

    <slot />
  </div>
</template>
