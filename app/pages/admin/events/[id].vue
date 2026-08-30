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
const loading = ref(true)
const saving = ref(false)
const message = ref('')
const errorMessage = ref('')

const showEdit = ref(false)
const editSaving = ref(false)
const deleting = ref(false)
const sports = ref<any[]>([])
const teachers = ref<any[]>([])

const editForm = reactive({
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

const populateEditForm = () => {
  if (!event.value) return

  Object.assign(editForm, {
    name: event.value.name || '',
    sport_id: event.value.sport_id ?? null,
    year_level: event.value.year_level ?? null,
    gender: event.value.gender || 'mixed',
    event_date: event.value.event_date || '',
    start_time: event.value.start_time ? String(event.value.start_time).slice(0, 5) : '',
    location: event.value.location || '',
    teacher_id: event.value.teacher_id ?? null,
    status: event.value.status || 'scheduled',
  })
}

const loadEditOptions = async () => {
  const [sportsResult, teachersResult] = await Promise.all([
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
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true }),
  ])

  if (sportsResult.error) {
    throw new Error(sportsResult.error.message)
  }

  if (teachersResult.error) {
    throw new Error(teachersResult.error.message)
  }

  sports.value = sportsResult.data || []
  teachers.value = teachersResult.data || []
}

const openEdit = async () => {
  errorMessage.value = ''
  message.value = ''

  try {
    if (!sports.value.length && !teachers.value.length) {
      await loadEditOptions()
    }

    populateEditForm()
    showEdit.value = true
  } catch (error: any) {
    errorMessage.value = error?.message || 'Could not load event editing options.'
  }
}

const saveEvent = async () => {
  errorMessage.value = ''
  message.value = ''

  if (!editForm.name.trim()) {
    errorMessage.value = 'Event name is required.'
    return
  }

  if (!editForm.sport_id) {
    errorMessage.value = 'Select a sport.'
    return
  }

  if (!editForm.event_date) {
    errorMessage.value = 'Event date is required.'
    return
  }

  editSaving.value = true

  try {
    const accessToken = await getAccessToken()

    const result: any = await $fetch('/api/admin/events/manage', {
      method: 'POST',
      body: {
        action: 'update',
        event_id: eventId.value,
        access_token: accessToken,
        event: {
          name: editForm.name,
          sport_id: editForm.sport_id,
          year_level: editForm.year_level,
          gender: editForm.gender,
          event_date: editForm.event_date,
          start_time: editForm.start_time,
          location: editForm.location,
          teacher_id: editForm.teacher_id,
          status: editForm.status,
        },
      },
    })

    showEdit.value = false
    message.value = result?.message || 'Event updated.'
    await load()
  } catch (error: any) {
    console.error('UPDATE EVENT ERROR:', error)
    errorMessage.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Could not update this event.'
  } finally {
    editSaving.value = false
  }
}

const deleteEvent = async () => {
  if (!event.value) return

  const confirmed = confirm(
    `Delete "${event.value.name}"?\n\nThis will also remove its participant assignments and results. This cannot be undone.`
  )

  if (!confirmed) return

  const confirmedAgain = confirm(
    'Are you sure? Click OK to permanently delete this event.'
  )

  if (!confirmedAgain) return

  deleting.value = true
  errorMessage.value = ''
  message.value = ''

  try {
    const accessToken = await getAccessToken()

    await $fetch('/api/admin/events/manage', {
      method: 'POST',
      body: {
        action: 'delete',
        event_id: eventId.value,
        access_token: accessToken,
      },
    })

    await navigateTo('/admin/events')
  } catch (error: any) {
    console.error('DELETE EVENT ERROR:', error)
    errorMessage.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Could not delete this event.'
  } finally {
    deleting.value = false
  }
}

const load = async () => {
  loading.value = true
  errorMessage.value = ''
  message.value = ''

  const id = Number(route.params.id)

  if (!Number.isInteger(id) || id <= 0) {
    errorMessage.value = 'Invalid event ID.'
    loading.value = false
    return
  }

  try {
    // Load the event first so the page can always render the event header.
    const { data: eventRow, error: eventError } = await supabase
      .from('events')
      .select('id,name,sport_id,year_level,gender,event_date,start_time,location,teacher_id,status,school_id,carnival_id')
      .eq('id', id)
      .single()

    if (eventError || !eventRow) {
      throw new Error(eventError?.message || `Event ${id} was not found.`)
    }

    const [sportResult, teacherResult] = await Promise.all([
      eventRow.sport_id
        ? supabase.from('sports').select('id,name,measurement_type').eq('id', eventRow.sport_id).maybeSingle()
        : Promise.resolve({ data: null, error: null } as any),
      eventRow.teacher_id
        ? supabase.from('profiles').select('id,first_name,last_name').eq('id', eventRow.teacher_id).maybeSingle()
        : Promise.resolve({ data: null, error: null } as any),
    ])

    event.value = {
      ...eventRow,
      sport: sportResult.data || null,
      teacher: teacherResult.data || null,
    }

    if (showEdit.value) {
      populateEditForm()
    }

    // Load assignment data through the verified Admin API.
    const { data: { session } } = await supabase.auth.getSession()

    if (!session?.access_token) {
      errorMessage.value = 'The event loaded, but your login session could not be verified for student assignments. Please sign out and back in.'
      return
    }

    const result: any = await $fetch('/api/admin/events/participants', {
      method: 'POST',
      body: {
        action: 'load',
        event_id: id,
        access_token: session.access_token,
      },
    })

    students.value = result.students || []
    participants.value = result.participants || []
    houses.value = result.houses || []
  } catch (error: any) {
    console.error('LOAD ASSIGN STUDENTS ERROR:', error)

    if (!event.value) {
      students.value = []
      participants.value = []
      houses.value = []
    }

    errorMessage.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Could not load this event.'
  } finally {
    loading.value = false
  }
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

    const result: any = await $fetch('/api/admin/events/participants', {
      method: 'POST',
      body: {
        action: 'add',
        event_id: eventId.value,
        participants: inserts,
        access_token: accessToken,
      },
    })

    if (!result?.added && !result?.skipped) {
      throw new Error('The server did not confirm any student assignments.')
    }

    message.value = result.message ||
      `Added ${result.added || 0} student${Number(result.added || 0) === 1 ? '' : 's'} to the event.`

    if (Array.isArray(result.failed) && result.failed.length) {
      errorMessage.value = `${result.failed.length} student assignment(s) failed: ${result.failed.map((item: any) => item.error).join(' | ')}`
    }

    selected.value = []

    // Reload from the server immediately so Assigned Students reflects the database.
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

onMounted(async () => {
  await load()
})

watch(() => route.params.id, async (value, oldValue) => {
  if (value !== oldValue) await load()
})
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

    <div v-else-if="!event" class="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
      <div class="font-semibold">Event page did not initialise.</div>
      <div class="mt-1 text-sm">Event ID: {{ route.params.id }}</div>
      <button type="button" class="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white" @click="load">
        Retry loading event
      </button>
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

        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-lg bg-blue-600 px-4 py-2 text-center font-semibold text-white hover:bg-blue-700"
            @click="openEdit"
          >
            Edit Event
          </button>

          <NuxtLink
            :to="`/teacher/events/${event.id}`"
            class="rounded-lg bg-emerald-600 px-4 py-2 text-center font-semibold text-white hover:bg-emerald-700"
          >
            Open Result Entry
          </NuxtLink>

          <button
            type="button"
            :disabled="deleting"
            class="rounded-lg bg-red-50 px-4 py-2 text-center font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
            @click="deleteEvent"
          >
            {{ deleting ? 'Deleting...' : 'Delete Event' }}
          </button>
        </div>
      </div>

      <div v-if="message" class="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-700">{{ message }}</div>
      <div v-if="errorMessage" class="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">{{ errorMessage }}</div>

      <section v-if="showEdit" class="mt-6 rounded-xl border border-blue-200 bg-white p-5 shadow-sm">
        <div class="flex items-center justify-between gap-4">
          <div>
            <h2 class="text-lg font-bold">Edit Event</h2>
            <p class="text-sm text-slate-500">Correct event details without changing assigned students.</p>
          </div>

          <button
            type="button"
            class="text-sm font-semibold text-slate-500 hover:text-slate-700"
            @click="showEdit = false"
          >
            Close
          </button>
        </div>

        <form class="mt-5 grid gap-4 md:grid-cols-3" @submit.prevent="saveEvent">
          <label class="md:col-span-2">
            <span class="mb-1 block text-sm font-semibold text-slate-700">Event name</span>
            <input v-model="editForm.name" required class="w-full rounded-lg border px-3 py-2" />
          </label>

          <label>
            <span class="mb-1 block text-sm font-semibold text-slate-700">Sport</span>
            <select v-model.number="editForm.sport_id" required class="w-full rounded-lg border px-3 py-2">
              <option :value="null">Select sport</option>
              <option v-for="sport in sports" :key="sport.id" :value="sport.id">{{ sport.name }}</option>
            </select>
          </label>

          <label>
            <span class="mb-1 block text-sm font-semibold text-slate-700">Year level</span>
            <input v-model.number="editForm.year_level" type="number" min="1" max="12" class="w-full rounded-lg border px-3 py-2" />
          </label>

          <label>
            <span class="mb-1 block text-sm font-semibold text-slate-700">Gender / category</span>
            <select v-model="editForm.gender" class="w-full rounded-lg border px-3 py-2">
              <option value="mixed">Mixed</option>
              <option value="female">Girls</option>
              <option value="male">Boys</option>
              <option value="open">Open</option>
            </select>
          </label>

          <label>
            <span class="mb-1 block text-sm font-semibold text-slate-700">Location</span>
            <input v-model="editForm.location" class="w-full rounded-lg border px-3 py-2" />
          </label>

          <label>
            <span class="mb-1 block text-sm font-semibold text-slate-700">Date</span>
            <input v-model="editForm.event_date" type="date" required class="w-full rounded-lg border px-3 py-2" />
          </label>

          <label>
            <span class="mb-1 block text-sm font-semibold text-slate-700">Start time</span>
            <input v-model="editForm.start_time" type="time" class="w-full rounded-lg border px-3 py-2" />
          </label>

          <label>
            <span class="mb-1 block text-sm font-semibold text-slate-700">Teacher</span>
            <select v-model="editForm.teacher_id" class="w-full rounded-lg border px-3 py-2">
              <option :value="null">No teacher assigned</option>
              <option v-for="teacher in teachers" :key="teacher.id" :value="teacher.id">
                {{ teacher.first_name }} {{ teacher.last_name }}
              </option>
            </select>
          </label>

          <label>
            <span class="mb-1 block text-sm font-semibold text-slate-700">Status</span>
            <select v-model="editForm.status" class="w-full rounded-lg border px-3 py-2">
              <option value="scheduled">Scheduled</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>

          <div class="flex items-end gap-2 md:col-span-3">
            <button
              type="submit"
              :disabled="editSaving"
              class="rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {{ editSaving ? 'Saving...' : 'Save Event Changes' }}
            </button>

            <button
              type="button"
              class="rounded-lg border px-5 py-2 font-semibold text-slate-700 hover:bg-slate-50"
              @click="showEdit = false"
            >
              Cancel
            </button>
          </div>
        </form>
      </section>

      <section class="mt-6 rounded-xl border bg-white p-5">
        <h2 class="text-lg font-bold">Assigned Students ({{ participants.length }})</h2>
        <p class="text-sm text-slate-500">Set lanes or bib numbers before the event.</p>

        <div class="mt-4 overflow-x-auto">
          <table class="sst-dark-table w-full min-w-[760px] text-left">
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
