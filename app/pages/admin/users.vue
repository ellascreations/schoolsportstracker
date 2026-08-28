<script setup lang="ts">
definePageMeta({ middleware:'admin' }); const supabase=useSupabaseClient(); const users=ref<any[]>([])
const load=async()=>{const{data}=await supabase.from('profiles').select('id,email,first_name,last_name,role,active').order('last_name');users.value=data||[]}
const setRole=async(u:any)=>{await supabase.from('profiles').update({role:u.role}).eq('id',u.id)}
onMounted(load)
</script>
<template><main class="mx-auto max-w-6xl px-4 py-8"><NuxtLink to="/admin" class="text-sm font-semibold text-blue-600">← Admin Dashboard</NuxtLink><h1 class="mt-3 text-3xl font-bold">Users & Roles</h1><div class="mt-6 overflow-hidden rounded-xl border bg-white"><div v-for="u in users" :key="u.id" class="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center"><div class="flex-1"><div class="font-semibold">{{u.first_name}} {{u.last_name}}</div><div class="text-sm text-slate-500">{{u.email}}</div></div><select v-model="u.role" class="rounded-lg border px-3 py-2" @change="setRole(u)"><option value="admin">Admin</option><option value="teacher">Teacher</option><option value="student">Student</option></select></div></div></main></template>
