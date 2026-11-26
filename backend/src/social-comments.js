const GRAPH_VERSION = String(process.env.META_GRAPH_VERSION || 'v27.0').replace(/^\/+|\/+$/g,'');
const META_SYSTEM_TOKEN = String(process.env.META_SYSTEM_USER_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || '').trim();
const META_BUSINESS_ID = String(process.env.META_BUSINESS_ID || '').trim();

export function registerCommentMonitoring(app, deps) {
  const { query, crypto, ok, fail, isLemeN8nSecret, encryptIntegrationSecret, decryptIntegrationSecret,
    normalizeSubmittedIntegrationSecret, maskIntegrationSecret, fetchWithTimeout, broadcastRealtime } = deps;

  const publicMonitor = row => ({
    client_id: row?.client_id || '', enabled: Boolean(row?.enabled),
    instagram_account_id: row?.instagram_account_id || '', instagram_username: row?.instagram_username || '',
    facebook_page_id: row?.facebook_page_id || '', facebook_page_name: row?.facebook_page_name || '',
    ignore_own_comments: row?.ignore_own_comments !== false,
    has_page_access_token: Boolean(row?.page_access_token_encrypted),
    page_access_token_masked: row?.page_access_token_encrypted ? maskIntegrationSecret(decryptIntegrationSecret(row.page_access_token_encrypted)) : '',
    subscription_status: row?.subscription_status || 'not_subscribed', subscription_error: row?.subscription_error || '',
    subscribed_at: row?.subscribed_at || null, updated_at: row?.updated_at || null
  });
  async function monitor(clientId, required=false) {
    const found=await query('SELECT * FROM social_comment_monitors WHERE client_id=$1 LIMIT 1',[String(clientId||'')]);
    if(!found.rows[0]&&required) fail('Monitoramento não configurado para este cliente.',404);
    return found.rows[0]||null;
  }
  function assertN8n(req){ if(!isLemeN8nSecret(req)) fail('X-LEME-N8N-KEY inválida.',403); }

  async function graphCollection(path,token=META_SYSTEM_TOKEN){
    const rows=[];
    let url=`https://graph.facebook.com/${GRAPH_VERSION}/${path}${path.includes('?')?'&':'?'}access_token=${encodeURIComponent(token)}`;
    for(let page=0;url&&page<10;page+=1){
      const response=await fetchWithTimeout(url,{},20000);
      const body=await response.json();
      if(!response.ok||body.error) throw new Error(body.error?.message||`Meta respondeu ${response.status}`);
      rows.push(...(Array.isArray(body.data)?body.data:[]));
      url=body.paging?.next||'';
    }
    return rows;
  }

  async function listMetaAssets(){
    if(!META_SYSTEM_TOKEN) fail('Configure META_SYSTEM_USER_ACCESS_TOKEN no ambiente do sistema.',409);
    const fields='id,name,access_token,instagram_business_account{id,username}';
    const paths=META_BUSINESS_ID
      ? [`${encodeURIComponent(META_BUSINESS_ID)}/owned_pages?fields=${encodeURIComponent(fields)}&limit=200`,`${encodeURIComponent(META_BUSINESS_ID)}/client_pages?fields=${encodeURIComponent(fields)}&limit=200`]
      : [`me/accounts?fields=${encodeURIComponent(fields)}&limit=200`];
    const results=[];
    for(const path of paths){try{results.push(...await graphCollection(path));}catch(error){if(paths.length===1)throw error;}}
    const unique=new Map();
    results.forEach(page=>{if(page?.id&&page?.access_token)unique.set(String(page.id),page);});
    return [...unique.values()].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'pt-BR'));
  }

  app.get('/api/social-comments/meta-assets',async(_req,res)=>{
    if(!META_SYSTEM_TOKEN)return res.json(ok({configured:false,assets:[]}));
    const assets=await listMetaAssets();
    res.json(ok({configured:true,assets:assets.map(page=>({facebook_page_id:String(page.id||''),facebook_page_name:String(page.name||''),instagram_account_id:String(page.instagram_business_account?.id||''),instagram_username:String(page.instagram_business_account?.username||'')}))}));
  });

  app.post('/api/clients/:clientId/comment-monitoring/link-meta-asset',async(req,res)=>{
    const pageId=String(req.body?.facebook_page_id||'');
    const assets=await listMetaAssets();
    const page=assets.find(item=>String(item.id)===pageId);
    if(!page)fail('A página selecionada não está disponível para o token global da LEME.',404);
    const current=await monitor(req.params.clientId);
    const saved=await query(`INSERT INTO social_comment_monitors(client_id,enabled,instagram_account_id,instagram_username,facebook_page_id,facebook_page_name,page_access_token_encrypted,ignore_own_comments,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()) ON CONFLICT(client_id) DO UPDATE SET instagram_account_id=$3,instagram_username=$4,facebook_page_id=$5,facebook_page_name=$6,page_access_token_encrypted=$7,updated_at=now() RETURNING *`,[
      String(req.params.clientId||''),Boolean(current?.enabled),String(page.instagram_business_account?.id||''),String(page.instagram_business_account?.username||''),String(page.id||''),String(page.name||''),encryptIntegrationSecret(String(page.access_token||'')),current?.ignore_own_comments!==false]);
    broadcastRealtime('social_comments','monitor_updated',String(req.params.clientId||''));
    res.json(ok({monitor:publicMonitor(saved.rows[0])}));
  });

  app.get('/api/clients/:clientId/comment-monitoring',async(req,res)=>{
    const row=await monitor(req.params.clientId);
    const history=await query(`SELECT id,provider,comment_id,post_id,author_name,author_username,message,occurred_at,publication_url,notification_status,notification_attempts,last_error
      FROM social_comments WHERE client_id=$1 ORDER BY occurred_at DESC NULLS LAST,created_at DESC LIMIT 100`,[String(req.params.clientId||'')]);
    res.json(ok({monitor:publicMonitor(row),comments:history.rows}));
  });
  app.put('/api/clients/:clientId/comment-monitoring',async(req,res)=>{
    const clientId=String(req.params.clientId||'');
    const current=await monitor(clientId);
    const submitted=normalizeSubmittedIntegrationSecret(req.body.page_access_token||'');
    const encrypted=submitted?encryptIntegrationSecret(submitted):(current?.page_access_token_encrypted||'');
    const saved=await query(`INSERT INTO social_comment_monitors(client_id,enabled,instagram_account_id,instagram_username,facebook_page_id,facebook_page_name,page_access_token_encrypted,ignore_own_comments,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()) ON CONFLICT(client_id) DO UPDATE SET enabled=$2,instagram_account_id=$3,instagram_username=$4,facebook_page_id=$5,facebook_page_name=$6,page_access_token_encrypted=$7,ignore_own_comments=$8,updated_at=now() RETURNING *`,[
      clientId,Boolean(req.body.enabled),String(req.body.instagram_account_id||''),String(req.body.instagram_username||''),String(req.body.facebook_page_id||''),String(req.body.facebook_page_name||''),encrypted,req.body.ignore_own_comments!==false]);
    broadcastRealtime('social_comments','monitor_updated',clientId);
    res.json(ok({monitor:publicMonitor(saved.rows[0])}));
  });
  app.post('/api/clients/:clientId/comment-monitoring/subscribe',async(req,res)=>{
    const row=await monitor(req.params.clientId,true);
    if(!row.facebook_page_id||!row.page_access_token_encrypted) fail('Informe o ID da Página e o Page Access Token.',409);
    const token=decryptIntegrationSecret(row.page_access_token_encrypted);
    const url=`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(row.facebook_page_id)}/subscribed_apps`;
    let result;
    try {
      const response=await fetchWithTimeout(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({subscribed_fields:'feed',access_token:token})},20000);
      result=await response.json(); if(!response.ok||result.error) throw new Error(result.error?.message||`Meta respondeu ${response.status}`);
      await query(`UPDATE social_comment_monitors SET enabled=true,subscription_status='subscribed',subscription_error='',subscribed_at=now(),updated_at=now() WHERE client_id=$1`,[row.client_id]);
    } catch(error) {
      await query(`UPDATE social_comment_monitors SET subscription_status='error',subscription_error=$2,updated_at=now() WHERE client_id=$1`,[row.client_id,String(error.message||error).slice(0,1000)]);
      throw error;
    }
    res.json(ok({subscribed:true,result}));
  });
  app.post('/api/clients/:clientId/comment-monitoring/unsubscribe',async(req,res)=>{
    const row=await monitor(req.params.clientId,true);
    if(row.facebook_page_id&&row.page_access_token_encrypted){
      const token=decryptIntegrationSecret(row.page_access_token_encrypted);
      const url=`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(row.facebook_page_id)}/subscribed_apps?access_token=${encodeURIComponent(token)}`;
      const response=await fetchWithTimeout(url,{method:'DELETE'},20000); const body=await response.json();
      if(!response.ok||body.error) fail(body.error?.message||'A Meta recusou a remoção.',502);
    }
    await query(`UPDATE social_comment_monitors SET enabled=false,subscription_status='not_subscribed',subscription_error='',updated_at=now() WHERE client_id=$1`,[row.client_id]);
    res.json(ok({unsubscribed:true}));
  });

  app.get('/api/automations/social-comments/resolve',async(req,res)=>{
    assertN8n(req); const provider=String(req.query.provider||''); const account=String(req.query.account_id||'');
    const column=provider==='instagram'?'instagram_account_id':'facebook_page_id';
    const found=await query(`SELECT m.*,c.nome_cliente FROM social_comment_monitors m JOIN clientes c ON c.registro_id=m.client_id WHERE m.${column}=$1 LIMIT 1`,[account]);
    const row=found.rows[0]; if(!row) return res.status(404).json({ok:false,error:'Conta não vinculada no Sistema LEME.'});
    res.json(ok({client:{id:row.client_id,name:row.nome_cliente},monitor:{enabled:row.enabled,ignore_own_comments:row.ignore_own_comments,instagram_account_id:row.instagram_account_id,instagram_username:row.instagram_username,facebook_page_id:row.facebook_page_id}}));
  });
  app.post('/api/automations/social-comments/register',async(req,res)=>{
    assertN8n(req); const b=req.body||{}; const provider=String(b.provider||''); const commentId=String(b.comment_id||'');
    if(!['instagram','facebook'].includes(provider)||!commentId) fail('provider e comment_id são obrigatórios.');
    const m=await monitor(b.client_id,true); if(!m.enabled) return res.json(ok({accepted:false,reason:'monitor_disabled',should_notify:false}));
    const ownIds=[m.instagram_account_id,m.facebook_page_id].filter(Boolean).map(String);
    const ownNames=[m.instagram_username].filter(Boolean).map(v=>String(v).replace(/^@/,'').toLowerCase());
    const isOwn=ownIds.includes(String(b.author_id||''))||ownNames.includes(String(b.author_username||'').replace(/^@/,'').toLowerCase());
    if(m.ignore_own_comments&&isOwn) return res.json(ok({accepted:false,reason:'own_comment',should_notify:false}));
    const message=String(b.message||'').slice(0,4000);
    const hash=crypto.createHash('sha256').update(JSON.stringify({provider,commentId,message})).digest('hex');
    const inserted=await query(`INSERT INTO social_comments(client_id,provider,account_id,comment_id,post_id,parent_comment_id,author_id,author_name,author_username,message,occurred_at,publication_url,payload_hash,next_retry_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now()) ON CONFLICT(provider,comment_id) DO NOTHING RETURNING *`,[
      String(b.client_id||''),provider,String(b.account_id||''),commentId,String(b.post_id||''),String(b.parent_comment_id||''),String(b.author_id||''),String(b.author_name||'').slice(0,300),String(b.author_username||'').slice(0,300),message,b.occurred_at||new Date().toISOString(),String(b.publication_url||'').slice(0,2000),hash]);
    const row=inserted.rows[0];
    res.json(ok({accepted:Boolean(row),duplicate:!row,should_notify:Boolean(row),comment:row?{id:row.id,client_id:row.client_id}:null}));
  });
  app.post('/api/automations/social-comments/:id/delivery',async(req,res)=>{
    assertN8n(req); const success=String(req.body.status||'')==='sent';
    const attempts=Math.max(1,Number(req.body.attempts||1)); const delay=Math.min(3600,Math.pow(2,attempts)*60);
    const updated=await query(`UPDATE social_comments SET notification_status=$2,notification_attempts=notification_attempts+1,last_error=$3,whatsapp_message_id=$4,next_retry_at=CASE WHEN $2='failed' THEN now()+($5||' seconds')::interval ELSE NULL END,updated_at=now() WHERE id=$1 RETURNING id`,[
      String(req.params.id||''),success?'sent':'failed',String(req.body.error||'').slice(0,1000),String(req.body.whatsapp_message_id||''),String(delay)]);
    res.json(ok({updated:Boolean(updated.rows[0])}));
  });
  app.get('/api/automations/social-comments/retry-queue',async(req,res)=>{
    assertN8n(req); const rows=await query(`SELECT sc.*,c.nome_cliente FROM social_comments sc JOIN clientes c ON c.registro_id=sc.client_id WHERE sc.notification_status IN('pending','failed') AND COALESCE(sc.next_retry_at,now())<=now() AND sc.notification_attempts<6 ORDER BY sc.created_at LIMIT 50`);
    res.json(ok({comments:rows.rows}));
  });
}
