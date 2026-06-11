import { defineStore } from 'pinia'
import { ref } from 'vue'

function loadToken(): string | null {
  try {
    return localStorage.getItem('fe-test-token')
  } catch { return null }
}

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(loadToken())

  function setAccessToken(token: string) {
    accessToken.value = token
    localStorage.setItem('fe-test-token', token)
  }

  function clearAccessToken() {
    accessToken.value = null
    localStorage.removeItem('fe-test-token')
  }

  return { accessToken, setAccessToken, clearAccessToken }
})
