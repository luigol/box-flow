# box-flow

> *Box flow* é a tradução (errada, de propósito) de **fluxo de caixa**.

App de finanças pessoais **open source** e **local-first**. Ele puxa as transações dos seus bancos pelo [Meu Pluggy](https://meu.pluggy.ai) (Open Finance, gratuito para uso pessoal), classifica cada lançamento e mostra quanto você realmente tem, quanto já está comprometido e o saldo previsto dos próximos meses.

- **Sem servidor.** É um PWA: roda no navegador do celular e fala direto com a API da Pluggy. Seus dados ficam só no aparelho.
- **Sem loja de apps.** No iPhone ou no Android, abra o site e use "Adicionar à Tela de Início".
- **Cada pessoa usa a própria conta da Pluggy.** O app não tem credenciais de ninguém embutidas.

> **Status:** em construção. Já conecta à Pluggy (Ajustes → Bancos), guarda os lançamentos no aparelho e mostra o extrato do mês. Ainda sem categorias, compromissos e saldo. As decisões estão em [docs/design.md](docs/design.md).

## O que o MVP vai fazer
1. **Extrato do mês** (mês do calendário) com cada lançamento classificado: categoria, valor fixo ou variável, avulso, parcelado ou recorrente, e etiquetas.
2. **Compromissos**: recorrentes (todo dia 15, até cancelar) e parcelados (do cartão, vindos do banco, ou combinados com pessoas, lançados à mão), gerando os lançamentos previstos sozinhos.
3. **Saldo previsto** em dois modos:
   - **pré-pago**: só o que você já tem menos o que já está comprometido, sem contar salário futuro;
   - **pós-pago**: o mesmo, somando as receitas previstas.
4. **Lançamento manual rápido** para o que o banco não sabe ou ainda não sincronizou, conciliado depois com a transação do banco, sempre com a sua confirmação.
5. **Backup por arquivo**, criptografado com senha.

## O que você vai precisar
1. Conta no [Meu Pluggy](https://meu.pluggy.ai) com os seus bancos conectados (cada banco é uma autorização separada; até 5).
2. Uma aplicação no [Dashboard da Pluggy](https://dashboard.pluggy.ai), criada com o **mesmo e-mail** do Meu Pluggy, para obter `clientId` e `clientSecret`.
3. Em *Applications → sua aplicação → Demo → Connect Account*, conecte cada banco pelo conector **MeuPluggy** (não pelo conector do banco, que é do trial comercial e pausa em 15 dias) e copie o `itemId` de cada um em *Connected Items*. A API não lista os itens; o `itemId` só aparece ali.

Guia oficial: <https://docs.pluggy.ai/en/docs/guides/meu-pluggy-personal-use>

## Stack
React + Vite + TypeScript · Tailwind CSS · react-i18next · Dexie (IndexedDB) · PWA · GitHub Pages via GitHub Actions.

## Desenvolvimento
Requer Node 24 ou mais novo.
```
npm ci            # instala exatamente as versões do package-lock.json
npm run dev       # abre em http://localhost:5173/box-flow/
npm test
npm run build     # gera dist/, com a política de segurança (CSP) aplicada
```
As versões das dependências são fixas e os scripts de instalação ficam desligados (`.npmrc`). O app só pode se conectar a `api.pluggy.ai`.

## Licença
[MIT](LICENSE)
