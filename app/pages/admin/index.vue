<script setup lang="ts">definePageMeta({ middleware: 'admin' })</script>
<template><main class="mx-auto max-w-7xl px-4 py-8"><p class="text-sm font-bold uppercase tracking-wider text-violet-600">Administration</p><h1 class="mt-1 text-3xl font-bold">Admin Dashboard</h1><div class="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
<NuxtLink v-for="item in [
['Students','Manage student profiles, year levels and houses','/admin/students','🎓'],['Teachers','Manage teachers and access','/admin/teachers','🧑‍🏫'],['Houses','Manage school houses and colours','/admin/houses','🏠'],['Sports','Manage sports and measurement types','/admin/sports','🏃'],['Events','Create and manage sports events','/admin/events','📅'],['Users & Roles','Manage user access levels','/admin/users','🔐']
]" :key="item[0]" :to="item[2]" class="rounded-xl border bg-white p-6 shadow-sm hover:border-violet-300"><div class="text-3xl">{{ item[3] }}</div><h2 class="mt-3 text-lg font-bold">{{ item[0] }}</h2><p class="mt-1 text-sm text-slate-500">{{ item[1] }}</p></NuxtLink>
</div></main></template>
