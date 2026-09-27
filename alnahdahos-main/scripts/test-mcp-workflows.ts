import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ensureCrmBackend, adminClient, ALL_PERMISSIONS } from '../server/crm.ts';
import { handleCrmHttp } from '../server/http.ts';

// Uses only isolated synthetic records. Never invokes a messaging provider.
await ensureCrmBackend();
const db = adminClient();
const suffix = randomUUID().slice(0,8);
const origin = process.env.MCP_TEST_ORIGIN || 'http://localhost:4010';
const ids: string[] = [];
const campaigns: string[] = [];
const catalogs: Array<[string,string]> = [];
const secret = `ndh_live_${randomBytes(32).toString('hex')}`;
const hash = createHash('sha256').update(secret).digest('hex');
const {data: actor,error: actorError} = await db.from('mcp_clients').insert({ name: `MCP verification ${suffix}`, status:'active', permissions:[...ALL_PERMISSIONS], token_hash:hash,token_prefix:secret.slice(0,16) }).select('id').single();
if(actorError) throw actorError;
let passed=0;
function pass(name:string) { console.log(`PASS ${name}`); passed++; }
async function http(path:string, init:RequestInit={}) {
  const request = new Request(origin+path,init);
  return process.env.MCP_TEST_ORIGIN ? fetch(request,{redirect:'manual'}) : handleCrmHttp(request);
}
async function rpc(method:string,params:object={},bearer=secret) {
  const r=await http('/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream',authorization:`Bearer ${bearer}`},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
  const body=await r.json() as any;
  return {status:r.status,body};
}
async function call(name:string,args:object={},fail=false) {
  const r=await rpc('tools/call',{name,arguments:args});
  assert.equal(r.status,200,`${name}: HTTP`);
  assert.equal(Boolean(r.body.result?.isError || r.body.error),fail,`${name}: ${JSON.stringify(r.body).slice(0,250)}`);
  if(fail) return null;
  return JSON.parse(r.body.result.content[0].text);
}
async function oauth(path:string,body:object) { return http(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}); }
try {
  const listed=await rpc('tools/list');
  const tools=listed.body.result.tools;
  assert(tools.find((t:any)=>t.name==='patient_create').inputSchema.properties.civil_id);
  assert(tools.find((t:any)=>t.name==='notification_campaign_create'));
  pass('identity and notification schemas exposed');
  const cat=await call('category_create',{name_en:`Verification ${suffix}`,name_ar:`اختبار ${suffix}`,slug:`verify-${suffix}`}); catalogs.push(['categories',cat.id]);
  const med=await call('medication_create',{name:`Verification medication ${suffix}`}); catalogs.push(['medications',med.id]);
  const cond=await call('condition_create',{name_en:`Verification condition ${suffix}`,name_ar:`اختبار ${suffix}`}); catalogs.push(['conditions',cond.id]);
  for(let i=0;i<3;i++) {
    const p=await call('patient_create',{full_name:`اختبار MCP ${suffix} ${i}`,primary_phone:`+968000${Date.now().toString().slice(-4)}${i}`,civil_id:`TEST-${suffix}-${i}`,file_number:`FILE-${suffix}-${i}`,communication_consent:i===1?'denied':'granted',phone_status:'valid',category_id:cat.id});
    ids.push(p.id);
    const {error}=await db.from('patients').update({is_seed:true}).eq('id',p.id); if(error) throw error;
    assert.equal(p.civil_id,`TEST-${suffix}-${i}`);
  }
  const updated=await call('patient_update',{patient_id:ids[0],file_number:`UPDATED-${suffix}`}); assert.equal(updated.file_number,`UPDATED-${suffix}`);
  const found=await call('patients_search',{query:`UPDATED-${suffix}`}); assert(found.some((p:any)=>p.id===ids[0]));
  const interaction=await call('patient_record_interaction',{patient_id:ids[0],civil_id:`CIVIL-${suffix}`,message:{direction:'incoming',message_body:`Synthetic incoming ${suffix}`},note:'Synthetic verification only',medications:[{medication_id:med.id}],conditions:[{condition_id:cond.id}]});
  assert.equal(interaction.patient.civil_id,`CIVIL-${suffix}`);
  await call('patient_note_update',{id:interaction.note.id,body:'Updated synthetic note'});
  await call('patient_medication_update',{id:interaction.medications[0].id,dosage:'record-only'});
  await call('condition_update',{condition_id:cond.id,name_ar:'تصنيف اختبار محدث'});
  await call('category_update',{category_id:cat.id,name_ar:'فئة اختبار محدثة'});
  await call('patient_category_set',{patient_id:ids[0],category_id:cat.id});
  const msg=await call('message_create',{patient_id:ids[0],phone_number:updated.primary_phone,direction:'outgoing',message_body:'Synthetic recorded reply; no actual send'});
  const check=await call('patient_full_profile',{patient_id:ids[0]}); assert(JSON.stringify(check).includes(`CIVIL-${suffix}`));
  const {data: stored}=await db.from('messages').select('id').eq('id',msg.id).single(); assert(stored);
  pass('patient, note, medication, condition, category and incoming/outgoing writes read back from database');
  const input={idempotency_key:`verify-${suffix}`,message_body:`SIMULATED TEST ${suffix} — no provider send`,category_id:cat.id,medication_id:med.id,scheduled_at:new Date(Date.now()-60000).toISOString(),timezone:'Asia/Muscat'};
  const camp=await call('notification_campaign_create',input); campaigns.push(camp.id);
  assert.equal((await call('notification_campaign_create',input)).id,camp.id);
  await call('notification_campaign_create',{...input,message_body:'changed'},true);
  const detail=await call('notification_campaign_get',{campaign_id:camp.id});
  assert.equal(detail.notification_deliveries.length,3); assert.equal(detail.notification_deliveries.filter((d:any)=>d.status==='skipped').length,1);
  await call('patient_update',{patient_id:ids[2],communication_consent:'denied'});
  const claims=await Promise.all([call('notification_claim_due',{campaign_id:camp.id}),call('notification_claim_due',{campaign_id:camp.id})]);
  const deliveries=claims.flatMap(c=>c.deliveries); assert.equal(deliveries.length,1);
  await call('notification_delivery_result',{delivery_id:deliveries[0].delivery_id,status:'sent'},true);
  const delivered=await call('notification_delivery_result',{delivery_id:deliveries[0].delivery_id,status:'sent',external_message_id:`SIMULATED-TEST-${suffix}`});
  assert(delivered.sent_at && delivered.message_id);
  assert.equal((await call('notification_delivery_result',{delivery_id:delivered.id,status:'sent',external_message_id:`SIMULATED-TEST-${suffix}`})).message_id,delivered.message_id);
  const {data: receipt}=await db.from('messages').select('status,sent_at').eq('id',delivered.message_id).single(); assert(receipt?.sent_at && receipt.status==='sent');
  await db.from('messages').update({is_seed:true}).eq('id',delivered.message_id);
  const final=await call('notification_campaign_get',{campaign_id:camp.id}); assert.equal(final.status,'completed');
  pass('campaign idempotency, consent recheck, concurrent claims, receipt requirement and persisted simulated result');
  const future=await call('notification_campaign_create',{...input,idempotency_key:`future-${suffix}`,scheduled_at:new Date(Date.now()+86400000).toISOString(),patient_ids:[ids[0]]}); campaigns.push(future.id);
  assert.equal((await call('notification_claim_due',{campaign_id:future.id})).deliveries.length,0);
  pass('future campaign cannot be dispatched early');
  const failedCampaign=await call('notification_campaign_create',{...input,idempotency_key:`failed-${suffix}`,patient_ids:[ids[0]]}); campaigns.push(failedCampaign.id);
  const failedClaim=await call('notification_claim_due',{campaign_id:failedCampaign.id});
  const failure=await call('notification_delivery_result',{delivery_id:failedClaim.deliveries[0].delivery_id,status:'failed',error:'SIMULATED_TEST_PROVIDER_FAILURE'});
  const {data: failedMessage}=await db.from('messages').select('status,failed_at,delivery_error').eq('id',failure.message_id).single();
  assert(failedMessage?.failed_at && failedMessage.status==='failed' && failedMessage.delivery_error==='SIMULATED_TEST_PROVIDER_FAILURE');
  await db.from('messages').update({is_seed:true}).eq('id',failure.message_id);
  pass('failed delivery persists failure time, reason and outgoing message');
  await db.from('mcp_clients').update({permissions:['patients.read']}).eq('id',actor.id);
  await call('patient_create',{full_name:'must not create',primary_phone:'+96800000000'},true);
  assert(!(await rpc('tools/list')).body.result.tools.some((t:any)=>t.name==='patient_create'));
  await db.from('mcp_clients').update({permissions:[...ALL_PERMISSIONS]}).eq('id',actor.id);
  pass('read-only client cannot list or invoke writes');
  const registration=await oauth('/register',{redirect_uris:['http://127.0.0.1:45678/callback'],client_name:`Test ${suffix}`,token_endpoint_auth_method:'none'});
  assert.equal(registration.status,201); const registered=await registration.json() as any;
  const verifier=randomBytes(32).toString('base64url');
  const authorize={client_id:registered.client_id,redirect_uri:registered.redirect_uris[0],response_type:'code',code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',scope:'mcp:tools',resource:origin+'/mcp',mcp_token:secret,state:suffix};
  const wrong=await oauth('/authorize',{...authorize,redirect_uri:'https://example.invalid/callback'}); assert.equal(wrong.status,400);
  const auth=await oauth('/authorize',authorize); assert.equal(auth.status,302);
  const location=new URL(auth.headers.get('location')!); assert.equal(location.searchParams.get('state'),suffix);
  const exchange={grant_type:'authorization_code',client_id:registered.client_id,redirect_uri:registered.redirect_uris[0],code_verifier:verifier,code:location.searchParams.get('code'),resource:origin+'/mcp'};
  const issued=await oauth('/token',exchange); assert.equal(issued.status,200); const tokens=await issued.json() as any;
  assert.equal((await oauth('/token',exchange)).status,400);
  assert.equal((await rpc('tools/list',{},tokens.access_token)).status,200);
  const refresh=await oauth('/token',{grant_type:'refresh_token',client_id:registered.client_id,refresh_token:tokens.refresh_token}); assert.equal(refresh.status,200);
  await db.from('mcp_clients').update({permissions:['patients.read']}).eq('id',actor.id);
  assert(!(await rpc('tools/list',{},tokens.access_token)).body.result.tools.some((t:any)=>t.name==='patient_create'));
  await oauth('/revoke',{token:tokens.access_token}); assert.equal((await rpc('tools/list',{},tokens.access_token)).status,401);
  await oauth('/revoke',{token:tokens.refresh_token}); assert.equal((await oauth('/token',{grant_type:'refresh_token',client_id:registered.client_id,refresh_token:tokens.refresh_token})).status,400);
  pass('OAuth S256, redirect validation, code replay rejection, refresh, live permissions and revocation');
  await db.from('mcp_clients').update({status:'disabled'}).eq('id',actor.id);
  assert.equal((await rpc('tools/list')).status,401);
  pass('disabled MCP token rejected');
  const {data: logs,error}=await db.from('mcp_logs').select('id,success,entity_id').eq('client_id',actor.id); if(error) throw error;
  assert(logs?.some(l=>l.success && l.entity_id===ids[0])); assert(logs?.some(l=>!l.success));
  pass('audit contains actual success and failure with entity IDs');
  console.log(`Verified ${passed} workflow groups; patient IDs: ${ids.join(', ')}; campaign IDs: ${campaigns.join(', ')}`);
} finally {
  if(ids.length) await db.from('patients').update({archived_at:new Date().toISOString()}).in('id',ids);
  if(campaigns.length) await db.from('notification_campaigns').update({status:'cancelled'}).in('id',campaigns).eq('status','scheduled');
  for(const [table,id] of catalogs) await db.from(table).update({status:'archived'}).eq('id',id);
  await db.from('mcp_clients').update({status:'disabled',token_hash:null}).eq('id',actor.id);
}
process.exit(0);
