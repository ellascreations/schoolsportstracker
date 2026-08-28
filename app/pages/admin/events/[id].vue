<script setup lang="ts">
definePageMeta({ middleware: 'admin' })

const route = useRoute()
const supabase = useSupabaseClient()

const event = ref<any>(null)
const students = ref<any[]>([])
const participants = ref<any[]>([])
const houses = ref<any[]>([])
const selected = ref<string[]>([])
const search = ref('')
const houseFilter = ref('')
const loading = ref(false)
const saving = ref(false)
const message = ref('')
const errorMessage = ref('')

const eventId = computed(() => Number(route.params.id))

const participantIds = computed(() => new Set(participants.value.map((p: any) => p.student_id)))

const availableStudents = computed(() => {
  const q = search.value.trim().toLowerCase()

  return students.value
    .filter((student: any) => !participantIds.value.has(student.id))
    .filter((student: any) => {
      const matchesSearch =
        !q ||
        `${student.first_name || ''} ${student.last_name || ''} ${student.student_number || ''}`
          .toLowerCase()
          .includes(q)

      const matchesHouse = !houseFilter.value || String(student.house_id || '') === houseFilter.value
      return matchesSearch && matchesHouse
    })
})

const load = async () => {
  loading.value = true
  errorMessage.value = ''
  message.value = ''

  if (!Number.isFinite(eventId.value) || eventId.value <= 0) {
    errorMessage.value = 'Invalid event ID.'
    loading.value = false
    return
  }

  const eventResult = await supabase
    .from('events')
    .select('id,name,sport_id,year_level,gender,event_date,start_time,location,teacher_id,status')
    .eq('id', eventId.value)
    .single()

  if (eventResult.error || !eventResult.data) {
    errorMessage.value = eventResult.error?.message || 'Event not found.'
    loading.value = false
    return
  }

  const currentEvent: any = eventResult.data

  const [sportResult, teacherResult, studentsResult, participantsResult, housesResult] = await Promise.all([
    currentEvent.sport_id
      ? supabase.from('sports').select('id,name,measurement_type').eq('id', currentEvent.sport_id).maybeSingle()
      : Promise.resolve({ data: null, error: null } as any),
    currentEvent.teacher_id
      ? supabase.from('profiles').select('id,first_name,last_name').eq('id', currentEvent.teacher_id).maybeSingle()
      : Promise.resolve({ data: null, error: null } as any),
    supabase
      .from('profiles')
      .select('id,first_name,last_name,student_number,year_level,house_id')
      .eq('role', 'student')
      .eq('active', true)
      .order('year_level', { ascending: true })
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true }),
    supabase
      .from('event_participants')
      .select('id,event_id,student_id,lane,bib_number')
      .eq('event_id', eventId.value)
      .order('lane', { ascending: true, nullsFirst: false }),
    supabase.from('houses').select('id,name,colour').eq('active', true).order('name'),
  ])

  const firstError =
    sportResult.error ||
    teacherResult.error ||
    studentsResult.error ||
    participantsResult.error ||
    housesResult.error

  if (firstError) {
    errorMessage.value = firstError.message || 'Could not load event assignment data.'
    loading.value = false
    return
  }

  const houseMap = new Map((housesResult.data || []).map((house: any) => [String(house.id), house]))
  const studentMap = new Map(
    (studentsResult.data || []).map((student: any) => [
      student.id,
      { ...student, house: student.house_id ? houseMap.get(String(student.house_id)) || null : null },
    ])
  )

  event.value = {
    ...currentEvent,
    sport: sportResult.data || null,
    teacher: teacherResult.data || null,
  }

  students.value = Array.from(studentMap.values()).filter(
    (student: any) => !currentEvent.year_level || Number(student.year_level) === Number(currentEvent.year_level)
  )

  participants.value = (participantsResult.data || []).map((participant: any) => ({
    ...participant,
    student: studentMap.get(participant.student_id) || null,
  }))

  houses.value = housesResult.data || []
  loading.value = false
}

const getAccessToken = async () => {
  const { data: { session } } = await supabase.auth.getSession()

  if (!session?.access_token) {
    throw new Error('Authentication required. Please sign out and back in.')
  }

  return session.access_token
}

const addSelected = async () => {
  if (!selected.value.length) return

  saving.value = true
  errorMessage.value = ''
  message.value = ''

  const maxLane = Math.max(0, ...participants.value.map((p: any) => Number(p.lane) || 0))
  const inserts = selected.value.map((studentId, index) => ({
    event_id: eventId.value,
    student_id: studentId,
    lane: maxLane + index + 1,
  }))

  try {
    const accessToken = await getAccessToken()

    await $fetch('/api/admin/events/participants', {
      method: 'POST',
      body: {
        action: 'add',
        event_id: eventId.value,
        participants: inserts,
        access_token: accessToken,
      },
    })

    message.value = `Added ${inserts.length} student${inserts.length === 1 ? '' : 's'} to the event.`
    selected.value = []
    await load()
  } catch (error: any) {
    console.error('ADD EVENT PARTICIPANTS ERROR:', error)
    errorMessage.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Could not assign students to this event.'
  } finally {
    saving.value = false
  }
}

const removeParticipant = async (participant: any) => {
  const studentName = participant.student
    ? `${participant.student.first_name || ''} ${participant.student.last_name || ''}`.trim()
    : 'this student'

  if (!confirm(`Remove ${studentName} from this event?`)) return

  errorMessage.value = ''

  try {
    const accessToken = await getAccessToken()

    await $fetch('/api/admin/events/participants', {
      method: 'POST',
      body: {
        action: 'remove',
        participant_id: participant.id,
        event_id: eventId.value,
        access_token: accessToken,
      },
    })

    await load()
  } catch (error: any) {
    console.error('REMOVE EVENT PARTICIPANT ERROR:', error)
    errorMessage.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Could not remove this student from the event.'
  }
}

const saveParticipant = async (participant: any) => {
  errorMessage.value = ''
  message.value = ''

  try {
    const accessToken = await getAccessToken()

    await $fetch('/api/admin/events/participants', {
      method: 'POST',
      body: {
        action: 'update',
        participant_id: participant.id,
        event_id: eventId.value,
        lane: participant.lane || null,
        bib_number: participant.bib_number || null,
        access_token: accessToken,
      },
    })

    message.value = 'Event assignment updated.'
  } catch (error: any) {
    console.error('UPDATE EVENT PARTICIPANT ERROR:', error)
    errorMessage.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Could not update this event assignment.'
  }
}

const selectAllVisible = () => {
  selected.value = availableStudents.value.map((student: any) => student.id)
}

const clearSelection = () => {
  selected.value = []
}

onMounted(load)
</script>

<template>
  <main class="mx-auto max-w-7xl px-4 py-8">
    <NuxtLink to="/admin/events" class="text-sm font-semibold text-blue-600">← Events</NuxtLink>

    <div v-if="loading" class="mt-8 rounded-xl border bg-white p-10 text-center text-slate-500">
      Loading event and students...
    </div>

    <div v-else-if="errorMessage && !event" class="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
      <div class="font-semibold">Unable to open Assign Students</div>
      <div class="mt-1 text-sm">{{ errorMessage }}</div>
    </div>

    <div v-else-if="event">
      <div class="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 class="text-3xl font-bold">Assign Students</h1>
          <p class="mt-1 text-slate-500">
            {{ event.name }} · {{ event.sport?.name || 'No sport' }} · {{ event.event_date }}
            <span v-if="event.year_level"> · Year {{ event.year_level }}</span>
          </p>
          <p v-if="event.teacher" class="mt-1 text-sm text-slate-500">
            Teacher: {{ event.teacher.first_name }} {{ event.teacher.last_name }}
          </p>
        </div>

        <NuxtLink :to="`/teacher/events/${event.id}`" class="rounded-lg bg-emerald-600 px-4 py-2 text-center font-semibold text-white">
          Open Result Entry
        </NuxtLink>
      </div>

      <div v-if="message" class="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-700">{{ message }}</div>
      <div v-if="errorMessage" class="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">{{ errorMessage }}</div>

      <section class="mt-6 rounded-xl border bg-white p-5">
        <h2 class="text-lg font-bold">Assigned Students ({{ participants.length }})</h2>
        <p class="text-sm text-slate-500">Set lanes or bib numbers before the event.</p>

        <div class="mt-4 overflow-x-auto">
          <table class="w-full min-w-[760px] text-left">
            <thead class="bg-slate-50">
              <tr><th class="p-3">Student</th><th>House</th><th>Lane</th><th>Bib</th><th></th></tr>
            </thead>
            <tbody>
              <tr v-for="participant in participants" :key="participant.id" class="border-t">
                <td class="p-3 font-semibold">
                  <template v-if="participant.student">
                    {{ participant.student.last_name }}, {{ participant.student.first_name }}
                  </template>
                  <span v-else class="text-red-600">Student record unavailable</span>
                </td>
                <td>{{ participant.student?.house?.name || '—' }}</td>
                <td><input v-model.number="participant.lane" type="number" min="1" class="w-20 rounded border px-2 py-1" /></td>
                <td><input v-model="participant.bib_number" class="w-28 rounded border px-2 py-1" /></td>
                <td class="space-x-2">
                  <button type="button" class="rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white" @click="saveParticipant(participant)">Save</button>
                  <button type="button" class="rounded bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700" @click="removeParticipant(participant)">Remove</button>
                </td>
              </tr>
              <tr v-if="!participants.length"><td colspan="5" class="p-8 text-center text-slate-500">No students assigned yet.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="mt-6 rounded-xl border bg-white p-5">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 class="text-lg font-bold">Available Students</h2>
            <p class="text-sm text-slate-500">
              {{ event.year_level ? `Showing active Year ${event.year_level} students` : 'Showing all active students' }}
            </p>
          </div>

          <div class="flex flex-col gap-2 sm:flex-row">
            <input v-model="search" placeholder="Search students…" class="rounded-lg border px-3 py-2" />
            <select v-model="houseFilter" class="rounded-lg border px-3 py-2">
              <option value="">All houses</option>
              <option v-for="house in houses" :key="house.id" :value="String(house.id)">{{ house.name }}</option>
            </select>
          </div>
        </div>

        <div class="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" class="text-sm font-semibold text-blue-600" @click="selectAllVisible">Select all visible</button>
          <button v-if="selected.length" type="button" class="text-sm font-semibold text-slate-600" @click="clearSelection">Clear selection</button>
          <span class="text-sm text-slate-500">{{ selected.length }} selected</span>
          <button
            type="button"
            :disabled="!selected.length || saving"
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            @click="addSelected"
          >
            {{ saving ? 'Adding...' : 'Add Selected' }}
          </button>
        </div>

        <div class="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          <label v-for="student in availableStudents" :key="student.id" class="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-slate-50">
            <input v-model="selected" type="checkbox" :value="student.id" />
            <div>
              <div class="font-semibold">{{ student.first_name }} {{ student.last_name }}</div>
              <div class="text-sm text-slate-500">
                {{ student.student_number || 'No student #' }} · {{ student.house?.name || 'No house' }}
              </div>
            </div>
          </label>

          <div v-if="!availableStudents.length" class="rounded-lg bg-slate-50 p-4 text-sm text-slate-500 md:col-span-2 xl:col-span-3">
            No available students match this event and the selected filters.
          </div>
        </div>
      </section>
    </div>
  </main>
</template>
