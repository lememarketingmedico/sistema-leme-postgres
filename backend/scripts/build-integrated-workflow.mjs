import fs from 'node:fs/promises';

const source = new URL('../../n8n-exemplos/LEME-Analytics-V107.3.4-LOGO-BRANCO.json', import.meta.url);
const target = new URL('../../LEME-Relatorio-Integrado-Mensal-V112.45.json', import.meta.url);
const workflow = JSON.parse(await fs.readFile(source, 'utf8'));
workflow.name = 'LEME — Relatório Integrado Mensal V112.45';

const byName = (name) => workflow.nodes.find((node) => node.name === name);
const config = byName('CONFIGURAÇÃO — EDITE AQUI');
config.parameters.assignments.assignments.find((item) => item.name === 'leme_system_url').value = 'https://sistema.lememarketingmedico.com.br';

const webhook = byName('Webhook manual');
webhook.parameters.path = 'leme-relatorio-integrado';
webhook.webhookId = 'leme-relatorio-integrado';

const validate = byName('Validar webhook e payload');
validate.parameters.jsCode = validate.parameters.jsCode
  .replace("const required = ['delivery_id', 'client_id', 'start_date', 'end_date'];", "const required = ['delivery_id', 'client_id', 'competence'];")
  .replace("_source: 'manual'", "_source: body.trigger || 'manual'");

const replacements = [
  ['/api/automations/site-analytics/due-reports', '/api/automations/integrated-reports/due-reports'],
  ['/api/automations/site-analytics/report-context', '/api/automations/integrated-reports/report-context'],
  ['/api/automations/site-analytics/report-status', '/api/automations/integrated-reports/report-status']
];
for (const node of workflow.nodes) {
  const serialized = JSON.stringify(node.parameters);
  let changed = serialized;
  for (const [from, to] of replacements) changed = changed.split(from).join(to);
  node.parameters = JSON.parse(changed);
}

byName('Preparar contexto').parameters.jsCode = `return $input.all().map((item, index) => ({
  json: { delivery_id: String(item.json.delivery_id || ''), n8n_execution_id: String($execution.id), source: item.json._source || item.json.trigger || 'manual' },
  pairedItem: { item: index }
})).filter((item) => item.json.delivery_id);`;

const driveCredentials = {
  googleApi: { id: 'o28Imyqlk0TMgqPd', name: 'Google Sheets account' }
};
const folderNode = (name, queryString, parentExpression, position) => ({
  parameters: {
    authentication: 'serviceAccount', resource: 'fileFolder', queryString,
    filter: { folderId: { __rl: true, value: parentExpression, mode: 'id' } }, options: {}
  },
  id: crypto.randomUUID(), name, type: 'n8n-nodes-base.googleDrive', typeVersion: 3, position,
  credentials: driveCredentials, alwaysOutputData: true, onError: 'continueErrorOutput'
});
workflow.nodes.push(
  folderNode('Localizar pasta Posts', 'Posts', "={{ (() => { const v=String($('Buscar contexto').item.json.client?.drive_folder_id||''); const m=v.match(/\\/folders\\/([^/?#]+)/)||v.match(/[?&]id=([^&#]+)/); return m?m[1]:v; })() }}", [250, 240]),
  folderNode('Localizar pasta Ano', "={{ String($('Buscar contexto').item.json.period.competence).slice(0,4) }}", "={{ $json.id }}", [470, 240]),
  folderNode('Localizar pasta Mês', "={{ (() => { const c=String($('Buscar contexto').item.json.period.competence); const nomes=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']; const m=Number(c.slice(5,7)); return String(m).padStart(2,'0')+' - '+nomes[m-1]; })() }}", "={{ $json.id }}", [690, 240])
);

const htmlNode = byName('Montar HTML do relatório');
htmlNode.position = [920, 240];
htmlNode.parameters.jsCode = String.raw`
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n = (v) => new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0}).format(Number(v||0));
const pct = (v) => new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(Number(v||0))+'%';
const slug = (v) => String(v||'cliente').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const months=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const contexts=$('Buscar contexto').all();
const lineChart=(items,key='value',dateKey='date',color='#2f8fc0')=>{
  const rows=Array.isArray(items)?items:[]; if(!rows.length)return '<div class="empty">Sem série diária disponível.</div>';
  const w=800,h=230,l=48,t=16,b=32,values=rows.map(x=>Number(x[key]||x.views||x.impressions||0)),max=Math.max(...values,1);
  const x=i=>l+i*(w-l-15)/Math.max(rows.length-1,1), y=v=>t+(h-t-b)*(1-v/max);
  const points=values.map((v,i)=>x(i).toFixed(1)+','+y(v).toFixed(1)).join(' '),step=Math.max(1,Math.ceil(rows.length/6));
  const grid=[0,.25,.5,.75,1].map(p=>{const gy=t+p*(h-t-b);return '<line x1="'+l+'" x2="'+(w-15)+'" y1="'+gy+'" y2="'+gy+'"/><text x="40" y="'+(gy+4)+'" text-anchor="end">'+n(max*(1-p))+'</text>';}).join('');
  const labels=rows.map((r,i)=>(i%step===0||i===rows.length-1)?'<text x="'+x(i)+'" y="'+(h-8)+'" text-anchor="middle">'+esc(String(r[dateKey]||r.label||'').slice(5,10).split('-').reverse().join('/'))+'</text>':'').join('');
  return '<svg viewBox="0 0 '+w+' '+h+'"><g class="chart-grid">'+grid+'</g><polyline points="'+points+'" style="stroke:'+color+'"/>'+labels+'</svg>';
};
const table=(items,cols,limit=12)=>{const list=(Array.isArray(items)?items:[]).slice(0,limit);if(!list.length)return '<div class="empty">Sem dados no período.</div>';return '<table><thead><tr>'+cols.map(c=>'<th>'+esc(c[0])+'</th>').join('')+'</tr></thead><tbody>'+list.map((row,i)=>'<tr>'+cols.map((c,j)=>'<td>'+(j===0?'<b>'+(i+1)+'</b> ':'')+esc(typeof c[1]==='function'?c[1](row):row[c[1]])+'</td>').join('')+'</tr>').join('')+'</tbody></table>';};
const radarMap=(data)=>{const map=data?.map;if(!map?.available)return '<div class="empty">Mapa não disponível.</div>';const pts=map.points||[];const lines=[];for(const p of pts){for(const q of pts){if((p.row===q.row&&q.col===p.col+1)||(p.col===q.col&&q.row===p.row+1))lines.push('<line x1="'+p.x_percent+'" y1="'+p.y_percent+'" x2="'+q.x_percent+'" y2="'+q.y_percent+'"/>');}}const dots=pts.map(p=>{const rank=p.position==null?'—':p.position;const cls=p.position===1?'top1':p.position<=3?'top3':p.position<=10?'top10':'low';return '<g class="'+cls+'"><circle cx="'+p.x_percent+'" cy="'+p.y_percent+'" r="2.65"/><text x="'+p.x_percent+'" y="'+(p.y_percent+.8)+'">'+rank+'</text></g>';}).join('');return '<div class="radar-map"><img src="data:'+map.mime_type+';base64,'+map.data_base64+'"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><g class="grid-lines">'+lines.join('')+'</g><g class="grid-dots">'+dots+'</g></svg></div>';};
return $input.all().map((folderItem,index)=>{
  const raw=contexts[index]?.json||contexts[0]?.json||{};const ctx=raw.data||raw;
  const client=ctx.client||{},period=ctx.period||{},src=ctx.sources||{},insta=src.instagram||{},gb=src.google_business||{},perf=gb.performance||{},actions=perf.actions||{},imp=perf.impressions||{},rad=src.local_radar||{},scan=rad.radar||{},sum=scan.summary||{},site=src.site_analytics||{},ss=site.summary||{};
  const comp=String(period.competence||''),mi=Number(comp.slice(5,7))-1,periodLabel=(months[mi]||comp)+' de '+comp.slice(0,4);
  const instagramDaily=insta.views_diarias_custom||insta.views_daily||[];
  const instagramReach=insta.alcance_diario_custom||insta.reach_daily||[];
  const dailyGbp=(perf.daily||[]).map(d=>({date:d.date,value:d.impressions||0}));
  const siteTimeline=site.timeline||[];
  const kpi=(label,value,detail='')=>'<div class="kpi"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong><span>'+esc(detail)+'</span></div>';
  const header=(title,sub='')=>'<header><div><img src="https://lememarketingmedico.com.br/wp-content/uploads/2025/09/Logo-Leme-Horizontal-Completa-scaled.png"></div><div><h1>'+esc(title)+'</h1><p>'+esc(sub||client.nome_cliente)+'</p></div></header>';
  let pages=[];
  pages.push('<section class="page cover"><div class="cover-band"><img src="https://lememarketingmedico.com.br/wp-content/uploads/2025/09/Logo-Leme-Horizontal-Completa-scaled.png"><span>RELATÓRIO MENSAL INTEGRADO</span></div><div class="cover-main"><p>DESEMPENHO DIGITAL</p><h1>'+esc(client.nome_cliente)+'</h1><h2>'+esc(periodLabel)+'</h2><div class="cover-tags"><span>Instagram</span><span>Google Business</span><span>Local Radar</span><span>Site</span></div></div><footer>LEME Marketing Médico · dados consolidados em um único documento</footer></section>');
  if(src.instagram)pages.push('<section class="page">'+header('Instagram',periodLabel)+'<div class="kpis">'+kpi('Visualizações',n(insta.views_total))+kpi('Alcance',n(insta.alcance_total))+kpi('Interações',n(insta.interacoes_total))+kpi('Cliques no link',n(insta.cliques_total))+'</div><div class="section"><h2>Crescimento da comunidade</h2><div class="kpis compact">'+kpi('Seguidores atuais',n(insta.seguidores_atuais))+kpi('Ganhos',n(insta.seguidores_ganhos))+kpi('Perdas',n(insta.seguidores_perdidos))+kpi('Saldo líquido',(Number(insta.saldo_liquido||0)>0?'+':'')+n(insta.saldo_liquido))+'</div></div><div class="section"><h2>Evolução diária de visualizações</h2>'+lineChart(instagramDaily,'value','date','#4a90d9')+'</div><div class="section"><h2>Evolução diária de alcance</h2>'+lineChart(instagramReach,'value','date','#173765')+'</div></section>');
  if(src.google_business)pages.push('<section class="page">'+header('Google Business — Insights',periodLabel)+'<div class="kpis">'+kpi('Impressões',n(imp.total),'Maps + Pesquisa')+kpi('Interações',n(actions.total),pct(perf.interaction_rate)+' de taxa')+kpi('Ligações',n(actions.calls))+kpi('Rotas',n(actions.directions))+'</div><div class="kpis compact">'+kpi('Visitas ao site',n(actions.website))+kpi('Reservas',n(actions.bookings))+kpi('Maps mobile',n(imp.mobile_maps))+kpi('Pesquisa mobile',n(imp.mobile_search))+'</div><div class="section"><h2>Evolução diária de impressões</h2>'+lineChart(dailyGbp,'value','date','#2f8fc0')+'<p class="explain">Mostra quantas vezes o perfil apareceu a cada dia no Google Maps e na Pesquisa. O eixo vertical representa a quantidade de impressões.</p></div><div class="section"><h2>Termos que encontraram o perfil</h2>'+table(gb.keywords,[['Termo','keyword'],['Volume',r=>r.value??('Menos de '+(r.threshold||0))]],10)+'</div></section>');
  if(src.local_radar)pages.push('<section class="page">'+header('Local Radar',esc(scan.keyword||'')+' · '+periodLabel)+'<div class="kpis">'+kpi('Posição média',String(sum.averagePosition??'—'))+kpi('Top 1',pct(sum.top1Percent||0))+kpi('Top 3',pct(sum.top3Percent||0))+kpi('Top 10',pct(sum.top10Percent||0))+'</div><div class="section map-section"><h2>Visibilidade geográfica</h2>'+radarMap(rad)+'<div class="legend"><span class="l1">1</span> Top 1 <span class="l3">3</span> Top 3 <span class="l10">10</span> Top 10 <span class="ll">+</span> Fora do Top 10</div></div><p class="explain">Cada ponto representa uma busca simulada para a palavra-chave monitorada a partir daquela localização. Quanto menor o número, melhor a posição.</p></section>');
  if(src.local_radar)pages.push('<section class="page">'+header('Concorrentes no Local Pack',periodLabel)+'<div class="section"><h2>Benchmark competitivo</h2>'+table(rad.competitors,[['Perfil',r=>r.name||r.title||'Perfil'],['Posição média',r=>r.averagePosition??r.average_position??'—'],['Top 3',r=>pct(r.top3Percent??r.top3_percent??0)],['Avaliação',r=>r.rating??'—']],18)+'</div><div class="section"><h2>Leitura objetiva</h2><p>O cliente apareceu em <strong>'+pct(sum.top3Percent||0)+'</strong> dos pontos no Top 3 e encerrou o período com posição média <strong>'+esc(sum.averagePosition??'—')+'</strong>. Este quadro compara a presença do perfil com os concorrentes encontrados no mesmo grid e na mesma palavra-chave.</p></div></section>');
  if(src.site_analytics)pages.push('<section class="page">'+header('Analytics do Site',periodLabel)+'<div class="kpis">'+kpi('Visualizações',n(ss.views))+kpi('Visitantes',n(ss.visitors))+kpi('Sessões',n(ss.sessions))+kpi('Média diária',n(ss.daily_average))+'</div><div class="section"><h2>Evolução das visualizações</h2>'+lineChart(siteTimeline,'views','date','#2d78a8')+'</div><div class="columns"><div class="section"><h2>Páginas mais acessadas</h2>'+table(site.pages,[['Página',r=>r.title||r.page_title||r.path],['Views','views']],8)+'</div><div class="section"><h2>Principais cidades</h2>'+table(site.cities,[['Cidade',r=>[r.city,r.state].filter(Boolean).join(' - ')],['Views','views']],8)+'</div></div><div class="columns"><div class="section"><h2>Origens</h2>'+table(site.sources,[['Canal',r=>r.source||r.label],['Views','views']],6)+'</div><div class="section"><h2>Dispositivos</h2>'+table(site.devices,[['Dispositivo',r=>r.device||r.label],['Views','views']],6)+'</div></div></section>');
  pages.push('<section class="page closing">'+header('Resumo do mês',periodLabel)+'<div class="summary-grid"><article><small>Instagram</small><strong>'+n(insta.alcance_total)+'</strong><span>contas alcançadas</span></article><article><small>Google Business</small><strong>'+n(imp.total)+'</strong><span>impressões</span></article><article><small>Local Radar</small><strong>'+pct(sum.top3Percent||0)+'</strong><span>dos pontos no Top 3</span></article><article><small>Site</small><strong>'+n(ss.views)+'</strong><span>visualizações</span></article></div><div class="section final"><h2>Visão integrada</h2><p>Este documento reúne os principais resultados dos canais digitais monitorados pela LEME. As métricas são coletadas diretamente das integrações correspondentes e representam a competência indicada. Os relatórios individuais continuam disponíveis para análises específicas.</p></div><div class="signature">LEME Marketing Médico<br><span>Estratégia, presença e crescimento digital para a área médica.</span></div></section>');
  const css='<style>@page{size:A4 portrait;margin:9mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#153247;background:#fff;font-size:11px}.page{min-height:278mm;page-break-after:always;position:relative;padding-bottom:20px}.page:last-child{page-break-after:auto}header{display:flex;justify-content:space-between;align-items:center;padding:18px 22px;border-radius:15px;background:linear-gradient(125deg,#123b5f,#2f8fc0);color:#fff;margin-bottom:15px}header img{width:185px;max-height:50px;object-fit:contain;background:#fff;padding:5px;border-radius:7px}header h1{margin:0;font-size:23px;text-align:right}header p{margin:6px 0 0;text-align:right;opacity:.9}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin:12px 0}.kpi{border:1px solid #dce8ef;border-radius:11px;padding:13px;background:#f7fafc}.kpi small{display:block;color:#6e8191;font-weight:700}.kpi strong{display:block;color:#123b5f;font-size:23px;margin:7px 0 4px}.kpi span{color:#7d8e9b;font-size:9px}.compact .kpi strong{font-size:19px}.section{border:1px solid #dce8ef;border-radius:13px;padding:14px;margin-top:12px;break-inside:avoid}.section h2{margin:0 0 10px;color:#123b5f;font-size:16px}.section p{font-size:12px;line-height:1.7}svg{width:100%;height:220px}.chart-grid line{stroke:#e2e9ee;stroke-width:1}.chart-grid text,svg>text{fill:#718493;font-size:9px}.section>svg polyline{fill:none;stroke-width:3.5;stroke-linecap:round;stroke-linejoin:round}.explain{color:#687d8e;font-size:10px;line-height:1.5;margin:8px 0 0}.empty{display:grid;place-items:center;height:130px;background:#f5f8fa;color:#778a98;border-radius:9px}table{width:100%;border-collapse:collapse}th{text-align:left;text-transform:uppercase;font-size:8px;color:#718493;border-bottom:2px solid #dce8ef;padding:7px}td{padding:8px 7px;border-bottom:1px solid #e8eef2}td b{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:6px;background:#e5f2f8;color:#236b95}.columns{display:grid;grid-template-columns:1fr 1fr;gap:10px}.radar-map{position:relative;width:100%;aspect-ratio:640/430;border-radius:12px;overflow:hidden;background:#edf1f3}.radar-map img,.radar-map svg{position:absolute;inset:0;width:100%;height:100%}.grid-lines line{stroke:#154f72;stroke-width:.36;opacity:.8}.grid-dots circle{stroke:white;stroke-width:.45}.grid-dots text{fill:#fff;font-size:2.1px;text-anchor:middle;font-weight:700}.top1 circle{fill:#22a86a}.top3 circle{fill:#e4a51d}.top10 circle{fill:#ef7f32}.low circle{fill:#d94b50}.legend{display:flex;align-items:center;justify-content:center;gap:7px;margin-top:9px}.legend span{width:19px;height:19px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:700}.l1{background:#22a86a}.l3{background:#e4a51d}.l10{background:#ef7f32}.ll{background:#d94b50}.cover{background:linear-gradient(145deg,#0c2d47,#1a608b);color:#fff;padding:34px;border-radius:22px}.cover-band{display:flex;justify-content:space-between;align-items:center}.cover-band img{width:220px;background:#fff;padding:8px;border-radius:8px}.cover-band span{font-size:10px;letter-spacing:.2em}.cover-main{margin-top:82px}.cover-main p{letter-spacing:.22em;color:#86c8eb}.cover-main h1{font-size:46px;line-height:1.05;margin:16px 0}.cover-main h2{font-size:24px;font-weight:400;color:#b9dff3}.cover-tags{display:flex;gap:8px;margin-top:35px}.cover-tags span{padding:8px 12px;border:1px solid rgba(255,255,255,.28);border-radius:99px}.cover footer{position:absolute;bottom:35px;left:34px}.summary-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-top:25px}.summary-grid article{padding:22px;border-radius:15px;background:#f1f7fa;border-left:5px solid #2f8fc0}.summary-grid small,.summary-grid span{display:block;color:#718493}.summary-grid strong{display:block;font-size:34px;color:#123b5f;margin:8px 0}.final{margin-top:28px;padding:22px}.signature{text-align:center;margin-top:55px;font-size:18px;font-weight:700}.signature span{font-size:10px;color:#718493;font-weight:400}</style>';
  const html='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'+css+'</head><body>'+pages.join('')+'</body></html>';
  const fileName='Relatorio Completo - '+slug(client.nome_cliente)+' - '+comp+'.pdf';
  return {json:{html,delivery_id:String(ctx.delivery?.id||''),client_id:String(client.id||''),file_name:fileName,drive_folder_id:String(folderItem.json.id||''),caption:'📊 *Relatório mensal completo — '+periodLabel+'*\n\nSegue o relatório integrado de *'+String(client.nome_cliente||'Cliente')+'*, reunindo Instagram, Google Business, Local Radar e Site em um único PDF.\n\nLEME Marketing Médico',period_label:periodLabel},pairedItem:{item:index}};
});`;

byName('Salvar relatório no Drive').parameters.folderId.value = "={{ $('Montar HTML do relatório').item.json.drive_folder_id }}";
const success = byName('Callback de sucesso');
success.parameters.body = "={{ JSON.stringify({ delivery_id: $('Montar HTML do relatório').item.json.delivery_id, status: 'sent', n8n_execution_id: String($execution.id), drive_file_id: $('Salvar relatório no Drive').item.json.id, file_reference: 'https://drive.google.com/file/d/' + $('Salvar relatório no Drive').item.json.id + '/view' }) }}";

const c = workflow.connections;
c['Buscar contexto'] = { main: [[{ node: 'Localizar pasta Posts', type: 'main', index: 0 }], [{ node: 'Erro ao buscar contexto', type: 'main', index: 0 }]] };
c['Localizar pasta Posts'] = { main: [[{ node: 'Localizar pasta Ano', type: 'main', index: 0 }],[{ node: 'Erro ao salvar no Drive', type: 'main', index: 0 }]] };
c['Localizar pasta Ano'] = { main: [[{ node: 'Localizar pasta Mês', type: 'main', index: 0 }],[{ node: 'Erro ao salvar no Drive', type: 'main', index: 0 }]] };
c['Localizar pasta Mês'] = { main: [[{ node: 'Montar HTML do relatório', type: 'main', index: 0 }],[{ node: 'Erro ao salvar no Drive', type: 'main', index: 0 }]] };

const note = byName('LEIA PRIMEIRO');
if (note) note.parameters.content = '## Relatório Integrado LEME V112.45\n\nGera um único PDF mensal com Instagram, Google Business Insights, Local Radar/concorrentes e Analytics do Site. Salva em **Posts / Ano / Mês** no Drive e envia ao grupo configurado.\n\nEdite somente o nó **CONFIGURAÇÃO — EDITE AQUI** e confirme as credenciais já usadas nos fluxos atuais.';

await fs.writeFile(target, JSON.stringify(workflow, null, 2) + '\n');
console.log(target.pathname);
