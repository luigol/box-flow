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
| Abas embaixo | Extrato, Compromissos, lançamento rápido (+), Saldo e Ajustes, como nos apps do iPhone. |
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
- Dois eixos de classificação:
  - **Valor**: `fixo` | `variável`.
  - **Repetição**: `avulso` | `parcelado` (N vezes, tem fim) | `recorrente` (sem fim até cancelar; frequência mensal, anual…).

### Compromisso
Parcelados e recorrentes são compromissos que **geram lançamentos previstos**:
- parcelado: registra uma vez (ou vem do banco) e gera as N parcelas;
- recorrente: a regra é registrada uma vez ("todo dia 15") e gera um lançamento por período até ser encerrada;
- receita variável (salário): recorrente com **valor estimado**; quando o dinheiro cai, o valor real substitui a estimativa e a diferença fica visível.

### Regra de classificação
Padrão na descrição do banco → categoria, valor, repetição, etiquetas. Ex.: `DL*99 RIDE` → Transporte por app. As regras iniciais podem ser importadas de um arquivo (o app precisa de **importar regras**).

### Conciliação
- O app **sugere** casar uma transação do banco com lançamentos previstos ou manuais; **o usuário sempre confirma**. Casar só por valor + data gera pares falsos.
- Um lançamento do banco pode corresponder a **vários** lançamentos manuais (ex.: três pagamentos combinados que saíram num Pix só).
- Transferências internas não são gasto: pagamento de fatura, aplicação e resgate de cofrinho, transferência entre contas próprias.

## Mês e saldo
- **Mês = mês do calendário.**
- **Pré-pago**: saldo atual das contas − tudo que já está comprometido (faturas abertas, parcelas futuras, o que **eu devo** a pessoas, previstos de saída). Não conta receita prevista nem o que outras pessoas me devem. Objetivo: não comprometer o salário do futuro.
  - O comprometido no cartão é a **soma das transações**, item a item. O `balance` do banco aparece ao lado, com a diferença.
- **Pós-pago**: pré-pago + receitas previstas + o que pessoas me devem.
- O usuário alterna entre os dois modos.
- **Horizonte da previsão:** 12 meses ou até a última parcela, o que for mais longe.

## Segurança e backup
- Credenciais da Pluggy ficam no armazenamento do app. No MVP, quem protege é o bloqueio do celular.
- **CSP restrita** por `<meta>`: `connect-src` só para `https://api.pluggy.ai`, sem scripts nem estilos de terceiros. Mesmo um código malicioso não consegue mandar o segredo para outro lugar.
- **Dependências travadas:** versões exatas no `package.json`, lockfile no repositório, `npm ci` no GitHub Actions e o mínimo de dependências.
- Backup: arquivo exportado pelo usuário, **criptografado com senha**, **sem as credenciais**.

## Categorias padrão
Transporte por app · Transporte · Alimentação · Lazer · Saúde · Presente · Roupa · Passagem · Moradia · Contabilidade · Imposto · Assinaturas · Empréstimo · Salário. O usuário cria, renomeia e apaga.

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
Inspirado no estilo da Apple, adaptado a um app, não a uma vitrine de produto:
- fundo cinza bem claro, cartões brancos com cantos de 12 a 28 px, sem borda e sem sombra; listas agrupadas como no app Ajustes do iPhone;
- fonte do sistema (no iPhone, a SF Pro), títulos grandes com espaçamento apertado, números com largura fixa para alinhar valores;
- um único azul para a ação principal; o resto é preto, cinza e branco. Verde só para valores que entram;
- segue o modo claro ou escuro do aparelho.

## Consentimento
- O app **avisa** quando o `consentExpiresAt` de um banco estiver perto (ex.: 30 dias antes) e explica como reconectar.
