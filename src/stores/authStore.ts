import { defineStore } from 'pinia'
import { ref } from 'vue'

function loadToken(): string | null {
  try {
    // fe-test 자체 저장 토큰 우선, 없으면 메인 FE 토큰 시도
    const direct = localStorage.getItem('fe-test-token')
    if (direct) return direct
    const raw = localStorage.getItem('auth')
    return raw ? JSON.parse(raw)?.token ?? null : null
  } catch { return null }
}

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(loadToken())

  return { accessToken }
})
