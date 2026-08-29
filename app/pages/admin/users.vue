<script setup lang="ts">
definePageMeta({
  middleware: 'admin',
})

const supabase = useSupabaseClient()

const users = ref<any[]>([])
const loading = ref(false)
const savingUserId = ref<string | null>(null)
const errorMessage = ref('')
const successMessage = ref('')

const timeoutOptions = [
  { value: 5, label: '5 minutes' },
  { value: 10, label: '10 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
  { value: 0, label: 'Never' },
]

const load = async () => {
  loading.value = true
  errorMessage.value = ''

  const { data, error } = await supabase
    .from('profiles')
    .select(`
      id,
      email,
      first_name,
      last_name,
      role,
      active,
      idle_timeout_minutes
    `)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })

  if (error) {
    console.error('LOAD USERS ERROR:', error)
    errorMessage.value = error.message
    users.value = []
  } else {
    users.value = (data || []).map((user: any) => ({
      ...user,
      idle_timeout_minutes:
        user.idle_timeout_minutes === null ||
        user.idle_timeout_minutes === undefined
          ? 5
          : Number(user.idle_timeout_minutes),
    }))
  }

  loading.value = false
}

const saveUser = async (user: any, field: 'role' | 'idle_timeout_minutes') => {
  errorMessage.value = ''
  successMessage.value = ''
  savingUserId.value = user.id

  try {
    const payload =
      field === 'role'
        ? { role: user.role }
        : { idle_timeout_minutes: Number(user.idle_timeout_minutes) }

    const { error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', user.id)

    if (error) {
      throw error
    }

    const name =
      `${user.first_name || ''} ${user.last_name || ''}`.trim() ||
      user.email

    successMessage.value =
      field === 'role'
        ? `${name}'s role has been updated.`
        : `${name}'s automatic logout setting has been updated.`
  } catch (error: any) {
    console.error('UPDATE USER ERROR:', error)
    errorMessage.value =
      error?.message ||
      'Could not update this user.'

    await load()
  } finally {
    savingUserId.value = null
  }
}

onMounted(load)
</script>

<template>
  <main class="mx-auto max-w-7xl px-4 py-8">
    <div class="mb-8">
      <NuxtLink
        to="/admin"
        class="text-sm font-semibold text-blue-600 hover:text-blue-700"
      >
        ← Admin Dashboard
      </NuxtLink>

      <h1 class="mt-3 text-3xl font-bold text-slate-900">
        Users & Roles
      </h1>

      <p class="mt-1 text-slate-500">
        Manage user roles and automatic logout times.
        New users default to 5 minutes of inactivity.
      </p>
    </div>

    <div
      v-if="errorMessage"
      class="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700"
    >
      {{ errorMessage }}
    </div>

    <div
      v-if="successMessage"
      class="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-700"
    >
      {{ successMessage }}
    </div>

    <section class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div
        v-if="loading"
        class="p-8 text-center text-slate-500"
      >
        Loading users...
      </div>

      <div
        v-else-if="!users.length"
        class="p-8 text-center text-slate-500"
      >
        No users found.
      </div>

      <div v-else class="overflow-x-auto">
        <table class="min-w-full divide-y divide-slate-200 text-sm">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-4 py-3 text-left font-semibold text-slate-600">
                User
              </th>

              <th class="px-4 py-3 text-left font-semibold text-slate-600">
                Role
              </th>

              <th class="px-4 py-3 text-left font-semibold text-slate-600">
                Automatic logout
              </th>

              <th class="px-4 py-3 text-left font-semibold text-slate-600">
                Status
              </th>
            </tr>
          </thead>

          <tbody class="divide-y divide-slate-100">
            <tr
              v-for="user in users"
              :key="user.id"
            >
              <td class="px-4 py-4">
                <div class="font-semibold text-slate-900">
                  {{ user.first_name }} {{ user.last_name }}
                </div>

                <div class="text-xs text-slate-500">
                  {{ user.email }}
                </div>
              </td>

              <td class="px-4 py-4">
                <select
                  v-model="user.role"
                  :disabled="savingUserId === user.id"
                  class="rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:opacity-50"
                  @change="saveUser(user, 'role')"
                >
                  <option value="admin">
                    Admin
                  </option>
                  <option value="teacher">
                    Teacher
                  </option>
                  <option value="student">
                    Student
                  </option>
                </select>
              </td>

              <td class="px-4 py-4">
                <select
                  v-model.number="user.idle_timeout_minutes"
                  :disabled="savingUserId === user.id"
                  class="rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:opacity-50"
                  @change="saveUser(user, 'idle_timeout_minutes')"
                >
                  <option
                    v-for="option in timeoutOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>

                <div class="mt-1 text-xs text-slate-400">
                  Time is reset when the user is active.
                </div>
              </td>

              <td class="px-4 py-4">
                <span
                  class="rounded-full px-2 py-1 text-xs font-bold"
                  :class="
                    user.active
                      ? 'bg-green-100 text-green-700'
                      : 'bg-slate-100 text-slate-600'
                  "
                >
                  {{ user.active ? 'Active' : 'Inactive' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</template>
