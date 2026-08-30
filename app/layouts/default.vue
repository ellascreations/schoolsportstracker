<script setup lang="ts">
const supabase = useSupabaseClient()
const user = useSupabaseUser()

const profile = ref<any>(null)
const isAdmin = ref(false)
const isSuperAdmin = ref(false)
const isTeacher = ref(false)
const mobileMenuOpen = ref(false)

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
  mobileMenuOpen.value = false
  await navigateTo('/login')
}

const closeMobileMenu = () => {
  mobileMenuOpen.value = false
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
    <aside
      v-if="user"
      class="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-slate-800 bg-slate-950/95 backdrop-blur md:flex"
    >
      <div class="flex justify-center border-b border-slate-800 px-5 py-6">
        <NuxtLink to="/dashboard" aria-label="School Sports Tracker dashboard" class="block">
          <img
            src="/images/school-sports-tracker-logo.png"
            alt="School Sports Tracker"
            class="h-36 w-36 object-contain drop-shadow-2xl"
          />
        </NuxtLink>
      </div>

      <nav class="flex-1 space-y-2 overflow-y-auto px-4 py-5">
        <NuxtLink to="/dashboard" class="sst-nav-link flex w-full items-center rounded-xl px-4 py-3 text-left">Dashboard</NuxtLink>
        <NuxtLink to="/events" class="sst-nav-link flex w-full items-center rounded-xl px-4 py-3 text-left">Events</NuxtLink>
        <NuxtLink to="/leaderboard" class="sst-nav-link flex w-full items-center rounded-xl px-4 py-3 text-left">Leaderboard</NuxtLink>
        <NuxtLink to="/records" class="sst-nav-link flex w-full items-center rounded-xl px-4 py-3 text-left">Records</NuxtLink>
        <NuxtLink v-if="profile?.role === 'student'" to="/student" class="sst-nav-link flex w-full items-center rounded-xl px-4 py-3 text-left">My Results</NuxtLink>
        <NuxtLink v-if="isTeacher" to="/teacher" class="sst-nav-link flex w-full items-center rounded-xl px-4 py-3 text-left">Teacher</NuxtLink>
        <NuxtLink v-if="isAdmin" to="/admin" class="sst-nav-link flex w-full items-center rounded-xl px-4 py-3 text-left">Admin</NuxtLink>
      </nav>

      <div class="border-t border-slate-800 p-4">
        <div class="mb-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div class="font-semibold text-slate-100">{{ profile?.first_name }} {{ profile?.last_name }}</div>
          <div v-if="profile?.school" class="mt-1 text-xs text-slate-400">{{ profile.school.short_name || profile.school.name }}</div>
          <div v-if="profile?.role" class="mt-1 text-xs capitalize text-emerald-400">{{ String(profile.role).replaceAll('_', ' ') }}</div>
        </div>

        <button
          type="button"
          class="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
          @click="logout"
        >
          Sign out
        </button>
      </div>
    </aside>

    <header
      v-if="user"
      class="sticky top-0 z-50 flex items-center justify-between border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur md:hidden"
    >
      <NuxtLink to="/dashboard" aria-label="School Sports Tracker dashboard">
        <img src="/images/school-sports-tracker-logo.png" alt="School Sports Tracker" class="h-16 w-16 object-contain" />
      </NuxtLink>

      <button
        type="button"
        class="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-bold text-white"
        @click="mobileMenuOpen = !mobileMenuOpen"
      >
        {{ mobileMenuOpen ? 'Close' : 'Menu' }}
      </button>
    </header>

    <div
      v-if="user && mobileMenuOpen"
      class="fixed inset-x-0 top-[89px] z-40 border-b border-slate-800 bg-slate-950 px-4 py-4 shadow-2xl md:hidden"
    >
      <nav class="space-y-2">
        <NuxtLink to="/dashboard" class="sst-nav-link block rounded-xl px-4 py-3" @click="closeMobileMenu">Dashboard</NuxtLink>
        <NuxtLink to="/events" class="sst-nav-link block rounded-xl px-4 py-3" @click="closeMobileMenu">Events</NuxtLink>
        <NuxtLink to="/leaderboard" class="sst-nav-link block rounded-xl px-4 py-3" @click="closeMobileMenu">Leaderboard</NuxtLink>
        <NuxtLink to="/records" class="sst-nav-link block rounded-xl px-4 py-3" @click="closeMobileMenu">Records</NuxtLink>
        <NuxtLink v-if="profile?.role === 'student'" to="/student" class="sst-nav-link block rounded-xl px-4 py-3" @click="closeMobileMenu">My Results</NuxtLink>
        <NuxtLink v-if="isTeacher" to="/teacher" class="sst-nav-link block rounded-xl px-4 py-3" @click="closeMobileMenu">Teacher</NuxtLink>
        <NuxtLink v-if="isAdmin" to="/admin" class="sst-nav-link block rounded-xl px-4 py-3" @click="closeMobileMenu">Admin</NuxtLink>
      </nav>

      <div class="mt-4 border-t border-slate-800 pt-4">
        <div class="mb-3 text-sm text-slate-300">{{ profile?.first_name }} {{ profile?.last_name }}</div>
        <button type="button" class="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800" @click="logout">Sign out</button>
      </div>
    </div>

    <div :class="user ? 'md:pl-72' : ''">
      <slot />
    </div>
  </div>
</template>
