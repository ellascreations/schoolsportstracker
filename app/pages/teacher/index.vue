<script setup lang="ts">
definePageMeta({
  middleware: 'teacher',
})

const supabase = useSupabaseClient()

const events = ref<any[]>([])
const loading = ref(true)
const errorMessage = ref('')
const profile = ref<any>(null)

const loadTeacherPage = async () => {
  loading.value = true
  errorMessage.value = ''

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      throw new Error(
        userError?.message ||
        'Could not verify the logged-in user.'
      )
    }

    const { data: profileData, error: profileError } =
      await supabase
        .from('profiles')
        .select('id, first_name, last_name, role, active')
        .eq('id', user.id)
        .single()

    if (profileError) {
      throw new Error(profileError.message)
    }

    if (!profileData?.active) {
      throw new Error('Your account is inactive.')
    }

    profile.value = profileData

    let query = supabase
      .from('events')
      .select(`
        id,
        name,
        event_date,
        start_time,
        location,
        year_level,
        gender,
        status,
        teacher_id,
        sport:sports (
          id,
          name
        )
      `)
      .order('event_date', { ascending: true })
      .order('start_time', { ascending: true })

    /*
     * Admins can see every event.
     *
     * Teachers see:
     * - events assigned to them
     * - events that do not currently have a teacher
     */
    if (profileData.role === 'teacher') {
      query = query.or(
        `teacher_id.eq.${user.id},teacher_id.is.null`
      )
    }

    const { data, error } = await query

    if (error) {
      throw new Error(error.message)
    }

    events.value = data || []
  } catch (error: any) {
    console.error(
      'TEACHER PAGE LOAD ERROR:',
      error
    )

    events.value = []

    errorMessage.value =
      error?.message ||
      'Could not load teacher events.'
  } finally {
    loading.value = false
  }
}

onMounted(loadTeacherPage)
</script>

<template>
  <main
    class="mx-auto max-w-6xl px-4 py-8"
  >
    <div
      class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
    >
      <div>
        <p
          class="text-sm font-bold uppercase tracking-wider text-emerald-600"
        >
          Teacher
        </p>

        <h1
          class="mt-1 text-3xl font-bold text-slate-900"
        >
          Event Management
        </h1>

        <p
          class="mt-2 text-slate-500"
        >
          Select an event to enter or update results.
        </p>

        <p
          v-if="profile"
          class="mt-2 text-sm text-slate-400"
        >
          Signed in as
          {{ profile.first_name }}
          {{ profile.last_name }}
          ·
          <span class="capitalize">
            {{ profile.role }}
          </span>
        </p>
      </div>

      <NuxtLink
        v-if="['admin','super_admin'].includes(profile?.role)"
        to="/admin/events"
        class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        Admin Events
      </NuxtLink>
    </div>

    <div
      v-if="errorMessage"
      class="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700"
    >
      <div class="font-semibold">
        Could not load Teacher events
      </div>

      <div class="mt-1 text-sm">
        {{ errorMessage }}
      </div>

      <button
        type="button"
        class="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
        @click="loadTeacherPage"
      >
        Try Again
      </button>
    </div>

    <section
      v-if="loading"
      class="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm"
    >
      <div
        class="text-lg font-semibold text-slate-700"
      >
        Loading events...
      </div>

      <p
        class="mt-1 text-sm text-slate-500"
      >
        Checking your assigned sporting events.
      </p>
    </section>

    <section
      v-else-if="!errorMessage && !events.length"
      class="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm"
    >
      <div
        class="text-lg font-semibold text-slate-800"
      >
        No events available
      </div>

      <p
        class="mt-1 text-sm text-slate-500"
      >
        {{
          ['admin','super_admin'].includes(profile?.role)
            ? 'No sporting events have been created yet.'
            : 'There are currently no events assigned to you or waiting for a teacher.'
        }}
      </p>
    </section>

    <div
      v-else-if="!errorMessage"
      class="grid gap-4 md:grid-cols-2"
    >
      <NuxtLink
        v-for="event in events"
        :key="event.id"
        :to="`/teacher/events/${event.id}`"
        class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow"
      >
        <div
          class="flex items-start justify-between gap-4"
        >
          <div>
            <div
              class="text-lg font-bold text-slate-900"
            >
              {{ event.name }}
            </div>

            <div
              class="mt-1 text-sm text-slate-500"
            >
              {{ event.event_date }}
              <span v-if="event.start_time">
                ·
                {{
                  String(
                    event.start_time
                  ).slice(0, 5)
                }}
              </span>
            </div>
          </div>

          <span
            class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold capitalize text-slate-600"
          >
            {{
              String(
                event.status || ''
              ).replaceAll('_', ' ')
            }}
          </span>
        </div>

        <div
          class="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2"
        >
          <div>
            <span class="font-semibold">
              Sport:
            </span>
            {{ event.sport?.name || '—' }}
          </div>

          <div>
            <span class="font-semibold">
              Year:
            </span>
            {{
              event.year_level
                ? `Year ${event.year_level}`
                : 'All'
            }}
          </div>

          <div>
            <span class="font-semibold">
              Category:
            </span>
            <span class="capitalize">
              {{ event.gender || 'mixed' }}
            </span>
          </div>

          <div>
            <span class="font-semibold">
              Location:
            </span>
            {{ event.location || '—' }}
          </div>
        </div>

        <div
          class="mt-4 text-sm font-semibold text-emerald-700"
        >
          Open Result Entry →
        </div>
      </NuxtLink>
    </div>
  </main>
</template>
