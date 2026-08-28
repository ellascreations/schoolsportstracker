<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const supabase = useSupabaseClient()
const events = ref<any[]>([])
onMounted(async () => {
  const { data } = await supabase.from('events').select('id,name,event_date,start_time,location,status,sport:sports(name),teacher:profiles!events_teacher_id_fkey(first_name,last_name)').order('event_date').order('start_time')
  events.value = data || []
})
</script>
<template>
  <main class="mx-auto max-w-7xl px-4 py-8"><h1 class="text-3xl font-bold">Events</h1><p class="mt-2 text-slate-500">Upcoming and completed school sporting events.</p>
    <div class="mt-6 overflow-hidden rounded-xl border bg-white"><table class="w-full text-left"><thead class="bg-slate-50 text-sm"><tr><th class="p-4">Event</th><th class="p-4">Date</th><th class="p-4">Location</th><th class="p-4">Status</th></tr></thead><tbody>
      <tr v-for="event in events" :key="event.id" class="border-t"><td class="p-4 font-semibold">{{ event.name }}<div class="text-xs font-normal text-slate-500">{{ event.sport?.name }}</div></td><td class="p-4">{{ event.event_date }} {{ event.start_time?.slice(0,5) }}</td><td class="p-4">{{ event.location || '—' }}</td><td class="p-4 capitalize">{{ event.status.replaceAll('_',' ') }}</td></tr>
      <tr v-if="!events.length"><td colspan="4" class="p-8 text-center text-slate-500">No events yet.</td></tr>
    </tbody></table></div>
  </main>
</template>
