<script setup lang="ts">
definePageMeta({ middleware: 'admin' })

const route = useRoute()
const supabase = useSupabaseClient()
const carnival = ref<any>(null)
const events = ref<any[]>([])
const schools = ref<any[]>([])
const points = ref<any[]>([])
const templates = ref<any[]>([])
const leaderboard = ref<any[]>([])
const loading = ref(true)
const generating = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const selectedTemplateId = ref<number | null>(null)

const carnivalId = computed(() => Number(route.params.id))

const token = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Authentication required.')
  return session.access_token
}

const load = async () => {
  loading.value = true
  errorMessage.value = ''

  const [carnivalResult, eventsResult, schoolResult, pointsResult, templateResult] = await Promise.all([
    supabase.from('carnivals').select('*,host_school:schools(id,name,short_name)').eq('id', carnivalId.value).single(),
    supabase.from('events').select('id,name,event_date,start_time,status,year_level,gender,sport:sports(name,measurement_type)').eq('carnival_id', carnivalId.value).order('event_date').order('start_time'),
    supabase.from('carnival_schools').select('id,status,school:schools(id,name,short_name)').eq('carnival_id', carnivalId.value),
    supabase.from('carnival_points_rules').select('id,position,points').eq('carnival_id', carnivalId.value).order('position'),
    supabase.from('carnival_templates').select('id,name,carnival_type').eq('active', true).order('name'),
  ])

  if (carnivalResult.error) {
    errorMessage.value = carnivalResult.error.message
    loading.value = false
    return
  }

  carnival.value = carnivalResult.data
  events.value = eventsResult.data || []
  schools.value = schoolResult.data || []
  points.value = pointsResult.data || []
  templates.value = (templateResult.data || []).filter((t: any) => t.carnival_type === carnival.value.carnival_type)
  selectedTemplateId.value = carnival.value.template_id || templates.value[0]?.id || null

  const view = carnival.value.scoring_mode === 'school' ? 'carnival_school_leaderboard' : 'carnival_house_leaderboard'
  const { data: leaderboardRows, error: leaderboardError } = await supabase
    .from(view)
    .select('*')
    .eq('carnival_id', carnivalId.value)
    .order('points', { ascending: false })

  if (!leaderboardError) leaderboard.value = leaderboardRows || []
  loading.value = false
}

const generateEvents = async () => {
  errorMessage.value = ''
  successMessage.value = ''
  if (!selectedTemplateId.value) {
    errorMessage.value = 'Select a template first.'
    return
  }

  generating.value = true
  try {
    const result: any = await $fetch('/api/admin/carnivals/generate', {
      method: 'POST',
      body: {
        carnival_id: carnivalId.value,
        template_id: selectedTemplateId.value,
        access_token: await token(),
      },
    })

    successMessage.value = `${result.generated} events created${result.skipped ? `, ${result.skipped} already existed` : ''}.`
    await load()
  } catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || error?.message || 'Could not generate carnival events.'
  } finally {
    generating.value = false
  }
}

onMounted(load)
</script>

<template>
  <main class="mx-auto max-w-7xl px-4 py-8">
    <NuxtLink to="/admin/carnivals" class="text-sm font-semibold text-blue-600">← Carnivals</NuxtLink>

    <div v-if="loading" class="mt-6 rounded-xl border bg-white p-10 text-center text-slate-500">Loading carnival...</div>

    <template v-else-if="carnival">
      <div class="mt-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div class="text-sm font-bold uppercase tracking-wider text-blue-600">{{ String(carnival.carnival_type).replaceAll('_',' ') }} · {{ carnival.scope }}</div>
          <h1 class="mt-1 text-3xl font-bold">{{ carnival.name }}</h1>
          <p class="mt-2 text-slate-500">{{ carnival.start_date }}<span v-if="carnival.end_date && carnival.end_date !== carnival.start_date"> – {{ carnival.end_date }}</span><span v-if="carnival.venue"> · {{ carnival.venue }}</span></p>
          <p class="mt-1 text-sm text-slate-500">Host: {{ carnival.host_school?.name }}</p>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <a
            :href="`/display/carnival/${carnival.id}`"
            target="_blank"
            rel="noopener"
            class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Big Screen Display
          </a>

          <span class="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-bold capitalize">
            {{ String(carnival.status).replaceAll('_',' ') }}
          </span>
        </div>
      </div>

      <div v-if="errorMessage" class="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">{{ errorMessage }}</div>
      <div v-if="successMessage" class="mt-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-700">{{ successMessage }}</div>

      <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-xl border bg-white p-5"><div class="text-sm text-slate-500">Events</div><div class="mt-1 text-3xl font-bold">{{ events.length }}</div></div>
        <div class="rounded-xl border bg-white p-5"><div class="text-sm text-slate-500">Schools</div><div class="mt-1 text-3xl font-bold">{{ schools.length }}</div></div>
        <div class="rounded-xl border bg-white p-5"><div class="text-sm text-slate-500">Scoring</div><div class="mt-1 text-xl font-bold capitalize">{{ carnival.scoring_mode }}</div></div>
        <div class="rounded-xl border bg-white p-5"><div class="text-sm text-slate-500">Type</div><div class="mt-1 text-xl font-bold capitalize">{{ String(carnival.carnival_type).replaceAll('_',' ') }}</div></div>
      </div>

      <section class="mt-6 rounded-xl border bg-white p-5 shadow-sm">
        <h2 class="text-lg font-bold">Carnival Events</h2>
        <p class="mt-1 text-sm text-slate-500">Generate the standard events from a template, then assign participants and enter results as normal.</p>
        <div class="mt-4 flex flex-col gap-3 sm:flex-row">
          <select v-model.number="selectedTemplateId" class="rounded-lg border px-3 py-2 sm:min-w-72">
            <option :value="null">Select template</option>
            <option v-for="template in templates" :key="template.id" :value="template.id">{{ template.name }}</option>
          </select>
          <button :disabled="generating || !selectedTemplateId" class="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50" @click="generateEvents">{{ generating ? 'Generating...' : 'Generate Missing Events' }}</button>
          <NuxtLink to="/admin/events" class="rounded-lg border px-4 py-2 text-center font-semibold">Manage All Events</NuxtLink>
        </div>
      </section>

      <div class="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section class="overflow-hidden rounded-xl border bg-white shadow-sm">
          <div class="border-b px-5 py-4"><h2 class="font-bold">Events</h2></div>
          <div v-if="!events.length" class="p-8 text-center text-slate-500">No events yet. Generate them from a template above.</div>
          <NuxtLink v-for="event in events" :key="event.id" :to="`/admin/events/${event.id}`" class="flex items-center gap-4 border-b px-5 py-4 hover:bg-slate-50">
            <div class="flex-1"><div class="font-semibold">{{ event.name }}</div><div class="text-sm text-slate-500">{{ event.sport?.name }}<span v-if="event.start_time"> · {{ String(event.start_time).slice(0,5) }}</span></div></div>
            <span class="text-sm capitalize text-slate-500">{{ String(event.status).replaceAll('_',' ') }}</span>
            <span class="font-semibold text-blue-700">Open →</span>
          </NuxtLink>
        </section>

        <div class="space-y-6">
          <section class="rounded-xl border bg-white p-5 shadow-sm">
            <h2 class="font-bold">Participating Schools</h2>
            <div v-if="!schools.length" class="mt-3 text-sm text-slate-500">No schools attached.</div>
            <div v-for="entry in schools" :key="entry.id" class="mt-3 flex items-center justify-between gap-3 border-b pb-3 last:border-0">
              <span>{{ entry.school?.name }}</span><span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold capitalize">{{ entry.status }}</span>
            </div>
          </section>

          <section class="rounded-xl border bg-white p-5 shadow-sm">
            <h2 class="font-bold">Current Leaderboard</h2>
            <div v-if="!leaderboard.length" class="mt-3 text-sm text-slate-500">No points recorded yet.</div>
            <div v-for="(row,index) in leaderboard.slice(0,8)" :key="row.house_id || row.school_id" class="mt-3 flex items-center gap-3">
              <div class="w-7 font-bold">{{ index + 1 }}</div>
              <div class="flex-1">{{ row.name || row.school_name }}</div>
              <div class="font-bold">{{ row.points }}</div>
            </div>
          </section>
        </div>
      </div>
    </template>
  </main>
</template>
