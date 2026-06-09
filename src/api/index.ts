import axios from 'axios'
import { useAuthStore } from '@/stores/authStore'

const http = axios.create({
  baseURL: '',
  timeout: 10000,
})

http.interceptors.request.use((config) => {
  const auth = useAuthStore()
  if (auth.accessToken) {
    config.headers.Authorization = `Bearer ${auth.accessToken}`
  }
  return config
})

export default http
