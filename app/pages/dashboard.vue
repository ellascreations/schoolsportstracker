<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const user = useSupabaseUser()
const supabase = useSupabaseClient()
const profile = ref<any>(null)
const stats = ref({ students: 0, teachers: 0, upcoming: 0, completed: 0 })

onMounted(async () => {
  const [{ data: p }, students, teachers, upcoming, completed] = await Promise.all([
    supabase.from('profiles').select('first_name,last_name,role,year_level,house:houses(name,colour)').eq('id', user.value!.id).single(),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student').eq('active', true),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'teacher').eq('active', true),
    supabase.from('events').select('*', { count: 'exact', head: true }).in('status', ['scheduled','open','in_progress']),
    supabase.from('events').select('*', { count: 'exact', head: true }).eq('status', 'completed')
  ])
  profile.value = p
  stats.value = { students: students.count || 0, teachers: teachers.count || 0, upcoming: upcoming.count || 0, completed: completed.count || 0 }
})
</script>

<template>
  <main class="mx-auto max-w-7xl px-4 py-8">
    <div class="mb-8">
      <p class="text-sm font-bold uppercase tracking-wider text-blue-600">Dashboard</p>
      <h1 class="mt-1 text-3xl font-bold">Welcome {{ profile?.first_name || '' }}</h1>
      <p class="mt-2 text-slate-500">Track school sports, results and house points from one place.</p>
    </div>
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div v-for="item in [
        ['Students', stats.students, '🎓'], ['Teachers', stats.teachers, '🧑‍🏫'], ['Upcoming Events', stats.upcoming, '📅'], ['Completed Events', stats.completed, '✅']
      ]" :key="item[0]" class="rounded-xl border bg-white p-5 shadow-sm">
        <div class="text-2xl">{{ item[2] }}</div><p class="mt-3 text-sm text-slate-500">{{ item[0] }}</p><p class="text-3xl font-bold">{{ item[1] }}</p>
      </div>
    </div>
    <div class="mt-8 grid gap-6 lg:grid-cols-2">
      <NuxtLink to="/events" class="rounded-xl border bg-white p-6 shadow-sm hover:border-blue-300"><h2 class="text-xl font-bold">Events</h2><p class="mt-2 text-slate-500">View scheduled and completed sporting events.</p></NuxtLink>
      <NuxtLink to="/leaderboard" class="rounded-xl border bg-white p-6 shadow-sm hover:border-blue-300"><h2 class="text-xl font-bold">House Leaderboard</h2><p class="mt-2 text-slate-500">See the current house championship standings.</p></NuxtLink>
    </div>
  </main>
</template>
