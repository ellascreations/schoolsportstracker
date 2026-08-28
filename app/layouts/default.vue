<script setup lang="ts">
const user = useSupabaseUser()
const supabase = useSupabaseClient()
const profile = ref<any>(null)

watchEffect(async () => {
  if (!user.value) { profile.value = null; return }
  const { data } = await supabase.from('profiles').select('first_name,last_name,role').eq('id', user.value.id).single()
  profile.value = data
})

const logout = async () => {
  await supabase.auth.signOut()
  await navigateTo('/login')
}
</script>

<template>
  <div class="min-h-screen bg-slate-50 text-slate-900">
    <header v-if="user" class="border-b bg-white">
      <div class="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
        <NuxtLink to="/dashboard" class="text-xl font-bold text-blue-700">School Sports Tracker</NuxtLink>
        <nav class="hidden items-center gap-5 md:flex">
          <NuxtLink to="/dashboard" class="hover:text-blue-700">Dashboard</NuxtLink>
          <NuxtLink to="/events" class="hover:text-blue-700">Events</NuxtLink>
          <NuxtLink to="/leaderboard" class="hover:text-blue-700">Leaderboard</NuxtLink>
          <NuxtLink v-if="profile?.role === 'student'" to="/student" class="hover:text-blue-700">My Results</NuxtLink>
          <NuxtLink v-if="['teacher','admin'].includes(profile?.role)" to="/teacher" class="hover:text-blue-700">Teacher</NuxtLink>
          <NuxtLink v-if="profile?.role === 'admin'" to="/admin" class="hover:text-blue-700">Admin</NuxtLink>
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
