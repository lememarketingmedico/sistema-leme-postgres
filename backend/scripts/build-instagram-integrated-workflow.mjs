import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('Informe o JSON de origem do fluxo completo do Instagram.');
const workflow = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
workflow.name = 'LEME — Instagram completo + snapshot integrado V112.46';
const config = workflow.nodes.find((node) => node.name === 'Configuração');
if (!config?.parameters?.jsCode) throw new Error('Nó Configuração não encontrado.');
config.parameters.jsCode = config.parameters.jsCode
  .replace("sistema_url: 'https://sistema-leme-2-sistema-leme.bnwvvh.easypanel.host/api/sync',", "sistema_url: 'https://sistema.lememarketingmedico.com.br/api/sync',\n    leme_system_url: 'https://sistema.lememarketingmedico.com.br',\n    n8n_leme_secret: 'COLE_AQUI_O_MESMO_N8N_LEME_SECRET_DO_BACKEND',");

for (const node of workflow.nodes) {
  node.parameters = JSON.parse(JSON.stringify(node.parameters)
    .split('https://sistema-leme-2-sistema-leme.bnwvvh.easypanel.host').join('https://sistema.lememarketingmedico.com.br'));
}

const snapshotNode = {
  parameters: {
    method: 'POST',
    url: "={{ $('Configuração').first().json.leme_system_url.replace(/\\/$/,'') + '/api/automations/integrated-reports/instagram-snapshot' }}",
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'X-LEME-N8N-KEY', value: "={{ $('Configuração').first().json.n8n_leme_secret }}" },
      { name: 'Content-Type', value: 'application/json' }
    ] },
    sendBody: true,
    contentType: 'raw',
    rawContentType: 'application/json',
    body: "={{ JSON.stringify({ client_id: $json.cliente_id, competence: String($('Configuração').first().json.ano) + '-' + String($('Configuração').first().json.mes).padStart(2,'0'), data: $json }) }}",
    options: { timeout: 30000 }
  },
  id: crypto.randomUUID(),
  name: 'Registrar snapshot no relatório integrado',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [820, 2460],
  onError: 'continueRegularOutput'
};
workflow.nodes.push(snapshotNode);
const validation = workflow.connections['Validar métricas obrigatórias'];
if (!validation?.main?.[0]) throw new Error('Conexão de validação não encontrada.');
validation.main[0].push({ node: snapshotNode.name, type: 'main', index: 0 });

const target = new URL('../../LEME-Instagram-Completo-V112.46-RELATORIO-INTEGRADO.json', import.meta.url);
await fs.writeFile(target, JSON.stringify(workflow, null, 2) + '\n');
console.log(target.pathname);
