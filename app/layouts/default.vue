<script setup lang="ts">
const supabase = useSupabaseClient()

const isAdmin = ref(false)
const isTeacher = ref(false)

const checkRole = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    isAdmin.value = false
    isTeacher.value = false
    return
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role, active')
    .eq('id', user.id)
    .single()

  if (error || !profile?.active) {
    console.error('HEADER ROLE CHECK ERROR:', error)
    isAdmin.value = false
    isTeacher.value = false
    return
  }

  isAdmin.value = profile.role === 'admin'
  isTeacher.value =
    profile.role === 'admin' ||
    profile.role === 'teacher'
}

onMounted(() => {
  checkRole()
})

const {
  data: { subscription },
} = supabase.auth.onAuthStateChange(() => {
  checkRole()
})

onUnmounted(() => {
  subscription.unsubscribe()
})
</script>

<template>
  <div class="min-h-screen bg-slate-50 text-slate-900">
    <header v-if="user" class="border-b bg-white">
      <div class="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
        <NuxtLink to="/dashboard" class="text-xl font-bold text-blue-700">School Sports Tracker</NuxtLink>
        <nav class="flex items-center gap-4">
  <NuxtLink to="/dashboard">
    Dashboard
  </NuxtLink>

  <NuxtLink to="/events">
    Events
  </NuxtLink>

  <NuxtLink to="/leaderboard">
    Leaderboard
  </NuxtLink>

  <NuxtLink
    v-if="isTeacher"
    to="/teacher"
  >
    Teacher
  </NuxtLink>

  <NuxtLink
    v-if="isAdmin"
    to="/admin"
  >
    Admin
  </NuxtLink>
</nav>
        <div class="flex items-center gap-3">
          <span class="hidden text-sm text-slate-500 sm:block">{{ profile?.first_name }} {{ profile?.last_name }}</span>
          <button class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white" @click="logout">Sign out</button>
        </div>
      </div>
    </header>
    <slot />
  </div>
</template>
