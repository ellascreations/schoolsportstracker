<script setup lang="ts">
const user = useSupabaseUser()

onMounted(async () => {
  await navigateTo(
    user.value ? '/dashboard' : '/login',
    { replace: true }
  )
})
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-slate-50">
    <div class="text-center">
      <div
        class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-2xl text-white"
      >
        🏆
      </div>

      <p class="font-semibold text-slate-700">
        Loading School Sports Tracker…
      </p>
    </div>
  </main>
</template>
