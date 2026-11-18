# Design do box-flow

Decisões tomadas antes do primeiro código (nov/2026). Quando uma decisão mudar, atualize aqui.

## Princípios
- **Substituir a planilha primeiro, funcionalidades extras depois.** O MVP precisa rodar e classificar certo antes de qualquer análise.
- **Local-first, sem backend.** O único serviço externo é a API da Pluggy. O GitHub Pages só entrega o código.
- **Só pessoa física.** Renda de PJ entra como receita (pró-labore, distribuição de lucro), sem acompanhar a empresa.
- **Só celular.** Não há sincronização entre aparelhos.

## Plataforma
| Decisão | Motivo |
|---|---|
| PWA em TypeScript (React + Vite) | No iPhone, app nativo exige macOS para compilar e conta Apple paga (ou reassinar a cada 7 dias). PWA instala pelo Safari, sem Mac e sem custo. A lógica em TS pode ser reaproveitada num React Native depois. |
| Dexie sobre IndexedDB | Banco local no navegador, **dentro do app**: os dados só existem no aparelho. Num PWA instalado o iOS raramente apaga os dados; o backup por arquivo cobre o risco. Ler e gravar um arquivo escolhido pelo usuário foi descartado: no iPhone seria preciso escolher o arquivo a cada abertura. |
| Tailwind CSS e react-i18next | Bibliotecas prontas para o visual e para a tradução, aceitas desde que as proteções de [Segurança](#segurança-e-backup) valham. |
| Abas embaixo | Extrato, Compromissos, Saldo e Ajustes numa barra de vidro, com o lançamento rápido (+) num círculo ao lado, como nos apps do iPhone (revisto em 18/11/2026; antes o + ficava no meio da barra). |
| GitHub Pages + Actions | Grátis em repositório público. |
| Atualiza ao abrir o app e ao puxar a tela para baixo | O Meu Pluggy sincroniza com o banco a cada 24 h; sem tarefa em segundo plano no MVP. |

## API da Pluggy (testado em 16/11/2026 com Meu Pluggy)
```
POST /auth                                         {clientId, clientSecret} → {apiKey}; header X-API-KEY nas demais
GET  /items/{itemId}                               status, executionStatus, consentExpiresAt
GET  /accounts?itemId={itemId}
GET  /v2/transactions?accountId={id}&dateFrom=AAAA-MM-DD
GET  /bills?accountId={id}                         faturas do cartão: billClosingDate, dueDate, totalAmount, payments
```
- **CORS liberado** (`Access-Control-Allow-Origin: *`): o navegador chama a API direto.
- `GET /items` (listar) → 401. O usuário informa os `itemId`s.
- `GET /transactions` (v1) → 410, desativado. `/v2/transactions` **não aceita `pageSize`**; vem até 500 por página e `next` é uma *query string* (`?accountId=…&after=…`) a concatenar em `/v2/transactions`.
- Histórico: ~12 meses (depende do banco).
- **Datas em UTC.** A data da transação, `purchaseDate` e `transactionDateTime` são momentos em UTC e precisam virar o dia em Brasília. Exemplo: a conta corrente marca o fim do dia 03/11 como `2026-11-04T02:59:59.999Z`; lida sem conversão, a transação cai um dia depois. Já `dueDate`, `billClosingDate` e `paymentDate` das faturas são "só o dia", gravados como meia-noite UTC: não passam por fuso. O fuso é **fixo em Brasília**, para que as datas não mudem com o celular em viagem.
- **Moeda estrangeira:** em compra no exterior, `amount` vem na moeda original (ex.: USD 12) e o valor em reais vem em `amountInAccountCurrency` (ex.: R$ 66,37). O app usa o valor em reais e guarda o original para exibir.
- **Paginação:** transações seguem o campo `next`; contas e faturas usam `page`/`totalPages`.
- **Chave (`apiKey`)** dura 2 h: o app reaproveita e, se a Pluggy responder 401, faz login de novo e repete o pedido.
- **Conexão:** `/items/{id}` traz `consentExpiresAt`, `lastUpdatedAt` e `nextAutoSyncAt` (próxima sincronização).
- **O que o app guarda:** id, conta, dia, valor em centavos, descrição (e a original, se diferente), categoria do banco, estabelecimento, status, moeda original e os dados de cartão (parcela, data da compra, fatura). Nunca `paymentData`, que traz CPF de quem pagou e recebeu.
- **Sinal do valor depende da conta:** na conta corrente saída é negativa; no cartão compra é positiva e pagamento é negativo. Normalizar na entrada pelo campo `type`, que é estável: `DEBIT` = saiu (negativo), `CREDIT` = entrou (positivo). No cartão, o `balance` da conta é o limite usado e vira saldo negativo.
- `category` vem preenchida mesmo no uso gratuito (em inglês, às vezes errada). Serve de sugestão; a regra do usuário manda.
- Parcelas: `creditCardMetadata.installmentNumber/totalInstallments`; **as parcelas futuras já vêm** como `PENDING`.
  - **O `date` de uma parcela muda.** Enquanto futura, é o último dia do mês (parcela 2/6 → 31/12). Depois de liquidada, vira a data da compra (as parcelas 1/3, 2/3 e 3/3 ficam todas com o mesmo `date`). Não usar `date` para pôr parcela no mês.
  - Não há ID que agrupe as parcelas de uma compra. Agrupar por **descrição sem o sufixo `NN/NN`** + `totalInstallments` + `purchaseDate`/`transactionDateTime` (iguais em todas as parcelas). Não usar o valor: a antecipação muda o valor.
  - **Antecipação de parcelas:** as parcelas antecipadas passam para a fatura aberta e o desconto vem numa transação separada ("Desc Antecipa Parcelas").
- **Fatura de uma compra:** `billId` só aparece depois que a compra liquida (`POSTED`). Antes disso, `creditCardMetadata.billForecastDate` (`AAAA-MM`) diz em qual fatura ela vai cair. O dia do vencimento vem de `/bills` (`dueDate`), e varia com fim de semana e feriado. Não é preciso configurar fechamento nem vencimento.
- **Saldo:** na conta corrente, `balance` é o saldo disponível. No cartão, `balance` é o **limite usado** (fatura aberta + parcelas futuras), mas não bate no centavo com a soma das transações pendentes.
- `connectToken` não é `itemId`; só serve para abrir o widget.
- Consentimento dura 1 ano por banco (`consentExpiresAt`). Depois, o usuário reconecta e o `itemId` pode mudar: guardar transações pelo `id` delas.
- **Em aberto:** o `id` de uma transação `PENDING` se mantém quando ela vira `POSTED`? Se não se mantiver, a importação precisa reconhecer a mesma compra pela descrição + valor + parcela + `transactionDateTime`. Observado: no cartão, a compra fica `PENDING` até a fatura **fechar**, então a resposta só aparece depois de um fechamento.
- Implementado em `src/pluggy/client.ts` (conversa com a API) e `src/pluggy/convert.ts` (tradução para o formato do app).

## Modelo de domínio

### Conta
Onde o dinheiro está ou com quem há saldo.
- **Banco** e **cartão**: vêm da Pluggy.
- **Espécie**: manual, em qualquer moeda (ex.: dólares em espécie), convertida pela cotação para exibir.
- **Pessoa**: manual, **nos dois sentidos**. Quanto eu devo a alguém ou quanto alguém me deve (ex.: parcelamento combinado com um familiar, dinheiro que um amigo devolveu).

Pagar uma pessoa ou mover dinheiro entre contas é **transferência**, não gasto.

### Lançamento
- `status`: `previsto` ou `realizado`.
- `origem`: banco (id da transação na Pluggy) ou manual.
- **Categoria**, **etiquetas** (para quem ou para quê: uma pessoa, uma viagem) e **descrição livre**, opcional, escrita pelo usuário.
- Dois eixos de classificação, **tirados do compromisso** (não se marcam lançamento a lançamento):
  - **Repetição**: ligado a um recorrente → `recorrente`; a um parcelado → `parcelado`; sem compromisso → `avulso`.
  - **Valor**: `fixo` | `variável`, guardado no compromisso.

### Compromisso (grill de 17/11/2026)
Parcelados e recorrentes são compromissos que **geram lançamentos previstos**.

**Tipos**
- **Recorrente** (mensal ou anual), de saída ou de entrada (ex.: salário): categoria, valor, dia, conta e, opcional, o texto do banco que o identifica.
- **Parcelado com pessoa**: pessoa, motivo e categoria, valor da parcela, total de parcelas, quantas já foram pagas e dia do mês. Cada parcela paga é gasto na categoria (o mês é quando o dinheiro sai); "quanto devo a cada pessoa" é a soma das parcelas que faltam.
- **Parcelado do cartão**: reconhecido sozinho a partir do banco (descrição sem "NN/NN" + total de parcelas + data da compra), só para consulta, com andamento e quanto falta. Não gera previstos: o banco já manda as parcelas futuras (conferido em 17/11/2026 em cartões de dois bancos: todas as parcelas futuras chegam como pendentes, cada uma com o mês da fatura prevista).

**Valor previsto**
- Por padrão, o **valor digitado pelo usuário**; opção de usar a **média dos últimos 3 meses realizados** quando não se sabe.
- Editar ou encerrar vale só para os previstos futuros; o histórico não muda.

**Quando cai**
- No cartão: dia da cobrança + cartão → mês em que a fatura é paga (mesma regra das compras). Na conta ou boleto: o dia informado. Dia que o mês não tem → último dia do mês.
- Previstos até 12 meses à frente ou até a última parcela.
- **Primeiro previsto** de um recorrente novo: se o lançamento deste mês foi vinculado, o mês nasce realizado; se o dia já passou sem lançamento, começa no mês seguinte; se o dia ainda não chegou, começa neste mês.

**Previsto → realizado** (revê "o usuário sempre confirma", ver Conciliação)
- Lançamento com o **texto do banco** do compromisso, até **10 dias** antes ou depois da data prevista, realiza o previsto **sozinho**. O valor não precisa bater; a diferença aparece. Dá para desfazer.
- **Pix para pessoa** (o mesmo Pix pode pagar várias coisas): o app **sugere** e o usuário **confirma**, podendo dividir.
- Um previsto pode juntar **vários lançamentos** (salário que chega em vários Pix: vale a soma no mês) e um lançamento pode realizar **vários previstos**.
- Compra **pendente** no cartão já conta como realizada.
- Data passou e nada chegou: **atrasado** (em destaque) até chegar ou até o usuário marcar "não aconteceu neste mês".

**Classificação**: lançamento ligado a um compromisso recebe a **categoria do compromisso**; vence as regras e perde só para a escolha à mão.

**Telas**
- **Extrato = extrato + previsão**: os previstos aparecem no mês com visual próprio; os totais separam **realizado** e **previsto**. Tocar num previsto: "Vincular ao extrato", "Não aconteceu neste mês", "Editar compromisso".
- **Aba Compromissos** (lista, sem troca de mês): Recorrentes, Parcelados, Receitas e **Sugestões** (mesmo texto do banco em 3 ou mais dos últimos 6 meses, valores até 25% diferentes; "Criar" ou "Ignorar"; Pix para pessoa entra já marcado como "você confirma cada mês").
- **Criar**: formulário, com ou sem **"Vincular ao extrato"** (escolher o lançamento equivalente: o texto dele vira a assinatura do compromisso, os próximos são reconhecidos e os antigos são ligados como histórico), ou a partir de um lançamento ("Vincular a um compromisso"). Compromisso pode ser editado.

**Dados**: vínculos guardados à parte, como as classificações à mão (ligar um lançamento antigo não altera o período fechado). Compromissos vão no backup trancado.

**Implementação** (`src/domain/commitment.ts`, `reconcile.ts`, `forecast.ts`):
- Cada ocorrência tem uma chave (compromisso + mês da cobrança) e duas datas: a da cobrança (a janela de 10 dias conta a partir dela) e a do dinheiro (no cartão, o vencimento da fatura).
- No cartão, o ciclo é aprendido das faturas guardadas (fechamento e vencimento mais frequentes): cobrança até 2 dias antes do fechamento entra na fatura que fecha naquele mês; depois, na seguinte.
- O vínculo automático é calculado na hora (como as regras), não guardado. Guardados: vínculos confirmados, "desvincular" e "não aconteceu".
- Um lançamento ligado a vários previstos conta, em cada um, o valor esperado.
- "Pix para pessoa" (sugerido em vez de automático) vem marcado quando o outro lado do lançamento escolhido é pessoa: a tradução guarda só o **tipo** do documento (CPF → pessoa, CNPJ → empresa), nunca o número.
- "Vincular ao extrato" liga também o histórico dos últimos 12 meses; meses antes do início só aparecem se tiveram pagamento.

**Parcelados do cartão** (`src/domain/installments.ts`)
- Uma parcela está paga quando o dinheiro dela já saiu (regra do mês do cartão). Pagas = total de parcelas − parcelas que ainda vão sair: assim, numa compra antiga, as primeiras parcelas que já saíram do histórico contam como pagas.
- Quanto falta = soma das parcelas que ainda vão sair. A compra quitada some da lista. A que termina antes vem primeiro.

**Sugestões** (`src/domain/suggestions.ts`), calibradas com os dados reais em 17/11/2026
- Mesmo texto do banco (sem "NN/NN") e mesmo sentido, nos últimos 6 meses contando o atual.
- Compara o **total de cada mês** com o valor típico (a mediana dos totais): bastam **3 meses até 25%** do típico. Um mês com desconto ou com cobrança dupla não derruba a sugestão. O valor sugerido é o típico.
- No máximo **2 lançamentos por mês**, em média: corridas e mercado ficam de fora.
- Precisa ter aparecido **neste mês ou no anterior**: assinatura cancelada não vira sugestão.
- Ficam de fora: transferências, parcelas do cartão, lançamentos já ligados a um compromisso e os que contêm o texto do banco de um compromisso.
- "Criar" abre o formulário preenchido a partir do lançamento mais recente, com o valor típico e a categoria dele, e liga o histórico (como "Vincular ao extrato"). "Ignorar" é guardado pela chave texto + sentido, vai no `box-flow.json` e se desfaz em Ajustes → Sugestões ignoradas.
- Nos dados reais, sem nenhum compromisso, o critério acha os recorrentes com texto (assinaturas, contador, Pix mensais), com um falso (corridas de um app que aparecem poucas vezes por mês). Salário recebido em 3 ou mais Pix por mês não é sugerido: cria-se pelo formulário.

Fora desta etapa: saldo pré e pós-pago (usa os compromissos) e contas de pessoa.

### Regra de classificação
Padrão na descrição do banco → categoria, valor, repetição, etiquetas. Ex.: `DL*99 RIDE` → Transporte por app. As regras iniciais podem ser importadas de um arquivo (o app precisa de **importar regras**).

### Conciliação
- O app **sugere** casar uma transação do banco com lançamentos previstos ou manuais; **o usuário confirma**. Casar só por valor + data gera pares falsos. Exceção (17/11/2026): previsto de compromisso com texto do banco de empresa é realizado sozinho (ver Compromisso).
- Um lançamento do banco pode corresponder a **vários** lançamentos manuais (ex.: três pagamentos combinados que saíram num Pix só).
- Transferências internas não são gasto: pagamento de fatura, aplicação e resgate de cofrinho, transferência entre contas próprias.

## Atualização (sincronização)
- Ao abrir o app e pelo botão **Atualizar**, o app busca tudo o que a Pluggy devolve de cada conexão (~12 meses) e grava de uma vez: se a Pluggy falhar no meio, nada do que estava guardado muda. Uma conexão com erro não impede as outras.
- **Período aberto** = mês atual + mês anterior + tudo o que está pendente (fatura aberta, parcelas futuras). Nele, o aparelho fica igual ao banco: o que mudou é atualizado e o que sumiu é removido (resolve a compra pendente que volta liquidada com outro `id`).
- **Período fechado** = o resto. Fica guardado e não muda mais, inclusive a classificação feita pelo usuário. Assim o histórico com mais de 12 meses, que a Pluggy não devolve, continua no aparelho.
- **Lançamento novo sempre entra**, com qualquer data (banco que sincroniza atrasado).
- Implementado em `src/sync/sync.ts` (`syncConnection`).
- **Em aberto:** ao renovar o consentimento, o `itemId` e talvez os `id`s das contas mudam. Sem tratamento, as contas apareceriam duplicadas. Resolver antes do primeiro vencimento de consentimento.

## Configuração no app
- Em **Ajustes → Bancos** o usuário cola `clientId`, `clientSecret` e os `itemId`s (um por linha), ou abre o arquivo trancado que já traz tudo. Ficam só no aparelho.
- A tela mostra, por conexão: as contas, quando a Pluggy leu o banco, a próxima leitura, o vencimento do consentimento (aviso a 30 dias) e o erro da última atualização.

## Mês e saldo
- **Mês = mês do calendário.**
- **Extrato do mês:** na conta, pelo dia; no cartão, pelo mês em que o dinheiro sai. Cartão sem nenhuma fatura fechada ainda: o mês previsto pelo banco ou, sem previsão, o da compra. Mais recente primeiro. Sem totais até existirem as regras de transferência (pagamento de fatura contaria em dobro). Implementado em `src/domain/statement.ts`.
- **Pré-pago**: saldo atual das contas − tudo que já está comprometido (faturas abertas, parcelas futuras, o que **eu devo** a pessoas, previstos de saída). Não conta receita prevista nem o que outras pessoas me devem. Objetivo: não comprometer o salário do futuro.
  - O comprometido no cartão é a **soma das transações**, item a item. O `balance` do banco aparece ao lado, com a diferença.
- **Pós-pago**: pré-pago + receitas previstas + o que pessoas me devem.
- O usuário alterna entre os dois modos.
- **Horizonte da previsão:** 12 meses ou até a última parcela, o que for mais longe.

## Segurança e backup
- Credenciais da Pluggy ficam no armazenamento do app. No MVP, quem protege é o bloqueio do celular.
- **CSP restrita** por `<meta>`: `connect-src` só para `https://api.pluggy.ai`, sem scripts nem estilos de terceiros. Mesmo um código malicioso não consegue mandar o segredo para outro lugar.
- **Dependências travadas:** versões exatas no `package.json`, lockfile no repositório, `npm ci` no GitHub Actions e o mínimo de dependências.
- Backup: arquivo exportado pelo usuário, **trancado com senha**, com tudo: credenciais, categorias, regras e lançamentos. (Revisto em 17/11/2026: antes era sem as credenciais; trancado, o arquivo é um jeito mais seguro de levar o segredo ao celular do que copiar e colar.)

## Arquivo trancado (cofre)
- Um único formato serve para **configurar** (credenciais + regras, gerado por um script do usuário) e para **backup** (exportado pelo app, com todas as tabelas). Em Ajustes → Arquivos e backup: **Abrir arquivo…** (aceita também o arquivo de regras aberto) e **Exportar backup…**.
- **Criptografia** do próprio navegador (Web Crypto), sem biblioteca: chave por **PBKDF2-SHA256 com 600 mil repetições** e sal aleatório (cada tentativa de adivinhar a senha fica lenta) e conteúdo cifrado com **AES-256-GCM** (qualquer alteração no arquivo é detectada).
- **Senha escolhida pelo usuário, mínimo de 16 caracteres** (sugestão: frase de 4 palavras). Não há limite de tentativas: quem copia o arquivo testa senhas fora do app; a proteção é a tentativa lenta + senha forte.
- **Abrir um backup substitui** os dados do aparelho e pede confirmação antes. Em seguida, a atualização segue a regra de sempre: o período aberto fica igual ao banco; o fechado fica como veio do backup.
```json
{ "format": "box-flow-vault", "version": 1,
  "kdf": { "name": "PBKDF2", "hash": "SHA-256", "iterations": 600000, "salt": "<base64>" },
  "cipher": { "name": "AES-GCM", "iv": "<base64>" },
  "data": "<base64: JSON cifrado>" }
```
- Conteúdo (todas as partes opcionais): `pluggy` (`clientId`, `clientSecret`, `itemIds`); `rules` (texto + nome da categoria, gravadas como importadas); `commitments` (compromissos com a categoria pelo nome, gravados como importados); `tables` (cópia das tabelas do app, no backup). A senha é normalizada em NFC antes de virar chave.
- **Um arquivo só: `box-flow.json`** (revisto em 17/11/2026). É o **único** arquivo que o app abre: não há mais arquivo de regras sem senha nem "importar regras" separado. Quem não programa preenche a Pluggy em Ajustes → Bancos e cria regras, categorias e compromissos no app; o "Exportar backup" grava tudo no `box-flow.json`.
- Um script do usuário pode gerar a **primeira versão** do arquivo (credenciais + regras + compromissos, ex.: migrando de uma planilha); depois, o arquivo de verdade é o backup do app, salvo por cima.
- Abrir de novo um arquivo com `rules`/`commitments` substitui só os **importados** antes; o que foi criado no app fica.
- Implementado em `src/lib/vault.ts` e `src/db/vaultData.ts`.

## Categorias padrão
Transporte por app · Transporte · Alimentação · Lazer · Saúde · Presente · Roupa · Passagem · Moradia · Contabilidade · Imposto · Assinaturas · Empréstimo · Salário · Transferência. O usuário cria e renomeia (apagar: depois). Os nomes padrão existem em português e inglês; renomeada, vale o nome do usuário.

## Categorias e regras
- **Ordem:** a categoria escolhida à mão vence tudo; depois as regras do usuário (a mais recente vence), as importadas (na ordem do arquivo) e as automáticas.
- **Regras valem para todo o histórico** (são aplicadas na hora de mostrar), menos o que foi marcado à mão.
- **Texto da regra:** procurado na descrição, na descrição original e no estabelecimento; maiúsculas, acentos e espaços não importam.
- **Transferência** é uma categoria especial: não entra nos totais do mês.
- **Regras automáticas de transferência** (pela categoria que a Pluggy dá): `Credit card payment`, `Same person transfer`, `Investments`, `Fixed income`; no cartão, entrada marcada como `Transfers` ou `Transfer - PIX` (pagamento da fatura); e o texto "Pagamento de fatura" saindo da conta (há banco que manda só como `Transfers`). Ficam de fora: saída no cartão marcada como `Transfers` (Pix no crédito, que é empréstimo), rendimentos e estornos.
- **Trocar a categoria** de um lançamento oferece criar uma regra com um trecho do texto ("aplicar a todos parecidos").
- **Totais do mês:** entradas, saídas e resultado, sem transferências; o extrato mostra quantos estão sem categoria.
- Implementado em `src/domain/category.ts` (`classify`) e `src/domain/statement.ts` (`monthTotals`).

## Regras vindas do arquivo
- No `box-flow.json`, cada regra é `{ "text": "DL*99", "category": "Transporte por app" }`. `category` é o nome; a categoria que não existe é criada (o nome é comparado sem acento e sem maiúsculas, nos dois idiomas).
- Abrir de novo **substitui** as regras importadas antes; as criadas no app ficam. Linha sem texto ou sem categoria é ignorada.
- Implementado em `src/db/rulesImport.ts` (`importRuleEntries`).

## Depois do MVP
- Senha para abrir o app e **Face ID** via WebAuthn (passkey). Para a senha também cifrar os dados: extensão PRF do WebAuthn (testar no iOS antes de contar com ela).
- **Teto por categoria** definido pelo usuário, com sugestão do app.
- **Meta de poupança** ("pague-se primeiro"): sobra = renda média − fixos e recorrentes − parcelas − média dos variáveis.
- **Onde cortar**: recorrentes ordenados pelo custo anual; categorias acima do teto ou da média.
- **Viagem e moeda estrangeira**: etiqueta de viagem com custo total; gastos em espécie em outra moeda.

## Cartão: o mês é quando o dinheiro sai
Uma regra só para o extrato e para o saldo previsto: a compra no cartão entra no mês em que a fatura é paga.
- **Fatura ainda não paga:** mês do **vencimento**. Uma compra de 20/11 numa fatura que vence em 15/12 entra em dezembro.
- **Fatura paga:** mês do **pagamento**, antes ou depois do vencimento. Se a fatura de 15/12 for paga em 30/11, as compras dela entram em novembro; se for paga em 05/01, em janeiro.
- **Quando a fatura foi quitada:** a lista `payments` de `/bills` vem fora de ordem e mistura pagamentos de outras faturas. A fatura está quitada no pagamento que, somado aos anteriores em ordem de data, cobre o total.
- A fatura vem de `billId` (compra liquidada) ou de `billForecastDate` (compra pendente). Fatura ainda não fechada: vencimento previsto no **dia mais frequente** dos vencimentos anteriores (um vencimento adiado por feriado não conta).
- **Compra no cartão lançada à mão**, antes de o banco sincronizar: vai para a fatura aberta, a do mês seguinte à última fatura fechada.
- Implementado em `src/domain/card.ts` (`cashOutDate`), com os casos em `card.test.ts`.
- **Parcelada:** cada parcela segue a fatura em que cai. Parcela antecipada vai para a fatura que a recebeu.
- A data da compra continua visível no lançamento; só não decide o mês.

## Idioma
- Interface em **português (pt-BR) por padrão**, com opção de trocar para **inglês**.
- i18n desde o início com `react-i18next`: nenhum texto de interface fixo no código. Datas e valores formatados com `Intl` conforme o idioma.

## Visual
Revisto em 18/11/2026: a referência passou a ser o app **Carteira** do iPhone (iOS 26), não mais o site da Apple. Decidido num esboço com a tela de hoje ao lado da proposta.
- **Um destaque por tela.** No Extrato, o gasto do mês em número grande, na fonte arredondada do sistema (`ui-rounded`, a SF Pro Rounded no iPhone); no detalhe, o valor do lançamento.
- **Vidro só na navegação** (Liquid Glass): barra de abas, botões redondos e cápsulas no topo, folhas. Listas e blocos são sólidos. Sem barra de título: no Extrato, o mês fica numa cápsula de vidro no topo.
- **Sem azul.** Ações e seleção na cor do texto (branco no escuro, preto no claro). Cor só onde tem significado: verde para entrada, laranja para atenção, vermelho para ação destrutiva e a cor de cada categoria.
- **Um raio só** (26 px) para blocos e campos; botões em cápsula. Separador recuado, alinhado ao texto.
- **Linha de lançamento:** nome em semibold; categoria e conta em duas linhas cinza, sem "·"; valor cinza, sem negrito e sem sinal de menos (a entrada tem "+" e fica verde); seta à direita.
- **Etiquetas** retangulares ao lado da categoria: Previsto e parcela em cinza, Atrasado em laranja.
- **Títulos de seção** grandes e sem caixa alta. Dias recentes como "Hoje" e "Ontem".
- **Sem categoria** não pinta a linha de laranja: o Extrato mostra um item "Para revisar" no topo.
- **Barra do mês**, como a do Armazenamento do iPhone: o total são as entradas; cada categoria de gasto tem uma cor (as 5 maiores; o resto vira "Outros"), o previsto fica listrado e o que sobra aparece livre, com o valor dentro. **Cor fixa por categoria**, com padrão na ordem do iOS e editável.
- **Detalhe do lançamento:** tocar numa linha abre uma tela com o valor grande, um bloco com estado, conta, texto do banco e total, as linhas de categoria e compromisso, os dados do cartão e as ações em cápsula, cada uma com uma explicação embaixo. A categoria é escolhida a partir dela.
- **Barra de abas** de vidro, como a do app Arquivos: a seleção é uma pílula; ao tocar, vira uma lente que desliza até a aba, e dá para segurar e arrastar. O lançamento rápido (+) fica num círculo ao lado da barra. Botões de vidro crescem ao serem tocados.
- Fonte do sistema (no iPhone, a SF Pro), números com largura fixa; segue o modo claro ou escuro do aparelho.

## Consentimento
- O app **avisa** quando o `consentExpiresAt` de um banco estiver perto (ex.: 30 dias antes) e explica como reconectar.
