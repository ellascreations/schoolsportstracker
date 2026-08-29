<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const supabase = useSupabaseClient()
const profile = ref<any>(null)
const stats = ref({ students: 0, teachers: 0, carnivals: 0, upcoming: 0 })
const loading = ref(true)

onMounted(async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: p } = await supabase
    .from('profiles')
    .select('first_name,last_name,role,school_id,year_level,house:houses(name,colour),school:schools(name,short_name)')
    .eq('id', user.id)
    .single()

  profile.value = p

  let studentsQ = supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student').eq('active', true)
  let teachersQ = supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'teacher').eq('active', true)
  let eventsQ = supabase.from('events').select('*', { count: 'exact', head: true }).in('status', ['scheduled','open','in_progress'])
  let carnivalsQ = supabase.from('carnivals').select('*', { count: 'exact', head: true }).in('status', ['draft','open','in_progress'])

  if (p?.role !== 'super_admin' && p?.school_id) {
    studentsQ = studentsQ.eq('school_id', p.school_id)
    teachersQ = teachersQ.eq('school_id', p.school_id)
    eventsQ = eventsQ.eq('school_id', p.school_id)
    carnivalsQ = carnivalsQ.eq('host_school_id', p.school_id)
  }

  const [students, teachers, carnivals, upcoming] = await Promise.all([studentsQ, teachersQ, carnivalsQ, eventsQ])
  stats.value = {
    students: students.count || 0,
    teachers: teachers.count || 0,
    carnivals: carnivals.count || 0,
    upcoming: upcoming.count || 0,
  }
  loading.value = false
})
</script>

<template>
  <main class="mx-auto max-w-7xl px-4 py-8">
    <div class="mb-8">
      <p class="text-sm font-bold uppercase tracking-wider text-blue-600">Dashboard</p>
      <h1 class="mt-1 text-3xl font-bold">Welcome {{ profile?.first_name || '' }}</h1>
      <p class="mt-2 text-slate-500">
        {{ profile?.role === 'super_admin' ? 'Multi-school sports administration.' : `Sports tracking for ${profile?.school?.name || 'your school'}.` }}
      </p>
    </div>

    <div v-if="loading" class="rounded-xl border bg-white p-8 text-center text-slate-500">Loading dashboard...</div>
    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div v-for="item in [
        ['Students', stats.students, '🎓'],
        ['Teachers', stats.teachers, '🧑‍🏫'],
        ['Active Carnivals', stats.carnivals, '🏆'],
        ['Upcoming Events', stats.upcoming, '📅']
      ]" :key="item[0]" class="rounded-xl border bg-white p-5 shadow-sm">
        <div class="text-2xl">{{ item[2] }}</div><p class="mt-3 text-sm text-slate-500">{{ item[0] }}</p><p class="text-3xl font-bold">{{ item[1] }}</p>
      </div>
    </div>

    <div class="mt-8 grid gap-6 lg:grid-cols-3">
      <NuxtLink v-if="['admin','super_admin'].includes(profile?.role)" to="/admin/carnivals" class="rounded-xl border bg-white p-6 shadow-sm hover:border-blue-300"><h2 class="text-xl font-bold">Carnivals</h2><p class="mt-2 text-slate-500">Create athletics, swimming, cross-country and interschool carnivals.</p></NuxtLink>
      <NuxtLink to="/events" class="rounded-xl border bg-white p-6 shadow-sm hover:border-blue-300"><h2 class="text-xl font-bold">Events</h2><p class="mt-2 text-slate-500">View scheduled and completed sporting events.</p></NuxtLink>
      <NuxtLink to="/leaderboard" class="rounded-xl border bg-white p-6 shadow-sm hover:border-blue-300"><h2 class="text-xl font-bold">Leaderboards</h2><p class="mt-2 text-slate-500">See house and carnival standings.</p></NuxtLink>
    </div>
  </main>
</template>
