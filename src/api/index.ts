import axios from 'axios'
import { useAuthStore } from '@/stores/authStore'

const http = axios.create({
  baseURL: '',
  timeout: 10000,
  withCredentials: true,
})

http.interceptors.request.use((config) => {
  const auth = useAuthStore()
  if (auth.accessToken) {
    config.headers.Authorization = `Bearer ${auth.accessToken}`
  }
  return config
})

let refreshPromise: Promise<string> | null = null

http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (
      error.response?.status !== 401
      || originalRequest?._retry
      || originalRequest?.url?.includes('/auth/token/refresh')
    ) {
      return Promise.reject(error)
    }

    originalRequest._retry = true

    try {
      refreshPromise ??= axios.post(
        '/api/v1/auth/token/refresh',
        {},
        { withCredentials: true },
      ).then(({ data }) => data.accessToken)

      const newToken = await refreshPromise
      const auth = useAuthStore()
      auth.setAccessToken(newToken)
      originalRequest.headers.Authorization = `Bearer ${newToken}`

      return http(originalRequest)
    } catch (refreshError) {
      useAuthStore().clearAccessToken()
      return Promise.reject(refreshError)
    } finally {
      refreshPromise = null
    }
  },
)

export default http
