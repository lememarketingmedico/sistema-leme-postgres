{
  "name": "Enviar aprovação - preserva grupos WhatsApp v91",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "enviar-aprovacao-teste",
        "options": {}
      },
      "id": "9390277c-401b-4ef8-92d7-47d4fd889fc8",
      "name": "Receber aprovação do Sistema",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2.1,
      "position": [
        -1960,
        520
      ]
    },
    {
      "parameters": {
        "method": "GET",
        "url": "https://sistema-leme-2-sistema-leme.bnwvvh.easypanel.host/api/sync",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "x-api-key",
              "value": "COLE_AQUI_A_SUA_N8N_API_KEY"
            }
          ]
        },
        "options": {}
      },
      "id": "8aea27e3-785c-4d47-85b2-121871542790",
      "name": "Buscar dados do Sistema LEME",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [
        -1740,
        520
      ]
    },
    {
      "parameters": {
        "jsCode": "\nconst webhook = $('Receber aprovação do Sistema').first().json || {};\nconst body = webhook.body || webhook || {};\nconst data = $json || {};\n\nconst clientes = data.clientes || data.clients || data.data?.clientes || [];\nconst colaboradores = data.colaboradores || data.collaborators || data.data?.colaboradores || [];\nconst publicacoes = data.publicacoes || data.posts || data.data?.publicacoes || [];\n\nconst normalize = value => String(value || '')\n  .normalize('NFD')\n  .replace(/[\\u0300-\\u036f]/g, '')\n  .toLowerCase()\n  .replace(/[^a-z0-9]/g, '');\n\nconst onlyDigits = value => String(value || '').replace(/\\D/g, '');\nconst isGroupJid = value => /@g\\.us$/i.test(String(value || '').trim());\nconst isUserJid = value => /@s\\.whatsapp\\.net$/i.test(String(value || '').trim());\nconst phoneBR = value => {\n  const raw = String(value || '').trim();\n  if (!raw) return '';\n\n  // Se for grupo do WhatsApp, preserva exatamente o JID.\n  // Exemplo: 120363406739579811@g.us\n  if (isGroupJid(raw) || isUserJid(raw)) return raw;\n\n  let phone = onlyDigits(raw);\n  if (phone && !phone.startsWith('55') && phone.length >= 10 && phone.length <= 11) phone = `55${phone}`;\n  return phone;\n};\nconst firstWhatsAppDestination = (...values) => {\n  for (const value of values) {\n    const destination = phoneBR(value);\n    if (destination) return destination;\n  }\n  return '';\n};\n\nconst requestedClient = body.client || body.cliente || {};\nconst requestedCollab = body.collaborator || body.colaborador || {};\nconst requestedClientId = String(requestedClient.registro_id || requestedClient.id || body.cliente_id || '').trim();\nconst requestedClientName = String(requestedClient.nome_cliente || requestedClient.nome || body.nome_cliente || '').trim();\nconst requestedCollabId = String(requestedCollab.registro_id || requestedCollab.id || body.colaborador_id || '').trim();\n\nlet client = null;\nif (requestedClientId) {\n  client = clientes.find(c => String(c.registro_id || c.id || '') === requestedClientId);\n}\nif (!client && requestedClientName) {\n  const target = normalize(requestedClientName);\n  client = clientes.find(c => normalize(c.nome_cliente || c.nome) === target)\n    || clientes.find(c => normalize(c.nome_cliente || c.nome).includes(target) || target.includes(normalize(c.nome_cliente || c.nome)));\n}\nclient = client || requestedClient;\n\nconst clientId = String(client.registro_id || client.id || requestedClientId || '').trim();\nconst collaboratorId = String(requestedCollabId || client.responsavel_id || requestedCollab.registro_id || requestedCollab.id || '').trim();\nlet collaborator = colaboradores.find(c => String(c.registro_id || c.id || '') === collaboratorId) || requestedCollab || {};\n\nconst now = DateTime.now().setZone('America/Sao_Paulo');\nconst startOfNextWeek = now.plus({ weeks: 1 }).startOf('week').minus({ days: 1 }).startOf('day');\nconst endOfNextWeek = startOfNextWeek.plus({ days: 6 }).endOf('day');\nconst startKey = startOfNextWeek.toFormat('yyyy-MM-dd');\nconst endKey = endOfNextWeek.toFormat('yyyy-MM-dd');\n\nconst demands = publicacoes\n  .filter(p => String(p.cliente_id || '') === clientId)\n  .filter(p => {\n    const day = String(p.data_publicacao || '').slice(0, 10);\n    return day >= startKey && day <= endKey;\n  })\n  .filter(p => String(p.status || '').toLowerCase() !== 'publicado')\n  .sort((a, b) => String(a.data_publicacao || '').localeCompare(String(b.data_publicacao || '')));\n\nconst base = {\n  client_id: clientId,\n  nome_cliente: client.nome_cliente || client.nome || requestedClientName || 'Cliente',\n  cliente_telefone: firstWhatsAppDestination(\n    requestedClient.remote_jid_aprovacao,\n    requestedClient.destino_aprovacao,\n    requestedClient.whatsapp_aprovacao,\n    client.remote_jid_aprovacao,\n    client.destino_aprovacao,\n    client.whatsapp_aprovacao,\n    client.numero_aprovacao,\n    client.telefone_aprovacao,\n    client.telefone_secretaria,\n    requestedClient.telefone_secretaria,\n    client.telefone_doutor,\n    requestedClient.telefone_doutor\n  ),\n  telefone_doutor: phoneBR(client.telefone_doutor || requestedClient.telefone_doutor || ''),\n  telefone_secretaria: phoneBR(client.telefone_secretaria || requestedClient.telefone_secretaria || ''),\n  collaborator_id: collaboratorId,\n  nome_colaborador: collaborator.nome || requestedCollab.nome || 'Colaborador',\n  telefone_colaborador: phoneBR(collaborator.telefone || collaborator.whatsapp || requestedCollab.telefone || requestedCollab.whatsapp || ''),\n  periodo_inicio: startKey,\n  periodo_fim: endKey,\n};\n\nif (!clientId) {\n  return [{ json: { controle: 'erro', motivo: 'Cliente não encontrado no payload nem no sistema.', ...base } }];\n}\n\nif (!base.cliente_telefone) {\n  return [{ json: { controle: 'erro', motivo: `Cliente ${base.nome_cliente} não possui telefone do doutor/secretária cadastrado.`, ...base } }];\n}\n\nif (!demands.length) {\n  return [{ json: { controle: 'erro', motivo: `Não encontrei demandas da próxima semana para ${base.nome_cliente}.`, ...base } }];\n}\n\nreturn demands.map((post, index) => {\n  const registroId = String(post.registro_id || post.id || '');\n  return {\n    json: {\n      controle: 'demanda',\n      index: index + 1,\n      total_demandas: demands.length,\n      registro_id: registroId,\n      id: registroId,\n      titulo: post.titulo || 'Publicação sem título',\n      formato: post.formato || '',\n      status: post.status || '',\n      data_publicacao: String(post.data_publicacao || '').slice(0, 10),\n      drive_folder_url: post.drive_folder_url || post.banco_google || '',\n      legenda: post.legenda || '',\n      ...base,\n      post,\n      client,\n      collaborator,\n    }\n  };\n});\n"
      },
      "id": "23adfcbc-cea7-4211-acb3-3c8f9f72563a",
      "name": "Preparar demandas do cliente",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        -1520,
        520
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
              "id": "5063ec6f-71dc-4b4e-b35f-92c2b9135c97",
              "leftValue": "={{ $json.controle }}",
              "rightValue": "demanda",
              "operator": {
                "type": "string",
                "operation": "equals"
              }
            }
          ],
          "combinator": "and"
        },
        "options": {}
      },
      "id": "4549dabe-daf9-42c1-aec3-db13f55a665d",
      "name": "Tem demandas para conferir?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2.3,
      "position": [
        -1300,
        520
      ]
    },
    {
      "parameters": {
        "resource": "messages-api",
        "instanceName": "Leme Marketing Médico",
        "remoteJid": "={{ ($json.telefone_colaborador || '').toString().replace(/\\D/g, '') }}",
        "messageText": "=🚨🚨 *Não consegui enviar para aprovação*\n\nCliente: {{ $json.nome_cliente }}\nMotivo: {{ $json.motivo }}\n\nNenhuma mensagem foi enviada ao cliente.",
        "options_message": {}
      },
      "id": "61b94d29-23f0-48ea-a64c-e8a86482967a",
      "name": "Avisar erro ao colaborador",
      "type": "n8n-nodes-evolution-api.evolutionApi",
      "typeVersion": 1,
      "position": [
        -1060,
        720
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
        "options": {}
      },
      "id": "c9add47c-e66e-488d-b1fa-2ab2a9a136d6",
      "name": "Loop conferir arquivos",
      "type": "n8n-nodes-base.splitInBatches",
      "typeVersion": 3,
      "position": [
        -1060,
        420
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
              "id": "6dd54eb5-7ea1-479f-a42e-58aa27dd9f8f",
              "leftValue": "={{ $json.drive_folder_url }}",
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
      "id": "b6fb4c64-f9be-4526-8ee2-f073c9dfd0eb",
      "name": "Tem pasta da demanda?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2.3,
      "position": [
        -820,
        500
      ]
    },
    {
      "parameters": {
        "resource": "messages-api",
        "instanceName": "Leme Marketing Médico",
        "remoteJid": "={{ ($json.telefone_colaborador || '').toString().replace(/\\D/g, '') }}",
        "messageText": "=🚨🚨 *Está faltando a pasta da demanda*\n\nCliente: {{ $json.nome_cliente }}\nDemanda: {{ $json.titulo }}\nData: {{ DateTime.fromISO($json.data_publicacao).toFormat('dd/MM/yyyy') }}\n\nCadastre o link da pasta no sistema e clique em enviar para aprovação novamente.\n\nNenhuma mensagem foi enviada ao cliente.",
        "options_message": {}
      },
      "id": "75e5adf8-551f-46f5-b55a-8f5aa17aa01f",
      "name": "Avisar pasta ausente",
      "type": "n8n-nodes-evolution-api.evolutionApi",
      "typeVersion": 1,
      "position": [
        -600,
        720
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
        "resource": "fileFolder",
        "filter": {
          "folderId": {
            "__rl": true,
            "value": "={{ $json.drive_folder_url }}",
            "mode": "url"
          }
        },
        "options": {
          "fields": [
            "mimeType",
            "id",
            "name"
          ]
        }
      },
      "id": "187a9802-3129-4fde-89d2-a7d7331f2d08",
      "name": "Conferir arquivos e pastas",
      "type": "n8n-nodes-base.googleDrive",
      "typeVersion": 3,
      "position": [
        -600,
        420
      ],
      "credentials": {
        "googleDriveOAuth2Api": {
          "id": "qR6jjrRH5v3ne4Qv",
          "name": "Google Drive account"
        }
      },
      "alwaysOutputData": true
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
              "id": "5d6813f3-0cfa-45ee-9d2e-d58e7c8ff2dd",
              "leftValue": "={{ $json.mimeType }}",
              "rightValue": "application/vnd.google-apps.folder",
              "operator": {
                "type": "string",
                "operation": "equals"
              }
            }
          ],
          "combinator": "and"
        },
        "options": {}
      },
      "id": "d7816cfb-a398-44a2-b100-593a1c2c1a0b",
      "name": "É pasta na conferência?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2.3,
      "position": [
        -380,
        420
      ]
    },
    {
      "parameters": {
        "resource": "fileFolder",
        "queryString": "=",
        "filter": {
          "folderId": {
            "__rl": true,
            "value": "={{ $json.id }}",
            "mode": "id"
          }
        },
        "options": {
          "fields": [
            "id",
            "mimeType",
            "name"
          ]
        }
      },
      "id": "8905116e-5f9d-4526-bb75-c5adc82f03f5",
      "name": "Conferir arquivos dentro da pasta",
      "type": "n8n-nodes-base.googleDrive",
      "typeVersion": 3,
      "position": [
        -160,
        300
      ],
      "credentials": {
        "googleDriveOAuth2Api": {
          "id": "qR6jjrRH5v3ne4Qv",
          "name": "Google Drive account"
        }
      }
    },
    {
      "parameters": {},
      "id": "6357cf8a-009b-4709-b57c-946655109c12",
      "name": "Juntar arquivos da conferência",
      "type": "n8n-nodes-base.merge",
      "typeVersion": 3.2,
      "position": [
        60,
        420
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
              "id": "b6a08667-57c4-4d48-b7ce-0c4378919f79",
              "leftValue": "={{ $json.mimeType }}",
              "rightValue": "^(image\\/(png|jpeg)|video\\/mp4)$",
              "operator": {
                "type": "string",
                "operation": "regex"
              }
            }
          ],
          "combinator": "and"
        },
        "options": {}
      },
      "id": "1dd9b468-ac40-475a-80bb-c580ec3f89e9",
      "name": "Filtrar mídia da conferência",
      "type": "n8n-nodes-base.filter",
      "typeVersion": 2.3,
      "position": [
        280,
        420
      ],
      "alwaysOutputData": true
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
              "id": "a797f5bb-9de5-41d9-8315-8d0ac736d2dd",
              "leftValue": "={{ $json.id }}",
              "rightValue": "",
              "operator": {
                "type": "string",
                "operation": "notExists",
                "singleValue": true
              }
            }
          ],
          "combinator": "and"
        },
        "options": {}
      },
      "id": "16efc2a5-1c44-4671-87df-3bc18e150b42",
      "name": "Faltou mídia?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2.3,
      "position": [
        500,
        420
      ]
    },
    {
      "parameters": {
        "resource": "messages-api",
        "instanceName": "Leme Marketing Médico",
        "remoteJid": "={{ ($('Loop conferir arquivos').item.json.telefone_colaborador || '').toString().replace(/\\D/g, '') }}",
        "messageText": "=🚨🚨 *Está faltando arquivo do cliente {{ $('Loop conferir arquivos').item.json.nome_cliente }}*\n\nDemanda: {{ $('Loop conferir arquivos').item.json.titulo }}\nData: {{ DateTime.fromISO($('Loop conferir arquivos').item.json.data_publicacao).toFormat('dd/MM/yyyy') }}\n\nConfira a pasta:\n{{ $('Loop conferir arquivos').item.json.drive_folder_url }}\n\nDepois de subir, clique em enviar para aprovação novamente.\n\nNenhuma mensagem foi enviada ao cliente.",
        "options_message": {}
      },
      "id": "b3c56320-56bf-442f-bbef-3b004b6c8115",
      "name": "Avisar mídia ausente",
      "type": "n8n-nodes-evolution-api.evolutionApi",
      "typeVersion": 1,
      "position": [
        740,
        300
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
        "fieldsToAggregate": {
          "fieldToAggregate": [
            {
              "fieldToAggregate": "id"
            }
          ]
        },
        "options": {}
      },
      "id": "94ab646d-d6f3-4d9d-bc40-0f788ccc8e05",
      "name": "Confirmar mídia encontrada",
      "type": "n8n-nodes-base.aggregate",
      "typeVersion": 1,
      "position": [
        740,
        520
      ]
    },
    {
      "parameters": {
        "options": {}
      },
      "id": "87c454fb-9f7f-4d3d-a4b7-da3ce4fb06d7",
      "name": "Continuar conferência",
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.4,
      "position": [
        960,
        520
      ],
      "alwaysOutputData": true
    },
    {
      "parameters": {
        "jsCode": "const items = $('Preparar demandas do cliente').all().filter(item => item.json.controle === 'demanda');\nreturn items.map(item => ({ json: item.json }));"
      },
      "id": "611f6379-0774-4e92-b174-e169b00a2606",
      "name": "Recriar lista para envio",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        -820,
        80
      ]
    },
    {
      "parameters": {
        "options": {
          "reset": false
        }
      },
      "id": "7f5c5505-ac3c-4177-8b43-da087f47a479",
      "name": "Loop enviar demandas",
      "type": "n8n-nodes-base.splitInBatches",
      "typeVersion": 3,
      "position": [
        -600,
        80
      ]
    },
    {
      "parameters": {
        "resource": "messages-api",
        "instanceName": "=Leme Marketing Médico",
        "remoteJid": "={{ ($('Preparar demandas do cliente').first().json.telefone_colaborador || '').toString().replace(/\\D/g, '') }}",
        "messageText": "=✅ Pronto, já enviei para o cliente apenas as mídias, legenda, enquete e separação das demandas de: {{ $('Preparar demandas do cliente').first().json.nome_cliente }}",
        "options_message": {}
      },
      "id": "6448668a-5b02-4b54-8906-80355c751e07",
      "name": "Avisar colaborador concluído",
      "type": "n8n-nodes-evolution-api.evolutionApi",
      "typeVersion": 1,
      "position": [
        -360,
        -120
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
        "resource": "fileFolder",
        "filter": {
          "folderId": {
            "__rl": true,
            "value": "={{ $json.drive_folder_url }}",
            "mode": "url"
          }
        },
        "options": {
          "fields": [
            "mimeType",
            "id",
            "name"
          ]
        }
      },
      "id": "9eaa1f34-a00f-4601-9173-ac9fb43ae582",
      "name": "Buscar arquivos e pastas para envio",
      "type": "n8n-nodes-base.googleDrive",
      "typeVersion": 3,
      "position": [
        -360,
        120
      ],
      "credentials": {
        "googleDriveOAuth2Api": {
          "id": "qR6jjrRH5v3ne4Qv",
          "name": "Google Drive account"
        }
      }
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
              "id": "059e17fc-b109-4317-9f54-2dab35d8edb1",
              "leftValue": "={{ $json.mimeType }}",
              "rightValue": "application/vnd.google-apps.folder",
              "operator": {
                "type": "string",
                "operation": "equals"
              }
            }
          ],
          "combinator": "and"
        },
        "options": {}
      },
      "id": "9c4ad570-e3a5-402a-87f8-d1ce406d83e1",
      "name": "É pasta no envio?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2.3,
      "position": [
        -140,
        120
      ]
    },
    {
      "parameters": {
        "resource": "fileFolder",
        "queryString": "=",
        "filter": {
          "folderId": {
            "__rl": true,
            "value": "={{ $json.id }}",
            "mode": "id"
          }
        },
        "options": {
          "fields": [
            "id",
            "mimeType",
            "name"
          ]
        }
      },
      "id": "a26030d3-c04b-4cc7-80ba-fa7fdbff9af1",
      "name": "Buscar arquivos dentro da pasta",
      "type": "n8n-nodes-base.googleDrive",
      "typeVersion": 3,
      "position": [
        80,
        0
      ],
      "credentials": {
        "googleDriveOAuth2Api": {
          "id": "qR6jjrRH5v3ne4Qv",
          "name": "Google Drive account"
        }
      }
    },
    {
      "parameters": {},
      "id": "1c0aa0b7-5f2f-4e18-880d-001018b38cbe",
      "name": "Juntar arquivos para envio",
      "type": "n8n-nodes-base.merge",
      "typeVersion": 3.2,
      "position": [
        300,
        120
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
              "id": "0ee90da5-1434-466b-bc85-444226b4f63c",
              "leftValue": "={{ $json.mimeType }}",
              "rightValue": "^(image\\/(png|jpeg)|video\\/mp4)$",
              "operator": {
                "type": "string",
                "operation": "regex"
              }
            }
          ],
          "combinator": "and"
        },
        "options": {}
      },
      "id": "30530478-b742-4227-8cff-d6cdcf3962e4",
      "name": "Filtrar mídia para envio",
      "type": "n8n-nodes-base.filter",
      "typeVersion": 2.3,
      "position": [
        520,
        120
      ]
    },
    {
      "parameters": {
        "sortFieldsUi": {
          "sortField": [
            {
              "fieldName": "name"
            }
          ]
        },
        "options": {}
      },
      "id": "68a15531-dee0-4879-809a-f7aa6864b2b5",
      "name": "Ordenar mídia",
      "type": "n8n-nodes-base.sort",
      "typeVersion": 1,
      "position": [
        740,
        120
      ]
    },
    {
      "parameters": {
        "operation": "download",
        "fileId": {
          "__rl": true,
          "value": "={{ $json.id }}",
          "mode": "id"
        },
        "options": {}
      },
      "id": "4bfc60b2-5eda-4e41-a2ec-9c57d5ef2fcb",
      "name": "Baixar arquivo",
      "type": "n8n-nodes-base.googleDrive",
      "typeVersion": 3,
      "position": [
        960,
        120
      ],
      "credentials": {
        "googleDriveOAuth2Api": {
          "id": "qR6jjrRH5v3ne4Qv",
          "name": "Google Drive account"
        }
      }
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
              "id": "e7230e9c-c65a-4396-819e-32094bdc0a52",
              "leftValue": "={{ $json.mimeType }}",
              "rightValue": "video/mp4",
              "operator": {
                "type": "string",
                "operation": "equals",
                "name": "filter.operator.equals"
              }
            }
          ],
          "combinator": "and"
        },
        "options": {}
      },
      "id": "2d99ef8e-4426-4595-8f11-fdef9d23ac9c",
      "name": "É vídeo?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2.3,
      "position": [
        1180,
        120
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
              "id": "2bb99f39-dd72-4883-82e1-8d18d708df38",
              "leftValue": "={{ $json.name.toLowerCase() }}",
              "rightValue": "menor",
              "operator": {
                "type": "string",
                "operation": "contains"
              }
            }
          ],
          "combinator": "and"
        },
        "options": {}
      },
      "id": "97a9a99a-d70c-4546-a677-b0759086e916",
      "name": "Filtrar só o menor",
      "type": "n8n-nodes-base.filter",
      "typeVersion": 2.3,
      "position": [
        1400,
        0
      ]
    },
    {
      "parameters": {
        "operation": "binaryToPropery",
        "options": {}
      },
      "id": "b7232264-ec19-4475-9751-85d69d45e7aa",
      "name": "Extrair vídeo",
      "type": "n8n-nodes-base.extractFromFile",
      "typeVersion": 1.1,
      "position": [
        1620,
        0
      ]
    },
    {
      "parameters": {
        "resource": "messages-api",
        "operation": "send-video",
        "instanceName": "Leme Marketing Médico",
        "remoteJid": "={{ $('Loop enviar demandas').item.json.cliente_telefone }}",
        "media": "={{ $json.data }}",
        "options_message": {}
      },
      "id": "fdfc9666-74f2-47c7-a317-f91b821aea13",
      "name": "Enviar vídeo",
      "type": "n8n-nodes-evolution-api.evolutionApi",
      "typeVersion": 1,
      "position": [
        1840,
        0
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
        "operation": "binaryToPropery",
        "options": {}
      },
      "id": "9160108e-0fee-4e54-b4b5-477e63ed5921",
      "name": "Extrair imagem",
      "type": "n8n-nodes-base.extractFromFile",
      "typeVersion": 1.1,
      "position": [
        1400,
        240
      ]
    },
    {
      "parameters": {
        "resource": "messages-api",
        "operation": "send-image",
        "instanceName": "Leme Marketing Médico",
        "remoteJid": "={{ $('Loop enviar demandas').item.json.cliente_telefone }}",
        "media": "={{ $json.data }}",
        "options_message": {}
      },
      "id": "84a4540b-5a06-4c48-a646-f12cb47da65c",
      "name": "Enviar imagem",
      "type": "n8n-nodes-evolution-api.evolutionApi",
      "typeVersion": 1,
      "position": [
        1620,
        240
      ],
      "credentials": {
        "evolutionApi": {
          "id": "YN1IPxHgezfgnFka",
          "name": "Evolution account"
        }
      }
    },
    {
      "parameters": {},
      "id": "0c1c8242-8886-4fe3-b5e9-47f827199ec7",
      "name": "Juntar após mídia",
      "type": "n8n-nodes-base.merge",
      "typeVersion": 3.2,
      "position": [
        2060,
        120
      ]
    },
    {
      "parameters": {
        "options": {}
      },
      "id": "6ca0e2ca-e3c5-4533-a48c-2ba156fcdf41",
      "name": "Seguir para legenda",
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.4,
      "position": [
        2260,
        120
      ],
      "executeOnce": true
    },
    {
      "parameters": {
        "resource": "fileFolder",
        "filter": {
          "folderId": {
            "__rl": true,
            "value": "={{ $('Loop enviar demandas').item.json.drive_folder_url }}",
            "mode": "url"
          }
        },
        "options": {
          "fields": [
            "mimeType",
            "id",
            "name"
          ]
        }
      },
      "id": "8ab38c7f-cc12-4e9a-963a-f6273dbbf3ee",
      "name": "Buscar legenda no Drive",
      "type": "n8n-nodes-base.googleDrive",
      "typeVersion": 3,
      "position": [
        2480,
        120
      ],
      "credentials": {
        "googleDriveOAuth2Api": {
          "id": "qR6jjrRH5v3ne4Qv",
          "name": "Google Drive account"
        }
      }
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
              "id": "eb81fa79-ef7d-4be9-b06c-9b3ba52dc82b",
              "leftValue": "={{ $json.mimeType }}",
              "rightValue": "=application/vnd.google-apps.document",
              "operator": {
                "type": "string",
                "operation": "equals"
              }
            }
          ],
          "combinator": "and"
        },
        "options": {}
      },
      "id": "78b5779c-ab64-4124-9f35-3e66228481a9",
      "name": "Filtrar Google Docs",
      "type": "n8n-nodes-base.filter",
      "typeVersion": 2.3,
      "position": [
        2700,
        120
      ]
    },
    {
      "parameters": {
        "operation": "get",
        "documentURL": "={{ $json.id }}"
      },
      "id": "1315d7b9-010e-446d-85a1-00a540782c2f",
      "name": "Ler legenda da próxima semana",
      "type": "n8n-nodes-base.googleDocs",
      "typeVersion": 2,
      "position": [
        2920,
        120
      ],
      "credentials": {
        "googleDocsOAuth2Api": {
          "id": "LBnPK4zjq5gmuOnJ",
          "name": "Google Docs account"
        }
      }
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
      "id": "0a127b9e-354c-4c92-b58f-4e0e1f8ebfb9",
      "name": "OpenAI Chat Model",
      "type": "@n8n/n8n-nodes-langchain.lmChatOpenAi",
      "typeVersion": 1.3,
      "position": [
        3140,
        320
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
        "promptType": "define",
        "text": "=Legenda para formatar: {{ $json.content || $json.text || $json.body || '' }}",
        "options": {
          "systemMessage": "Você é um agente responsável apenas por revisar e formatar legendas antes do envio ou publicação.\n\nATENÇÃO: Seu objetivo NÃO é reescrever, melhorar criativamente ou alterar a legenda.\nSeu único objetivo é FORMATAR melhor o texto e, apenas quando necessário, corrigir erros.\n\nSua função é pegar um texto bruto vindo de um Google Docs ou outra fonte e devolver esse mesmo texto corrigido e bem formatado, mantendo exatamente a mesma ideia, tom de voz e mensagem original.\n\nSiga estas regras com rigor:\n\n1. Corrija apenas erros ortográficos, de digitação e de acentuação.\n2. Corrija palavras abreviadas ou informais, substituindo por versões corretas e completas.\n3. Remova caracteres estranhos, inválidos, corrompidos ou que não façam sentido no texto.\n4. Ajuste pontuação apenas se necessário para clareza.\n5. Organize as quebras de linha para melhorar a leitura.\n6. Nunca deixe linhas excessivamente quebradas sem necessidade.\n7. Nunca deixe blocos de texto totalmente colados.\n8. Evite quebra de linha dupla em excesso.\n9. Preserve emojis, desde que estejam corretos.\n10. Preserve hashtags, desde que estejam corretas.\n11. NÃO invente informações.\n12. NÃO reescreva frases desnecessariamente.\n13. NÃO mude palavras só por preferência.\n14. NÃO altere o sentido da mensagem.\n15. Nunca use abreviações informais.\n16. Nunca use travessões.\n17. Remova frases externas do ChatGPT, como: Claro, segue a legenda, aqui está, legenda:, título:, pode usar assim.\n\nSaída esperada: apenas a legenda final corrigida e formatada, sem aspas, sem explicações e sem texto extra."
        }
      },
      "id": "347a4597-c53a-4149-9c76-6c5db6ac52b5",
      "name": "Formatar legenda",
      "type": "@n8n/n8n-nodes-langchain.agent",
      "typeVersion": 3.1,
      "position": [
        3140,
        120
      ]
    },
    {
      "parameters": {
        "resource": "messages-api",
        "instanceName": "Leme Marketing Médico",
        "remoteJid": "={{ $('Loop enviar demandas').item.json.cliente_telefone }}",
        "messageText": "={{ $json.output }}",
        "options_message": {}
      },
      "id": "102b8cf0-a4f9-419f-ba70-653b26633432",
      "name": "Enviar legenda",
      "type": "n8n-nodes-evolution-api.evolutionApi",
      "typeVersion": 1,
      "position": [
        3460,
        120
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
        "resource": "messages-api",
        "operation": "send-poll",
        "instanceName": "Leme Marketing Médico",
        "remoteJid": "={{ $('Loop enviar demandas').item.json.cliente_telefone }}",
        "caption": "={{ DateTime.fromISO($('Loop enviar demandas').item.json.data_publicacao).setZone('America/Sao_Paulo').toFormat('dd/MM') }}",
        "options_display": {
          "metadataValues": [
            {
              "optionValue": "✅"
            },
            {
              "optionValue": "❌"
            }
          ]
        }
      },
      "id": "70256620-237e-4a9a-bd30-c50c9c8d7e62",
      "name": "Enviar enquete",
      "type": "n8n-nodes-evolution-api.evolutionApi",
      "typeVersion": 1,
      "position": [
        3680,
        120
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
        "resource": "messages-api",
        "instanceName": "Leme Marketing Médico",
        "remoteJid": "={{ $('Loop enviar demandas').item.json.cliente_telefone }}",
        "messageText": "=---------------------",
        "options_message": {}
      },
      "id": "55f08f9e-3f80-43c7-9729-d4cad5b54958",
      "name": "Enviar separador",
      "type": "n8n-nodes-evolution-api.evolutionApi",
      "typeVersion": 1,
      "position": [
        3900,
        120
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
        "content": "## Fluxo unificado: conferência interna + envio limpo ao cliente\n\nPrimeiro confere pasta, mídia e legenda. Se faltar algo, avisa somente o colaborador e para.\n\nO cliente recebe apenas mídia, legenda, enquete e separador.",
        "height": 420,
        "width": 760
      },
      "id": "d7ff0681-7b8f-4597-af19-792f24b7af66",
      "name": "Nota",
      "type": "n8n-nodes-base.stickyNote",
      "typeVersion": 1,
      "position": [
        -1960,
        -120
      ]
    },
    {
      "parameters": {
        "resource": "fileFolder",
        "filter": {
          "folderId": {
            "__rl": true,
            "value": "={{ $('Loop conferir arquivos').item.json.drive_folder_url }}",
            "mode": "url"
          }
        },
        "options": {
          "fields": [
            "mimeType",
            "id",
            "name"
          ]
        }
      },
      "id": "982c40eb-fa0c-4255-b91f-95af3cc1d095",
      "name": "Conferir legenda da demanda",
      "type": "n8n-nodes-base.googleDrive",
      "typeVersion": 3,
      "position": [
        960,
        680
      ],
      "alwaysOutputData": true,
      "credentials": {
        "googleDriveOAuth2Api": {
          "id": "qR6jjrRH5v3ne4Qv",
          "name": "Google Drive account"
        }
      }
    },
    {
      "parameters": {
        "jsCode": "const demanda = $('Loop conferir arquivos').item.json;\nconst docs = $input.all().filter(item => item.json?.mimeType === 'application/vnd.google-apps.document');\nreturn [{\n  json: {\n    ...demanda,\n    legenda_doc_count: docs.length,\n    legenda_doc_id: docs[0]?.json?.id || '',\n    legenda_doc_nome: docs[0]?.json?.name || ''\n  }\n}];"
      },
      "id": "24bafc0d-3154-466e-9aa2-d7edd512ebde",
      "name": "Verificar legenda encontrada",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        1180,
        680
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
              "id": "5bdc6023-5fa5-4311-bc1a-718233755965",
              "leftValue": "={{ Number($json.legenda_doc_count || 0) }}",
              "rightValue": 0,
              "operator": {
                "type": "number",
                "operation": "equals"
              }
            }
          ],
          "combinator": "and"
        },
        "options": {}
      },
      "id": "7d89c172-caa0-4cb2-8f51-3564355f8ec7",
      "name": "Faltou legenda?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2.3,
      "position": [
        1400,
        680
      ]
    },
    {
      "parameters": {
        "resource": "messages-api",
        "instanceName": "Leme Marketing Médico",
        "remoteJid": "={{ ($json.telefone_colaborador || '').toString().replace(/\\D/g, '') }}",
        "messageText": "=🚨🚨 *Está faltando legenda do cliente {{ $json.nome_cliente }}*\n\nDemanda: {{ $json.titulo }}\nData: {{ DateTime.fromISO($json.data_publicacao).toFormat('dd/MM/yyyy') }}\n\nConfira a pasta:\n{{ $json.drive_folder_url }}\n\nAdicione o Google Docs com a legenda e clique em enviar para aprovação novamente.\n\nNenhuma mensagem foi enviada ao cliente.",
        "options_message": {}
      },
      "id": "99ff3a88-52e1-4dd7-a467-8913a5bf14d2",
      "name": "Avisar legenda ausente",
      "type": "n8n-nodes-evolution-api.evolutionApi",
      "typeVersion": 1,
      "position": [
        1620,
        560
      ],
      "credentials": {
        "evolutionApi": {
          "id": "YN1IPxHgezfgnFka",
          "name": "Evolution account"
        }
      }
    }
  ],
  "connections": {
    "Receber aprovação do Sistema": {
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
            "node": "Preparar demandas do cliente",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Preparar demandas do cliente": {
      "main": [
        [
          {
            "node": "Tem demandas para conferir?",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Tem demandas para conferir?": {
      "main": [
        [
          {
            "node": "Loop conferir arquivos",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Avisar erro ao colaborador",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Loop conferir arquivos": {
      "main": [
        [
          {
            "node": "Recriar lista para envio",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Tem pasta da demanda?",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Tem pasta da demanda?": {
      "main": [
        [
          {
            "node": "Conferir arquivos e pastas",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Avisar pasta ausente",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Conferir arquivos e pastas": {
      "main": [
        [
          {
            "node": "É pasta na conferência?",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "É pasta na conferência?": {
      "main": [
        [
          {
            "node": "Conferir arquivos dentro da pasta",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Juntar arquivos da conferência",
            "type": "main",
            "index": 1
          }
        ]
      ]
    },
    "Conferir arquivos dentro da pasta": {
      "main": [
        [
          {
            "node": "Juntar arquivos da conferência",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Juntar arquivos da conferência": {
      "main": [
        [
          {
            "node": "Filtrar mídia da conferência",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Filtrar mídia da conferência": {
      "main": [
        [
          {
            "node": "Faltou mídia?",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Faltou mídia?": {
      "main": [
        [
          {
            "node": "Avisar mídia ausente",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Confirmar mídia encontrada",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Confirmar mídia encontrada": {
      "main": [
        [
          {
            "node": "Conferir legenda da demanda",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Continuar conferência": {
      "main": [
        [
          {
            "node": "Loop conferir arquivos",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Recriar lista para envio": {
      "main": [
        [
          {
            "node": "Loop enviar demandas",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Loop enviar demandas": {
      "main": [
        [
          {
            "node": "Avisar colaborador concluído",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Buscar arquivos e pastas para envio",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Buscar arquivos e pastas para envio": {
      "main": [
        [
          {
            "node": "É pasta no envio?",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "É pasta no envio?": {
      "main": [
        [
          {
            "node": "Buscar arquivos dentro da pasta",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Juntar arquivos para envio",
            "type": "main",
            "index": 1
          }
        ]
      ]
    },
    "Buscar arquivos dentro da pasta": {
      "main": [
        [
          {
            "node": "Juntar arquivos para envio",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Juntar arquivos para envio": {
      "main": [
        [
          {
            "node": "Filtrar mídia para envio",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Filtrar mídia para envio": {
      "main": [
        [
          {
            "node": "Ordenar mídia",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Ordenar mídia": {
      "main": [
        [
          {
            "node": "Baixar arquivo",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Baixar arquivo": {
      "main": [
        [
          {
            "node": "É vídeo?",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "É vídeo?": {
      "main": [
        [
          {
            "node": "Filtrar só o menor",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Extrair imagem",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Filtrar só o menor": {
      "main": [
        [
          {
            "node": "Extrair vídeo",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Extrair vídeo": {
      "main": [
        [
          {
            "node": "Enviar vídeo",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Enviar vídeo": {
      "main": [
        [
          {
            "node": "Juntar após mídia",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Extrair imagem": {
      "main": [
        [
          {
            "node": "Enviar imagem",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Enviar imagem": {
      "main": [
        [
          {
            "node": "Juntar após mídia",
            "type": "main",
            "index": 1
          }
        ]
      ]
    },
    "Juntar após mídia": {
      "main": [
        [
          {
            "node": "Seguir para legenda",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Seguir para legenda": {
      "main": [
        [
          {
            "node": "Buscar legenda no Drive",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Buscar legenda no Drive": {
      "main": [
        [
          {
            "node": "Filtrar Google Docs",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Filtrar Google Docs": {
      "main": [
        [
          {
            "node": "Ler legenda da próxima semana",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Ler legenda da próxima semana": {
      "main": [
        [
          {
            "node": "Formatar legenda",
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
            "node": "Formatar legenda",
            "type": "ai_languageModel",
            "index": 0
          }
        ]
      ]
    },
    "Formatar legenda": {
      "main": [
        [
          {
            "node": "Enviar legenda",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Enviar legenda": {
      "main": [
        [
          {
            "node": "Enviar enquete",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Enviar enquete": {
      "main": [
        [
          {
            "node": "Enviar separador",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Enviar separador": {
      "main": [
        [
          {
            "node": "Loop enviar demandas",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Conferir legenda da demanda": {
      "main": [
        [
          {
            "node": "Verificar legenda encontrada",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Verificar legenda encontrada": {
      "main": [
        [
          {
            "node": "Faltou legenda?",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Faltou legenda?": {
      "main": [
        [
          {
            "node": "Avisar legenda ausente",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Continuar conferência",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  },
  "pinData": {},
  "settings": {
    "executionOrder": "v1"
  },
  "staticData": null,
  "tags": [],
  "triggerCount": 0,
  "updatedAt": "2026-06-30T00:00:00.000Z",
  "versionId": "fb22ee53-8a83-48df-9d66-63c521a565f4",
  "active": false,
  "meta": {
    "instanceId": "leme-v79-postgres"
  }
}