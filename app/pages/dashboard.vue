<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const supabase = useSupabaseClient()

const profile = ref<any>(null)
const loading = ref(true)
const errorMessage = ref('')
const currentCarnival = ref<any>(null)
const standings = ref<any[]>([])
const newRecords = ref<any[]>([])
const recentResults = ref<any[]>([])
const nextEvents = ref<any[]>([])

const stats = ref({
  carnivals: 0,
  students: 0,
  events: 0,
  records: 0,
})

const today = () => {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const fullName = computed(() =>
  `${profile.value?.first_name || ''} ${profile.value?.last_name || ''}`.trim()
)

const roleLabel = computed(() =>
  String(profile.value?.role || '').replaceAll('_', ' ')
)

const formatDate = (value?: string | null) => {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`))
}

const formatShortDate = (value?: string | null) => {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${value}T00:00:00`))
}

const formatTime = (value?: string | null) => value ? String(value).slice(0, 5) : 'TBA'

const recordScopeLabel = (scope?: string) => {
  if (scope === 'school') return 'NEW SCHOOL RECORD'
  if (scope === 'house') return 'NEW HOUSE RECORD'
  if (scope === 'interschool') return 'NEW INTERSCHOOL RECORD'
  return 'NEW RECORD'
}

const loadDashboard = async () => {
  loading.value = true
  errorMessage.value = ''

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      throw new Error(userError?.message || 'Could not verify your session.')
    }

    const { data: p, error: profileError } = await supabase
      .from('profiles')
      .select('id,first_name,last_name,role,school_id,year_level,house:houses(name,colour),school:schools(id,name,short_name)')
      .eq('id', user.id)
      .single()

    if (profileError) throw profileError
    profile.value = p

    let studentsQ = supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'student')
      .eq('active', true)

    let carnivalsQ = supabase
      .from('carnivals')
      .select('*', { count: 'exact', head: true })
      .in('status', ['draft', 'open', 'in_progress'])

    let eventsQ = supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .in('status', ['scheduled', 'open', 'in_progress'])

    let recordsQ = supabase
      .from('record_performances')
      .select('*', { count: 'exact', head: true })
      .gte('achieved_date', `${new Date().getFullYear()}-01-01`)

    if (p?.role !== 'super_admin' && p?.school_id) {
      studentsQ = studentsQ.eq('school_id', p.school_id)
      carnivalsQ = carnivalsQ.eq('host_school_id', p.school_id)
      eventsQ = eventsQ.eq('school_id', p.school_id)
      recordsQ = recordsQ.or(`school_id.eq.${p.school_id},record_scope.eq.interschool`)
    }

    const [students, carnivals, events, records] = await Promise.all([
      studentsQ,
      carnivalsQ,
      eventsQ,
      recordsQ,
    ])

    stats.value = {
      students: students.count || 0,
      carnivals: carnivals.count || 0,
      events: events.count || 0,
      records: records.count || 0,
    }

    let currentQ = supabase
      .from('carnivals')
      .select('id,name,carnival_type,scope,scoring_mode,start_date,end_date,venue,status,host_school_id,host_school:schools(id,name,short_name,logo_url)')
      .in('status', ['in_progress', 'open', 'draft'])
      .order('start_date', { ascending: true })
      .limit(1)

    if (p?.role !== 'super_admin' && p?.school_id) {
      currentQ = currentQ.eq('host_school_id', p.school_id)
    }

    const { data: carnivalRows } = await currentQ
    currentCarnival.value = carnivalRows?.[0] || null

    standings.value = []
    newRecords.value = []
    recentResults.value = []
    nextEvents.value = []

    if (!currentCarnival.value) return

    const carnivalId = currentCarnival.value.id
    const leaderboardView = currentCarnival.value.scoring_mode === 'school'
      ? 'carnival_school_leaderboard'
      : 'carnival_house_leaderboard'

    const [standingsResult, recordsResult, completedResult, upcomingResult] = await Promise.all([
      supabase
        .from(leaderboardView)
        .select('*')
        .eq('carnival_id', carnivalId)
        .order('points', { ascending: false })
        .limit(6),
      supabase
        .from('record_top5')
        .select('id,record_scope,record_rank,sport_name,year_level,gender,holder_name,holder_school_name,holder_house_name,result_display,result_value,achieved_date,event_id,carnival_id')
        .eq('carnival_id', carnivalId)
        .eq('record_rank', 1)
        .eq('achieved_date', today())
        .limit(5),
      supabase
        .from('events')
        .select('id,name,event_date,start_time,status')
        .eq('carnival_id', carnivalId)
        .eq('status', 'completed')
        .order('event_date', { ascending: false })
        .order('start_time', { ascending: false })
        .limit(5),
      supabase
        .from('events')
        .select('id,name,event_date,start_time,status,location')
        .eq('carnival_id', carnivalId)
        .in('status', ['scheduled', 'open'])
        .order('event_date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(5),
    ])

    standings.value = (standingsResult.data || []).map((row: any, index: number) => ({
      ...row,
      position: index + 1,
      display_name: row.school_name || row.short_name || row.name || row.house_name || 'Unknown',
    }))

    newRecords.value = recordsResult.data || []
    nextEvents.value = upcomingResult.data || []

    const completedEvents = completedResult.data || []
    const eventIds = completedEvents.map((event: any) => event.id)

    if (eventIds.length) {
      const { data: resultRows } = await supabase
        .from('results')
        .select('id,event_id,student_id,position,result_display,result_value')
        .in('event_id', eventIds)
        .eq('status', 'official')
        .not('position', 'is', null)
        .lte('position', 3)
        .order('position', { ascending: true })

      const studentIds = [...new Set((resultRows || []).map((row: any) => row.student_id).filter(Boolean))]
      const profileMap = new Map<string, any>()

      if (studentIds.length) {
        const { data: athletes } = await supabase
          .from('profiles')
          .select('id,first_name,last_name,house:houses(name),school:schools(name,short_name)')
          .in('id', studentIds)

        for (const athlete of athletes || []) {
          profileMap.set(String(athlete.id), athlete)
        }
      }

      const grouped = new Map<number, any[]>()
      for (const row of resultRows || []) {
        const athlete = profileMap.get(String(row.student_id))
        const list = grouped.get(Number(row.event_id)) || []
        list.push({
          ...row,
          athlete_name: athlete
            ? `${athlete.first_name || ''} ${athlete.last_name || ''}`.trim()
            : 'Athlete',
          team_name: athlete?.house?.name || athlete?.school?.short_name || athlete?.school?.name || '',
        })
        grouped.set(Number(row.event_id), list)
      }

      recentResults.value = completedEvents.map((event: any) => ({
        ...event,
        results: (grouped.get(Number(event.id)) || []).sort((a, b) => a.position - b.position),
      }))
    }
  } catch (error: any) {
    console.error('DASHBOARD LOAD ERROR:', error)
    errorMessage.value = error?.message || 'Could not load dashboard.'
  } finally {
    loading.value = false
  }
}

onMounted(loadDashboard)
</script>

<template>
  <main class="mx-auto max-w-[1500px] px-5 py-7 lg:px-8">
    <div v-if="loading" class="rounded-2xl border border-slate-800 bg-slate-900/70 p-12 text-center text-slate-400">
      Loading dashboard...
    </div>

    <div v-else-if="errorMessage" class="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-red-200">
      <div class="text-lg font-bold">Dashboard could not load</div>
      <div class="mt-1 text-sm">{{ errorMessage }}</div>
      <button class="mt-4 rounded-xl bg-red-600 px-4 py-2 font-bold text-white" @click="loadDashboard">Try Again</button>
    </div>

    <template v-else>
      <section class="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-6 shadow-2xl lg:p-8">
        <div class="grid gap-6 xl:grid-cols-[1fr_1.15fr] xl:items-center">
          <div>
            <div class="text-lg text-slate-400">Welcome back,</div>
            <h1 class="mt-1 text-4xl font-black tracking-tight text-white lg:text-5xl">
              {{ fullName || 'Sports Tracker' }}!
            </h1>
            <p class="mt-2 text-lg text-slate-400">
              Here's what's happening with your carnivals.
            </p>
            <div v-if="profile?.school" class="mt-4 inline-flex rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-sm font-bold text-blue-300">
              {{ profile.school.short_name || profile.school.name }} · {{ roleLabel }}
            </div>
          </div>

          <div v-if="currentCarnival" class="rounded-2xl border border-slate-700 bg-slate-950/60 p-5">
            <div class="flex items-start gap-4">
              <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 text-3xl">📅</div>
              <div class="min-w-0 flex-1">
                <div class="text-sm font-semibold text-slate-400">Current Carnival</div>
                <div class="mt-1 truncate text-2xl font-black text-white">{{ currentCarnival.name }}</div>
                <div class="mt-1 text-sm font-bold text-sky-400">{{ formatDate(currentCarnival.start_date) }}</div>
                <div v-if="currentCarnival.venue" class="mt-1 text-sm text-slate-500">{{ currentCarnival.venue }}</div>
              </div>
              <span class="rounded-full bg-green-500/15 px-3 py-1 text-sm font-black text-green-400">
                • {{ currentCarnival.status === 'in_progress' ? 'Live' : String(currentCarnival.status).replaceAll('_', ' ') }}
              </span>
            </div>
          </div>

          <div v-else class="rounded-2xl border border-slate-700 bg-slate-950/60 p-5 text-slate-400">
            No active carnival at the moment.
          </div>
        </div>

        <div class="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <NuxtLink to="/admin/carnivals" class="group rounded-2xl border border-slate-800 bg-slate-950/55 p-5 transition hover:border-blue-500/40 hover:bg-slate-900">
            <div class="flex items-center gap-4">
              <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 text-3xl">🏆</div>
              <div><div class="text-3xl font-black text-white">{{ stats.carnivals }}</div><div class="text-slate-300">Carnivals</div><div class="text-sm font-semibold text-blue-400">Active</div></div>
            </div>
          </NuxtLink>

          <NuxtLink to="/admin/students" class="group rounded-2xl border border-slate-800 bg-slate-950/55 p-5 transition hover:border-green-500/40 hover:bg-slate-900">
            <div class="flex items-center gap-4">
              <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-500/10 text-3xl">👥</div>
              <div><div class="text-3xl font-black text-white">{{ stats.students }}</div><div class="text-slate-300">Students</div><div class="text-sm font-semibold text-green-400">Participating</div></div>
            </div>
          </NuxtLink>

          <NuxtLink to="/events" class="group rounded-2xl border border-slate-800 bg-slate-950/55 p-5 transition hover:border-violet-500/40 hover:bg-slate-900">
            <div class="flex items-center gap-4">
              <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 text-3xl">🗓️</div>
              <div><div class="text-3xl font-black text-white">{{ stats.events }}</div><div class="text-slate-300">Events</div><div class="text-sm font-semibold text-violet-400">Scheduled</div></div>
            </div>
          </NuxtLink>

          <NuxtLink to="/records" class="group rounded-2xl border border-slate-800 bg-slate-950/55 p-5 transition hover:border-amber-500/40 hover:bg-slate-900">
            <div class="flex items-center gap-4">
              <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-3xl">⭐</div>
              <div><div class="text-3xl font-black text-white">{{ stats.records }}</div><div class="text-slate-300">Records</div><div class="text-sm font-semibold text-amber-400">This Year</div></div>
            </div>
          </NuxtLink>
        </div>
      </section>

      <div class="mt-5 grid gap-5 xl:grid-cols-2">
        <section class="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 shadow-xl">
          <div class="flex items-center justify-between border-b border-slate-800 px-6 py-5">
            <h2 class="text-xl font-black text-white">Current Standings</h2>
            <NuxtLink to="/leaderboard" class="rounded-lg border border-slate-700 px-3 py-2 text-sm font-bold text-slate-300 hover:bg-slate-800">View All</NuxtLink>
          </div>

          <div v-if="!standings.length" class="p-8 text-center text-slate-500">No standings available yet.</div>
          <div v-else class="divide-y divide-slate-800">
            <div v-for="row in standings.slice(0, 5)" :key="row.house_id || row.school_id" class="grid grid-cols-[42px_1fr_auto] items-center gap-4 px-6 py-4">
              <div class="text-xl font-black text-white">{{ row.position }}</div>
              <div class="min-w-0">
                <div class="truncate font-bold text-slate-100">{{ row.display_name }}</div>
                <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div class="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400" :style="{ width: `${Math.max(12, Math.min(100, Number(row.points || 0) / Math.max(1, Number(standings[0]?.points || 1)) * 100))}%` }" />
                </div>
              </div>
              <div class="text-right"><div class="text-2xl font-black text-white">{{ row.points }}</div><div class="text-xs text-slate-500">pts</div></div>
            </div>
          </div>
        </section>

        <section class="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 shadow-xl">
          <div class="flex items-center justify-between border-b border-slate-800 px-6 py-5">
            <h2 class="text-xl font-black text-white">New Records Today</h2>
            <NuxtLink to="/records" class="rounded-lg border border-slate-700 px-3 py-2 text-sm font-bold text-slate-300 hover:bg-slate-800">View All</NuxtLink>
          </div>

          <div v-if="!newRecords.length" class="p-8 text-center text-slate-500">No new records today yet.</div>
          <div v-else class="divide-y divide-slate-800">
            <div v-for="record in newRecords.slice(0, 5)" :key="record.id" class="flex items-start gap-4 px-6 py-4">
              <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-2xl">🏊</div>
              <div class="min-w-0 flex-1">
                <div class="font-bold text-slate-100">
                  <span v-if="record.year_level">Year {{ record.year_level }} </span>{{ record.sport_name }}
                </div>
                <div class="mt-1 font-semibold text-sky-400">{{ record.holder_name }}</div>
                <div class="font-black text-white">{{ record.result_display || record.result_value }}</div>
                <span class="mt-1 inline-flex rounded bg-green-500/15 px-2 py-0.5 text-xs font-black text-green-400">{{ recordScopeLabel(record.record_scope) }}</span>
              </div>
            </div>
          </div>
        </section>

        <section class="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 shadow-xl">
          <div class="flex items-center justify-between border-b border-slate-800 px-6 py-5">
            <h2 class="text-xl font-black text-white">Last 5 Results</h2>
            <NuxtLink to="/events" class="rounded-lg border border-slate-700 px-3 py-2 text-sm font-bold text-slate-300 hover:bg-slate-800">View All</NuxtLink>
          </div>

          <div v-if="!recentResults.length" class="p-8 text-center text-slate-500">No completed results yet.</div>
          <div v-else class="divide-y divide-slate-800">
            <div v-for="event in recentResults" :key="event.id" class="px-6 py-4">
              <div class="flex items-center justify-between gap-3">
                <div><div class="font-bold text-white">{{ event.name }}</div><div class="text-xs text-slate-500">Completed {{ formatTime(event.start_time) }}</div></div>
              </div>
              <div v-for="row in event.results" :key="row.id" class="mt-2 grid grid-cols-[30px_1fr_auto] items-center gap-3 text-sm">
                <div class="font-black" :class="row.position === 1 ? 'text-amber-400' : row.position === 2 ? 'text-slate-300' : 'text-orange-400'">{{ row.position }}</div>
                <div class="min-w-0"><span class="font-semibold text-slate-100">{{ row.athlete_name }}</span><span v-if="row.team_name" class="ml-2 text-sky-400">{{ row.team_name }}</span></div>
                <div class="font-black text-white">{{ row.result_display || row.result_value }}</div>
              </div>
            </div>
          </div>
        </section>

        <section class="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 shadow-xl">
          <div class="flex items-center justify-between border-b border-slate-800 px-6 py-5">
            <h2 class="text-xl font-black text-white">Next 5 Events</h2>
            <NuxtLink to="/events" class="rounded-lg border border-slate-700 px-3 py-2 text-sm font-bold text-slate-300 hover:bg-slate-800">View All</NuxtLink>
          </div>

          <div v-if="!nextEvents.length" class="p-8 text-center text-slate-500">No upcoming events.</div>
          <div v-else class="divide-y divide-slate-800">
            <NuxtLink v-for="event in nextEvents" :key="event.id" :to="`/events/${event.id}`" class="grid grid-cols-[90px_1fr_auto] items-center gap-4 px-6 py-4 hover:bg-slate-800/40">
              <div><div class="font-black text-sky-400">{{ formatTime(event.start_time) }}</div><div class="text-xs text-slate-500">{{ formatShortDate(event.event_date) }}</div></div>
              <div class="min-w-0"><div class="truncate font-bold text-white">{{ event.name }}</div><div class="truncate text-xs text-slate-500">{{ event.location || 'Location TBA' }}</div></div>
              <div class="text-xs font-semibold capitalize text-slate-500">{{ event.status }}</div>
            </NuxtLink>
          </div>
        </section>
      </div>
    </template>
  </main>
</template>
