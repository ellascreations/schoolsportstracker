<script setup lang="ts">
definePageMeta({ layout: false })
const loading = ref(false)
const optionsLoading = ref(true)
const errorMessage = ref('')
const successMessage = ref('')
const settings = ref<any>({ schools: [], teacher_email_verification_required: true })
const form = reactive({ school_id: '', first_name: '', last_name: '', email: '', password: '' })
const selectedSchool = computed(() => settings.value.schools.find((s:any)=>String(s.id)===String(form.school_id)))

const loadOptions = async () => {
  try { settings.value = await $fetch('/api/public/teacher-registration') }
  catch (e:any) { errorMessage.value = e?.data?.statusMessage || e?.message || 'Could not load schools.' }
  finally { optionsLoading.value = false }
}

const register = async () => {
  errorMessage.value=''; successMessage.value=''; loading.value=true
  try {
    const result:any = await $fetch('/api/public/teacher-registration', { method:'POST', body: form })
    successMessage.value = result.message
    Object.assign(form,{ school_id:'', first_name:'', last_name:'', email:'', password:'' })
  } catch(e:any) {
    errorMessage.value = e?.data?.statusMessage || e?.data?.message || e?.message || 'Registration failed.'
  } finally { loading.value=false }
}
onMounted(loadOptions)
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-slate-100 px-4 py-10">
    <div class="w-full max-w-xl rounded-2xl bg-white p-8 shadow-xl">
      <div class="mb-6 text-center">
        <img
          src="/images/school-sports-tracker-logo.png"
          alt="School Sports Tracker"
          class="mx-auto mb-5 w-full max-w-[220px] object-contain drop-shadow-xl"
        />
        <h1 class="text-3xl font-bold">Teacher Registration</h1>
        <p class="mt-2 text-slate-500">Register using your school-issued email address.</p>
      </div>
      <div v-if="errorMessage" class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{{ errorMessage }}</div>
      <div v-if="successMessage" class="mb-4 rounded-lg bg-green-50 p-4 text-sm text-green-800">{{ successMessage }}</div>
      <div v-if="optionsLoading" class="py-8 text-center text-slate-500">Loading schools...</div>
      <form v-else class="space-y-4" @submit.prevent="register">
        <label class="block">
          <span class="mb-1 block text-sm font-semibold">School</span>
          <select v-model="form.school_id" required class="w-full rounded-lg border px-4 py-3">
            <option value="">Choose your school</option>
            <option v-for="school in settings.schools" :key="school.id" :value="school.id">{{ school.name }}</option>
          </select>
        </label>
        <div v-if="selectedSchool" class="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Approved email domain{{ selectedSchool.domains.length > 1 ? 's' : '' }}: {{ selectedSchool.domains.join(', ') }}
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <input v-model="form.first_name" required placeholder="First name" class="rounded-lg border px-4 py-3" />
          <input v-model="form.last_name" required placeholder="Last name" class="rounded-lg border px-4 py-3" />
        </div>
        <input v-model="form.email" type="email" required placeholder="School email address" class="w-full rounded-lg border px-4 py-3" />
        <input v-model="form.password" type="password" minlength="8" required placeholder="Password (minimum 8 characters)" class="w-full rounded-lg border px-4 py-3" />
        <div class="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <template v-if="settings.teacher_email_verification_required">Supabase email verification is <strong>required</strong>.</template>
          <template v-else>Supabase email verification is <strong>disabled</strong> by the Super Admin.</template>
          <span v-if="selectedSchool?.teacher_self_registration_mode === 'admin_approval'"> A School Admin must also approve your account.</span>
        </div>
        <button :disabled="loading" class="w-full rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
          {{ loading ? 'Registering...' : 'Register as Teacher' }}
        </button>
      </form>
      <div class="mt-5 text-center text-sm"><NuxtLink to="/login" class="font-semibold text-blue-600">← Back to sign in</NuxtLink></div>
    </div>
  </main>
</template>
