<script setup lang="ts">
definePageMeta({ layout: false })
const supabase = useSupabaseClient()
const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref('')

const login = async () => {
  loading.value = true
  errorMessage.value = ''
  const { error } = await supabase.auth.signInWithPassword({ email: email.value, password: password.value })
  loading.value = false
  if (error) { errorMessage.value = error.message; return }
  await navigateTo('/dashboard')
}
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100 px-4">
    <div class="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
      <div class="mb-7 text-center">
        <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-3xl text-white">🏆</div>
        <h1 class="text-3xl font-bold">School Sports Tracker</h1>
        <p class="mt-2 text-slate-500">Sign in to continue</p>
      </div>
      <div v-if="errorMessage" class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{{ errorMessage }}</div>
      <form class="space-y-4" @submit.prevent="login">
        <input v-model="email" type="email" required placeholder="Email address" class="w-full rounded-lg border px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
        <input v-model="password" type="password" required placeholder="Password" class="w-full rounded-lg border px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
        <button :disabled="loading" class="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          {{ loading ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>
    </div>
  </main>
</template>
