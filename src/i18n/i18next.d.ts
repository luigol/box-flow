import 'i18next'
import type { Messages } from './pt-BR'

// Chaves de tradução checadas pelo TypeScript: t('tabs.statemnt') não compila.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: Messages }
  }
}
