<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const supabase = useSupabaseClient()
const events = ref<any[]>([])

onMounted(async () => {
  const { data } = await supabase
    .from('events')
    .select(`
      id,
      name,
      event_date,
      start_time,
      location,
      status,
      sport:sports(name),
      teacher:profiles!events_teacher_id_fkey(first_name,last_name)
    `)
    .order('event_date')
    .order('start_time')

  events.value = data || []
})
</script>

<template>
  <main class="mx-auto max-w-7xl px-4 py-8 text-slate-100">
    <h1 class="text-3xl font-bold text-white">Events</h1>

    <p class="mt-2 text-slate-400">
      Upcoming and completed school sporting events.
    </p>

    <div
      class="mt-6 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-xl"
    >
      <table class="w-full text-left text-slate-200">
        <thead class="border-b border-slate-700 bg-slate-800 text-sm text-slate-300">
          <tr>
            <th class="p-4 font-semibold">Event</th>
            <th class="p-4 font-semibold">Date</th>
            <th class="p-4 font-semibold">Location</th>
            <th class="p-4 font-semibold">Status</th>
          </tr>
        </thead>

        <tbody class="divide-y divide-slate-800 bg-slate-900">
          <tr
            v-for="event in events"
            :key="event.id"
            class="bg-slate-900 transition hover:bg-slate-800/80"
          >
            <td class="p-4 font-semibold text-slate-100">
              {{ event.name }}

              <div class="mt-1 text-xs font-normal text-slate-400">
                {{ event.sport?.name }}
              </div>
            </td>

            <td class="p-4 text-slate-300">
              {{ event.event_date }}
              <span v-if="event.start_time">
                {{ event.start_time.slice(0, 5) }}
              </span>
            </td>

            <td class="p-4 text-slate-300">
              {{ event.location || '—' }}
            </td>

            <td class="p-4">
              <span
                class="inline-flex rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-sm font-semibold capitalize text-blue-300"
              >
                {{ event.status.replaceAll('_', ' ') }}
              </span>
            </td>
          </tr>

          <tr v-if="!events.length" class="bg-slate-900">
            <td colspan="4" class="p-8 text-center text-slate-400">
              No events yet.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </main>
</template>
