<script setup lang="ts">
definePageMeta({ middleware: 'admin' })
const supabase = useSupabaseClient()
const profile = ref<any>(null)

onMounted(async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { data } = await supabase.from('profiles').select('role,school_id,school:schools(name,short_name)').eq('id', user.id).single()
  profile.value = data
})

const items = computed(() => {
  const base = [
    ['Carnivals','Create school and interschool carnivals','/admin/carnivals','🏆'],
    ['Students','Manage student profiles, year levels and houses','/admin/students','👥'],
    ['Teachers','Manage teachers and access','/admin/teachers','🧑‍🏫'],
    ['Houses','Manage school houses and colours','/admin/houses','🏘️'],
    ['Sports','Manage sports and measurement types','/admin/sports','🏃‍♂️'],
    ['Events','Manage individual carnival events','/admin/events','🗓️'],
    ['Records','Top 5 records and historical performances','/admin/records','🥇'],
    ['Users & Roles','Manage user access levels','/admin/users','🛡️'],
    ['Schools','Manage school details and participating schools','/admin/schools','🏫'],
  ]
  return base
})
</script>

<template>
  <main class="mx-auto max-w-7xl px-4 py-8">
    <p class="text-sm font-bold uppercase tracking-wider text-violet-600">Administration</p>
    <h1 class="mt-1 text-3xl font-bold">Admin Dashboard</h1>
    <p v-if="profile?.school" class="mt-2 text-slate-400">{{ profile.school.name }}</p>

    <div class="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <NuxtLink v-for="item in items" :key="item[0]" :to="item[2]" class="group rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-violet-400 hover:bg-slate-800 hover:shadow-lg">
        <div class="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-700 bg-slate-800 text-4xl shadow-inner transition group-hover:scale-110 group-hover:border-violet-400">{{ item[3] }}</div>
        <h2 class="mt-4 text-xl font-bold text-slate-100">{{ item[0] }}</h2>
        <p class="mt-1 text-sm text-slate-400">{{ item[1] }}</p>
      </NuxtLink>
    </div>
  </main>
</template>
