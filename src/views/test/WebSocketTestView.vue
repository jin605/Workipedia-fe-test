<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Client } from '@stomp/stompjs'
import http from '@/api/index'
import { useAuthStore } from '@/stores/authStore'

const auth = useAuthStore()

// ── WebSocket ──────────────────────────────────────────────────────────
type Log = { type: 'ok' | 'err' | 'info'; text: string; time: string }
const logs = ref<Log[]>([])
const connected = ref(false)
const chatMsg = ref('')
const messages = ref<any[]>([])
let stomp: Client | null = null

function addLog(text: string, type: Log['type'] = 'info') {
  logs.value.push({ type, text, time: new Date().toLocaleTimeString() })
}

function connect() {
  if (stomp?.connected) { addLog('이미 연결됨', 'info'); return }
  stomp = new Client({
    brokerURL: 'ws://localhost:8080/ws/flash-chat-native',
    connectHeaders: auth.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {},
    onConnect: () => {
      connected.value = true
      addLog('STOMP 연결 성공', 'ok')
      stomp!.subscribe('/topic/flash-chat', (msg) => {
        const body = JSON.parse(msg.body)
        addLog(`수신 [${body.type}] ${body.nickname ?? ''}: ${body.content ?? body.id}`, 'info')
        if (body.type === 'MESSAGE') messages.value.unshift(body)
        if (body.type === 'DELETE') messages.value = messages.value.filter(m => m.id !== body.id)
      })
      addLog('/topic/flash-chat 구독 완료', 'ok')
      fetchMessages()
    },
    onDisconnect: () => { connected.value = false; addLog('연결 해제', 'info') },
    onStompError: (frame) => addLog(`STOMP 에러: ${frame.headers?.message}`, 'err'),
  })
  stomp.activate()
  addLog('연결 시도 중...', 'info')
}

function disconnect() { stomp?.deactivate() }

function send() {
  const t = chatMsg.value.trim()
  if (!t) return
  if (!stomp?.connected) { addLog('먼저 연결하세요', 'err'); return }
  stomp.publish({ destination: '/app/flash-chat/send', body: JSON.stringify({ content: t, replyToId: null }) })
  addLog(`전송: ${t}`, 'ok')
  chatMsg.value = ''
}

async function fetchMessages() {
  try {
    const { data } = await http.get('/api/v1/flash-chat/messages')
    messages.value = data.messages ?? []
    addLog(`메시지 ${messages.value.length}개 로드`, 'ok')
  } catch (e: any) {
    addLog(`메시지 조회 실패: ${e.message}`, 'err')
  }
}

// ── Admin ──────────────────────────────────────────────────────────────
const policy = ref<any>(null)
const policyTtl = ref(600)
const policyCooldown = ref(3)
const policyBannedWords = ref('')

async function fetchPolicy() {
  try {
    const { data } = await http.get('/api/v1/admin/flash-chat/policy')
    policy.value = data
    policyTtl.value = data.messageTtlSeconds
    policyCooldown.value = data.sendCooldownSeconds
    policyBannedWords.value = (data.bannedWords ?? []).join(', ')
  } catch (e: any) {
    addLog(`정책 조회 실패: ${e.message}`, 'err')
  }
}

async function updatePolicy() {
  try {
    const bannedWords = policyBannedWords.value.split(',').map(w => w.trim()).filter(Boolean)
    const { data } = await http.patch('/api/v1/admin/flash-chat/policy', {
      messageTtlSeconds: policyTtl.value,
      sendCooldownSeconds: policyCooldown.value,
      bannedWords,
    })
    policy.value = data
    addLog('정책 업데이트 완료', 'ok')
  } catch (e: any) {
    addLog(`정책 업데이트 실패: ${e.message}`, 'err')
  }
}

async function deleteMessage(id: string) {
  try {
    await http.delete(`/api/v1/admin/flash-chat/messages/${id}`)
    messages.value = messages.value.filter(m => m.id !== id)
    addLog(`메시지 삭제: ${id}`, 'ok')
  } catch (e: any) {
    addLog(`삭제 실패: ${e.message}`, 'err')
  }
}

onMounted(fetchPolicy)
onUnmounted(() => stomp?.deactivate())
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1 class="page-title">Flash Chat WebSocket</h1>
      <span class="badge" :class="connected ? 'badge--green' : 'badge--gray'">
        <span class="dot"></span>{{ connected ? '연결됨' : '미연결' }}
      </span>
    </div>

    <div class="grid">
      <!-- 왼쪽: WS + 메시지 -->
      <div class="col">
        <div class="card">
          <div class="section-title">연결 제어</div>
          <div class="btn-row">
            <button class="btn btn--primary" @click="connect">연결</button>
            <button class="btn btn--danger" @click="disconnect">해제</button>
            <button class="btn btn--outline" @click="fetchMessages">새로고침</button>
          </div>
        </div>

        <div class="card">
          <div class="section-title">메시지 전송</div>
          <div class="input-row">
            <input v-model="chatMsg" class="input" placeholder="메시지 입력" @keyup.enter="send" />
            <button class="btn btn--primary" @click="send">전송</button>
          </div>
        </div>

        <div class="card">
          <div class="section-title">활성 메시지 ({{ messages.length }})</div>
          <div class="msg-list">
            <div v-for="m in messages" :key="m.id" class="msg-item">
              <div class="msg-info">
                <span class="msg-nick">{{ m.nickname }}</span>
                <span class="msg-content">{{ m.content }}</span>
              </div>
              <button class="btn-del" @click="deleteMessage(m.id)">삭제</button>
            </div>
            <div v-if="!messages.length" class="empty">메시지 없음</div>
          </div>
        </div>

        <div class="card">
          <div class="section-title">로그</div>
          <div class="log">
            <div v-for="(l, i) in logs" :key="i" :class="`log-line log-line--${l.type}`">
              <span class="log-time">{{ l.time }}</span> {{ l.text }}
            </div>
            <div v-if="!logs.length" class="log-empty">로그 없음</div>
          </div>
        </div>
      </div>

      <!-- 오른쪽: 관리자 -->
      <div class="col">
        <div class="card">
          <div class="section-title">관리자 — 정책</div>
          <div v-if="policy" class="policy-current">
            <span class="tag">TTL {{ policy.messageTtlSeconds }}s</span>
            <span class="tag">쿨다운 {{ policy.sendCooldownSeconds }}s</span>
            <span class="tag">금지어 {{ policy.bannedWords?.length ?? 0 }}개</span>
          </div>
          <div class="field">
            <label>메시지 TTL (초)</label>
            <input v-model.number="policyTtl" class="input" type="number" min="60" />
          </div>
          <div class="field">
            <label>전송 쿨다운 (초)</label>
            <input v-model.number="policyCooldown" class="input" type="number" min="0" />
          </div>
          <div class="field">
            <label>금지어 (쉼표 구분)</label>
            <input v-model="policyBannedWords" class="input" placeholder="욕설, 광고, ..." />
          </div>
          <div class="btn-row">
            <button class="btn btn--primary" @click="updatePolicy">정책 저장</button>
            <button class="btn btn--outline" @click="fetchPolicy">불러오기</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 32px; display: flex; flex-direction: column; gap: 16px; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.page-title { font-size: 20px; font-weight: 700; color: var(--ink); }

.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
.col { display: flex; flex-direction: column; gap: 16px; }

.card { background: var(--bg); border: 1px solid var(--line); border-radius: var(--radius); padding: 20px; box-shadow: var(--shadow-card); display: flex; flex-direction: column; gap: 12px; }
.section-title { font-size: 13px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }

.badge { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; padding: 4px 10px; border-radius: 99px; font-weight: 500; }
.badge--green { background: #dcfce7; color: #166534; }
.badge--gray { background: var(--bg-soft); color: var(--muted); }
.dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }

.btn-row { display: flex; gap: 8px; flex-wrap: wrap; }
.input-row { display: flex; gap: 8px; }
.btn { padding: 8px 16px; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; border: none; white-space: nowrap; }
.btn--primary { background: var(--blue); color: #fff; }
.btn--primary:hover { opacity: 0.9; }
.btn--danger { background: var(--red); color: #fff; }
.btn--danger:hover { opacity: 0.9; }
.btn--outline { background: transparent; border: 1px solid var(--line); color: var(--ink); }
.btn--outline:hover { background: var(--bg-soft); }

.input { flex: 1; padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; font-size: 14px; outline: none; width: 100%; }
.input:focus { border-color: var(--blue); }

.field { display: flex; flex-direction: column; gap: 6px; }
label { font-size: 13px; color: var(--muted); font-weight: 500; }

.policy-current { display: flex; gap: 6px; flex-wrap: wrap; }
.tag { background: var(--bg-soft); border: 1px solid var(--line); border-radius: 6px; padding: 3px 10px; font-size: 12px; color: var(--ink); }

.msg-list { display: flex; flex-direction: column; gap: 6px; max-height: 240px; overflow-y: auto; }
.msg-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; background: var(--bg-soft); border-radius: 8px; }
.msg-info { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.msg-nick { font-size: 12px; font-weight: 600; color: var(--muted); }
.msg-content { font-size: 13px; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.btn-del { padding: 4px 10px; background: transparent; border: 1px solid var(--red); color: var(--red); border-radius: 6px; font-size: 12px; cursor: pointer; flex-shrink: 0; }
.btn-del:hover { background: var(--red); color: #fff; }
.empty { font-size: 13px; color: var(--muted); text-align: center; padding: 16px 0; }

.log { background: #1e1e1e; border-radius: 8px; padding: 14px; height: 200px; overflow-y: auto; font-family: monospace; font-size: 12px; }
.log-line { margin-bottom: 4px; line-height: 1.5; }
.log-line--ok { color: #4ade80; }
.log-line--err { color: #f87171; }
.log-line--info { color: #93c5fd; }
.log-time { color: #6b7280; margin-right: 6px; }
.log-empty { color: #6b7280; }
</style>
