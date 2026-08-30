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
  <div class="min-h-screen bg-slate-50 text-slate-900">
    <header v-if="user" class="border-b bg-white">
      <div class="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
        <NuxtLink
          to="/dashboard"
          class="flex shrink-0 items-center gap-3"
          aria-label="School Sports Tracker dashboard"
        >
          <img
            src="/images/school-sports-tracker-logo.png"
            alt="School Sports Tracker"
            class="h-14 w-14 rounded-xl object-contain"
          />

          <div class="hidden lg:block">
            <div class="text-lg font-black leading-tight text-slate-900">
              School Sports
            </div>
            <div class="text-sm font-black uppercase tracking-[0.18em] text-emerald-600">
              Tracker
            </div>
          </div>
        </NuxtLink>

        <nav class="hidden items-center gap-4 md:flex">
          <NuxtLink to="/dashboard" class="hover:text-blue-700">Dashboard</NuxtLink>
          <NuxtLink to="/events" class="hover:text-blue-700">Events</NuxtLink>
          <NuxtLink to="/leaderboard" class="hover:text-blue-700">Leaderboard</NuxtLink>
          <NuxtLink to="/records" class="hover:text-blue-700">Records</NuxtLink>
          <NuxtLink v-if="profile?.role === 'student'" to="/student" class="hover:text-blue-700">
            My Results
          </NuxtLink>
          <NuxtLink v-if="isTeacher" to="/teacher" class="hover:text-blue-700">Teacher</NuxtLink>
          <NuxtLink v-if="isAdmin" to="/admin" class="font-semibold text-blue-700 hover:text-blue-800">
            Admin
          </NuxtLink>
        </nav>

        <div class="flex items-center gap-3">
          <div class="hidden text-right sm:block">
            <div class="text-sm font-semibold text-slate-700">
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
            class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700"
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
