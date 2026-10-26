/*
 * Configuração da Lia — Cadena Imóveis
 * Espelha a seção 16 da skill (skills/lia-cadena-primeiro-atendimento.md).
 *
 * NUNCA coloque tokens, senhas ou API keys aqui: este arquivo é público no navegador.
 * Integrações que exigem segredo devem passar por uma função de servidor (ex.: /api na Vercel).
 *
 * Enquanto um campo estiver null, a Lia NÃO finge ter aquele recurso:
 * - catalog_provider null  -> não sugere imóveis; avisa que não consegue consultar o catálogo e prepara o encaminhamento
 * - handoff_routes.X null  -> não diz que "encaminhou"; mostra o resumo pronto para a equipe
 * - privacy_policy_url null -> cita a política de privacidade da Cadena sem link
 */
window.LIA_CONFIG = {
  brand: "Cadena Imóveis",
  bot_name: "Lia",
  bot_public_role: "corretora virtual / assistente digital",

  // Regiões confirmadas de atendimento. Vazio = a Lia não afirma cobertura geográfica.
  service_regions: [],

  // Ex.: "segunda a sexta, das 9h às 18h". null = a Lia não promete horário.
  // Valor abaixo: o mesmo horário publicado no site demo.
  human_service_hours: "de segunda a sexta, das 9h às 18h, e aos sábados, das 9h às 12h",

  // URL real da política de privacidade da Cadena.
  privacy_policy_url: null,

  // Onde a Lia busca imóveis:
  //   "local"           -> os destaques publicados pela própria página em window.LIA_CATALOG (site.js)
  //   "/api/listings"   -> endpoint da mesma origem (contrato no README.md)
  //   null              -> sem catálogo: a Lia avisa e prepara o encaminhamento
  catalog_provider: "local",

  // Endpoint que grava o lead (mesma origem, ex.: "/api/leads"). Deve responder { success, lead_id }.
  lead_destination: null,

  // Destino do encaminhamento por setor. Aceita:
  //   { type: "whatsapp", number: "5541999999999" }  -> abre o WhatsApp com o resumo já escrito (o cliente é quem envia)
  //   { type: "url", href: "https://..." }            -> abre um link (formulário oficial, página de contato etc.)
  //   { type: "api", endpoint: "/api/route" }         -> POST com o lead; só confirma se responder { success: true }
  //   null                                            -> sem destino: a Lia mostra o resumo e não diz que encaminhou
  // Números abaixo: os WhatsApp de Vendas e Locação publicados no site demo.
  handoff_routes: {
    sales: { type: "whatsapp", number: "5541998791047" },    // compra
    rentals: { type: "whatsapp", number: "5541996990773" },  // locação
    acquisition: null,  // angariação: proprietário que quer vender ou alugar
    mcmv: null,         // Minha Casa Minha Vida / financiamento
    support: null       // contrato, cobrança, manutenção, visita/proposta em andamento
  },

  human_handoff_enabled: false,

  // Respostas institucionais APROVADAS (lookup_faq). Só entra aqui texto validado pela Cadena.
  // Formato: { keywords: ["horario", "funciona"], answer: "..." }
  faq: [
    { keywords: ["simul"], answer: "O site tem um simulador de financiamento em cadenaimoveis.com.br/simulador. Os valores finais dependem da análise de crédito do banco." },
    { keywords: ["horario"], answer: "A equipe atende de segunda a sexta, das 9h às 18h, e aos sábados, das 9h às 12h." },
    { keywords: ["endereco"], answer: "A unidade principal fica na Rua Acyr Guimarães, 180, Água Verde, Curitiba." }
  ],

  // Ritmo da conversa (ms). A Lia mostra "digitando..." enquanto espera.
  typing_delay_ms: 650
};
