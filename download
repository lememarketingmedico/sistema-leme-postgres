{
  "name": "LEME - Avisos de gravações 15, 10 e 7 dias",
  "nodes": [
    {
      "parameters": {
        "rule": {
          "interval": [
            {
              "field": "cronExpression",
              "expression": "0 0 8 * * *"
            }
          ]
        }
      },
      "id": "529367cc-f944-4c84-9a97-18196d4ba8dc",
      "name": "Todos os dias às 08h",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.2,
      "position": [
        -720,
        160
      ]
    },
    {
      "parameters": {},
      "id": "c491530b-5c41-44af-9076-93ecc57cc464",
      "name": "Teste manual",
      "type": "n8n-nodes-base.manualTrigger",
      "typeVersion": 1,
      "position": [
        -720,
        340
      ]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://sistema-leme-2-sistema-leme.bnwvvh.easypanel.host/webhook/avisos-gravacoes",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "x-api-key",
              "value": "COLE_AQUI_A_MESMA_N8N_API_KEY_DO_EASYPANEL"
            },
            {
              "name": "Content-Type",
              "value": "application/json"
            }
          ]
        },
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            {
              "name": "origem",
              "value": "n8n_avisos_gravacoes"
            }
          ]
        },
        "options": {
          "timeout": 30000
        }
      },
      "id": "853c727e-2bc2-42a6-a3c6-14781e9f1b22",
      "name": "Buscar avisos no Sistema LEME",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [
        -464,
        240
      ]
    },
    {
      "parameters": {
        "jsCode": "const response = $json || {};\nconst avisos = response.avisos || response.data?.avisos || [];\n\nif (!Array.isArray(avisos) || !avisos.length) return [];\n\nreturn avisos.map(aviso => ({\n  json: { ...aviso },\n  pairedItem: { item: 0 }\n}));"
      },
      "id": "ad6babec-4107-4a74-a460-9ee63883d830",
      "name": "Separar avisos pendentes",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        -224,
        240
      ]
    },
    {
      "parameters": {
        "jsCode": "const fallbackGroup = '120363406336468365@g.us';\n\nconst formatPhone = value => {\n  const raw = String(value || '').trim();\n  if (!raw) return '';\n  if (/@g\\.us$/i.test(raw) || /@s\\.whatsapp\\.net$/i.test(raw)) return raw;\n  let digits = raw.replace(/\\D/g, '');\n  if (digits && !digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) digits = `55${digits}`;\n  return digits;\n};\n\nconst brDate = value => {\n  const match = String(value || '').slice(0, 10).match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);\n  return match ? `${match[3]}/${match[2]}/${match[1]}` : 'não informada';\n};\n\nreturn $input.all().map((item, index) => {\n  const aviso = item.json || {};\n  const days = Number(aviso.dias_restantes || 0);\n  const countdown = days === 0\n    ? 'A previsão chegou para hoje.'\n    : days === 1\n      ? 'Falta 1 dia para a data prevista.'\n      : `Faltam ${days} dias para a data prevista.`;\n  const destination = formatPhone(aviso.responsavel_telefone) || fallbackGroup;\n  const message = [\n    '🎥 *Lembrete de gravação — Sistema LEME*',\n    '',\n    countdown,\n    '',\n    `*Cliente:* ${aviso.cliente_nome || 'Cliente sem nome'}`,\n    `*Estoque estimado:* ${Number(aviso.videos_restantes_estimados || 0)} vídeo(s)`,\n    `*Última gravação:* ${brDate(aviso.ultima_gravacao)}`,\n    `*Próxima previsão:* ${brDate(aviso.data_prevista)}`,\n    `*Responsável:* ${aviso.responsavel_nome || 'Equipe LEME'}`,\n    '',\n    'Entre no Sistema LEME e clique em *Agendar gravação*. Assim que ela for agendada, os próximos avisos desse ciclo param automaticamente.'\n  ].join('\\n');\n\n  return {\n    json: {\n      ...aviso,\n      remote_jid: destination,\n      mensagem: message\n    },\n    pairedItem: { item: index }\n  };\n});"
      },
      "id": "7fca1fcc-aa5d-4af5-9cf1-c7ade2349c99",
      "name": "Preparar mensagem e destino",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        32,
        240
      ]
    },
    {
      "parameters": {
        "options": {
          "reset": false
        }
      },
      "id": "66182e73-d252-4e15-88af-7ad6ff5664f6",
      "name": "Loop de avisos",
      "type": "n8n-nodes-base.splitInBatches",
      "typeVersion": 3,
      "position": [
        280,
        240
      ]
    },
    {
      "parameters": {
        "resource": "messages-api",
        "instanceName": "Leme Marketing Médico",
        "remoteJid": "={{ $json.remote_jid }}",
        "messageText": "={{ $json.mensagem }}",
        "options_message": {}
      },
      "id": "c664af5d-daf8-40ec-a203-a70066a8c334",
      "name": "Enviar aviso no WhatsApp",
      "type": "n8n-nodes-evolution-api.evolutionApi",
      "typeVersion": 1,
      "position": [
        520,
        160
      ],
      "credentials": {
        "evolutionApi": {
          "id": "YN1IPxHgezfgnFka",
          "name": "Evolution account"
        }
      }
    },
    {
      "parameters": {
        "mode": "combine",
        "combineBy": "combineByPosition",
        "options": {}
      },
      "id": "b76f04f9-7857-4771-b140-37a68809b453",
      "name": "Preservar dados após o envio",
      "type": "n8n-nodes-base.merge",
      "typeVersion": 3.2,
      "position": [
        760,
        240
      ]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://sistema-leme-2-sistema-leme.bnwvvh.easypanel.host/webhook/marcar-aviso-gravacao",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "x-api-key",
              "value": "COLE_AQUI_A_MESMA_N8N_API_KEY_DO_EASYPANEL"
            },
            {
              "name": "Content-Type",
              "value": "application/json"
            }
          ]
        },
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            {
              "name": "gravacao_id",
              "value": "={{ $json.gravacao_id }}"
            },
            {
              "name": "limiar_aviso",
              "value": "={{ $json.limiar_aviso }}"
            },
            {
              "name": "dias_restantes",
              "value": "={{ $json.dias_restantes }}"
            },
            {
              "name": "origem",
              "value": "n8n_avisos_gravacoes"
            }
          ]
        },
        "options": {
          "timeout": 30000
        }
      },
      "id": "971417cb-a12b-403b-b782-5ec57189a838",
      "name": "Confirmar aviso enviado",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [
        1016,
        240
      ]
    },
    {
      "parameters": {
        "content": "## Como funciona\n\n1. Nos dois nós HTTP, troque `COLE_AQUI_A_MESMA_N8N_API_KEY_DO_EASYPANEL` pela chave `N8N_API_KEY` usada no backend.\n2. Executa todos os dias às 08h (America/Sao_Paulo).\n3. O Sistema LEME devolve somente gravações **Previstas**, ainda não agendadas, nos alertas de 15, 10 e 7 dias.\n4. Envia ao telefone do colaborador responsável. Se ele não tiver telefone cadastrado, usa o grupo interno da LEME.\n5. Só confirma o aviso depois que o WhatsApp responder com sucesso.\n6. O backend impede mensagens duplicadas e interrompe os avisos assim que a gravação vira **Agendada**.\n\nUse o gatilho **Teste manual** para validar.",
        "height": 300,
        "width": 420,
        "color": 5
      },
      "id": "6db20675-b53d-42ce-a607-2480f86dbe69",
      "name": "Instruções",
      "type": "n8n-nodes-base.stickyNote",
      "typeVersion": 1,
      "position": [
        -720,
        -200
      ]
    }
  ],
  "pinData": {},
  "connections": {
    "Todos os dias às 08h": {
      "main": [
        [
          {
            "node": "Buscar avisos no Sistema LEME",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Teste manual": {
      "main": [
        [
          {
            "node": "Buscar avisos no Sistema LEME",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Buscar avisos no Sistema LEME": {
      "main": [
        [
          {
            "node": "Separar avisos pendentes",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Separar avisos pendentes": {
      "main": [
        [
          {
            "node": "Preparar mensagem e destino",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Preparar mensagem e destino": {
      "main": [
        [
          {
            "node": "Loop de avisos",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Loop de avisos": {
      "main": [
        [],
        [
          {
            "node": "Enviar aviso no WhatsApp",
            "type": "main",
            "index": 0
          },
          {
            "node": "Preservar dados após o envio",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Enviar aviso no WhatsApp": {
      "main": [
        [
          {
            "node": "Preservar dados após o envio",
            "type": "main",
            "index": 1
          }
        ]
      ]
    },
    "Preservar dados após o envio": {
      "main": [
        [
          {
            "node": "Confirmar aviso enviado",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Confirmar aviso enviado": {
      "main": [
        [
          {
            "node": "Loop de avisos",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  },
  "active": false,
  "settings": {
    "executionOrder": "v1",
    "timezone": "America/Sao_Paulo"
  },
  "versionId": "65b1e86b-716a-48a2-8db4-f9f8e158a4c4",
  "meta": {
    "templateCredsSetupCompleted": true,
    "instanceId": "eebe9e81565ae11dc9ed66e2d5f5c4a5d65cd698a84c8ada275e87203f331f98"
  },
  "tags": []
}
