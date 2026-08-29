<script setup lang="ts">
definePageMeta({ middleware: 'admin' })

const supabase = useSupabaseClient()
const users = ref<any[]>([])
const schools = ref<any[]>([])
const profile = ref<any>(null)
const loading = ref(true)
const savingUserId = ref<string | null>(null)
const search = ref('')
const errorMessage = ref('')
const successMessage = ref('')

const timeoutOptions = [
  { value: 5, label: '5 minutes' }, { value: 10, label: '10 minutes' },
  { value: 15, label: '15 minutes' }, { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' }, { value: 120, label: '2 hours' }, { value: 0, label: 'Never' },
]

const filteredUsers = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return users.value
  return users.value.filter((u:any) => `${u.first_name || ''} ${u.last_name || ''} ${u.email || ''} ${u.role || ''} ${u.school?.name || ''}`.toLowerCase().includes(q))
})

const load = async () => {
  loading.value = true
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: p } = await supabase.from('profiles').select('id,role,school_id').eq('id', user.id).single()
  profile.value = p

  let query = supabase.from('profiles').select('id,email,first_name,last_name,role,active,school_id,idle_timeout_minutes,school:schools(id,name,short_name)').order('last_name').order('first_name')
  if (p?.role !== 'super_admin' && p?.school_id) query = query.eq('school_id', p.school_id)

  const [{ data, error }, schoolResult] = await Promise.all([
    query,
    supabase.from('schools').select('id,name,short_name').eq('active', true).order('name'),
  ])

  if (error) errorMessage.value = error.message
  users.value = data || []
  schools.value = schoolResult.data || []
  loading.value = false
}

const saveUser = async (u:any) => {
  savingUserId.value = u.id
  errorMessage.value = ''
  successMessage.value = ''

  if (u.role === 'super_admin' && profile.value?.role !== 'super_admin') {
    errorMessage.value = 'Only a Super Admin can grant Super Admin access.'
    await load()
    savingUserId.value = null
    return
  }

  const payload:any = { role: u.role, idle_timeout_minutes: Number(u.idle_timeout_minutes ?? 5) }
  if (profile.value?.role === 'super_admin') payload.school_id = u.school_id || null

  const { error } = await supabase.from('profiles').update(payload).eq('id', u.id)
  if (error) errorMessage.value = error.message
  else successMessage.value = 'User updated.'
  savingUserId.value = null
}

onMounted(load)
</script>

<template>
  <main class="mx-auto max-w-7xl px-4 py-8">
    <NuxtLink to="/admin" class="text-sm font-semibold text-blue-600">← Admin Dashboard</NuxtLink>
    <h1 class="mt-3 text-3xl font-bold">Users & Roles</h1>
    <p class="mt-1 text-slate-500">Manage access, school membership and inactivity logout.</p>

    <div v-if="errorMessage" class="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">{{ errorMessage }}</div>
    <div v-if="successMessage" class="mt-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-700">{{ successMessage }}</div>

    <section class="mt-6 rounded-xl border bg-white p-4 shadow-sm">
      <input v-model="search" type="search" placeholder="Search by name, email, role or school..." class="w-full rounded-lg border px-4 py-2.5" />
      <p class="mt-2 text-xs text-slate-500">Showing {{ filteredUsers.length }} of {{ users.length }} users</p>
    </section>

    <section class="mt-5 overflow-hidden rounded-xl border bg-white shadow-sm">
      <div v-if="loading" class="p-8 text-center text-slate-500">Loading users...</div>
      <div v-else-if="!filteredUsers.length" class="p-8 text-center text-slate-500">No users match your search.</div>
      <div v-else class="overflow-x-auto">
        <table class="min-w-full divide-y text-sm">
          <thead class="bg-slate-50"><tr><th class="px-4 py-3 text-left">User</th><th class="px-4 py-3 text-left">School</th><th class="px-4 py-3 text-left">Role</th><th class="px-4 py-3 text-left">Logout</th><th class="px-4 py-3 text-right">Save</th></tr></thead>
          <tbody class="divide-y">
            <tr v-for="u in filteredUsers" :key="u.id">
              <td class="px-4 py-4"><div class="font-semibold">{{ u.first_name }} {{ u.last_name }}</div><div class="text-xs text-slate-500">{{ u.email }}</div></td>
              <td class="px-4 py-4">
                <select v-if="profile?.role === 'super_admin'" v-model.number="u.school_id" class="rounded-lg border px-3 py-2"><option :value="null">No school</option><option v-for="school in schools" :key="school.id" :value="school.id">{{ school.short_name || school.name }}</option></select>
                <span v-else>{{ u.school?.short_name || u.school?.name || '—' }}</span>
              </td>
              <td class="px-4 py-4"><select v-model="u.role" class="rounded-lg border px-3 py-2"><option v-if="profile?.role === 'super_admin'" value="super_admin">Super Admin</option><option value="admin">School Admin</option><option value="teacher">Teacher</option><option value="student">Student</option></select></td>
              <td class="px-4 py-4"><select v-model.number="u.idle_timeout_minutes" class="rounded-lg border px-3 py-2"><option v-for="option in timeoutOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></td>
              <td class="px-4 py-4 text-right"><button :disabled="savingUserId === u.id" class="rounded-lg bg-slate-900 px-3 py-2 font-semibold text-white disabled:opacity-50" @click="saveUser(u)">Save</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</template>
