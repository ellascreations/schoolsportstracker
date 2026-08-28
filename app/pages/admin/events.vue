<script setup lang="ts">
definePageMeta({ middleware: 'admin' })

const supabase = useSupabaseClient()
const events = ref<any[]>([])
const sports = ref<any[]>([])
const teachers = ref<any[]>([])
const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const form = reactive({
  name: '',
  sport_id: null as number | null,
  year_level: null as number | null,
  gender: 'mixed',
  event_date: '',
  start_time: '',
  location: '',
  teacher_id: null as string | null,
  status: 'scheduled',
})

const load = async () => {
  loading.value = true
  errorMessage.value = ''

  const [eventsResult, sportsResult, teachersResult] = await Promise.all([
    supabase
      .from('events')
      .select('id,name,sport_id,year_level,gender,event_date,start_time,location,teacher_id,status')
      .order('event_date', { ascending: true })
      .order('start_time', { ascending: true }),
    supabase
      .from('sports')
      .select('id,name')
      .eq('active', true)
      .order('name'),
    supabase
      .from('profiles')
      .select('id,first_name,last_name')
      .eq('role', 'teacher')
      .eq('active', true)
      .order('last_name')
      .order('first_name'),
  ])

  if (eventsResult.error || sportsResult.error || teachersResult.error) {
    errorMessage.value =
      eventsResult.error?.message ||
      sportsResult.error?.message ||
      teachersResult.error?.message ||
      'Could not load events.'
  }

  sports.value = sportsResult.data || []
  teachers.value = teachersResult.data || []

  const sportMap = new Map(sports.value.map((sport: any) => [sport.id, sport]))
  const teacherMap = new Map(teachers.value.map((teacher: any) => [teacher.id, teacher]))

  events.value = (eventsResult.data || []).map((event: any) => ({
    ...event,
    sport: sportMap.get(event.sport_id) || null,
    teacher: teacherMap.get(event.teacher_id) || null,
  }))

  loading.value = false
}

const add = async () => {
  errorMessage.value = ''
  successMessage.value = ''
  saving.value = true

  const payload = {
    ...form,
    sport_id: form.sport_id || null,
    teacher_id: form.teacher_id || null,
    year_level: form.year_level || null,
    start_time: form.start_time || null,
    location: form.location.trim() || null,
  }

  const { error } = await supabase.from('events').insert(payload)

  if (error) {
    errorMessage.value = error.message
  } else {
    successMessage.value = 'Event created.'
    Object.assign(form, {
      name: '',
      sport_id: null,
      year_level: null,
      gender: 'mixed',
      event_date: '',
      start_time: '',
      location: '',
      teacher_id: null,
      status: 'scheduled',
    })
    await load()
  }

  saving.value = false
}

const assignStudents = async (eventId: number | string) => {
  if (!eventId) {
    errorMessage.value = 'This event does not have a valid ID.'
    return
  }

  await navigateTo(`/admin/events/${eventId}`)
}

onMounted(load)
</script>

<template>
  <main class="mx-auto max-w-7xl px-4 py-8">
    <NuxtLink to="/admin" class="text-sm font-semibold text-blue-600">
      ← Admin Dashboard
    </NuxtLink>

    <h1 class="mt-3 text-3xl font-bold">Events</h1>
    <p class="mt-1 text-slate-500">Create events, assign teachers and add student participants.</p>

    <div v-if="errorMessage" class="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
      {{ errorMessage }}
    </div>

    <div v-if="successMessage" class="mt-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-700">
      {{ successMessage }}
    </div>

    <form class="mt-6 grid gap-3 rounded-xl border bg-white p-5 md:grid-cols-3" @submit.prevent="add">
      <input v-model="form.name" required placeholder="Event name" class="rounded-lg border px-4 py-2 md:col-span-2" />

      <select v-model="form.sport_id" required class="rounded-lg border px-4 py-2">
        <option :value="null">Select sport</option>
        <option v-for="sport in sports" :key="sport.id" :value="sport.id">{{ sport.name }}</option>
      </select>

      <input v-model.number="form.year_level" type="number" min="1" max="12" placeholder="Year level" class="rounded-lg border px-4 py-2" />

      <select v-model="form.gender" class="rounded-lg border px-4 py-2">
        <option value="mixed">Mixed</option>
        <option value="female">Girls</option>
        <option value="male">Boys</option>
        <option value="open">Open</option>
      </select>

      <input v-model="form.location" placeholder="Location" class="rounded-lg border px-4 py-2" />
      <input v-model="form.event_date" type="date" required class="rounded-lg border px-4 py-2" />
      <input v-model="form.start_time" type="time" class="rounded-lg border px-4 py-2" />

      <select v-model="form.teacher_id" class="rounded-lg border px-4 py-2">
        <option :value="null">No teacher assigned</option>
        <option v-for="teacher in teachers" :key="teacher.id" :value="teacher.id">
          {{ teacher.first_name }} {{ teacher.last_name }}
        </option>
      </select>

      <button :disabled="saving" class="rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white disabled:opacity-50 md:col-span-3">
        {{ saving ? 'Creating...' : 'Create Event' }}
      </button>
    </form>

    <section class="mt-6 overflow-hidden rounded-xl border bg-white">
      <div v-if="loading" class="p-8 text-center text-slate-500">Loading events...</div>
      <div v-else-if="!events.length" class="p-8 text-center text-slate-500">No events have been created yet.</div>

      <div v-for="event in events" v-else :key="event.id" class="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
        <div class="flex-1">
          <div class="font-semibold">{{ event.name }}</div>
          <div class="text-sm text-slate-500">
            {{ event.event_date }}
            <span v-if="event.start_time"> · {{ event.start_time }}</span>
            · {{ event.sport?.name || 'No sport' }}
            <span v-if="event.year_level"> · Year {{ event.year_level }}</span>
          </div>
          <div v-if="event.teacher" class="mt-1 text-xs text-slate-500">
            Teacher: {{ event.teacher.first_name }} {{ event.teacher.last_name }}
          </div>
        </div>

        <span class="text-sm capitalize text-slate-600">{{ String(event.status || '').replaceAll('_', ' ') }}</span>

        <button
          type="button"
          class="rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
          @click="assignStudents(event.id)"
        >
          Assign Students
        </button>
      </div>
    </section>
  </main>
</template>
