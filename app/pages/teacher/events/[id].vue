<script setup lang="ts">
definePageMeta({ middleware:'teacher' })
const route=useRoute(); const supabase=useSupabaseClient(); const event=ref<any>(null); const participants=ref<any[]>([]); const message=ref(''); const errorMessage=ref(''); const saving=ref(false); const recordBadges=ref<Record<number,any[]>>({})
const statusOptions=[{value:'official',label:'Official'},{value:'dns',label:'DNS'},{value:'dnf',label:'DNF'},{value:'dq',label:'DQ'}]
const formatValue=(value:number|null, type:string)=>{if(value==null||Number.isNaN(value))return'';if(type==='time'){if(value>=60){const m=Math.floor(value/60);const s=(value-m*60).toFixed(2).padStart(5,'0');return `${m}:${s}`}return `${value.toFixed(2)} s`}if(type==='distance'||type==='height')return `${value.toFixed(2)} m`;return String(value)}
const parseValue=(input:any,type:string)=>{const raw=String(input??'').trim();if(!raw)return null;if(type==='time'&&raw.includes(':')){const bits=raw.split(':').map(Number);if(bits.some(Number.isNaN))return NaN;return bits.length===2?bits[0]*60+bits[1]:bits[0]*3600+bits[1]*60+bits[2]}const n=Number(raw.replace(/[^0-9.+-]/g,''));return n}
const load=async()=>{
  const id=Number(route.params.id)
  errorMessage.value=''
  const [{data:e,error:ee},{data:roster,error:pe},{data:r,error:re}]=await Promise.all([
    supabase.from('events').select('*,sport:sports(name,measurement_type,lower_is_better),carnival:carnivals(id,name,scope,scoring_mode)').eq('id',id).single(),
    supabase.rpc('get_event_roster',{p_event_id:id}),
    supabase.from('results').select('id,student_id,result_value,result_display,position,points,status,notes').eq('event_id',id)
  ])
  if(ee||pe||re){errorMessage.value=ee?.message||pe?.message||re?.message||'Could not load event.';return}
  event.value=e
  const resultIds=(r||[]).map((x:any)=>x.id).filter(Boolean)
  recordBadges.value={}
  if(resultIds.length){
    const{data:recordRows,error:recordError}=await supabase.from('record_top5').select('source_result_id,record_scope,record_rank').in('source_result_id',resultIds)
    if(!recordError){
      for(const row of recordRows||[]){
        const id=Number(row.source_result_id)
        if(!recordBadges.value[id])recordBadges.value[id]=[]
        recordBadges.value[id].push(row)
      }
    }
  }
  const resultMap=new Map((r||[]).map((x:any)=>[x.student_id,x]))
  participants.value=(roster||[]).map((x:any)=>{
    const result:any=resultMap.get(x.student_id)||null
    return {
      id:x.participant_id,
      lane:x.lane,
      bib_number:x.bib_number,
      student_id:x.student_id,
      student:{
        id:x.student_id,
        first_name:x.first_name,
        last_name:x.last_name,
        school:{id:x.school_id,name:x.school_name,short_name:x.school_short_name},
        house:x.house_id?{id:x.house_id,name:x.house_name,colour:x.house_colour}:null
      },
      input:result?.result_value!=null?(e?.sport?.measurement_type==='time'&&Number(result.result_value)>=60?formatValue(Number(result.result_value),'time').replace(' s',''):String(result.result_value)):'',
      resultStatus:result?.status||'official',
      notes:result?.notes||'',
      result
    }
  })
}
const badgeLabel=(badge:any)=>{const scope=String(badge.record_scope||'').replaceAll('_',' ');if(Number(badge.record_rank)===1)return `🏆 ${scope.charAt(0).toUpperCase()+scope.slice(1)} record`;if(Number(badge.record_rank)===2)return `🥈 2nd ${scope} all-time`;if(Number(badge.record_rank)===3)return `🥉 3rd ${scope} all-time`;return `⭐ #${badge.record_rank} ${scope} all-time`}
const save=async()=>{saving.value=true;message.value='';errorMessage.value='';try{for(const p of participants.value){const status=p.resultStatus||'official';const value=status==='official'?parseValue(p.input,event.value?.sport?.measurement_type):null;if(status==='official'&&(value===null||Number.isNaN(value))){throw new Error(`Enter a valid result for ${p.student.first_name} ${p.student.last_name}, or choose DNS/DNF/DQ.`)}const payload={event_id:Number(route.params.id),student_id:p.student.id,result_value:value,result_display:status==='official'?formatValue(value,event.value?.sport?.measurement_type):status.toUpperCase(),status,notes:p.notes||null};const{error}=await supabase.from('results').upsert(payload,{onConflict:'event_id,student_id'});if(error)throw error}const{error:rankError}=await supabase.rpc('rank_event_results',{p_event_id:Number(route.params.id)});if(rankError)throw rankError;message.value=event.value?.carnival?.scoring_mode==='school'?'Results saved, ranked and school points updated.':'Results saved, ranked and house points updated.';await load()}catch(e:any){errorMessage.value=e?.message||'Could not save results.'}finally{saving.value=false}}
const completeEvent=async()=>{await save();if(errorMessage.value)return;const{error}=await supabase.from('events').update({status:'completed'}).eq('id',Number(route.params.id));if(error)errorMessage.value=error.message;else{message.value='Event completed and results are saved.';await load()}}
onMounted(load)
</script>
<template><main class="mx-auto max-w-7xl px-4 py-8"><NuxtLink to="/teacher" class="text-sm font-semibold text-blue-600">← Teacher Events</NuxtLink><div v-if="event"><div class="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h1 class="text-3xl font-bold">{{event.name}}</h1><p class="mt-2 text-slate-500">{{event.sport?.name}} · {{event.event_date}} · {{event.location||'Location TBA'}} · <span class="capitalize">{{event.status.replaceAll('_',' ')}}</span></p></div><div class="rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-800"><strong>Result format:</strong> <span v-if="event.sport?.measurement_type==='time'">seconds or mm:ss.xx</span><span v-else-if="['distance','height'].includes(event.sport?.measurement_type)">metres</span><span v-else>{{event.sport?.measurement_type}}</span></div></div><div v-if="message" class="mt-5 rounded-lg bg-green-50 p-3 text-green-700">{{message}}</div><div v-if="errorMessage" class="mt-5 rounded-lg bg-red-50 p-3 text-red-700">{{errorMessage}}</div><div class="mt-6 overflow-x-auto rounded-xl border bg-white"><table class="w-full min-w-[1050px] text-left"><thead class="bg-slate-50"><tr><th class="p-4">Lane</th><th>Bib</th><th>Student</th><th>School</th><th>House</th><th>Result</th><th>Status</th><th>Place</th><th>Points</th><th>Records</th><th>Notes</th></tr></thead><tbody><tr v-for="p in participants" :key="p.id" class="border-t"><td class="p-4">{{p.lane||'—'}}</td><td>{{p.bib_number||'—'}}</td><td class="font-semibold">{{p.student.first_name}} {{p.student.last_name}}</td><td>{{p.student.school?.short_name||p.student.school?.name||'—'}}</td><td>{{p.student.house?.name||'—'}}</td><td><input v-model="p.input" :disabled="p.resultStatus!=='official'" inputmode="decimal" placeholder="Result" class="w-32 rounded border px-3 py-2 disabled:bg-slate-100"></td><td><select v-model="p.resultStatus" class="rounded border px-2 py-2"><option v-for="s in statusOptions" :key="s.value" :value="s.value">{{s.label}}</option></select></td><td class="font-bold">{{p.resultStatus==='official'?(p.result?.position||'—'):'—'}}</td><td>{{p.resultStatus==='official'?(p.result?.points||0):0}}</td><td><div v-if="p.result?.id && recordBadges[p.result.id]?.length" class="flex min-w-52 flex-col gap-1"><span v-for="badge in recordBadges[p.result.id]" :key="`${badge.record_scope}-${badge.record_rank}`" class="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">{{badgeLabel(badge)}}</span></div><span v-else class="text-slate-400">—</span></td><td><input v-model="p.notes" placeholder="Optional" class="w-40 rounded border px-2 py-2"></td></tr><tr v-if="!participants.length"><td colspan="11" class="p-8 text-center text-slate-500">No students have been assigned to this event yet. Ask an Admin to assign participants.</td></tr></tbody></table></div><div class="mt-5 flex flex-wrap gap-3"><button :disabled="saving||!participants.length" class="rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white disabled:opacity-50" @click="save">{{saving?'Saving…':'Save & Rank Results'}}</button><button :disabled="saving||!participants.length" class="rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-50" @click="completeEvent">Complete Event</button></div></div></main></template>
