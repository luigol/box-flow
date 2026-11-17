import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { en } from './en'
import { ptBR } from './pt-BR'

/** Nome de cada idioma escrito nele mesmo, como no seletor do iPhone. */
export const LANGUAGES = { 'pt-BR': 'Português', en: 'English' } as const
export type Language = keyof typeof LANGUAGES

const DEFAULT_LANGUAGE: Language = 'pt-BR'
const STORAGE_KEY = 'box-flow:language'

function isLanguage(value: string | null): value is Language {
  return value !== null && value in LANGUAGES
}

function savedLanguage(): Language {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (isLanguage(value)) return value
  } catch {
    // Armazenamento indisponível (aba privada): fica o padrão.
  }
  return DEFAULT_LANGUAGE
}

export function setLanguage(language: Language): void {
  try {
    localStorage.setItem(STORAGE_KEY, language)
  } catch {
    // Sem armazenamento, a troca vale só até fechar o app.
  }
  document.documentElement.lang = language
  void i18n.changeLanguage(language)
}

export function currentLanguage(): Language {
  return isLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE
}

void i18n.use(initReactI18next).init({
  resources: {
    'pt-BR': { translation: ptBR },
    en: { translation: en },
  },
  lng: savedLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false },
})

document.documentElement.lang = currentLanguage()

export default i18n
