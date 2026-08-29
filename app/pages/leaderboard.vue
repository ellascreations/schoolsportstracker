<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const supabase = useSupabaseClient()
const profile = ref<any>(null)
const carnivals = ref<any[]>([])
const rows = ref<any[]>([])
const selectedCarnivalId = ref<number | null>(null)
const loading = ref(true)
const errorMessage = ref('')

const selectedCarnival = computed(() => carnivals.value.find((c:any) => c.id === selectedCarnivalId.value) || null)

const loadLeaderboard = async () => {
  errorMessage.value = ''
  loading.value = true

  if (selectedCarnivalId.value) {
    const view = selectedCarnival.value?.scoring_mode === 'school' ? 'carnival_school_leaderboard' : 'carnival_house_leaderboard'
    const { data, error } = await supabase.from(view).select('*').eq('carnival_id', selectedCarnivalId.value).order('points', { ascending: false })
    if (error) errorMessage.value = error.message
    rows.value = data || []
  } else {
    let query = supabase.from('house_leaderboard').select('*').order('points', { ascending: false })
    if (profile.value?.role !== 'super_admin' && profile.value?.school_id) query = query.eq('school_id', profile.value.school_id)
    const { data, error } = await query
    if (error) errorMessage.value = error.message
    rows.value = data || []
  }

  loading.value = false
}

const load = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: p } = await supabase.from('profiles').select('role,school_id,school:schools(name)').eq('id', user.id).single()
  profile.value = p

  const { data } = await supabase.from('carnivals').select('id,name,scoring_mode,start_date,status').order('start_date', { ascending: false })
  carnivals.value = data || []
  await loadLeaderboard()
}

watch(selectedCarnivalId, loadLeaderboard)
onMounted(load)
</script>

<template>
  <main class="mx-auto max-w-5xl px-4 py-8">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-3xl font-bold">Leaderboards</h1>
        <p class="mt-2 text-slate-500">House championships and interschool carnival standings.</p>
      </div>

      <label class="min-w-72">
        <span class="mb-1 block text-sm font-semibold text-slate-600">View</span>
        <select v-model.number="selectedCarnivalId" class="w-full rounded-lg border bg-white px-3 py-2">
          <option :value="null">Current school house points</option>
          <option v-for="carnival in carnivals" :key="carnival.id" :value="carnival.id">{{ carnival.name }}</option>
        </select>
      </label>
    </div>

    <div v-if="errorMessage" class="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">{{ errorMessage }}</div>
    <div v-if="loading" class="mt-6 rounded-xl border bg-white p-8 text-center text-slate-500">Loading leaderboard...</div>

    <div v-else class="mt-6 space-y-3">
      <div v-for="(row,i) in rows" :key="row.house_id || row.school_id" class="flex items-center gap-4 rounded-xl border bg-white p-5 shadow-sm">
        <div class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-lg font-bold">{{ i+1 }}</div>
        <div class="flex-1">
          <div class="font-bold">{{ row.name || row.house_name || row.school_name }}</div>
          <div v-if="row.short_name" class="text-xs text-slate-500">{{ row.short_name }}</div>
        </div>
        <div class="text-2xl font-bold">{{ row.points ?? row.total_points ?? 0 }} <span class="text-sm font-normal text-slate-500">pts</span></div>
      </div>
      <div v-if="!rows.length" class="rounded-xl border bg-white p-8 text-center text-slate-500">No points have been awarded yet.</div>
    </div>
  </main>
</template>
