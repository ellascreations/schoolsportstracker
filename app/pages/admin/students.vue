<script setup lang="ts">
definePageMeta({ middleware: 'admin' })
const supabase = useSupabaseClient()
const rows = ref<any[]>([])
const houses = ref<any[]>([])
const loading = ref(false)
const saving = ref(false)
const search = ref('')
const yearFilter = ref('')
const houseFilter = ref('')
const message = ref('')
const errorMessage = ref('')
const importResults = ref<any[]>([])
const newStudent = reactive({ first_name:'', last_name:'', email:'', student_number:'', year_level:null as number|null, house_id:null as number|null, temporary_password:'' })

const filteredRows = computed(() => rows.value.filter(r => {
  const q = search.value.trim().toLowerCase()
  const matchesSearch = !q || `${r.first_name} ${r.last_name} ${r.email || ''} ${r.student_number || ''}`.toLowerCase().includes(q)
  const matchesYear = !yearFilter.value || String(r.year_level || '') === yearFilter.value
  const matchesHouse = !houseFilter.value || String(r.house_id || '') === houseFilter.value
  return matchesSearch && matchesYear && matchesHouse
}))

const load = async () => {
  loading.value = true
  const [studentsRes, housesRes] = await Promise.all([
    supabase.from('profiles').select('id,first_name,last_name,email,student_number,year_level,house_id,active,house:houses(name,colour)').eq('role','student').order('last_name').order('first_name'),
    supabase.from('houses').select('id,name,colour').eq('active',true).order('name')
  ])
  rows.value = studentsRes.data || []
  houses.value = housesRes.data || []
  loading.value = false
}

const createStudent = async () => {
  saving.value = true; message.value=''; errorMessage.value=''
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token
    if (!accessToken) throw new Error('Your login session has expired. Please sign in again.')
    const result:any = await $fetch('/api/admin/students/create', {
      method:'POST',
      headers:{ Authorization:`Bearer ${accessToken}` },
      body:newStudent
    })
    message.value = `Student created. Temporary password: ${result.temporary_password}`
    Object.assign(newStudent,{ first_name:'', last_name:'', email:'', student_number:'', year_level:null, house_id:null, temporary_password:'' })
    await load()
  } catch (e:any) { errorMessage.value = e?.data?.statusMessage || e?.message || 'Could not create student.' }
  finally { saving.value = false }
}

const updateStudent = async (student:any) => {
  const { error } = await supabase.from('profiles').update({ first_name:student.first_name, last_name:student.last_name, student_number:student.student_number || null, year_level:student.year_level || null, house_id:student.house_id || null, active:student.active, updated_at:new Date().toISOString() }).eq('id',student.id)
  if (error) errorMessage.value = error.message
  else { message.value = 'Student updated.'; await load() }
}

const csvTemplate = `student_number,first_name,last_name,email,year_level,house,temporary_password\nS00123,Jack,Brown,jack.brown@school.edu.au,8,Red House,Welcome123!\nS00124,Sarah,Jones,sarah.jones@school.edu.au,8,Blue House,Welcome123!`
const downloadTemplate = () => {
  const blob = new Blob([csvTemplate], { type:'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='student-import-template.csv'; a.click(); URL.revokeObjectURL(url)
}
const parseCsv = (text:string) => {
  const lines = text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(l=>l.trim())
  if (lines.length < 2) return []
  const split = (line:string) => { const out:string[]=[]; let cur=''; let quoted=false; for(let i=0;i<line.length;i++){ const c=line[i]; if(c==='"'){ if(quoted && line[i+1]==='"'){cur+='"';i++} else quoted=!quoted } else if(c===','&&!quoted){out.push(cur.trim());cur=''} else cur+=c } out.push(cur.trim()); return out }
  const headers = split(lines[0]).map(h=>h.toLowerCase())
  return lines.slice(1).map(line => { const values=split(line); const obj:any={}; headers.forEach((h,i)=>obj[h]=values[i]??''); return obj })
}
const importCsv = async (event:Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]; if(!file) return
  saving.value=true; message.value=''; errorMessage.value=''; importResults.value=[]
  try {
    const parsed=parseCsv(await file.text())
    if(!parsed.length) throw new Error('The CSV contains no student rows.')
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token
    if (!accessToken) throw new Error('Your login session has expired. Please sign in again.')
    const result:any = await $fetch('/api/admin/students/import',{
      method:'POST',
      headers:{ Authorization:`Bearer ${accessToken}` },
      body:{rows:parsed}
    })
    importResults.value=result.results || []
    message.value=`Import complete: ${result.successful} successful, ${result.failed} failed.`
    await load()
  } catch(e:any){ errorMessage.value=e?.data?.statusMessage||e?.message||'CSV import failed.' }
  finally { saving.value=false; input.value='' }
}

onMounted(load)
</script>

<template>
<main class="mx-auto max-w-7xl px-4 py-8">
  <NuxtLink to="/admin" class="text-sm font-semibold text-blue-600">← Admin Dashboard</NuxtLink>
  <div class="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h1 class="text-3xl font-bold">Student Management</h1><p class="mt-1 text-slate-500">Add, import, edit and deactivate student accounts.</p></div><button class="rounded-lg border bg-white px-4 py-2 font-semibold" @click="downloadTemplate">Download CSV Template</button></div>
  <div v-if="message" class="mt-5 rounded-lg bg-emerald-50 p-3 text-emerald-700">{{message}}</div><div v-if="errorMessage" class="mt-5 rounded-lg bg-red-50 p-3 text-red-700">{{errorMessage}}</div>

  <section class="mt-6 rounded-xl border bg-white p-5"><h2 class="text-lg font-bold">Add Student</h2><form class="mt-4 grid gap-3 md:grid-cols-4" @submit.prevent="createStudent">
    <input v-model="newStudent.first_name" required placeholder="First name" class="rounded-lg border px-3 py-2"><input v-model="newStudent.last_name" required placeholder="Last name" class="rounded-lg border px-3 py-2"><input v-model="newStudent.email" required type="email" placeholder="Email" class="rounded-lg border px-3 py-2"><input v-model="newStudent.student_number" placeholder="Student number" class="rounded-lg border px-3 py-2">
    <input v-model.number="newStudent.year_level" type="number" min="1" max="12" placeholder="Year level" class="rounded-lg border px-3 py-2"><select v-model="newStudent.house_id" class="rounded-lg border px-3 py-2"><option :value="null">No house</option><option v-for="h in houses" :key="h.id" :value="h.id">{{h.name}}</option></select><input v-model="newStudent.temporary_password" placeholder="Temporary password (optional)" class="rounded-lg border px-3 py-2 md:col-span-2"><button :disabled="saving" class="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white md:col-span-4">{{saving?'Saving…':'Create Student'}}</button>
  </form></section>

  <section class="mt-6 rounded-xl border bg-white p-5"><div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 class="text-lg font-bold">CSV Import</h2><p class="text-sm text-slate-500">Required columns: first_name, last_name, email. Optional: student_number, year_level, house, temporary_password.</p></div><label class="cursor-pointer rounded-lg bg-slate-900 px-4 py-2 text-center font-semibold text-white"><input type="file" accept=".csv,text/csv" class="hidden" :disabled="saving" @change="importCsv">{{saving?'Importing…':'Choose CSV'}}</label></div>
    <div v-if="importResults.length" class="mt-4 max-h-64 overflow-auto rounded-lg border"><table class="w-full text-sm"><thead class="bg-slate-50"><tr><th class="p-2 text-left">Row</th><th class="text-left">Email</th><th class="text-left">Result</th><th class="text-left">Temporary Password</th></tr></thead><tbody><tr v-for="r in importResults" :key="`${r.row}-${r.email}`" class="border-t"><td class="p-2">{{r.row}}</td><td>{{r.email}}</td><td :class="r.ok?'text-emerald-700':'text-red-700'">{{r.ok?r.action:r.error}}</td><td>{{r.temporary_password||'—'}}</td></tr></tbody></table></div>
  </section>

  <section class="mt-6"><div class="grid gap-3 md:grid-cols-3"><input v-model="search" placeholder="Search students…" class="rounded-lg border bg-white px-4 py-2"><select v-model="yearFilter" class="rounded-lg border bg-white px-4 py-2"><option value="">All year levels</option><option v-for="y in 12" :key="y" :value="String(y)">Year {{y}}</option></select><select v-model="houseFilter" class="rounded-lg border bg-white px-4 py-2"><option value="">All houses</option><option v-for="h in houses" :key="h.id" :value="String(h.id)">{{h.name}}</option></select></div>
    <div class="mt-4 overflow-x-auto rounded-xl border bg-white"><table class="w-full min-w-[1000px] text-left"><thead class="bg-slate-50"><tr><th class="p-3">Student</th><th>Email</th><th>Student #</th><th>Year</th><th>House</th><th>Active</th><th></th></tr></thead><tbody><tr v-for="r in filteredRows" :key="r.id" class="border-t"><td class="p-3"><div class="flex gap-2"><input v-model="r.first_name" class="w-28 rounded border px-2 py-1"><input v-model="r.last_name" class="w-28 rounded border px-2 py-1"></div></td><td>{{r.email}}</td><td><input v-model="r.student_number" class="w-28 rounded border px-2 py-1"></td><td><input v-model.number="r.year_level" type="number" min="1" max="12" class="w-20 rounded border px-2 py-1"></td><td><select v-model="r.house_id" class="rounded border px-2 py-1"><option :value="null">—</option><option v-for="h in houses" :key="h.id" :value="h.id">{{h.name}}</option></select></td><td><input v-model="r.active" type="checkbox"></td><td><button class="rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white" @click="updateStudent(r)">Save</button></td></tr><tr v-if="!filteredRows.length"><td colspan="7" class="p-8 text-center text-slate-500">{{loading?'Loading students…':'No students match these filters.'}}</td></tr></tbody></table></div>
  </section>
</main>
</template>
