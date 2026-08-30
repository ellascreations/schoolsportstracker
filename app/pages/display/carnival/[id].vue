<script setup lang="ts">
definePageMeta({
  layout: false,
})

const route = useRoute()

const data = ref<any>(null)
const loading = ref(true)
const errorMessage = ref('')
const lastUpdated = ref<Date | null>(null)
const secondsToRefresh = ref(20)

let refreshTimer: ReturnType<typeof setInterval> | null = null
let countdownTimer: ReturnType<typeof setInterval> | null = null

const carnivalId = computed(() => Number(route.params.id))

const localDate = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const loadDisplay = async () => {
  if (!Number.isInteger(carnivalId.value) || carnivalId.value <= 0) {
    errorMessage.value = 'Invalid carnival.'
    loading.value = false
    return
  }

  try {
    const result = await $fetch(
      `/api/public/carnivals/${carnivalId.value}/display`,
      {
        query: {
          date: localDate(),
        },
      }
    )

    data.value = result
    lastUpdated.value = new Date()
    errorMessage.value = ''
    secondsToRefresh.value = 20
  } catch (error: any) {
    console.error('CARNIVAL DISPLAY LOAD ERROR:', error)

    errorMessage.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Could not load the carnival display.'
  } finally {
    loading.value = false
  }
}

const formatTime = (value: string | null) => {
  if (!value) return 'TBA'
  return String(value).slice(0, 5)
}

const formatDate = (value: string | null) => {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00`)
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
  }).format(date)
}

const genderLabel = (value: string | null) => {
  if (!value) return ''
  const text = String(value).toLowerCase()
  if (text === 'female') return 'Girls'
  if (text === 'male') return 'Boys'
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const recordScopeLabel = (value: string) => {
  if (value === 'school') return 'SCHOOL RECORD'
  if (value === 'house') return 'HOUSE RECORD'
  if (value === 'interschool') return 'INTERSCHOOL RECORD'
  return 'NEW RECORD'
}

const resultText = (row: any) =>
  row?.result_display ||
  (row?.result_value != null ? String(row.result_value) : '—')

const requestFullscreen = async () => {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen()
    } else {
      await document.exitFullscreen()
    }
  } catch (error) {
    console.warn('FULLSCREEN ERROR:', error)
  }
}

onMounted(async () => {
  await loadDisplay()

  refreshTimer = setInterval(loadDisplay, 20_000)

  countdownTimer = setInterval(() => {
    secondsToRefresh.value =
      secondsToRefresh.value <= 1
        ? 20
        : secondsToRefresh.value - 1
  }, 1_000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
  if (countdownTimer) clearInterval(countdownTimer)
})
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-white">
    <div
      v-if="loading"
      class="flex min-h-screen items-center justify-center"
    >
      <div class="text-center">
        <div class="text-4xl font-black">Loading Carnival...</div>
        <div class="mt-3 text-xl text-slate-400">
          Preparing the live display
        </div>
      </div>
    </div>

    <div
      v-else-if="errorMessage && !data"
      class="flex min-h-screen items-center justify-center p-8"
    >
      <div class="max-w-2xl text-center">
        <div class="text-4xl font-black text-red-300">
          Display unavailable
        </div>

        <div class="mt-4 text-xl text-slate-300">
          {{ errorMessage }}
        </div>

        <button
          class="mt-6 rounded-xl bg-white px-6 py-3 text-lg font-bold text-slate-900"
          @click="loadDisplay"
        >
          Try Again
        </button>
      </div>
    </div>

    <template v-else-if="data">
      <header class="border-b border-white/10 bg-slate-900/80 px-7 py-5">
        <div class="flex items-center gap-5">
          <img
            src="/images/school-sports-tracker-logo.png"
            alt="School Sports Tracker"
            class="h-20 w-20 rounded-2xl object-contain shadow-2xl"
          />

          <img
            v-if="data.carnival.host_school?.logo_url"
            :src="data.carnival.host_school.logo_url"
            :alt="data.carnival.host_school?.name || 'Host school'"
            class="hidden h-16 w-16 rounded-xl bg-white object-contain p-1 lg:block"
          />

          <div class="min-w-0 flex-1">
            <div class="text-sm font-black uppercase tracking-[0.25em] text-cyan-300">
              Live Carnival Display
            </div>

            <h1 class="truncate text-4xl font-black tracking-tight">
              {{ data.carnival.name }}
            </h1>

            <div class="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-lg text-slate-300">
              <span v-if="data.carnival.venue">
                {{ data.carnival.venue }}
              </span>

              <span>
                {{ data.carnival.host_school?.name }}
              </span>
            </div>
          </div>

          <div class="hidden text-right xl:block">
            <div class="text-sm uppercase tracking-widest text-slate-400">
              Last updated
            </div>
            <div class="text-xl font-bold">
              {{
                lastUpdated
                  ? lastUpdated.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })
                  : '—'
              }}
            </div>
            <div class="mt-1 text-sm text-slate-500">
              Refresh in {{ secondsToRefresh }}s
            </div>
          </div>

          <button
            type="button"
            class="rounded-xl border border-white/20 bg-white/10 px-4 py-3 font-bold hover:bg-white/20"
            @click="requestFullscreen"
          >
            Full Screen
          </button>
        </div>

        <div
          v-if="errorMessage"
          class="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-amber-200"
        >
          Refresh warning: {{ errorMessage }}
        </div>
      </header>

      <main class="grid gap-5 p-5 2xl:grid-cols-[0.9fr_1.1fr]">
        <!-- LEFT COLUMN -->
        <div class="grid content-start gap-5">
          <!-- Standings -->
          <section class="overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
            <div class="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div>
                <div class="text-sm font-black uppercase tracking-[0.2em] text-cyan-300">
                  Current Standings
                </div>
                <h2 class="mt-1 text-3xl font-black">
                  {{
                    data.carnival.scoring_mode === 'school'
                      ? 'School Championship'
                      : 'House Championship'
                  }}
                </h2>
              </div>

              <div class="text-5xl">
                🏆
              </div>
            </div>

            <div v-if="!data.standings.length" class="p-8 text-center text-xl text-slate-400">
              No points have been recorded yet.
            </div>

            <div
              v-for="row in data.standings.slice(0, 8)"
              :key="row.id"
              class="grid grid-cols-[70px_1fr_auto] items-center gap-4 border-b border-white/10 px-6 py-4 last:border-0"
            >
              <div
                class="flex h-12 w-12 items-center justify-center rounded-full text-2xl font-black"
                :class="
                  row.position === 1
                    ? 'bg-amber-400 text-slate-950'
                    : row.position === 2
                      ? 'bg-slate-300 text-slate-950'
                      : row.position === 3
                        ? 'bg-orange-400 text-slate-950'
                        : 'bg-white/10 text-white'
                "
              >
                {{ row.position }}
              </div>

              <div class="min-w-0">
                <div class="truncate text-2xl font-black">
                  {{ row.name }}
                </div>
              </div>

              <div class="text-right">
                <div class="text-4xl font-black text-cyan-300">
                  {{ row.points }}
                </div>
                <div class="text-sm font-bold uppercase tracking-wider text-slate-500">
                  points
                </div>
              </div>
            </div>
          </section>

          <!-- Records -->
          <section class="overflow-hidden rounded-2xl border border-amber-400/20 bg-slate-900 shadow-2xl">
            <div class="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div>
                <div class="text-sm font-black uppercase tracking-[0.2em] text-amber-300">
                  New Records Today
                </div>
                <h2 class="mt-1 text-3xl font-black">
                  Record Breakers
                </h2>
              </div>

              <div class="text-5xl">
                ⭐
              </div>
            </div>

            <div
              v-if="!data.new_records.length"
              class="p-8 text-center text-xl text-slate-400"
            >
              No new records recorded today yet.
            </div>

            <div class="grid gap-3 p-4">
              <div
                v-for="record in data.new_records.slice(0, 6)"
                :key="record.id"
                class="rounded-xl border border-amber-300/20 bg-amber-300/10 px-5 py-4"
              >
                <div class="flex items-start gap-4">
                  <div class="text-4xl">🏆</div>

                  <div class="min-w-0 flex-1">
                    <div class="text-sm font-black uppercase tracking-wider text-amber-300">
                      {{ recordScopeLabel(record.scope) }}
                    </div>

                    <div class="mt-1 text-xl font-black">
                      <span v-if="record.year_level">
                        Year {{ record.year_level }}
                      </span>
                      <span v-if="record.gender">
                        {{ genderLabel(record.gender) }}
                      </span>
                      {{ record.sport_name }}
                    </div>

                    <div class="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                      <span class="text-3xl font-black text-white">
                        {{ record.result_display || record.result_value }}
                      </span>

                      <span class="text-xl font-bold text-slate-200">
                        {{ record.holder_name }}
                      </span>
                    </div>

                    <div class="mt-1 text-sm text-slate-400">
                      <span v-if="record.house_name">
                        {{ record.house_name }}
                      </span>
                      <span v-if="record.house_name && record.school_name">
                        ·
                      </span>
                      <span v-if="record.school_name">
                        {{ record.school_name }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <!-- RIGHT COLUMN -->
        <div class="grid content-start gap-5">
          <!-- Last five -->
          <section class="overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
            <div class="border-b border-white/10 px-6 py-4">
              <div class="text-sm font-black uppercase tracking-[0.2em] text-emerald-300">
                Latest
              </div>
              <h2 class="mt-1 text-3xl font-black">
                Last 5 Event Results
              </h2>
            </div>

            <div
              v-if="!data.recent_results.length"
              class="p-8 text-center text-xl text-slate-400"
            >
              No completed event results yet.
            </div>

            <div
              v-for="event in data.recent_results"
              :key="event.id"
              class="border-b border-white/10 px-6 py-4 last:border-0"
            >
              <div class="flex items-center justify-between gap-4">
                <div class="text-xl font-black">
                  {{ event.name }}
                </div>

                <div class="whitespace-nowrap text-sm font-semibold text-slate-400">
                  {{ formatTime(event.start_time) }}
                </div>
              </div>

              <div
                v-if="!event.results.length"
                class="mt-2 text-sm text-slate-500"
              >
                Results not yet available.
              </div>

              <div
                v-for="row in event.results"
                :key="row.id"
                class="mt-2 grid grid-cols-[40px_1fr_auto] items-center gap-3 rounded-lg bg-white/5 px-3 py-2"
              >
                <div class="text-xl font-black text-emerald-300">
                  {{ row.position }}
                </div>

                <div class="min-w-0">
                  <div class="truncate font-bold">
                    {{ row.athlete_name }}
                  </div>

                  <div class="truncate text-xs text-slate-400">
                    {{ row.house_name || row.school_name || '' }}
                  </div>
                </div>

                <div class="text-lg font-black">
                  {{ resultText(row) }}
                </div>
              </div>
            </div>
          </section>

          <!-- Next five -->
          <section class="overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
            <div class="border-b border-white/10 px-6 py-4">
              <div class="text-sm font-black uppercase tracking-[0.2em] text-violet-300">
                Coming Up
              </div>
              <h2 class="mt-1 text-3xl font-black">
                Next 5 Events
              </h2>
            </div>

            <div
              v-if="!data.next_events.length"
              class="p-8 text-center text-xl text-slate-400"
            >
              No more scheduled events.
            </div>

            <div
              v-for="(event, index) in data.next_events"
              :key="event.id"
              class="grid grid-cols-[75px_1fr_auto] items-center gap-4 border-b border-white/10 px-6 py-4 last:border-0"
            >
              <div>
                <div class="text-2xl font-black text-violet-300">
                  {{ formatTime(event.start_time) }}
                </div>

                <div class="text-xs font-semibold text-slate-500">
                  {{ formatDate(event.event_date) }}
                </div>
              </div>

              <div class="min-w-0">
                <div class="truncate text-xl font-black">
                  {{ event.name }}
                </div>

                <div class="mt-1 truncate text-sm text-slate-400">
                  {{ event.location || event.sport_name || 'Location TBA' }}
                </div>
              </div>

              <div
                v-if="index === 0"
                class="rounded-full bg-violet-400 px-3 py-1 text-sm font-black text-slate-950"
              >
                NEXT
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer class="flex items-center justify-between border-t border-white/10 bg-slate-950 px-6 py-3 text-sm text-slate-500">
        <div>
          School Sports Tracker · Live Carnival Display
        </div>

        <div>
          Auto-refresh every 20 seconds
        </div>
      </footer>
    </template>
  </div>
</template>
