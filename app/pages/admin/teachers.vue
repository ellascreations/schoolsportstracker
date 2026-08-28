<script setup lang="ts">
definePageMeta({ middleware: ['admin'] })

const supabase = useSupabaseClient()
const teachers = ref<any[]>([])
const loading = ref(false)
const saving = ref(false)
const search = ref('')
const errorMessage = ref('')
const successMessage = ref('')
const showAdd = ref(false)
const form = reactive({ first_name: '', last_name: '', email: '', temporary_password: '' })

const filteredTeachers = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return teachers.value
  return teachers.value.filter((t) =>
    `${t.first_name || ''} ${t.last_name || ''} ${t.email || ''}`.toLowerCase().includes(q)
  )
})

const loadTeachers = async () => {
  loading.value = true
  errorMessage.value = ''
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,first_name,last_name,role,active')
    .eq('role', 'teacher')
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })

  if (error) {
    errorMessage.value = error.message
    teachers.value = []
  } else {
    teachers.value = data || []
  }
  loading.value = false
}

const addTeacher = async () => {
  errorMessage.value = ''
  successMessage.value = ''
  if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim()) {
    errorMessage.value = 'First name, last name and email are required.'
    return
  }

  saving.value = true
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Authentication required. Please sign out and back in.')

    const result: any = await $fetch('/api/admin/teachers/create', {
      method: 'POST',
      body: { ...form, access_token: session.access_token },
    })

    successMessage.value = `Teacher created. Temporary password: ${result.temporary_password}`
    Object.assign(form, { first_name: '', last_name: '', email: '', temporary_password: '' })
    showAdd.value = false
    await loadTeachers()
  } catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || error?.data?.message || error?.message || 'Could not create teacher.'
  } finally {
    saving.value = false
  }
}

const toggleActive = async (teacher: any) => {
  errorMessage.value = ''
  const { error } = await supabase.from('profiles').update({ active: !teacher.active }).eq('id', teacher.id)
  if (error) {
    errorMessage.value = error.message
    return
  }
  successMessage.value = `${teacher.first_name} ${teacher.last_name} ${teacher.active ? 'deactivated' : 'activated'}.`
  await loadTeachers()
}

onMounted(loadTeachers)
</script>

<template>
  <main class="mx-auto max-w-7xl px-4 py-8">
    <div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <NuxtLink to="/admin" class="text-sm font-semibold text-blue-600">← Admin Dashboard</NuxtLink>
        <h1 class="mt-3 text-3xl font-bold">Teachers</h1>
        <p class="mt-1 text-slate-500">Manage teacher accounts and access to sports events.</p>
      </div>
      <button class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white" @click="showAdd = !showAdd">
        {{ showAdd ? 'Cancel' : 'Add Teacher' }}
      </button>
    </div>

    <div v-if="errorMessage" class="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">{{ errorMessage }}</div>
    <div v-if="successMessage" class="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-700">{{ successMessage }}</div>

    <section v-if="showAdd" class="mb-6 rounded-xl border bg-white p-6 shadow-sm">
      <h2 class="text-xl font-bold">Add Teacher</h2>
      <div class="mt-5 grid gap-4 md:grid-cols-2">
        <label><span class="mb-1 block text-sm font-semibold">First name</span><input v-model="form.first_name" class="w-full rounded-lg border px-3 py-2" /></label>
        <label><span class="mb-1 block text-sm font-semibold">Last name</span><input v-model="form.last_name" class="w-full rounded-lg border px-3 py-2" /></label>
        <label><span class="mb-1 block text-sm font-semibold">Email</span><input v-model="form.email" type="email" class="w-full rounded-lg border px-3 py-2" /></label>
        <label><span class="mb-1 block text-sm font-semibold">Temporary password</span><input v-model="form.temporary_password" placeholder="Leave blank to generate" class="w-full rounded-lg border px-3 py-2" /></label>
      </div>
      <div class="mt-5 flex justify-end">
        <button :disabled="saving" class="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50" @click="addTeacher">
          {{ saving ? 'Creating...' : 'Create Teacher' }}
        </button>
      </div>
    </section>

    <section class="mb-6 rounded-xl border bg-white p-4 shadow-sm">
      <input v-model="search" type="search" placeholder="Search teachers by name or email..." class="w-full rounded-lg border px-3 py-2" />
    </section>

    <section class="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div v-if="loading" class="p-8 text-center text-slate-500">Loading teachers...</div>
      <div v-else-if="!filteredTeachers.length" class="p-10 text-center">
        <div class="text-lg font-semibold">No teachers found</div>
        <p class="mt-1 text-sm text-slate-500">Add your first teacher account to assign teachers to sporting events.</p>
        <button class="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white" @click="showAdd = true">Add Teacher</button>
      </div>
      <div v-else class="overflow-x-auto">
        <table class="min-w-full divide-y text-sm">
          <thead class="bg-slate-50"><tr>
            <th class="px-4 py-3 text-left">Teacher</th><th class="px-4 py-3 text-left">Email</th>
            <th class="px-4 py-3 text-left">Status</th><th class="px-4 py-3 text-right">Actions</th>
          </tr></thead>
          <tbody class="divide-y">
            <tr v-for="teacher in filteredTeachers" :key="teacher.id">
              <td class="px-4 py-4 font-semibold">{{ teacher.first_name }} {{ teacher.last_name }}</td>
              <td class="px-4 py-4 text-slate-600">{{ teacher.email }}</td>
              <td class="px-4 py-4"><span class="rounded-full px-2 py-1 text-xs font-bold" :class="teacher.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'">{{ teacher.active ? 'Active' : 'Inactive' }}</span></td>
              <td class="px-4 py-4 text-right"><button class="rounded-lg border px-3 py-2 text-xs font-semibold" @click="toggleActive(teacher)">{{ teacher.active ? 'Deactivate' : 'Activate' }}</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</template>
