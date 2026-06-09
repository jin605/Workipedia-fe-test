<script setup lang="ts">
import { ref } from 'vue'
import http from '@/api/index'

type Log = { type: 'ok' | 'err' | 'info'; text: string; time: string }
type Attachment = { objectKey: string; fileName: string; size: number; downloadUrl: string }

const logs = ref<Log[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const selectedFileName = ref('')
const attachments = ref<Attachment[]>([])

function addLog(text: string, type: Log['type'] = 'info') {
  logs.value.push({ type, text, time: new Date().toLocaleTimeString() })
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function onFileChange() {
  selectedFileName.value = fileInput.value?.files?.[0]?.name ?? ''
}

async function upload() {
  const file = fileInput.value?.files?.[0]
  if (!file) { addLog('파일을 선택하세요', 'err'); return }

  try {
    addLog(`presigned URL 발급 요청: ${file.name}`, 'info')
    const { data: uploadData } = await http.post('/api/v1/storage/presigned-upload', {
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
    })
    const { uploadUrl, objectKey } = uploadData.data
    addLog(`발급 완료 → ${objectKey}`, 'ok')

    addLog('R2 업로드 중...', 'info')
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    })
    if (!res.ok) {
      addLog(`R2 업로드 실패: ${res.status} ${res.statusText}`, 'err')
      return
    }
    addLog('업로드 성공, download URL 발급 중...', 'ok')

    const { data: dlData } = await http.get('/api/v1/storage/presigned-download', {
      params: { objectKey },
    })
    attachments.value.push({
      objectKey,
      fileName: file.name,
      size: file.size,
      downloadUrl: dlData.data.downloadUrl,
    })
    addLog(`첨부 완료: ${file.name}`, 'ok')

    if (fileInput.value) fileInput.value.value = ''
    selectedFileName.value = ''
  } catch (e: any) {
    addLog(`에러: ${e.message}`, 'err')
  }
}

async function remove(index: number) {
  const att = attachments.value[index]
  try {
    await http.delete('/api/v1/storage', { params: { objectKey: att.objectKey } })
    attachments.value.splice(index, 1)
    addLog(`삭제 완료: ${att.fileName}`, 'ok')
  } catch (e: any) {
    addLog(`삭제 실패: ${e.message}`, 'err')
  }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1 class="page-title">File Upload (R2 Presigned URL)</h1>
    </div>

    <div class="col">
      <div class="card">
        <div class="section-title">파일 첨부</div>
        <label class="file-label">
          <input ref="fileInput" type="file" class="file-input" @change="onFileChange" />
          <span class="btn btn--outline">파일 선택</span>
          <span class="file-name">{{ selectedFileName || '선택된 파일 없음' }}</span>
        </label>
        <button class="btn btn--primary" @click="upload">업로드</button>
      </div>

      <div v-if="attachments.length" class="card">
        <div class="section-title">첨부 파일 ({{ attachments.length }})</div>
        <div class="attach-list">
          <div v-for="(att, i) in attachments" :key="att.objectKey" class="attach-item">
            <div class="attach-icon">📎</div>
            <div class="attach-info">
              <span class="attach-name">{{ att.fileName }}</span>
              <span class="attach-size">{{ formatSize(att.size) }}</span>
            </div>
            <div class="attach-actions">
              <a :href="att.downloadUrl" target="_blank" class="btn-action btn-action--blue">열기</a>
              <button class="btn-action btn-action--red" @click="remove(i)">삭제</button>
            </div>
          </div>
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
  </div>
</template>

<style scoped>
.page { padding: 32px; display: flex; flex-direction: column; gap: 16px; max-width: 640px; }
.page-header { margin-bottom: 8px; }
.page-title { font-size: 20px; font-weight: 700; color: var(--ink); }

.col { display: flex; flex-direction: column; gap: 16px; }
.card { background: var(--bg); border: 1px solid var(--line); border-radius: var(--radius); padding: 20px; box-shadow: var(--shadow-card); display: flex; flex-direction: column; gap: 12px; }
.section-title { font-size: 13px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }

.file-label { display: flex; align-items: center; gap: 12px; cursor: pointer; }
.file-input { display: none; }
.file-name { font-size: 13px; color: var(--muted); }

.btn { padding: 8px 16px; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; border: none; white-space: nowrap; align-self: flex-start; }
.btn--primary { background: var(--blue); color: #fff; }
.btn--primary:hover { opacity: 0.9; }
.btn--outline { background: transparent; border: 1px solid var(--line); color: var(--ink); }
.btn--outline:hover { background: var(--bg-soft); }

.attach-list { display: flex; flex-direction: column; gap: 8px; }
.attach-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: var(--bg-soft); border-radius: 8px; border: 1px solid var(--line); }
.attach-icon { font-size: 18px; flex-shrink: 0; }
.attach-info { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.attach-name { font-size: 13px; font-weight: 600; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.attach-size { font-size: 11px; color: var(--muted); }
.attach-actions { display: flex; gap: 6px; flex-shrink: 0; }
.btn-action { padding: 4px 10px; border-radius: 6px; font-size: 12px; cursor: pointer; border: 1px solid; text-decoration: none; display: inline-block; }
.btn-action--blue { border-color: var(--blue); color: var(--blue); background: transparent; }
.btn-action--blue:hover { background: var(--blue); color: #fff; }
.btn-action--red { border-color: var(--red); color: var(--red); background: transparent; }
.btn-action--red:hover { background: var(--red); color: #fff; }

.log { background: #1e1e1e; border-radius: 8px; padding: 14px; height: 200px; overflow-y: auto; font-family: monospace; font-size: 12px; }
.log-line { margin-bottom: 4px; line-height: 1.5; }
.log-line--ok { color: #4ade80; }
.log-line--err { color: #f87171; }
.log-line--info { color: #93c5fd; }
.log-time { color: #6b7280; margin-right: 6px; }
.log-empty { color: #6b7280; }
</style>
