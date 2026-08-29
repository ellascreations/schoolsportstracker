<script setup lang="ts">
definePageMeta({ middleware: 'admin' })

const supabase = useSupabaseClient()
const carnivals = ref<any[]>([])
const schools = ref<any[]>([])
const templates = ref<any[]>([])
const profile = ref<any>(null)
const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const showCreate = ref(false)

const form = reactive({
  name: '',
  carnival_type: 'athletics',
  scope: 'school',
  host_school_id: null as number | null,
  template_id: null as number | null,
  start_date: '',
  end_date: '',
  venue: '',
  scoring_mode: 'house',
  participating_school_ids: [] as number[],
})

const token = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Authentication required.')
  return session.access_token
}

const load = async () => {
  loading.value = true
  errorMessage.value = ''

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    errorMessage.value = 'Authentication required.'
    loading.value = false
    return
  }

  const [profileResult, carnivalResult, schoolResult, templateResult] = await Promise.all([
    supabase.from('profiles').select('id,role,school_id').eq('id', user.id).single(),
    supabase.from('carnivals').select('id,name,carnival_type,scope,host_school_id,template_id,start_date,end_date,venue,status,year,scoring_mode,host_school:schools(name,short_name)').order('start_date', { ascending: false }),
    supabase.from('schools').select('id,name,short_name').eq('active', true).order('name'),
    supabase.from('carnival_templates').select('id,name,carnival_type,description,school_id').eq('active', true).order('name'),
  ])

  if (profileResult.error || carnivalResult.error || schoolResult.error || templateResult.error) {
    errorMessage.value = profileResult.error?.message || carnivalResult.error?.message || schoolResult.error?.message || templateResult.error?.message || 'Could not load carnivals.'
  }

  profile.value = profileResult.data
  carnivals.value = carnivalResult.data || []
  schools.value = schoolResult.data || []
  templates.value = templateResult.data || []

  if (!form.host_school_id && profile.value?.school_id) form.host_school_id = profile.value.school_id
  loading.value = false
}

watch(() => form.carnival_type, (type) => {
  const match = templates.value.find((t: any) => t.carnival_type === type)
  form.template_id = match?.id || null
})

watch(() => form.scope, (scope) => {
  form.scoring_mode = scope === 'interschool' ? 'school' : 'house'
  if (scope === 'school') form.participating_school_ids = []
})

const createCarnival = async () => {
  errorMessage.value = ''
  successMessage.value = ''

  if (!form.name.trim() || !form.start_date) {
    errorMessage.value = 'Carnival name and start date are required.'
    return
  }

  saving.value = true
  try {
    const result: any = await $fetch('/api/admin/carnivals/manage', {
      method: 'POST',
      body: {
        action: 'create',
        access_token: await token(),
        carnival: form,
      },
    })

    successMessage.value = `${result.carnival.name} created.`
    showCreate.value = false
    await navigateTo(`/admin/carnivals/${result.carnival.id}`)
  } catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || error?.message || 'Could not create carnival.'
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <main class="mx-auto max-w-7xl px-4 py-8">
    <div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <NuxtLink to="/admin" class="text-sm font-semibold text-blue-600">← Admin Dashboard</NuxtLink>
        <h1 class="mt-3 text-3xl font-bold">Carnivals</h1>
        <p class="mt-1 text-slate-500">Create school or interschool athletics, swimming and cross-country carnivals.</p>
      </div>
      <button class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white" @click="showCreate = !showCreate">
        {{ showCreate ? 'Cancel' : 'Create Carnival' }}
      </button>
    </div>

    <div v-if="errorMessage" class="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">{{ errorMessage }}</div>
    <div v-if="successMessage" class="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-700">{{ successMessage }}</div>

    <form v-if="showCreate" class="mb-8 rounded-xl border bg-white p-6 shadow-sm" @submit.prevent="createCarnival">
      <h2 class="text-xl font-bold">New Carnival</h2>
      <div class="mt-5 grid gap-4 md:grid-cols-3">
        <label class="md:col-span-2"><span class="mb-1 block text-sm font-semibold">Carnival name</span><input v-model="form.name" required placeholder="2027 Athletics Carnival" class="w-full rounded-lg border px-3 py-2" /></label>
        <label><span class="mb-1 block text-sm font-semibold">Type</span><select v-model="form.carnival_type" class="w-full rounded-lg border px-3 py-2"><option value="athletics">Athletics</option><option value="swimming">Swimming</option><option value="cross_country">Cross Country</option><option value="other">Other</option></select></label>
        <label><span class="mb-1 block text-sm font-semibold">Scope</span><select v-model="form.scope" class="w-full rounded-lg border px-3 py-2"><option value="school">School</option><option v-if="profile?.role === 'super_admin'" value="interschool">Interschool</option></select></label>
        <label v-if="profile?.role === 'super_admin'"><span class="mb-1 block text-sm font-semibold">Host school</span><select v-model.number="form.host_school_id" class="w-full rounded-lg border px-3 py-2"><option v-for="school in schools" :key="school.id" :value="school.id">{{ school.name }}</option></select></label>
        <label><span class="mb-1 block text-sm font-semibold">Template</span><select v-model.number="form.template_id" class="w-full rounded-lg border px-3 py-2"><option :value="null">Start empty</option><option v-for="template in templates.filter((t:any) => t.carnival_type === form.carnival_type)" :key="template.id" :value="template.id">{{ template.name }}</option></select></label>
        <label><span class="mb-1 block text-sm font-semibold">Start date</span><input v-model="form.start_date" type="date" required class="w-full rounded-lg border px-3 py-2" /></label>
        <label><span class="mb-1 block text-sm font-semibold">End date</span><input v-model="form.end_date" type="date" class="w-full rounded-lg border px-3 py-2" /></label>
        <label><span class="mb-1 block text-sm font-semibold">Venue</span><input v-model="form.venue" class="w-full rounded-lg border px-3 py-2" /></label>
        <label><span class="mb-1 block text-sm font-semibold">Scoring</span><select v-model="form.scoring_mode" class="w-full rounded-lg border px-3 py-2"><option value="house">House championship</option><option value="school">School championship</option><option value="individual">Individual only</option></select></label>
      </div>

      <div v-if="form.scope === 'interschool'" class="mt-5 rounded-lg border bg-slate-50 p-4">
        <h3 class="font-semibold">Participating Schools</h3>
        <p class="mt-1 text-sm text-slate-500">Select the schools invited to this carnival.</p>
        <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <label v-for="school in schools.filter((s:any) => s.id !== form.host_school_id)" :key="school.id" class="flex items-center gap-2 rounded-lg border bg-white px-3 py-2">
            <input v-model="form.participating_school_ids" type="checkbox" :value="school.id" />
            <span>{{ school.name }}</span>
          </label>
        </div>
      </div>

      <button :disabled="saving" class="mt-5 rounded-lg bg-emerald-600 px-5 py-2 font-semibold text-white disabled:opacity-50">{{ saving ? 'Creating...' : 'Create Carnival' }}</button>
    </form>

    <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <div v-if="loading" class="col-span-full rounded-xl border bg-white p-8 text-center text-slate-500">Loading carnivals...</div>
      <div v-else-if="!carnivals.length" class="col-span-full rounded-xl border bg-white p-8 text-center text-slate-500">No carnivals created yet.</div>

      <NuxtLink v-for="carnival in carnivals" v-else :key="carnival.id" :to="`/admin/carnivals/${carnival.id}`" class="rounded-xl border bg-white p-5 shadow-sm hover:border-blue-300">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-xs font-bold uppercase tracking-wide text-blue-600">{{ String(carnival.carnival_type).replaceAll('_',' ') }} · {{ carnival.scope }}</div>
            <h2 class="mt-1 text-lg font-bold">{{ carnival.name }}</h2>
          </div>
          <span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold capitalize">{{ String(carnival.status).replaceAll('_',' ') }}</span>
        </div>
        <div class="mt-4 text-sm text-slate-500">{{ carnival.start_date }}<span v-if="carnival.venue"> · {{ carnival.venue }}</span></div>
        <div class="mt-1 text-sm text-slate-500">Host: {{ carnival.host_school?.short_name || carnival.host_school?.name }}</div>
        <div class="mt-4 font-semibold text-blue-700">Open Carnival →</div>
      </NuxtLink>
    </section>
  </main>
</template>
