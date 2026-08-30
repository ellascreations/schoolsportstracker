<script setup lang="ts">
definePageMeta({ middleware: 'admin' })

const supabase = useSupabaseClient()
const schools = ref<any[]>([])
const domains = ref<any[]>([])
const profile = ref<any>(null)
const globalSettings = ref<any>({ teacher_email_verification_required: true })
const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const showAdd = ref(false)
const domainInputs = reactive<Record<number,string>>({})

const form = reactive({
  name: '', short_name: '', email: '', phone: '', address: '',
  teacher_self_registration_mode: 'admin_approval',
})

const getSessionToken = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Authentication required.')
  return session.access_token
}

const schoolDomains = (schoolId:number) => domains.value.filter((d:any)=>Number(d.school_id)===Number(schoolId))

const load = async () => {
  loading.value = true
  errorMessage.value = ''
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Authentication required.')

    const [profileResult, schoolsResult, domainsResult, publicSettings]:any = await Promise.all([
      supabase.from('profiles').select('id,role,school_id').eq('id', user.id).single(),
      supabase.from('schools').select('id,name,short_name,email,phone,address,active,created_at,teacher_self_registration_mode').order('name'),
      supabase.from('school_domains').select('id,school_id,domain,active').eq('active', true).order('domain'),
      $fetch('/api/public/teacher-registration'),
    ])

    if (profileResult.error) throw profileResult.error
    if (schoolsResult.error) throw schoolsResult.error
    if (domainsResult.error) throw domainsResult.error

    profile.value = profileResult.data
    schools.value = schoolsResult.data || []
    domains.value = domainsResult.data || []
    globalSettings.value.teacher_email_verification_required = publicSettings.teacher_email_verification_required
  } catch (e:any) {
    errorMessage.value = e?.message || 'Could not load schools.'
  } finally { loading.value = false }
}

const api = async (body:any) => $fetch('/api/admin/schools/manage', {
  method:'POST', body:{ ...body, access_token: await getSessionToken() }
})

const createSchool = async () => {
  errorMessage.value=''; successMessage.value=''
  if (!form.name.trim()) return errorMessage.value='School name is required.'
  saving.value=true
  try {
    const result:any = await api({ action:'create', school:form })
    successMessage.value=`${result.school.name} created.`
    Object.assign(form,{ name:'',short_name:'',email:'',phone:'',address:'',teacher_self_registration_mode:'admin_approval' })
    showAdd.value=false
    await load()
  } catch(e:any) { errorMessage.value=e?.data?.statusMessage||e?.message||'Could not create school.' }
  finally { saving.value=false }
}

const saveSchool = async (school:any) => {
  errorMessage.value=''; successMessage.value=''; saving.value=true
  try {
    await api({ action:'update', school_id:school.id, school })
    successMessage.value='School updated.'
  } catch(e:any) { errorMessage.value=e?.data?.statusMessage||e?.message||'Could not update school.' }
  finally { saving.value=false }
}

const addDomain = async (school:any) => {
  const domain=String(domainInputs[school.id]||'').trim()
  if (!domain) return
  errorMessage.value=''; successMessage.value=''
  try {
    await api({ action:'add_domain', school_id:school.id, domain })
    domainInputs[school.id]=''
    successMessage.value='School domain added.'
    await load()
  } catch(e:any) { errorMessage.value=e?.data?.statusMessage||e?.message||'Could not add domain.' }
}

const removeDomain = async (domain:any) => {
  errorMessage.value=''; successMessage.value=''
  try {
    await api({ action:'remove_domain', domain_id:domain.id })
    successMessage.value='School domain removed.'
    await load()
  } catch(e:any) { errorMessage.value=e?.data?.statusMessage||e?.message||'Could not remove domain.' }
}

const saveGlobalVerification = async () => {
  errorMessage.value=''; successMessage.value=''
  try {
    await api({
      action:'update_global_registration_settings',
      teacher_email_verification_required: globalSettings.value.teacher_email_verification_required,
    })
    successMessage.value='Teacher email verification setting updated.'
  } catch(e:any) { errorMessage.value=e?.data?.statusMessage||e?.message||'Could not update verification setting.' }
}

onMounted(load)
</script>

<template>
  <main class="mx-auto max-w-7xl px-4 py-8">
    <div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <NuxtLink to="/admin" class="text-sm font-semibold text-blue-600">← Admin Dashboard</NuxtLink>
        <h1 class="mt-3 text-3xl font-bold">Schools</h1>
        <p class="mt-1 text-slate-500">Manage schools, approved email domains and teacher self-registration.</p>
      </div>
      <button v-if="profile?.role === 'super_admin'" class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white" @click="showAdd=!showAdd">
        {{ showAdd ? 'Cancel' : 'Add School' }}
      </button>
    </div>

    <div v-if="errorMessage" class="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">{{ errorMessage }}</div>
    <div v-if="successMessage" class="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-700">{{ successMessage }}</div>

    <section v-if="profile?.role === 'super_admin'" class="mb-6 rounded-xl border border-violet-200 bg-violet-50 p-5">
      <h2 class="text-lg font-bold text-violet-950">Platform Teacher Registration</h2>
      <div class="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div class="font-semibold">Require Supabase email verification</div>
          <p class="text-sm text-violet-800">When disabled, self-registered teacher accounts are created as email-confirmed and Supabase sends no verification email.</p>
        </div>
        <label class="flex items-center gap-3 rounded-lg bg-white px-4 py-3 shadow-sm">
          <input v-model="globalSettings.teacher_email_verification_required" type="checkbox" class="h-5 w-5" @change="saveGlobalVerification" />
          <span class="font-semibold">{{ globalSettings.teacher_email_verification_required ? 'Required' : 'Disabled' }}</span>
        </label>
      </div>
    </section>

    <form v-if="showAdd" class="mb-6 grid gap-4 rounded-xl border bg-white p-5 md:grid-cols-2" @submit.prevent="createSchool">
      <input v-model="form.name" required placeholder="School name" class="rounded-lg border px-3 py-2" />
      <input v-model="form.short_name" placeholder="Short name / abbreviation" class="rounded-lg border px-3 py-2" />
      <input v-model="form.email" type="email" placeholder="School email" class="rounded-lg border px-3 py-2" />
      <input v-model="form.phone" placeholder="Phone" class="rounded-lg border px-3 py-2" />
      <input v-model="form.address" placeholder="Address" class="rounded-lg border px-3 py-2 md:col-span-2" />
      <select v-model="form.teacher_self_registration_mode" class="rounded-lg border px-3 py-2 md:col-span-2">
        <option value="disabled">Teacher self-registration disabled</option>
        <option value="admin_approval">Domain matched + Admin approval</option>
        <option value="auto_approve">Domain matched + automatic approval</option>
      </select>
      <button :disabled="saving" class="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white md:col-span-2">{{ saving ? 'Creating...' : 'Create School' }}</button>
    </form>

    <section class="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div v-if="loading" class="p-8 text-center text-slate-500">Loading schools...</div>
      <div v-else-if="!schools.length" class="p-8 text-center text-slate-500">No schools found.</div>
      <div v-else class="divide-y">
        <div v-for="school in schools" :key="school.id" class="p-5">
          <div class="grid gap-4 lg:grid-cols-3">
            <label><span class="mb-1 block text-xs font-semibold uppercase text-slate-500">School</span><input v-model="school.name" class="w-full rounded-lg border px-3 py-2" /></label>
            <label><span class="mb-1 block text-xs font-semibold uppercase text-slate-500">Short name</span><input v-model="school.short_name" class="w-full rounded-lg border px-3 py-2" /></label>
            <label><span class="mb-1 block text-xs font-semibold uppercase text-slate-500">Registration</span>
              <select v-model="school.teacher_self_registration_mode" class="w-full rounded-lg border px-3 py-2">
                <option value="disabled">Disabled</option>
                <option value="admin_approval">Domain + Admin approval</option>
                <option value="auto_approve">Domain + Auto approve</option>
              </select>
            </label>
          </div>

          <div class="mt-4 rounded-lg bg-slate-50 p-4">
            <div class="mb-2 text-sm font-bold text-slate-700">Approved Teacher Email Domains</div>
            <div class="mb-3 flex flex-wrap gap-2">
              <span v-for="domain in schoolDomains(school.id)" :key="domain.id" class="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm shadow-sm">
                @{{ domain.domain }}
                <button type="button" class="font-bold text-red-500" @click="removeDomain(domain)">×</button>
              </span>
              <span v-if="!schoolDomains(school.id).length" class="text-sm text-slate-500">No domains configured — teacher registration cannot be used.</span>
            </div>
            <div class="flex gap-2">
              <input v-model="domainInputs[school.id]" placeholder="school.edu.au" class="min-w-0 flex-1 rounded-lg border px-3 py-2" @keyup.enter="addDomain(school)" />
              <button type="button" class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white" @click="addDomain(school)">Add Domain</button>
            </div>
          </div>

          <div class="mt-4 flex justify-end"><button :disabled="saving" class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white" @click="saveSchool(school)">Save School</button></div>
        </div>
      </div>
    </section>
  </main>
</template>
