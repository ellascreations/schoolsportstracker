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
    ['Students','Manage student profiles, year levels and houses','/admin/students','🎓'],
    ['Teachers','Manage teachers and access','/admin/teachers','🧑‍🏫'],
    ['Houses','Manage school houses and colours','/admin/houses','🏠'],
    ['Sports','Manage sports and measurement types','/admin/sports','🏃'],
    ['Events','Manage individual carnival events','/admin/events','📅'],
    ['Records','Top 5 records and historical performances','/admin/records','🏅'],
    ['Users & Roles','Manage user access levels','/admin/users','🔐'],
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
      <NuxtLink v-for="item in items" :key="item[0]" :to="item[2]" class="rounded-xl border bg-slate-900 p-6 shadow-sm hover:border-violet-300">
        <div class="text-3xl">{{ item[3] }}</div>
        <h2 class="mt-3 text-lg font-bold">{{ item[0] }}</h2>
        <p class="mt-1 text-sm text-slate-400">{{ item[1] }}</p>
      </NuxtLink>
    </div>
  </main>
</template>
