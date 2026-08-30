<script setup lang="ts">
definePageMeta({ middleware: 'admin' })

const supabase = useSupabaseClient()
const profile = ref<any>(null)
const sports = ref<any[]>([])
const schools = ref<any[]>([])
const houses = ref<any[]>([])
const recentManual = ref<any[]>([])
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const form = reactive({
  record_scope: 'school',
  school_id: null as number|null,
  house_id: null as number|null,
  sport_id: null as number|null,
  year_level: 7 as number|null,
  gender: 'female',
  holder_name: '',
  holder_school_name: '',
  holder_house_name: '',
  result_value: '' as any,
  result_display: '',
  achieved_date: '',
  notes: '',
})

const loadHouses = async () => {
  houses.value = []
  form.house_id = null
  if (!form.school_id) return
  const { data, error } = await supabase.from('houses').select('id,name,school_id').eq('school_id', form.school_id).eq('active', true).order('name')
  if (error) throw error
  houses.value = data || []
}

const loadRecent = async () => {
  let query = supabase.from('record_performances').select('id,record_scope,school_id,house_id,holder_name,result_display,result_value,achieved_date,sport:sports(name,measurement_type)').eq('manual_entry', true).order('created_at', { ascending:false }).limit(30)
  if (profile.value?.role !== 'super_admin' && profile.value?.school_id) query = query.eq('school_id', profile.value.school_id)
  const { data } = await query
  recentManual.value = data || []
}

const submit = async () => {
  errorMessage.value = ''
  successMessage.value = ''
  saving.value = true
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Authentication required. Please sign out and back in.')

    await $fetch('/api/admin/records/manage', {
      method: 'POST',
      body: { ...form, action:'create', access_token: session.access_token }
    })

    successMessage.value = 'Historical performance added. The Top 5 records have been recalculated automatically.'
    form.holder_name = ''
    form.result_value = ''
    form.result_display = ''
    form.notes = ''
    await loadRecent()
  } catch (error:any) {
    errorMessage.value = error?.data?.statusMessage || error?.data?.message || error?.message || 'Could not add historical record.'
  } finally {
    saving.value = false
  }
}

const removeManual = async (id:number) => {
  if (!confirm('Delete this manually entered historical performance?')) return
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Authentication required.')
    await $fetch('/api/admin/records/manage', { method:'POST', body:{action:'delete',id,access_token:session.access_token} })
    await loadRecent()
  } catch (error:any) {
    errorMessage.value = error?.data?.statusMessage || error?.message || 'Could not delete performance.'
  }
}

onMounted(async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { data: p, error: pe } = await supabase.from('profiles').select('role,school_id,school:schools(id,name)').eq('id', user.id).single()
  if (pe) { errorMessage.value = pe.message; return }
  profile.value = p

  const [{data:sportRows,error:sportError},{data:schoolRows,error:schoolError}] = await Promise.all([
    supabase.from('sports').select('id,name,category,measurement_type,lower_is_better').eq('active', true).order('category').order('name'),
    p.role==='super_admin' ? supabase.from('schools').select('id,name').eq('active', true).order('name') : Promise.resolve({data:p.school?[p.school]:[],error:null} as any)
  ])
  if (sportError || schoolError) { errorMessage.value = sportError?.message || schoolError?.message || ''; return }
  sports.value = sportRows || []
  schools.value = schoolRows || []
  form.school_id = p.role==='super_admin' ? (schools.value[0]?.id || null) : p.school_id
  form.achieved_date = new Date().toISOString().slice(0,10)
  await loadHouses()
  await loadRecent()
})

watch(() => form.school_id, loadHouses)
watch(() => form.record_scope, () => { if (form.record_scope !== 'house') form.house_id = null })
</script>

<template>
  <main class="mx-auto max-w-7xl px-4 py-8">
    <NuxtLink to="/admin" class="text-sm font-semibold text-blue-600">← Admin Dashboard</NuxtLink>
    <div class="mt-3 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold">Records</h1>
        <p class="mt-1 text-slate-500">Add historical performances from before the Sports Tracker was introduced.</p>
      </div>
      <NuxtLink to="/records" class="rounded-lg bg-amber-500 px-4 py-2 font-semibold text-white hover:bg-amber-600">View Top 5 Records</NuxtLink>
    </div>

    <div v-if="errorMessage" class="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">{{ errorMessage }}</div>
    <div v-if="successMessage" class="mt-5 rounded-lg border border-green-200 bg-green-50 p-3 text-green-700">{{ successMessage }}</div>

    <form class="mt-6 rounded-xl border bg-white p-6 shadow-sm" @submit.prevent="submit">
      <h2 class="text-xl font-bold">Add Historical Performance</h2>
      <div class="mt-5 grid gap-4 md:grid-cols-3">
        <label><span class="mb-1 block text-sm font-semibold">Record scope</span><select v-model="form.record_scope" class="w-full rounded-lg border px-3 py-2"><option value="school">School</option><option value="house">House</option><option v-if="profile?.role==='super_admin'" value="interschool">Interschool</option></select></label>
        <label v-if="form.record_scope!=='interschool'"><span class="mb-1 block text-sm font-semibold">School</span><select v-model.number="form.school_id" :disabled="profile?.role!=='super_admin'" class="w-full rounded-lg border px-3 py-2 disabled:bg-slate-100"><option v-for="school in schools" :key="school.id" :value="school.id">{{school.name}}</option></select></label>
        <label v-if="form.record_scope==='house'"><span class="mb-1 block text-sm font-semibold">House</span><select v-model.number="form.house_id" class="w-full rounded-lg border px-3 py-2"><option :value="null">Select house</option><option v-for="house in houses" :key="house.id" :value="house.id">{{house.name}}</option></select></label>

        <label><span class="mb-1 block text-sm font-semibold">Sport / event</span><select v-model.number="form.sport_id" required class="w-full rounded-lg border px-3 py-2"><option :value="null">Select sport</option><option v-for="sport in sports" :key="sport.id" :value="sport.id">{{sport.category}} — {{sport.name}}</option></select></label>
        <label><span class="mb-1 block text-sm font-semibold">Year level</span><select v-model.number="form.year_level" class="w-full rounded-lg border px-3 py-2"><option :value="null">Open</option><option v-for="y in 12" :key="y" :value="y">Year {{y}}</option></select></label>
        <label><span class="mb-1 block text-sm font-semibold">Category</span><select v-model="form.gender" class="w-full rounded-lg border px-3 py-2"><option value="female">Girls</option><option value="male">Boys</option><option value="mixed">Mixed</option><option value="open">Open</option></select></label>

        <label><span class="mb-1 block text-sm font-semibold">Athlete name</span><input v-model="form.holder_name" required class="w-full rounded-lg border px-3 py-2" /></label>
        <label v-if="form.record_scope==='interschool'"><span class="mb-1 block text-sm font-semibold">Athlete school</span><input v-model="form.holder_school_name" class="w-full rounded-lg border px-3 py-2" /></label>
        <label><span class="mb-1 block text-sm font-semibold">Result value</span><input v-model="form.result_value" required inputmode="decimal" placeholder="e.g. 11.42, 1:04.33 or 4.92" class="w-full rounded-lg border px-3 py-2" /></label>
        <label><span class="mb-1 block text-sm font-semibold">Display result (optional)</span><input v-model="form.result_display" placeholder="e.g. 11.42 s" class="w-full rounded-lg border px-3 py-2" /></label>
        <label><span class="mb-1 block text-sm font-semibold">Date achieved</span><input v-model="form.achieved_date" type="date" required class="w-full rounded-lg border px-3 py-2" /></label>
        <label class="md:col-span-3"><span class="mb-1 block text-sm font-semibold">Notes</span><input v-model="form.notes" placeholder="Optional historical source or notes" class="w-full rounded-lg border px-3 py-2" /></label>
      </div>
      <button :disabled="saving" class="mt-5 rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-50">{{saving?'Saving...':'Add Historical Performance'}}</button>
    </form>

    <section class="mt-6 overflow-hidden rounded-xl border bg-white shadow-sm">
      <div class="border-b px-5 py-4"><h2 class="font-bold">Recent Manual Entries</h2></div>
      <div v-if="!recentManual.length" class="p-8 text-center text-slate-500">No manual historical performances yet.</div>
      <div v-else class="overflow-x-auto"><table class="min-w-full text-left text-sm"><thead class="bg-slate-50"><tr><th class="p-4">Scope</th><th>Sport</th><th>Athlete</th><th>Performance</th><th>Date</th><th></th></tr></thead><tbody><tr v-for="row in recentManual" :key="row.id" class="border-t"><td class="p-4 capitalize">{{row.record_scope}}</td><td>{{row.sport?.name}}</td><td>{{row.holder_name}}</td><td>{{row.result_display||row.result_value}}</td><td>{{row.achieved_date}}</td><td class="text-right pr-4"><button class="text-sm font-semibold text-red-600" @click="removeManual(row.id)">Delete</button></td></tr></tbody></table></div>
    </section>
  </main>
</template>
