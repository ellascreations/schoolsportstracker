<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const supabase = useSupabaseClient()
const rows = ref<any[]>([])
onMounted(async () => {
  const { data } = await supabase.from('house_leaderboard').select('*').order('total_points', { ascending: false })
  rows.value = data || []
})
</script>
<template><main class="mx-auto max-w-4xl px-4 py-8"><h1 class="text-3xl font-bold">House Championship</h1><p class="mt-2 text-slate-500">Live points calculated from completed results.</p>
<div class="mt-6 space-y-3"><div v-for="(row,i) in rows" :key="row.house_id" class="flex items-center gap-4 rounded-xl border bg-white p-5 shadow-sm"><div class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-lg font-bold">{{ i+1 }}</div><div class="flex-1"><div class="font-bold">{{ row.house_name }}</div></div><div class="text-2xl font-bold">{{ row.total_points }} <span class="text-sm font-normal text-slate-500">pts</span></div></div><div v-if="!rows.length" class="rounded-xl border bg-white p-8 text-center text-slate-500">No points have been awarded yet.</div></div></main></template>
