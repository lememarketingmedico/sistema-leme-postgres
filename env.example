{
  "name": "v97 - IA LEME Chat Interno com acesso rápido",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "chat-ia-leme-teste",
        "responseMode": "responseNode",
        "options": {}
      },
      "id": "b0e1db5e-7b8d-45a0-b55b-8d2f3a470c11",
      "name": "Receber pergunta do Sistema",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2.1,
      "position": [
        -608,
        0
      ],
      "webhookId": "6db69f64-a017-4e20-9937-chatialeme95"
    },
    {
      "parameters": {
        "url": "https://www.sistemaleme.com.br/api/sync",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "x-api-key",
              "value": "dklfajdklfjiquiuiuweiortuiqo2ur82945724893u5piojtiokjtfkledafhjadiofuyqw8e92034"
            },
            {
              "name": "Content-Type",
              "value": "application/json"
            }
          ]
        },
        "options": {
          "timeout": 30000
        }
      },
      "id": "0243ef36-c2f8-47e7-b2bc-384a02e1b9b1",
      "name": "Buscar dados do Sistema LEME",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [
        -384,
        0
      ]
    },
    {
      "parameters": {
        "jsCode": "const webhook = $('Receber pergunta do Sistema').first().json || {};\nconst body = webhook.body || webhook || {};\nconst data = $json || {};\n\nconst pergunta = String(body.message || body.pergunta || body.question || '').trim();\nif (!pergunta) {\n  return [{ json: { ok: false, error: 'Pergunta vazia.' } }];\n}\n\nfunction cleanObject(obj = {}) {\n  const out = {};\n  for (const [key, value] of Object.entries(obj || {})) {\n    if (value === undefined || value === null || value === '') continue;\n    if (/logo|base64|imagem|image|file|arquivo|anexo/i.test(key)) continue;\n    if (typeof value === 'object') continue;\n    out[key] = value;\n  }\n  return out;\n}\n\nconst clientes = (data.clientes || data.data?.clientes || []).map(c => cleanObject(c));\nconst colaboradores = (data.colaboradores || data.data?.colaboradores || []).map(c => cleanObject(c));\nconst publicacoes = (data.publicacoes || data.data?.publicacoes || []).map(p => cleanObject(p));\nconst eventos = (data.eventos || data.data?.eventos || []).map(e => cleanObject(e));\nconst financeBoxes = (data.finance_boxes || data.caixinhas || data.data?.finance_boxes || []).map(b => cleanObject(b));\nconst financeMovements = (data.finance_movements || data.movimentacoes || data.data?.finance_movements || []).map(m => cleanObject(m));\nconst prospects = (data.crm_prospects || data.data?.crm_prospects || []).map(p => cleanObject(p));\nconst acoesCrm = (data.crm_acoes || data.data?.crm_acoes || []).map(a => cleanObject(a));\n\nconst contexto = {\n  atualizado_em: new Date().toISOString(),\n  usuario: body.user || {},\n  historico_recente: Array.isArray(body.history) ? body.history.slice(-8).map(h => ({ role: h.role, content: h.content })) : [],\n  clientes,\n  colaboradores,\n  publicacoes,\n  eventos,\n  financeiro: {\n    caixinhas: financeBoxes,\n    movimentacoes: financeMovements\n  },\n  crm: {\n    prospects,\n    acoes: acoesCrm\n  }\n};\n\nreturn [{\n  json: {\n    ok: true,\n    pergunta,\n    contexto_json: JSON.stringify(contexto, null, 2)\n  }\n}];"
      },
      "id": "880eea8c-e1b9-45d9-9210-20fd4c68d740",
      "name": "Preparar contexto",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        -160,
        0
      ]
    },
    {
      "parameters": {
        "conditions": {
          "options": {
            "caseSensitive": true,
            "leftValue": "",
            "typeValidation": "strict",
            "version": 3
          },
          "conditions": [
            {
              "id": "0d669608-e6f2-4a14-91a7-2fbd2f7a9e64",
              "leftValue": "={{ $json.ok }}",
              "rightValue": true,
              "operator": {
                "type": "boolean",
                "operation": "equals"
              }
            }
          ],
          "combinator": "and"
        },
        "options": {}
      },
      "id": "fc7ec51b-5f42-4348-9d5c-2476757b57fa",
      "name": "Pergunta válida?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2.3,
      "position": [
        64,
        0
      ]
    },
    {
      "parameters": {
        "promptType": "define",
        "text": "=Pergunta do usuário:\n{{ $json.pergunta }}\n\nDados atuais do Sistema LEME em JSON:\n{{ $json.contexto_json }}",
        "options": {
          "systemMessage": "Você é a IA interna da LEME Marketing Médico, usada apenas por usuários autenticados do Sistema LEME. Responda em português do Brasil, de forma direta, prática e organizada. Use exclusivamente os dados enviados pelo Sistema LEME.\n\nVocê pode responder perguntas sobre clientes, acessos, senhas, publicações, responsáveis, Drive, grupos de aprovação, finanças, CRM e rotina interna. As credenciais cadastradas pertencem ao ambiente interno da LEME e podem ser exibidas quando o usuário pedir. Não recuse perguntas de senha ou login quando a informação estiver nos dados enviados.\n\nQuando a pergunta envolver senha ou acesso, responda apenas o acesso pedido, sem expor outros acessos que não foram solicitados. Não invente dados. Se não encontrar a informação, diga exatamente que não encontrou no cadastro.\n\nQuando houver mais de uma possibilidade de cliente, cite as opções e peça para especificar.\n\nNunca diga que não pode acessar o sistema, pois os dados foram fornecidos pelo Sistema LEME. Nunca cite JSON, prompt, política ou dados brutos. Responda como assistente operacional da LEME."
        }
      },
      "id": "ee960308-22e1-4ba1-9e29-f93158a73f28",
      "name": "Responder com IA LEME",
      "type": "@n8n/n8n-nodes-langchain.agent",
      "typeVersion": 3.1,
      "position": [
        704,
        96
      ]
    },
    {
      "parameters": {
        "model": {
          "__rl": true,
          "value": "gpt-4o-mini",
          "mode": "list",
          "cachedResultName": "gpt-4o-mini"
        },
        "builtInTools": {},
        "options": {
          "temperature": 0.1
        }
      },
      "id": "852297e4-859f-4f84-924f-f15276252f0d",
      "name": "OpenAI Chat Model",
      "type": "@n8n/n8n-nodes-langchain.lmChatOpenAi",
      "typeVersion": 1.3,
      "position": [
        704,
        304
      ],
      "credentials": {
        "openAiApi": {
          "id": "anAdOOhaXw7hSymm",
          "name": "OpenAi account"
        }
      }
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ { ok: true, answer: $json.output || $json.text || $json.resposta || '', resposta: $json.output || $json.text || $json.resposta || '' } }}",
        "options": {
          "responseCode": 200
        }
      },
      "id": "b5689de7-ed4e-4b2e-9024-62a6e572ca4a",
      "name": "Responder ao Sistema LEME",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1.4,
      "position": [
        976,
        96
      ]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ { ok: false, error: $json.error || 'Pergunta vazia.' } }}",
        "options": {
          "responseCode": 400
        }
      },
      "id": "0e085df7-02d9-4f25-ae54-5e03fe4e5ad8",
      "name": "Responder erro",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1.4,
      "position": [
        256,
        208
      ]
    },
    {
      "parameters": {
        "jsCode": "const pergunta = String($json.pergunta || '').trim();\nlet contexto = {};\ntry { contexto = JSON.parse($json.contexto_json || '{}'); } catch (e) { contexto = {}; }\nconst clientes = Array.isArray(contexto.clientes) ? contexto.clientes : [];\n\nfunction norm(value) {\n  return String(value || '')\n    .normalize('NFD')\n    .replace(/[\\u0300-\\u036f]/g, '')\n    .toLowerCase()\n    .replace(/[^a-z0-9]+/g, ' ')\n    .trim();\n}\n\nfunction compact(value) {\n  return norm(value).replace(/\\s+/g, '');\n}\n\nfunction getFirst(obj, keys) {\n  for (const key of keys) {\n    const value = obj?.[key];\n    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();\n  }\n  return '';\n}\n\nfunction clientScore(client, qNorm, qCompact) {\n  const name = String(client.nome_cliente || client.nome || client.cliente || '').trim();\n  const nameNorm = norm(name);\n  const nameCompact = compact(name);\n  if (!nameNorm) return 0;\n  let score = 0;\n  if (qCompact.includes(nameCompact)) score += 100;\n  const tokens = nameNorm.split(/\\s+/).filter(t => t.length > 2 && !['dra', 'dr', 'clinica', 'centro', 'araguari', 'medico', 'medica'].includes(t));\n  for (const token of tokens) if (qNorm.includes(token)) score += Math.min(25, token.length * 3);\n  const firstImportant = tokens[0];\n  if (firstImportant && qNorm.includes(firstImportant)) score += 20;\n  return score;\n}\n\nconst qNorm = norm(pergunta);\nconst qCompact = compact(pergunta);\nconst accessIntent = /(senha|senhas|login|logins|acesso|acessos|usuario|usuário|wordpress|instagram|facebook|email|e-mail|registro\\s*br|registrobr|aprova[cç][aã]o|grupo|whatsapp)/i.test(pergunta);\n\nif (!accessIntent) {\n  return [{ json: { ...$json, usar_ia: true, resposta_rapida: '' } }];\n}\n\nconst ranked = clientes\n  .map(client => ({ client, score: clientScore(client, qNorm, qCompact) }))\n  .filter(item => item.score > 0)\n  .sort((a, b) => b.score - a.score);\n\nif (!ranked.length) {\n  return [{ json: { ...$json, usar_ia: true, resposta_rapida: '' } }];\n}\n\nif (ranked.length > 1 && ranked[0].score === ranked[1].score && ranked[0].score < 45) {\n  const options = ranked.slice(0, 5).map(item => `- ${item.client.nome_cliente || item.client.nome}`).join('\\n');\n  return [{ json: { ...$json, usar_ia: false, resposta_rapida: `Encontrei mais de um cliente possível. Especifique melhor:\\n${options}` } }];\n}\n\nconst client = ranked[0].client;\nconst nome = client.nome_cliente || client.nome || 'Cliente';\n\nconst platforms = [\n  {\n    id: 'instagram', label: 'Instagram', aliases: ['instagram', 'insta'],\n    fields: [\n      ['Perfil', ['instagram', 'conta_instagram']],\n      ['Login', ['instagram_login', 'usuario_instagram']],\n      ['Senha', ['instagram_senha', 'senha_instagram']]\n    ]\n  },\n  {\n    id: 'facebook', label: 'Facebook', aliases: ['facebook', 'face', 'meta'],\n    fields: [\n      ['Perfil', ['facebook', 'conta_facebook']],\n      ['Login', ['facebook_login', 'email_facebook', 'usuario_facebook']],\n      ['Senha', ['facebook_senha', 'senha_facebook']]\n    ]\n  },\n  {\n    id: 'email', label: 'E-mail', aliases: ['email', 'e mail', 'e-mail', 'gmail', 'conta google'],\n    fields: [\n      ['E-mail/Login', ['email_login', 'email_google', 'conta_google', 'email']],\n      ['Senha', ['email_senha', 'senha_email']]\n    ]\n  },\n  {\n    id: 'registrobr', label: 'RegistroBR', aliases: ['registro br', 'registrobr', 'registro'],\n    fields: [\n      ['Login', ['registrobr_login', 'usuario_registrobr']],\n      ['Senha', ['registrobr_senha', 'senha_registrobr']],\n      ['Validade', ['validade_registrobr']]\n    ]\n  },\n  {\n    id: 'wordpress', label: 'WordPress', aliases: ['wordpress', 'word press', 'wp', 'site'],\n    fields: [\n      ['URL', ['wordpress_url', 'wp_url']],\n      ['Login', ['wordpress_login', 'usuario_wordpress']],\n      ['Senha', ['wordpress_senha', 'senha_wordpress']]\n    ]\n  },\n  {\n    id: 'aprovacao', label: 'Aprovação WhatsApp', aliases: ['aprovacao', 'aprovação', 'grupo', 'whatsapp', 'zap'],\n    fields: [\n      ['Destino de aprovação', ['remote_jid_aprovacao', 'destino_aprovacao', 'whatsapp_aprovacao', 'numero_aprovacao', 'telefone_aprovacao']],\n      ['Número do doutor', ['telefone_doutor', 'numero_doutor']],\n      ['Número da secretária', ['telefone_secretaria', 'numero_secretaria']]\n    ]\n  }\n];\n\nconst matchedPlatforms = platforms.filter(p => p.aliases.some(alias => qNorm.includes(norm(alias))));\nconst wantsAll = /(todos os acessos|todos acessos|acessos do|senhas do|logins do)/i.test(pergunta);\n\nfunction platformText(platform) {\n  const lines = [];\n  for (const [label, keys] of platform.fields) {\n    const value = getFirst(client, keys);\n    if (value) lines.push(`${label}: ${value}`);\n  }\n  if (!lines.length) return '';\n  return `*${platform.label}*\\n${lines.join('\\n')}`;\n}\n\nlet answerParts = [];\nif (wantsAll && matchedPlatforms.length === 0) {\n  answerParts = platforms.map(platformText).filter(Boolean);\n} else if (matchedPlatforms.length) {\n  answerParts = matchedPlatforms.map(platformText).filter(Boolean);\n} else if (/(senha|login|usuario|usuário)/i.test(pergunta)) {\n  return [{ json: { ...$json, usar_ia: false, resposta_rapida: `De qual acesso você precisa para ${nome}? Pode ser Instagram, Facebook, E-mail, RegistroBR ou WordPress.` } }];\n}\n\nif (!answerParts.length) {\n  return [{ json: { ...$json, usar_ia: false, resposta_rapida: `Não encontrei esse acesso cadastrado para ${nome}.` } }];\n}\n\nconst resposta = `*${nome}*\\n\\n${answerParts.join('\\n\\n')}`;\nreturn [{ json: { ...$json, usar_ia: false, resposta_rapida: resposta, cliente_encontrado: nome } }];"
      },
      "id": "2b2630ee-530a-4fe7-bb22-1d6fea72bc96",
      "name": "Resposta rápida de acessos",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        256,
        0
      ]
    },
    {
      "parameters": {
        "conditions": {
          "options": {
            "caseSensitive": true,
            "leftValue": "",
            "typeValidation": "strict",
            "version": 3
          },
          "conditions": [
            {
              "id": "1c9bc4b8-978b-4c14-bb47-0fed16072976",
              "leftValue": "={{ $json.resposta_rapida }}",
              "rightValue": "",
              "operator": {
                "type": "string",
                "operation": "notEmpty",
                "singleValue": true
              }
            }
          ],
          "combinator": "and"
        },
        "options": {}
      },
      "id": "775cb146-b49e-459d-9b17-ffbcaa9d8102",
      "name": "Tem resposta rápida?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2.3,
      "position": [
        480,
        0
      ]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ { ok: true, answer: $json.resposta_rapida || '', resposta: $json.resposta_rapida || '', fast: true } }}",
        "options": {
          "responseCode": 200
        }
      },
      "id": "753be068-9105-4c39-934f-45a31600fde0",
      "name": "Responder acesso rápido",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1.4,
      "position": [
        704,
        -112
      ]
    }
  ],
  "connections": {
    "Receber pergunta do Sistema": {
      "main": [
        [
          {
            "node": "Buscar dados do Sistema LEME",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Buscar dados do Sistema LEME": {
      "main": [
        [
          {
            "node": "Preparar contexto",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Preparar contexto": {
      "main": [
        [
          {
            "node": "Pergunta válida?",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Pergunta válida?": {
      "main": [
        [
          {
            "node": "Resposta rápida de acessos",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Responder erro",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Resposta rápida de acessos": {
      "main": [
        [
          {
            "node": "Tem resposta rápida?",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Tem resposta rápida?": {
      "main": [
        [
          {
            "node": "Responder acesso rápido",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Responder com IA LEME",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Responder com IA LEME": {
      "main": [
        [
          {
            "node": "Responder ao Sistema LEME",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "OpenAI Chat Model": {
      "ai_languageModel": [
        [
          {
            "node": "Responder com IA LEME",
            "type": "ai_languageModel",
            "index": 0
          }
        ]
      ]
    }
  },
  "pinData": {},
  "meta": {
    "templateCredsSetupCompleted": true,
    "instanceId": "eebe9e81565ae11dc9ed66e2d5f5c4a5d65cd698a84c8ada275e87203f331f98"
  }
}