<script setup lang="ts">
definePageMeta({ middleware: ['admin'] })

const supabase = useSupabaseClient()

type TeacherCsvRow = {
  first_name?: string
  last_name?: string
  email?: string
  temporary_password?: string
}

type ImportResult = {
  row?: number
  email?: string
  ok?: boolean
  action?: string
  error?: string
  temporary_password?: string
}

const teachers = ref<any[]>([])
const loading = ref(false)
const saving = ref(false)
const search = ref('')
const errorMessage = ref('')
const successMessage = ref('')
const showAdd = ref(false)

const importing = ref(false)
const parsedRows = ref<TeacherCsvRow[]>([])
const importResults = ref<ImportResult[]>([])
const importError = ref('')
const importSuccess = ref('')
const currentBatch = ref(0)
const totalBatches = ref(0)
const processedCount = ref(0)

const BATCH_SIZE = 20
const MAX_IMPORT_ROWS = 2000

const form = reactive({
  first_name: '',
  last_name: '',
  email: '',
  temporary_password: '',
})

const filteredTeachers = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return teachers.value
  return teachers.value.filter((teacher) =>
    `${teacher.first_name || ''} ${teacher.last_name || ''} ${teacher.email || ''}`
      .toLowerCase()
      .includes(q)
  )
})

const loadTeachers = async () => {
  loading.value = true
  errorMessage.value = ''

  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,first_name,last_name,role,active,school_id,registration_status,registration_source')
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
    if (!session?.access_token) {
      throw new Error('Authentication required. Please sign out and back in.')
    }

    const result: any = await $fetch('/api/admin/teachers/create', {
      method: 'POST',
      body: { ...form, access_token: session.access_token },
    })

    successMessage.value = `Teacher created. Temporary password: ${result.temporary_password}`
    Object.assign(form, { first_name: '', last_name: '', email: '', temporary_password: '' })
    showAdd.value = false
    await loadTeachers()
  } catch (error: any) {
    errorMessage.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Could not create teacher.'
  } finally {
    saving.value = false
  }
}

const manageRegistration = async (teacher: any, action: 'approve' | 'reject') => {
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Authentication required.')

    await $fetch('/api/admin/teachers/registration', {
      method: 'POST',
      body: {
        action,
        teacher_id: teacher.id,
        access_token: session.access_token,
      },
    })

    successMessage.value = action === 'approve'
      ? `${teacher.first_name} ${teacher.last_name} approved.`
      : `${teacher.first_name} ${teacher.last_name} rejected.`

    await loadTeachers()
  } catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || error?.message || 'Could not update teacher registration.'
  }
}

const toggleActive = async (teacher: any) => {
  errorMessage.value = ''

  const { error } = await supabase
    .from('profiles')
    .update({ active: !teacher.active })
    .eq('id', teacher.id)

  if (error) {
    errorMessage.value = error.message
    return
  }

  successMessage.value = `${teacher.first_name} ${teacher.last_name} ${teacher.active ? 'deactivated' : 'activated'}.`
  await loadTeachers()
}

const parseCsvLine = (line: string): string[] => {
  const values: string[] = []
  let current = ''
  let insideQuotes = false

  for (let index = 0; index < line.length; index++) {
    const character = line[index]

    if (character === '"') {
      if (insideQuotes && line[index + 1] === '"') {
        current += '"'
        index++
      } else {
        insideQuotes = !insideQuotes
      }
      continue
    }

    if (character === ',' && !insideQuotes) {
      values.push(current.trim())
      current = ''
      continue
    }

    current += character
  }

  values.push(current.trim())
  return values
}

const parseCsv = (csvText: string): TeacherCsvRow[] => {
  const lines = csvText
    .replace(/\r/g, '')
    .split('\n')
    .filter((line) => line.trim().length > 0)

  if (lines.length < 2) {
    throw new Error('CSV file does not contain any teacher rows.')
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase())
  const requiredHeaders = ['first_name', 'last_name', 'email']

  for (const required of requiredHeaders) {
    if (!headers.includes(required)) {
      throw new Error(`CSV is missing required column: ${required}`)
    }
  }

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
    const row: Record<string, string> = {}

    headers.forEach((header, columnIndex) => {
      row[header] = values[columnIndex] || ''
    })

    return {
      first_name: row.first_name || '',
      last_name: row.last_name || '',
      email: row.email || '',
      temporary_password: row.temporary_password || '',
    }
  })
}

const handleCsvFile = async (event: Event) => {
  importError.value = ''
  importSuccess.value = ''
  importResults.value = []

  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    const rows = parseCsv(await file.text())

    if (rows.length > MAX_IMPORT_ROWS) {
      throw new Error(`Maximum ${MAX_IMPORT_ROWS} teachers per import.`)
    }

    parsedRows.value = rows
  } catch (error: any) {
    parsedRows.value = []
    importError.value = error?.message || 'Unable to read CSV file.'
  }
}

const importTeachers = async () => {
  importError.value = ''
  importSuccess.value = ''
  importResults.value = []

  if (!parsedRows.value.length) {
    importError.value = 'Select a CSV file first.'
    return
  }

  importing.value = true
  processedCount.value = 0
  currentBatch.value = 0
  totalBatches.value = Math.ceil(parsedRows.value.length / BATCH_SIZE)

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      throw new Error('Authentication required. Please sign out and back in.')
    }

    for (let offset = 0; offset < parsedRows.value.length; offset += BATCH_SIZE) {
      currentBatch.value++
      const batch = parsedRows.value.slice(offset, offset + BATCH_SIZE)

      try {
        const result: any = await $fetch('/api/admin/teachers/import', {
          method: 'POST',
          body: {
            rows: batch,
            access_token: session.access_token,
          },
        })

        const batchResults = Array.isArray(result?.results) ? result.results : []
        importResults.value.push(
          ...batchResults.map((item: ImportResult) => ({
            ...item,
            row: typeof item.row === 'number' ? item.row + offset : undefined,
          }))
        )
      } catch (error: any) {
        console.error(`TEACHER IMPORT BATCH ${currentBatch.value} FAILED:`, error)

        batch.forEach((row, index) => {
          importResults.value.push({
            row: offset + index + 2,
            email: row.email,
            ok: false,
            error:
              error?.data?.statusMessage ||
              error?.data?.message ||
              error?.message ||
              `Batch ${currentBatch.value} failed.`,
          })
        })
      }

      processedCount.value = Math.min(offset + batch.length, parsedRows.value.length)
    }

    const successful = importResults.value.filter((result) => result.ok).length
    const failed = importResults.value.filter((result) => !result.ok).length

    importSuccess.value = `${successful} teacher(s) processed successfully.${failed ? ` ${failed} failed.` : ''}`
    await loadTeachers()
  } catch (error: any) {
    importError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Teacher import failed.'
  } finally {
    importing.value = false
  }
}

const downloadTemplate = () => {
  const template = `first_name,last_name,email,temporary_password\nJohn,Smith,john.smith@school.edu.au,Welcome123!\nSarah,Jones,sarah.jones@school.edu.au,\n`
  const blob = new Blob([template], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'teacher-import-template.csv'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

const clearImport = () => {
  parsedRows.value = []
  importResults.value = []
  importError.value = ''
  importSuccess.value = ''
  currentBatch.value = 0
  totalBatches.value = 0
  processedCount.value = 0
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

      <div class="flex flex-wrap gap-3">
        <button
          type="button"
          class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          @click="downloadTemplate"
        >
          Download CSV Template
        </button>

        <button
          type="button"
          class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          @click="showAdd = !showAdd"
        >
          {{ showAdd ? 'Cancel' : 'Add Teacher' }}
        </button>
      </div>
    </div>

    <div v-if="errorMessage" class="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
      {{ errorMessage }}
    </div>

    <div v-if="successMessage" class="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-700">
      {{ successMessage }}
    </div>

    <section v-if="showAdd" class="mb-6 rounded-xl border bg-white p-6 shadow-sm">
      <h2 class="text-xl font-bold">Add Teacher</h2>
      <div class="mt-5 grid gap-4 md:grid-cols-2">
        <label>
          <span class="mb-1 block text-sm font-semibold">First name</span>
          <input v-model="form.first_name" class="w-full rounded-lg border px-3 py-2" />
        </label>
        <label>
          <span class="mb-1 block text-sm font-semibold">Last name</span>
          <input v-model="form.last_name" class="w-full rounded-lg border px-3 py-2" />
        </label>
        <label>
          <span class="mb-1 block text-sm font-semibold">Email</span>
          <input v-model="form.email" type="email" class="w-full rounded-lg border px-3 py-2" />
        </label>
        <label>
          <span class="mb-1 block text-sm font-semibold">Temporary password</span>
          <input v-model="form.temporary_password" placeholder="Leave blank to generate" class="w-full rounded-lg border px-3 py-2" />
        </label>
      </div>
      <div class="mt-5 flex justify-end">
        <button
          :disabled="saving"
          class="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          @click="addTeacher"
        >
          {{ saving ? 'Creating...' : 'Create Teacher' }}
        </button>
      </div>
    </section>

    <section class="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 class="text-xl font-bold text-slate-900">Import Teachers</h2>
          <p class="mt-1 text-sm text-slate-500">
            Import up to {{ MAX_IMPORT_ROWS }} teachers from CSV. Large imports are processed in batches of {{ BATCH_SIZE }}.
          </p>
        </div>
      </div>

      <div class="mt-5 grid gap-4 lg:grid-cols-[1fr_auto]">
        <input
          type="file"
          accept=".csv,text/csv"
          class="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          :disabled="importing"
          @change="handleCsvFile"
        />

        <button
          type="button"
          class="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="importing || !parsedRows.length"
          @click="importTeachers"
        >
          {{ importing ? 'Importing...' : `Import ${parsedRows.length || ''} Teachers` }}
        </button>
      </div>

      <div v-if="parsedRows.length" class="mt-4 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">
        {{ parsedRows.length }} teacher row(s) ready for import.
      </div>

      <div v-if="importing" class="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="font-semibold text-blue-900">Importing teachers...</p>
            <p class="mt-1 text-sm text-blue-700">Batch {{ currentBatch }} of {{ totalBatches }}</p>
          </div>
          <div class="text-right">
            <p class="text-lg font-bold text-blue-900">{{ processedCount }} / {{ parsedRows.length }}</p>
            <p class="text-xs text-blue-700">processed</p>
          </div>
        </div>
        <div class="mt-3 h-3 overflow-hidden rounded-full bg-blue-100">
          <div
            class="h-full rounded-full bg-blue-600 transition-all duration-300"
            :style="{
              width: parsedRows.length
                ? `${Math.round((processedCount / parsedRows.length) * 100)}%`
                : '0%',
            }"
          />
        </div>
      </div>

      <div v-if="importError" class="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {{ importError }}
      </div>

      <div v-if="importSuccess" class="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
        {{ importSuccess }}
      </div>

      <div v-if="importResults.length" class="mt-6">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="font-bold text-slate-900">Import Results</h3>
          <button type="button" class="text-sm font-semibold text-slate-500" @click="clearImport">Clear</button>
        </div>

        <div class="max-h-96 overflow-auto rounded-lg border border-slate-200">
          <table class="sst-dark-table min-w-full divide-y divide-slate-200 text-sm">
            <thead class="sticky top-0 bg-slate-50">
              <tr>
                <th class="px-4 py-3 text-left font-semibold">Row</th>
                <th class="px-4 py-3 text-left font-semibold">Email</th>
                <th class="px-4 py-3 text-left font-semibold">Status</th>
                <th class="px-4 py-3 text-left font-semibold">Details</th>
                <th class="px-4 py-3 text-left font-semibold">Password</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              <tr v-for="(result, index) in importResults" :key="`${result.email}-${index}`">
                <td class="px-4 py-3">{{ result.row }}</td>
                <td class="px-4 py-3">{{ result.email }}</td>
                <td class="px-4 py-3">
                  <span v-if="result.ok" class="rounded-full bg-green-100 px-2 py-1 text-xs font-bold text-green-700">Success</span>
                  <span v-else class="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700">Failed</span>
                </td>
                <td class="px-4 py-3">
                  <span v-if="result.ok">{{ result.action || 'Processed' }}</span>
                  <span v-else class="text-red-700">{{ result.error }}</span>
                </td>
                <td class="px-4 py-3 font-mono text-xs">{{ result.temporary_password || '' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section class="mb-6 rounded-xl border bg-white p-4 shadow-sm">
      <input
        v-model="search"
        type="search"
        placeholder="Search teachers by name or email..."
        class="w-full rounded-lg border px-3 py-2"
      />
    </section>

    <section class="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div v-if="loading" class="p-8 text-center text-slate-500">Loading teachers...</div>

      <div v-else-if="!filteredTeachers.length" class="p-10 text-center">
        <div class="text-lg font-semibold">No teachers found</div>
        <p class="mt-1 text-sm text-slate-500">Add your first teacher account to assign teachers to sporting events.</p>
        <button class="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white" @click="showAdd = true">
          Add Teacher
        </button>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="sst-dark-table min-w-full divide-y text-sm">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-4 py-3 text-left">Teacher</th>
              <th class="px-4 py-3 text-left">Email</th>
              <th class="px-4 py-3 text-left">Status</th>
              <th class="px-4 py-3 text-left">Registration</th>
              <th class="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr v-for="teacher in filteredTeachers" :key="teacher.id">
              <td class="px-4 py-4 font-semibold">{{ teacher.first_name }} {{ teacher.last_name }}</td>
              <td class="px-4 py-4 text-slate-600">{{ teacher.email }}</td>
              <td class="px-4 py-4">
                <span
                  class="rounded-full px-2 py-1 text-xs font-bold"
                  :class="teacher.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'"
                >
                  {{ teacher.active ? 'Active' : 'Inactive' }}
                </span>
              </td>
              <td class="px-4 py-4">
                <span
                  class="rounded-full px-2 py-1 text-xs font-bold capitalize"
                  :class="teacher.registration_status === 'pending'
                    ? 'bg-amber-100 text-amber-700'
                    : teacher.registration_status === 'rejected'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-green-100 text-green-700'"
                >
                  {{ teacher.registration_status || 'approved' }}
                </span>
                <div v-if="teacher.registration_source === 'self_registration'" class="mt-1 text-xs text-slate-400">Self registered</div>
              </td>
              <td class="px-4 py-4 text-right">
                <div class="flex flex-wrap justify-end gap-2">
                  <button
                    v-if="teacher.registration_status === 'pending'"
                    class="rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white"
                    @click="manageRegistration(teacher, 'approve')"
                  >Approve</button>
                  <button
                    v-if="teacher.registration_status === 'pending'"
                    class="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
                    @click="manageRegistration(teacher, 'reject')"
                  >Reject</button>
                  <button class="rounded-lg border px-3 py-2 text-xs font-semibold" @click="toggleActive(teacher)">
                    {{ teacher.active ? 'Deactivate' : 'Activate' }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</template>
