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

  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('active,registration_status')
      .eq('id', user.id)
      .maybeSingle()

    if (profile && !profile.active) {
      await supabase.auth.signOut()
      errorMessage.value = profile.registration_status === 'pending'
        ? 'Your teacher registration is waiting for School Admin approval.'
        : 'Your account is not active. Please contact your School Admin.'
      return
    }
  }

  await navigateTo('/dashboard')
}
</script>

<template>
  <main class="sst-login-page flex min-h-screen items-center justify-center px-4">
    <div class="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-8 shadow-2xl">
      <div class="mb-7 text-center">
        <img
          src="/images/school-sports-tracker-logo.png"
          alt="School Sports Tracker"
          class="mx-auto mb-5 w-full max-w-[360px] object-contain drop-shadow-xl"
        />
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
      <div class="mt-5 text-center text-sm text-slate-500">
        Teacher at a participating school?
        <NuxtLink to="/register/teacher" class="font-semibold text-emerald-700">Register here</NuxtLink>
      </div>
    </div>
  </main>
</template>


<style scoped>
.sst-login-page {
  background:
    radial-gradient(circle at 50% 0%, rgba(14, 165, 233, 0.12), transparent 34rem),
    linear-gradient(180deg, #020817 0%, #030b16 100%);
  color: #f8fafc;
}

.sst-login-page input {
  background: #071321;
  border-color: #29435d;
  color: #f8fafc;
}

.sst-login-page input::placeholder {
  color: #64748b;
}

.sst-login-page input:focus {
  border-color: #0ea5e9;
}
</style>
