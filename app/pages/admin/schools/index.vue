<script setup lang="ts">
definePageMeta({ middleware: 'admin' })

const supabase = useSupabaseClient()
const schools = ref<any[]>([])
const profile = ref<any>(null)
const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const showAdd = ref(false)

const form = reactive({
  name: '',
  short_name: '',
  email: '',
  phone: '',
  address: '',
})

const getSessionToken = async () => {
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

  const [{ data: p, error: pe }, { data: schoolRows, error: se }] = await Promise.all([
    supabase.from('profiles').select('id,role,school_id').eq('id', user.id).single(),
    supabase.from('schools').select('id,name,short_name,email,phone,address,active,created_at').order('name'),
  ])

  if (pe || se) {
    errorMessage.value = pe?.message || se?.message || 'Could not load schools.'
  }

  profile.value = p
  schools.value = schoolRows || []
  loading.value = false
}

const createSchool = async () => {
  errorMessage.value = ''
  successMessage.value = ''

  if (!form.name.trim()) {
    errorMessage.value = 'School name is required.'
    return
  }

  saving.value = true
  try {
    const result: any = await $fetch('/api/admin/schools/manage', {
      method: 'POST',
      body: {
        action: 'create',
        access_token: await getSessionToken(),
        school: form,
      },
    })

    successMessage.value = `${result.school.name} created.`
    Object.assign(form, { name: '', short_name: '', email: '', phone: '', address: '' })
    showAdd.value = false
    await load()
  } catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || error?.message || 'Could not create school.'
  } finally {
    saving.value = false
  }
}

const saveSchool = async (school: any) => {
  errorMessage.value = ''
  successMessage.value = ''
  saving.value = true

  try {
    await $fetch('/api/admin/schools/manage', {
      method: 'POST',
      body: {
        action: 'update',
        access_token: await getSessionToken(),
        school_id: school.id,
        school: {
          name: school.name,
          short_name: school.short_name,
          email: school.email,
          phone: school.phone,
          address: school.address,
          active: school.active,
        },
      },
    })

    successMessage.value = 'School updated.'
  } catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || error?.message || 'Could not update school.'
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
        <h1 class="mt-3 text-3xl font-bold">Schools</h1>
        <p class="mt-1 text-slate-500">Manage schools participating in the Sports Tracker.</p>
      </div>

      <button
        v-if="profile?.role === 'super_admin'"
        class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
        @click="showAdd = !showAdd"
      >
        {{ showAdd ? 'Cancel' : 'Add School' }}
      </button>
    </div>

    <div v-if="errorMessage" class="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">{{ errorMessage }}</div>
    <div v-if="successMessage" class="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-700">{{ successMessage }}</div>

    <form v-if="showAdd" class="mb-6 grid gap-4 rounded-xl border bg-white p-5 md:grid-cols-2" @submit.prevent="createSchool">
      <input v-model="form.name" required placeholder="School name" class="rounded-lg border px-3 py-2" />
      <input v-model="form.short_name" placeholder="Short name / abbreviation" class="rounded-lg border px-3 py-2" />
      <input v-model="form.email" type="email" placeholder="School email" class="rounded-lg border px-3 py-2" />
      <input v-model="form.phone" placeholder="Phone" class="rounded-lg border px-3 py-2" />
      <input v-model="form.address" placeholder="Address" class="rounded-lg border px-3 py-2 md:col-span-2" />
      <button :disabled="saving" class="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white md:col-span-2">{{ saving ? 'Creating...' : 'Create School' }}</button>
    </form>

    <section class="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div v-if="loading" class="p-8 text-center text-slate-500">Loading schools...</div>
      <div v-else-if="!schools.length" class="p-8 text-center text-slate-500">No schools found.</div>

      <div v-else class="divide-y">
        <div v-for="school in schools" :key="school.id" class="grid gap-4 p-5 lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-end">
          <label>
            <span class="mb-1 block text-xs font-semibold uppercase text-slate-500">School</span>
            <input v-model="school.name" class="w-full rounded-lg border px-3 py-2" />
          </label>
          <label>
            <span class="mb-1 block text-xs font-semibold uppercase text-slate-500">Short name</span>
            <input v-model="school.short_name" class="w-full rounded-lg border px-3 py-2" />
          </label>
          <label>
            <span class="mb-1 block text-xs font-semibold uppercase text-slate-500">Email</span>
            <input v-model="school.email" class="w-full rounded-lg border px-3 py-2" />
          </label>
          <button :disabled="saving" class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white" @click="saveSchool(school)">Save</button>
        </div>
      </div>
    </section>
  </main>
</template>
