<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const supabase = useSupabaseClient()

const profile = ref<any>(null)
const schools = ref<any[]>([])
const houses = ref<any[]>([])
const rows = ref<any[]>([])
const loading = ref(true)
const errorMessage = ref('')

const scope = ref<'school'|'house'|'interschool'>('school')
const selectedSchoolId = ref<number|null>(null)
const selectedHouseId = ref<number|null>(null)
const categoryFilter = ref('')
const search = ref('')

const grouped = computed(() => {
  const q = search.value.trim().toLowerCase()
  const filtered = rows.value.filter((row:any) => {
    if (categoryFilter.value && row.sport_category !== categoryFilter.value) return false
    if (!q) return true
    return `${row.sport_name || ''} ${row.holder_name || ''} ${row.holder_school_name || ''} ${row.holder_house_name || ''}`.toLowerCase().includes(q)
  })

  const map = new Map<string, any>()
  for (const row of filtered) {
    const key = `${row.sport_id}|${row.year_level ?? ''}|${row.gender}`
    if (!map.has(key)) {
      map.set(key, {
        key,
        sport_name: row.sport_name,
        sport_category: row.sport_category,
        measurement_type: row.measurement_type,
        year_level: row.year_level,
        gender: row.gender,
        records: [],
      })
    }
    map.get(key).records.push(row)
  }
  return Array.from(map.values()).sort((a,b) =>
    String(a.sport_category).localeCompare(String(b.sport_category)) ||
    String(a.sport_name).localeCompare(String(b.sport_name)) ||
    Number(a.year_level || 0) - Number(b.year_level || 0) ||
    String(a.gender).localeCompare(String(b.gender))
  )
})

const categories = computed(() => Array.from(new Set(rows.value.map((r:any) => r.sport_category).filter(Boolean))).sort())

const formatValue = (row:any) => {
  if (row.result_display) return row.result_display
  const value = Number(row.result_value)
  if (!Number.isFinite(value)) return '—'
  if (row.measurement_type === 'time') {
    if (value >= 60) {
      const m = Math.floor(value / 60)
      const s = (value - m * 60).toFixed(2).padStart(5, '0')
      return `${m}:${s}`
    }
    return `${value.toFixed(2)} s`
  }
  if (['distance','height'].includes(row.measurement_type)) return `${value.toFixed(2)} m`
  return String(value)
}

const loadHouses = async () => {
  houses.value = []
  selectedHouseId.value = null
  if (!selectedSchoolId.value) return
  const { data, error } = await supabase
    .from('houses')
    .select('id,name,school_id')
    .eq('school_id', selectedSchoolId.value)
    .eq('active', true)
    .order('name')
  if (error) throw error
  houses.value = data || []
}

const loadRecords = async () => {
  loading.value = true
  errorMessage.value = ''
  try {
    let query = supabase
      .from('record_top5')
      .select('*')
      .eq('record_scope', scope.value)
      .order('sport_category')
      .order('sport_name')
      .order('year_level')
      .order('gender')
      .order('record_rank')

    if (scope.value === 'school') {
      if (!selectedSchoolId.value) { rows.value = []; return }
      query = query.eq('school_id', selectedSchoolId.value)
    }

    if (scope.value === 'house') {
      if (!selectedHouseId.value) { rows.value = []; return }
      query = query.eq('house_id', selectedHouseId.value)
    }

    const { data, error } = await query
    if (error) throw error
    rows.value = data || []
  } catch (error:any) {
    console.error('LOAD RECORDS ERROR:', error)
    errorMessage.value = error?.message || 'Could not load records.'
    rows.value = []
  } finally {
    loading.value = false
  }
}

const changeScope = async (next:'school'|'house'|'interschool') => {
  scope.value = next
  categoryFilter.value = ''
  search.value = ''
  if (next === 'house' && selectedSchoolId.value) await loadHouses()
  await loadRecords()
}

onMounted(async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: p, error: pe } = await supabase
      .from('profiles')
      .select('id,role,school_id,school:schools(id,name,short_name)')
      .eq('id', user.id)
      .single()
    if (pe) throw pe
    profile.value = p

    if (p.role === 'super_admin') {
      const { data, error } = await supabase.from('schools').select('id,name,short_name').eq('active', true).order('name')
      if (error) throw error
      schools.value = data || []
      selectedSchoolId.value = schools.value[0]?.id || null
    } else {
      schools.value = p.school ? [p.school] : []
      selectedSchoolId.value = p.school_id || null
    }

    await loadRecords()
  } catch (error:any) {
    errorMessage.value = error?.message || 'Could not initialise records.'
    loading.value = false
  }
})

watch(selectedSchoolId, async () => {
  if (scope.value === 'house') await loadHouses()
  await loadRecords()
})
watch(selectedHouseId, async () => {
  if (scope.value === 'house') await loadRecords()
})
</script>

<template>
  <main class="mx-auto max-w-7xl px-4 py-8">
    <div class="mb-7">
      <p class="text-sm font-bold uppercase tracking-wider text-amber-600">Records</p>
      <h1 class="mt-1 text-3xl font-bold text-white">Top 5 All-Time Performances</h1>
      <p class="mt-2 text-slate-400">School, house and interschool records with the date each performance was achieved.</p>
    </div>

    <div class="mb-6 flex flex-wrap gap-2">
      <button v-for="item in [
        {value:'school',label:'School Records'},
        {value:'house',label:'House Records'},
        {value:'interschool',label:'Interschool Records'}
      ]" :key="item.value" type="button"
        class="rounded-lg px-4 py-2 text-sm font-semibold"
        :class="scope===item.value ? 'bg-slate-900 text-white' : 'border bg-slate-900 text-slate-200 hover:bg-slate-800'"
        @click="changeScope(item.value as any)">
        {{ item.label }}
      </button>
    </div>

    <section class="mb-6 grid gap-4 rounded-xl border bg-slate-900 p-5 shadow-sm md:grid-cols-4">
      <label v-if="scope!=='interschool'">
        <span class="mb-1 block text-sm font-semibold">School</span>
        <select v-model.number="selectedSchoolId" :disabled="profile?.role!=='super_admin'" class="w-full rounded-lg border px-3 py-2 disabled:bg-slate-100">
          <option v-for="school in schools" :key="school.id" :value="school.id">{{ school.name }}</option>
        </select>
      </label>

      <label v-if="scope==='house'">
        <span class="mb-1 block text-sm font-semibold">House</span>
        <select v-model.number="selectedHouseId" class="w-full rounded-lg border px-3 py-2">
          <option :value="null">Select house</option>
          <option v-for="house in houses" :key="house.id" :value="house.id">{{ house.name }}</option>
        </select>
      </label>

      <label>
        <span class="mb-1 block text-sm font-semibold">Sport category</span>
        <select v-model="categoryFilter" class="w-full rounded-lg border px-3 py-2">
          <option value="">All categories</option>
          <option v-for="category in categories" :key="category" :value="category">{{ category }}</option>
        </select>
      </label>

      <label class="md:col-span-2">
        <span class="mb-1 block text-sm font-semibold">Search</span>
        <input v-model="search" type="search" placeholder="Sport, athlete, school or house..." class="w-full rounded-lg border px-3 py-2" />
      </label>
    </section>

    <div v-if="errorMessage" class="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{{ errorMessage }}</div>
    <div v-if="loading" class="rounded-xl border bg-slate-900 p-10 text-center text-slate-400">Loading records...</div>
    <div v-else-if="!grouped.length" class="rounded-xl border bg-slate-900 p-10 text-center text-slate-400">No record performances are available for this selection yet.</div>

    <div v-else class="space-y-5">
      <section v-for="group in grouped" :key="group.key" class="overflow-hidden rounded-xl border bg-slate-900 shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-800 px-5 py-4">
          <div>
            <div class="font-bold text-white">{{ group.sport_name }}</div>
            <div class="text-sm text-slate-400">
              {{ group.year_level ? `Year ${group.year_level}` : 'Open' }} ·
              <span class="capitalize">{{ group.gender }}</span> · {{ group.sport_category }}
            </div>
          </div>
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-400">Top 5 all-time</div>
        </div>

        <div class="overflow-x-auto">
          <table class="sst-dark-table min-w-full text-left text-sm">
            <thead class="bg-slate-900 text-slate-400"><tr>
              <th class="px-5 py-3">Rank</th><th>Performance</th><th>Athlete</th><th>School</th><th>House</th><th>Date achieved</th>
            </tr></thead>
            <tbody class="divide-y">
              <tr v-for="row in group.records" :key="row.id" :class="row.record_rank===1 ? 'bg-amber-50/60' : ''">
                <td class="px-5 py-4 font-bold">
                  <span v-if="row.record_rank===1">🏆</span>
                  #{{ row.record_rank }}
                </td>
                <td class="font-bold text-white">{{ formatValue(row) }}</td>
                <td>{{ row.holder_name }}</td>
                <td>{{ row.holder_school_name || '—' }}</td>
                <td>{{ row.holder_house_name || '—' }}</td>
                <td>{{ row.achieved_date }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </main>
</template>
