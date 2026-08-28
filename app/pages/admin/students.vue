```vue
<script setup lang="ts">
definePageMeta({
  middleware: ['admin'],
})

const supabase = useSupabaseClient()

type StudentRow = {
  student_number?: string
  first_name?: string
  last_name?: string
  email?: string
  year_level?: string | number | null
  house?: string
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

const students = ref<any[]>([])
const houses = ref<any[]>([])

const loading = ref(false)
const importing = ref(false)

const search = ref('')
const yearFilter = ref('')
const houseFilter = ref('')

const parsedRows = ref<StudentRow[]>([])
const importResults = ref<ImportResult[]>([])

const importError = ref('')
const importSuccess = ref('')

const currentBatch = ref(0)
const totalBatches = ref(0)
const processedCount = ref(0)

const BATCH_SIZE = 20
const MAX_IMPORT_ROWS = 2000

const loadStudents = async () => {
  loading.value = true

  try {
    let query = supabase
      .from('profiles')
      .select(`
        id,
        email,
        first_name,
        last_name,
        student_number,
        year_level,
        house_id,
        role,
        active,
        houses (
          id,
          name
        )
      `)
      .eq('role', 'student')
      .order('year_level', { ascending: true })
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true })

    if (search.value.trim()) {
      const value = search.value.trim()

      query = query.or(
        `first_name.ilike.%${value}%,last_name.ilike.%${value}%,email.ilike.%${value}%,student_number.ilike.%${value}%`
      )
    }

    if (yearFilter.value) {
      query = query.eq(
        'year_level',
        Number(yearFilter.value)
      )
    }

    if (houseFilter.value) {
      query = query.eq(
        'house_id',
        houseFilter.value
      )
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    students.value = data || []
  } catch (error) {
    console.error(
      'LOAD STUDENTS ERROR:',
      error
    )
  } finally {
    loading.value = false
  }
}

const loadHouses = async () => {
  const { data, error } = await supabase
    .from('houses')
    .select('id, name')
    .eq('active', true)
    .order('name')

  if (error) {
    console.error(
      'LOAD HOUSES ERROR:',
      error
    )

    return
  }

  houses.value = data || []
}

const parseCsvLine = (
  line: string
): string[] => {
  const values: string[] = []

  let current = ''
  let insideQuotes = false

  for (
    let index = 0;
    index < line.length;
    index++
  ) {
    const character = line[index]

    if (character === '"') {
      if (
        insideQuotes &&
        line[index + 1] === '"'
      ) {
        current += '"'
        index++
      } else {
        insideQuotes = !insideQuotes
      }

      continue
    }

    if (
      character === ',' &&
      !insideQuotes
    ) {
      values.push(current.trim())
      current = ''
      continue
    }

    current += character
  }

  values.push(current.trim())

  return values
}

const parseCsv = (
  csvText: string
): StudentRow[] => {
  const lines = csvText
    .replace(/\r/g, '')
    .split('\n')
    .filter(
      line => line.trim().length > 0
    )

  if (lines.length < 2) {
    throw new Error(
      'CSV file does not contain any student rows.'
    )
  }

  const headers = parseCsvLine(
    lines[0]
  ).map(header =>
    header
      .trim()
      .toLowerCase()
  )

  const requiredHeaders = [
    'first_name',
    'last_name',
    'email',
  ]

  for (const required of requiredHeaders) {
    if (!headers.includes(required)) {
      throw new Error(
        `CSV is missing required column: ${required}`
      )
    }
  }

  const rows: StudentRow[] = []

  for (
    let index = 1;
    index < lines.length;
    index++
  ) {
    const values = parseCsvLine(
      lines[index]
    )

    const row: Record<
      string,
      string
    > = {}

    headers.forEach(
      (header, columnIndex) => {
        row[header] =
          values[columnIndex] || ''
      }
    )

    rows.push({
      student_number:
        row.student_number || '',
      first_name:
        row.first_name || '',
      last_name:
        row.last_name || '',
      email:
        row.email || '',
      year_level:
        row.year_level || '',
      house:
        row.house || '',
      temporary_password:
        row.temporary_password || '',
    })
  }

  return rows
}

const handleCsvFile = async (
  event: Event
) => {
  importError.value = ''
  importSuccess.value = ''
  importResults.value = []

  const input =
    event.target as HTMLInputElement

  const file =
    input.files?.[0]

  if (!file) {
    return
  }

  try {
    const text =
      await file.text()

    const rows =
      parseCsv(text)

    if (
      rows.length >
      MAX_IMPORT_ROWS
    ) {
      throw new Error(
        `Maximum ${MAX_IMPORT_ROWS} students per import.`
      )
    }

    parsedRows.value = rows
  } catch (error: any) {
    parsedRows.value = []

    importError.value =
      error?.message ||
      'Unable to read CSV file.'
  }
}

const importStudents = async () => {
  importError.value = ''
  importSuccess.value = ''
  importResults.value = []

  if (!parsedRows.value.length) {
    importError.value =
      'Select a CSV file first.'

    return
  }

  if (
    parsedRows.value.length >
    MAX_IMPORT_ROWS
  ) {
    importError.value =
      `Maximum ${MAX_IMPORT_ROWS} students per import.`

    return
  }

  importing.value = true

  processedCount.value = 0
  currentBatch.value = 0

  totalBatches.value =
    Math.ceil(
      parsedRows.value.length /
        BATCH_SIZE
    )

  try {
    const {
      data: { session },
    } =
      await supabase.auth.getSession()

    if (!session?.access_token) {
      throw new Error(
        'Authentication required.'
      )
    }

    for (
      let offset = 0;
      offset <
      parsedRows.value.length;
      offset += BATCH_SIZE
    ) {
      currentBatch.value++

      const batch =
        parsedRows.value.slice(
          offset,
          offset + BATCH_SIZE
        )

      const result: any =
        await $fetch(
          '/api/admin/students/import',
          {
            method: 'POST',

            body: {
              rows: batch,

              access_token:
                session.access_token,
            },
          }
        )

      const batchResults =
        Array.isArray(
          result?.results
        )
          ? result.results
          : []

      /*
       * Make row numbers refer to the
       * original CSV rather than restarting
       * at row 2 for each batch.
       */
      const adjustedResults =
        batchResults.map(
          (
            item: ImportResult
          ) => ({
            ...item,

            row:
              typeof item.row ===
              'number'
                ? item.row +
                  offset
                : undefined,
          })
        )

      importResults.value.push(
        ...adjustedResults
      )

      processedCount.value =
        Math.min(
          offset +
            batch.length,

          parsedRows.value.length
        )
    }

    const successful =
      importResults.value.filter(
        result =>
          result.ok
      ).length

    const failed =
      importResults.value.filter(
        result =>
          !result.ok
      ).length

    importSuccess.value =
      `${successful} student(s) processed successfully.` +
      (
        failed
          ? ` ${failed} failed.`
          : ''
      )

    await loadStudents()
  } catch (error: any) {
    console.error(
      'STUDENT IMPORT ERROR:',
      error
    )

    importError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.statusMessage ||
      error?.message ||
      'Student import failed.'
  } finally {
    importing.value = false
  }
}

const downloadTemplate = () => {
  const template =
`student_number,first_name,last_name,email,year_level,house,temporary_password
S00123,Jack,Brown,jack.brown@school.edu.au,8,Red House,Welcome123!
S00124,Sarah,Jones,sarah.jones@school.edu.au,8,Blue House,Welcome123!
`

  const blob =
    new Blob(
      [template],
      {
        type:
          'text/csv;charset=utf-8',
      }
    )

  const url =
    URL.createObjectURL(blob)

  const anchor =
    document.createElement('a')

  anchor.href = url

  anchor.download =
    'student-import-template.csv'

  document.body.appendChild(
    anchor
  )

  anchor.click()

  document.body.removeChild(
    anchor
  )

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

const toggleStudentActive = async (
  student: any
) => {
  const { error } =
    await supabase
      .from('profiles')
      .update({
        active:
          !student.active,
      })
      .eq('id', student.id)

  if (error) {
    console.error(
      'STUDENT UPDATE ERROR:',
      error
    )

    return
  }

  await loadStudents()
}

watch(
  [
    search,
    yearFilter,
    houseFilter,
  ],
  () => {
    loadStudents()
  }
)

onMounted(async () => {
  await Promise.all([
    loadStudents(),
    loadHouses(),
  ])
})
</script>

<template>
  <main
    class="mx-auto max-w-7xl px-4 py-8"
  >
    <div
      class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <NuxtLink
          to="/admin"
          class="text-sm font-semibold text-blue-600 hover:text-blue-700"
        >
          ← Admin Dashboard
        </NuxtLink>

        <h1
          class="mt-3 text-3xl font-bold text-slate-900"
        >
          Students
        </h1>

        <p
          class="mt-1 text-slate-500"
        >
          Manage student accounts,
          houses and year levels.
        </p>
      </div>

      <div
        class="flex flex-wrap gap-3"
      >
        <button
          type="button"
          class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          @click="downloadTemplate"
        >
          Download CSV Template
        </button>

        <NuxtLink
          to="/admin/students/new"
          class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Add Student
        </NuxtLink>
      </div>
    </div>

    <!-- CSV Import -->

    <section
      class="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div
        class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
      >
        <div>
          <h2
            class="text-xl font-bold text-slate-900"
          >
            Import Students
          </h2>

          <p
            class="mt-1 text-sm text-slate-500"
          >
            Import up to
            {{ MAX_IMPORT_ROWS }}
            students from a CSV file.
            Large imports are
            automatically processed in
            batches of
            {{ BATCH_SIZE }}.
          </p>
        </div>
      </div>

      <div
        class="mt-5 grid gap-4 lg:grid-cols-[1fr_auto]"
      >
        <input
          type="file"
          accept=".csv,text/csv"
          class="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
          :disabled="importing"
          @change="handleCsvFile"
        />

        <button
          type="button"
          class="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="
            importing ||
            !parsedRows.length
          "
          @click="importStudents"
        >
          {{
            importing
              ? 'Importing...'
              : `Import ${parsedRows.length || ''} Students`
          }}
        </button>
      </div>

      <div
        v-if="parsedRows.length"
        class="mt-4 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800"
      >
        {{
          parsedRows.length
        }}
        student row(s) ready
        for import.
      </div>

      <!-- Progress -->

      <div
        v-if="importing"
        class="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4"
      >
        <div
          class="flex items-center justify-between gap-4"
        >
          <div>
            <p
              class="font-semibold text-blue-900"
            >
              Importing students...
            </p>

            <p
              class="mt-1 text-sm text-blue-700"
            >
              Batch
              {{ currentBatch }}
              of
              {{ totalBatches }}
            </p>
          </div>

          <div
            class="text-right"
          >
            <p
              class="text-lg font-bold text-blue-900"
            >
              {{ processedCount }}
              /
              {{ parsedRows.length }}
            </p>

            <p
              class="text-xs text-blue-700"
            >
              processed
            </p>
          </div>
        </div>

        <div
          class="mt-3 h-3 overflow-hidden rounded-full bg-blue-100"
        >
          <div
            class="h-full rounded-full bg-blue-600 transition-all duration-300"
            :style="{
              width:
                parsedRows.length
                  ? `${Math.round(
                      (
                        processedCount /
                        parsedRows.length
                      ) * 100
                    )}%`
                  : '0%',
            }"
          />
        </div>
      </div>

      <div
        v-if="importError"
        class="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        {{ importError }}
      </div>

      <div
        v-if="importSuccess"
        class="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"
      >
        {{ importSuccess }}
      </div>

      <div
        v-if="importResults.length"
        class="mt-6"
      >
        <div
          class="mb-3 flex items-center justify-between"
        >
          <h3
            class="font-bold text-slate-900"
          >
            Import Results
          </h3>

          <button
            type="button"
            class="text-sm font-semibold text-slate-500 hover:text-slate-700"
            @click="clearImport"
          >
            Clear
          </button>
        </div>

        <div
          class="max-h-96 overflow-auto rounded-lg border border-slate-200"
        >
          <table
            class="min-w-full divide-y divide-slate-200 text-sm"
          >
            <thead
              class="sticky top-0 bg-slate-50"
            >
              <tr>
                <th
                  class="px-4 py-3 text-left font-semibold text-slate-600"
                >
                  Row
                </th>

                <th
                  class="px-4 py-3 text-left font-semibold text-slate-600"
                >
                  Email
                </th>

                <th
                  class="px-4 py-3 text-left font-semibold text-slate-600"
                >
                  Status
                </th>

                <th
                  class="px-4 py-3 text-left font-semibold text-slate-600"
                >
                  Details
                </th>

                <th
                  class="px-4 py-3 text-left font-semibold text-slate-600"
                >
                  Password
                </th>
              </tr>
            </thead>

            <tbody
              class="divide-y divide-slate-100 bg-white"
            >
              <tr
                v-for="(
                  result,
                  index
                ) in importResults"
                :key="`${result.email}-${index}`"
              >
                <td
                  class="px-4 py-3"
                >
                  {{ result.row }}
                </td>

                <td
                  class="px-4 py-3"
                >
                  {{ result.email }}
                </td>

                <td
                  class="px-4 py-3"
                >
                  <span
                    v-if="result.ok"
                    class="rounded-full bg-green-100 px-2 py-1 text-xs font-bold text-green-700"
                  >
                    Success
                  </span>

                  <span
                    v-else
                    class="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700"
                  >
                    Failed
                  </span>
                </td>

                <td
                  class="px-4 py-3"
                >
                  <span
                    v-if="result.ok"
                  >
                    {{
                      result.action ||
                      'Processed'
                    }}
                  </span>

                  <span
                    v-else
                    class="text-red-700"
                  >
                    {{
                      result.error
                    }}
                  </span>
                </td>

                <td
                  class="px-4 py-3 font-mono text-xs"
                >
                  {{
                    result.temporary_password ||
                    ''
                  }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- Filters -->

    <section
      class="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div
        class="grid gap-4 md:grid-cols-3"
      >
        <input
          v-model="search"
          type="search"
          placeholder="Search students..."
          class="rounded-lg border border-slate-300 px-3 py-2"
        />

        <select
          v-model="yearFilter"
          class="rounded-lg border border-slate-300 px-3 py-2"
        >
          <option value="">
            All year levels
          </option>

          <option
            v-for="year in 12"
            :key="year"
            :value="year"
          >
            Year {{ year }}
          </option>
        </select>

        <select
          v-model="houseFilter"
          class="rounded-lg border border-slate-300 px-3 py-2"
        >
          <option value="">
            All houses
          </option>

          <option
            v-for="house in houses"
            :key="house.id"
            :value="house.id"
          >
            {{ house.name }}
          </option>
        </select>
      </div>
    </section>

    <!-- Students -->

    <section
      class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <div
        v-if="loading"
        class="p-8 text-center text-slate-500"
      >
        Loading students...
      </div>

      <div
        v-else-if="!students.length"
        class="p-8 text-center text-slate-500"
      >
        No students found.
      </div>

      <div
        v-else
        class="overflow-x-auto"
      >
        <table
          class="min-w-full divide-y divide-slate-200 text-sm"
        >
          <thead
            class="bg-slate-50"
          >
            <tr>
              <th
                class="px-4 py-3 text-left font-semibold text-slate-600"
              >
                Student
              </th>

              <th
                class="px-4 py-3 text-left font-semibold text-slate-600"
              >
                Student #
              </th>

              <th
                class="px-4 py-3 text-left font-semibold text-slate-600"
              >
                Year
              </th>

              <th
                class="px-4 py-3 text-left font-semibold text-slate-600"
              >
                House
              </th>

              <th
                class="px-4 py-3 text-left font-semibold text-slate-600"
              >
                Status
              </th>

              <th
                class="px-4 py-3 text-right font-semibold text-slate-600"
              >
                Actions
              </th>
            </tr>
          </thead>

          <tbody
            class="divide-y divide-slate-100"
          >
            <tr
              v-for="student in students"
              :key="student.id"
            >
              <td
                class="px-4 py-4"
              >
                <div
                  class="font-semibold text-slate-900"
                >
                  {{
                    student.first_name
                  }}
                  {{
                    student.last_name
                  }}
                </div>

                <div
                  class="text-xs text-slate-500"
                >
                  {{ student.email }}
                </div>
              </td>

              <td
                class="px-4 py-4"
              >
                {{
                  student.student_number ||
                  '—'
                }}
              </td>

              <td
                class="px-4 py-4"
              >
                {{
                  student.year_level
                    ? `Year ${student.year_level}`
                    : '—'
                }}
              </td>

              <td
                class="px-4 py-4"
              >
                {{
                  student.houses?.name ||
                  '—'
                }}
              </td>

              <td
                class="px-4 py-4"
              >
                <span
                  v-if="student.active"
                  class="rounded-full bg-green-100 px-2 py-1 text-xs font-bold text-green-700"
                >
                  Active
                </span>

                <span
                  v-else
                  class="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600"
                >
                  Inactive
                </span>
              </td>

              <td
                class="px-4 py-4 text-right"
              >
                <div
                  class="flex justify-end gap-2"
                >
                  <NuxtLink
                    :to="`/admin/students/${student.id}`"
                    class="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Edit
                  </NuxtLink>

                  <button
                    type="button"
                    class="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    @click="
                      toggleStudentActive(
                        student
                      )
                    "
                  >
                    {{
                      student.active
                        ? 'Deactivate'
                        : 'Activate'
                    }}
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
```
