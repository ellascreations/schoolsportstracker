<script setup lang="ts">
definePageMeta({ middleware: 'admin' })
const supabase = useSupabaseClient(); const houses=ref<any[]>([]); const name=ref(''); const colour=ref('#2563eb');
const load=async()=>{ const {data}=await supabase.from('houses').select('*').order('name'); houses.value=data||[] }
const add=async()=>{ if(!name.value.trim())return; await supabase.from('houses').insert({name:name.value.trim(),colour:colour.value}); name.value=''; await load() }
const remove=async(id:number)=>{ if(confirm('Delete this house?')){ await supabase.from('houses').delete().eq('id',id); await load() } }
onMounted(load)
</script>
<template><main class="mx-auto max-w-5xl px-4 py-8"><NuxtLink to="/admin" class="text-sm font-semibold text-blue-600">← Admin Dashboard</NuxtLink><h1 class="mt-3 text-3xl font-bold">Houses</h1><form class="mt-6 flex flex-wrap gap-3 rounded-xl border bg-white p-5" @submit.prevent="add"><input v-model="name" required placeholder="House name" class="min-w-64 flex-1 rounded-lg border px-4 py-2"><input v-model="colour" type="color" class="h-11 w-16 rounded border"><button class="rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white">Add House</button></form><div class="mt-5 overflow-hidden rounded-xl border bg-white"><div v-for="h in houses" :key="h.id" class="flex items-center gap-3 border-b p-4 last:border-0"><span class="h-5 w-5 rounded-full" :style="{backgroundColor:h.colour}"></span><span class="flex-1 font-semibold">{{h.name}}</span><button class="text-sm font-semibold text-red-600" @click="remove(h.id)">Delete</button></div></div></main></template>
