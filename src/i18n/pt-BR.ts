/** Textos da interface em português. É a referência: o inglês precisa ter as mesmas chaves. */
export const ptBR = {
  tabs: {
    statement: 'Extrato',
    commitments: 'Compromissos',
    add: 'Novo lançamento',
    balance: 'Saldo',
    settings: 'Ajustes',
  },
  month: {
    previous: 'Mês anterior',
    next: 'Próximo mês',
  },
  statement: {
    emptyTitle: 'Nenhum lançamento',
    emptyBody: 'Conecte seus bancos em Ajustes ou lance um gasto pelo botão +.',
  },
  commitments: {
    emptyTitle: 'Nenhum compromisso',
    emptyBody: 'Parcelados e recorrentes aparecem aqui, com os lançamentos que vão gerar.',
  },
  balance: {
    prepaid: 'Pré-pago',
    postpaid: 'Pós-pago',
    prepaidHint: 'O que você tem menos o que já está comprometido. Não conta salário futuro.',
    postpaidHint: 'O pré-pago mais as receitas previstas e o que te devem.',
    noData: 'Ainda sem dados',
  },
  settings: {
    general: 'Geral',
    language: 'Idioma',
    data: 'Dados',
    banks: 'Bancos',
    backup: 'Backup',
    soon: 'Em breve',
    about: 'Sobre',
    license: 'Código aberto, licença MIT',
  },
  quickAdd: {
    title: 'Novo lançamento',
    body: 'Em breve: valor, categoria e conta em poucos toques.',
    close: 'Fechar',
  },
}

export type Messages = typeof ptBR
