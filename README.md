# Lia · Cadena Imóveis

Chatbot de primeiro atendimento da **Cadena Imóveis**. A Lia é a corretora virtual (assistente digital) que recebe quem chega pelo site, identifica se a pessoa quer **comprar, alugar, vender, anunciar, financiar/MCMV ou acompanhar um atendimento**, faz a triagem com poucas perguntas e prepara o encaminhamento para a equipe certa.

O motor é baseado no [Peekobot](https://github.com/Peekobot/peekobot) (MIT) e segue a skill [`skills/lia-cadena-primeiro-atendimento.md`](skills/lia-cadena-primeiro-atendimento.md).

## Estrutura

```
index.html                  página de teste com o widget da Lia
site.css                    estilos da página e posição do widget
lia/
  lia.config.js             configuração (seção 16 da skill) — sem segredos
  lia-nlu.js                entendimento de texto livre por palavras-chave (modo sem IA)
  peekobot.js               motor da conversa (Peekobot estendido)
  peekobot.css              visual da Lia (tokens de cor no topo)
  widget.js                 abrir/fechar o chat
  avatar.svg                avatar da Lia
skills/                     a skill de atendimento que o motor implementa
vercel.json                 cabeçalhos de segurança para o deploy
```

Site estático: não tem build. A Vercel publica a pasta como está.

## O que a Lia faz

- **Botões ou texto livre.** "apê de 2 quartos no Portão até 450 mil" já preenche tipo, bairro, quartos e valor; ela só pergunta o que falta, uma coisa por vez.
- **Fluxos:** compra, locação, proprietário (vender ou alugar), financiamento/MCMV e atendimento em andamento.
- **Pedido de humano a qualquer momento** ("quero falar com uma pessoa") → encaminhamento imediato com o que já foi dito.
- **Duas falhas de entendimento seguidas** → oferece falar com uma pessoa.
- **Transparência:** se perguntarem, diz que é assistente virtual e não corretora com CRECI.
- **LGPD:** explica a finalidade antes de pedir nome e contato; aceita "prefiro não informar"; recusa e mascara CPF, documentos, senhas, cartão e dados bancários; "pare" / "exclua meus dados" encerra a conversa e apaga o que estava guardado no navegador.
- **Não inventa.** Sem catálogo conectado, avisa que não consegue consultar em tempo real e prepara o encaminhamento. Só diz "encaminhei" ou "registrei" quando o backend confirma.
- **Retoma a conversa** se a página recarregar (fica só na aba, em `sessionStorage`).

## Configuração

Tudo em `lia/lia.config.js`. Enquanto os campos estão `null`, a Lia funciona em **modo de teste**: faz a triagem e mostra um resumo pronto para a equipe, deixando claro que ainda não está conectada aos canais.

| Campo | Para que serve |
|---|---|
| `handoff_routes.sales / rentals / acquisition / mcmv / support` | Destino de cada setor. `{type:"whatsapp", number:"5541..."}` abre o WhatsApp com o resumo escrito (o cliente envia); `{type:"url", href}` abre um link; `{type:"api", endpoint}` faz POST e só confirma se voltar `{success:true}`. |
| `catalog_provider` | Endpoint de busca de imóveis (mesma origem, ex.: `/api/listings`). |
| `lead_destination` | Endpoint que grava o lead (ex.: `/api/leads`), responde `{success, lead_id}`. |
| `privacy_policy_url` | Link oficial da política de privacidade (aparece no rodapé e no opt-out). |
| `human_service_hours` | Horário de atendimento da equipe, se for oficial. |
| `faq` | Respostas institucionais **aprovadas**: `{keywords:[...], answer:"..."}`. |

**Nunca coloque tokens ou API keys no `lia.config.js`**: ele é público no navegador. Integrações com segredo passam por uma função de servidor (ex.: `api/` na Vercel), e os endpoints ficam na mesma origem por causa da CSP do `vercel.json`.

### Contrato do catálogo (`search_listings`)

`GET {catalog_provider}?intent=buy&property_type=apartamento&neighborhoods=Portão&budget_max=450000&bedrooms_min=2&parking_min=1`

```json
{ "success": true,
  "items": [{ "id": "AP1234", "title": "Apartamento 2 quartos", "neighborhood": "Portão",
              "price": 430000, "bedrooms": 2, "parking": 1, "area_m2": 62,
              "status": "disponível", "url": "https://...", "updated_at": "2026-10-26T12:00:00Z" }] }
```

A Lia mostra no máximo 3 opções com status disponível.

### Lead enviado (`create_or_update_lead` / `route_to_team`)

Segue o modelo da seção 11 da skill (`source`, `assistant`, `intent`, `lead`, `preferences`, `listing_ids`, `handoff`), mais `conversation_id` e `created_at`. Para inspecionar no navegador: `Lia.lead()` no console.

## Visual

As cores estão em tokens no topo de `lia/peekobot.css` (`--lia-brand`, `--lia-accent` etc.), com modo claro e escuro. Troque pelos valores do manual de identidade da Cadena.

## Antes de produção (checklist da skill)

Validar com jurídico/compliance o termo "corretora virtual"; preencher rotas, horários e política de privacidade; conectar catálogo e CRM; testar abertura, múltiplas intenções, conversa retomada, catálogo fora do ar, pedido de humano, opt-out, mensagens ofensivas, celular e acessibilidade.

## Licença

Motor derivado do Peekobot, © 2019 Peekobot, licença MIT — ver [`LICENSE-peekobot`](LICENSE-peekobot).
