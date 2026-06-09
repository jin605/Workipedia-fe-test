<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/authStore'

const auth = useAuthStore()
const tokenInput = ref('')

function applyToken() {
  const t = tokenInput.value.trim()
  if (!t) return
  auth.accessToken = t
  localStorage.setItem('fe-test-token', t)
  tokenInput.value = ''
}

function clearToken() {
  auth.accessToken = null
  localStorage.removeItem('fe-test-token')
}
</script>

<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="sidebar-logo">Workipedia<br /><span>FE Test</span></div>
      <nav class="sidebar-nav">
        <p class="nav-label">Integration Test</p>
        <RouterLink to="/websocket" class="nav-item" active-class="nav-item--active">Flash Chat WS</RouterLink>
        <RouterLink to="/file-upload" class="nav-item" active-class="nav-item--active">File Upload (R2)</RouterLink>
        <p class="nav-label nav-label--spaced">Wireframe</p>
        <RouterLink to="/ai-admin" class="nav-item" active-class="nav-item--active">AI 관리</RouterLink>
      </nav>
      <div class="sidebar-footer">
        <p class="token-label">JWT Token</p>
        <p class="token-status" :class="auth.accessToken ? 'token-status--ok' : 'token-status--none'">
          {{ auth.accessToken ? '✓ 토큰 설정됨' : '토큰 없음' }}
        </p>
        <textarea v-model="tokenInput" class="token-input" placeholder="토큰 붙여넣기" rows="3" />
        <div class="token-btns">
          <button class="btn-apply" @click="applyToken">적용</button>
          <button class="btn-clear" @click="clearToken">초기화</button>
        </div>
      </div>
    </aside>
    <main class="main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.layout { display: flex; height: 100vh; }

.sidebar {
  width: var(--sidebar-width);
  background: var(--sidebar-bg);
  display: flex;
  flex-direction: column;
  padding: 28px 16px;
  flex-shrink: 0;
}

.sidebar-logo { font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 32px; line-height: 1.4; }
.sidebar-logo span { font-size: 11px; color: var(--brand-cyan); font-weight: 400; }

.sidebar-nav { display: flex; flex-direction: column; gap: 4px; flex: 1; }
.nav-label {
  padding: 0 14px 6px;
  color: rgba(255,255,255,0.34);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
}
.nav-label--spaced { margin-top: 18px; }
.nav-item { padding: 10px 14px; border-radius: 8px; color: rgba(255,255,255,0.65); font-size: 14px; transition: background 0.15s; }
.nav-item:hover { background: rgba(255,255,255,0.08); color: #fff; }
.nav-item--active { background: rgba(255,255,255,0.12); color: #fff; font-weight: 600; }

.sidebar-footer { border-top: 1px solid rgba(255,255,255,0.1); padding-top: 16px; display: flex; flex-direction: column; gap: 8px; }
.token-label { font-size: 11px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.5px; }
.token-status { font-size: 12px; font-weight: 500; }
.token-status--ok { color: #4ade80; }
.token-status--none { color: rgba(255,255,255,0.4); }

.token-input {
  width: 100%; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.15);
  border-radius: 6px; color: rgba(255,255,255,0.8); font-size: 11px; font-family: monospace;
  padding: 8px; resize: none; outline: none;
}
.token-input::placeholder { color: rgba(255,255,255,0.3); }

.token-btns { display: flex; gap: 6px; }
.btn-apply { flex: 1; padding: 7px; background: var(--blue); color: #fff; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; }
.btn-apply:hover { opacity: 0.9; }
.btn-clear { padding: 7px 10px; background: transparent; border: 1px solid rgba(255,255,255,0.2); color: rgba(255,255,255,0.5); border-radius: 6px; font-size: 13px; cursor: pointer; }
.btn-clear:hover { background: rgba(255,255,255,0.08); }

.main { flex: 1; overflow-y: auto; }

@media (max-width: 800px) {
  .layout { height: auto; min-height: 100vh; flex-direction: column; }
  .sidebar { width: 100%; padding: 12px 14px; flex-direction: row; align-items: center; gap: 16px; }
  .sidebar-logo { margin: 0; white-space: nowrap; }
  .sidebar-nav { flex-direction: row; overflow-x: auto; }
  .nav-label, .sidebar-footer { display: none; }
  .nav-item { white-space: nowrap; }
  .main { overflow: visible; }
}
</style>
