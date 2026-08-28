export default defineNuxtConfig({
  compatibilityDate: '2026-08-01',
  devtools: { enabled: true },
  modules: ['@nuxtjs/tailwindcss', '@nuxtjs/supabase'],
  supabase: {
    redirect: false
  },
  app: {
    head: {
      title: 'School Sports Tracker',
      meta: [{ name: 'description', content: 'School sports, events, results and house points tracker' }]
    }
  }
})
