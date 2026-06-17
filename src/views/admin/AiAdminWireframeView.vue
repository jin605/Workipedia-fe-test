<script setup lang="ts">
import { computed, ref } from 'vue'

type Section = 'prompt' | 'department' | 'documents' | 'tools' | 'knowledge' | 'routing' | 'sync'
type HttpParamLocation = 'PATH' | 'QUERY' | 'HEADER'
type ToolScope = 'self' | 'open' | null
type DepartmentSyncStatus = 'SYNCED' | 'PENDING' | 'FAILED' | 'EMPTY'

const sections: { id: Section; label: string; group: string }[] = [
  { id: 'prompt', label: '프롬프트 관리', group: 'AI 설정' },
  { id: 'department', label: '부서 티켓 배정 관리', group: 'AI 설정' },
  { id: 'documents', label: '매뉴얼 문서 관리', group: 'AI 설정' },
  { id: 'tools', label: 'API Tool 관리', group: 'AI 설정' },
  { id: 'knowledge', label: '수기 지식 관리', group: 'AI 설정' },
  { id: 'routing', label: '라우팅 품질', group: '운영 현황' },
  { id: 'sync', label: '지식화 현황', group: '운영 현황' },
]

const sectionNotices: Record<Section, { label: string; tone: 'optional' | 'required' | 'monitor'; title: string; description: string }> = {
  prompt: {
    label: '선택 설정',
    tone: 'optional',
    title: '사용자 정의 프롬프트는 필수가 아닙니다.',
    description: '비활성화하거나 등록하지 않으면 배포 시 고정된 base_prompt만 사용해 답변합니다.',
  },
  department: {
    label: '선택 설정',
    tone: 'optional',
    title: '배정 기준을 등록하지 않아도 티켓 기능은 정상 동작합니다.',
    description: '추천 근거가 없거나 점수가 부족한 티켓은 공통 접수 큐로 이동하며, 관리자가 담당 부서를 지정합니다.',
  },
  documents: {
    label: '선택 데이터',
    tone: 'optional',
    title: '매뉴얼 문서가 없어도 AI 서비스는 구동됩니다.',
    description: '매뉴얼 RAG에서 답을 찾지 못하면 Tool, 해결 티켓 이력, 티켓 생성 순서로 다음 경로를 실행합니다.',
  },
  tools: {
    label: '선택 기능',
    tone: 'optional',
    title: 'API Tool은 고객사가 제공하는 연동 기능이 있을 때만 등록합니다.',
    description: '활성 Tool이 없으면 실시간 데이터 조회 단계를 건너뛰고 다음 RAG 또는 티켓 생성 단계로 이동합니다.',
  },
  knowledge: {
    label: '선택 데이터',
    tone: 'optional',
    title: '수기 지식은 문서에 없는 정보를 보완하는 선택 데이터입니다.',
    description: '등록하지 않아도 기존 매뉴얼, 워키, Tool과 해결 티켓 이력을 이용해 답변합니다.',
  },
  routing: {
    label: '운영 확인',
    tone: 'monitor',
    title: '라우팅 품질 화면은 서비스 구동에 필요한 설정이 아닙니다.',
    description: '추천 부서와 최종 처리 부서의 차이를 확인하고 배정 기준과 임계값을 개선할 때 사용합니다.',
  },
  sync: {
    label: '조건부 필수',
    tone: 'required',
    title: '승인 지식을 RAG에 활용한다면 동기화 상태 확인이 필요합니다.',
    description: '동기화 실패가 전체 AI 서비스를 중단시키지는 않지만, 실패한 지식은 검색 결과에 반영되지 않습니다.',
  },
}

const activeSection = ref<Section>('prompt')
const savedNotice = ref('')
const toolModalOpen = ref(false)
const dbToolModalOpen = ref(false)
const toolFilter = ref('전체')
const routingFilter = ref('전체')
const promptEnabled = ref(true)
const aiInstruction = ref('')
const aiLoading = ref(false)
const editingDepartmentId = ref<number | null>(3)
const editingRr = ref('CI/CD 파이프라인, 서버 배포, 클라우드 인프라 관련 문의를 담당합니다. Kubernetes, Docker, AWS 관련 장애 및 설정 문의 티켓을 처리합니다.')

// DB Query Tool은 카탈로그 스캔 없이 미리 등록된 고정 datasource 중에서만 고른다(애플리케이션 설정에 있는 값).
const fixedDatasources = [
  { key: 'hr_readonly_db', label: 'hr_readonly_db (사내 인사 DB, 읽기전용)' },
  { key: 'asset_readonly_db', label: 'asset_readonly_db (자산관리 DB, 읽기전용)' },
]

const httpApiForm = ref({
  name: 'get_home_server_status',
  description: '홈서버의 현재 상태를 조회할 때 사용합니다.',
  method: 'GET',
  endpointUrl: 'https://api.workinprocess.dev/internal/server/{serverId}/status',
  authType: 'API_KEY',
  authHeaderName: 'X-API-Key',
  authKeyValue: '********',
  scope: null as ToolScope,
})
const httpApiParams = ref([
  { id: 1, name: 'serverId', location: 'PATH' as HttpParamLocation, dataType: 'string', required: true, description: '조회할 서버 ID', exampleValue: 'home-main' },
])
const nextHttpParamId = ref(2)
const httpSelfBindParamId = ref<number | null>(null)

const dbToolForm = ref({
  name: 'get_user_contact',
  description: '사번으로 사용자의 이름과 이메일을 조회합니다.',
  datasourceKey: fixedDatasources[0].key,
  queryTemplate: 'SELECT name, email FROM employees WHERE emp_no = :empNo',
  scope: null as ToolScope,
})
const dbToolParams = ref([
  { id: 1, name: 'empNo', dataType: 'string', required: true },
])
const nextDbParamId = ref(2)
const dbSelfBindParamId = ref<number | null>(null)

const departments = ref([
  {
    departmentId: 1,
    departmentName: '개발 1팀',
    rr: '백엔드 API 개발, 서버 인프라 관련 문의를 담당합니다. Java/Spring 기반 시스템 오류, DB 연동 문제, API 명세 관련 티켓을 처리합니다.',
    syncStatus: 'SYNCED' as DepartmentSyncStatus,
    syncInfo: '마지막 동기화: 2026-06-17 14:32',
  },
  {
    departmentId: 2,
    departmentName: '개발 2팀',
    rr: '프론트엔드 UI/UX, 브라우저 호환성 문제를 담당합니다. React 기반 화면 오류, 디자인 시스템 관련 티켓을 처리합니다.',
    syncStatus: 'PENDING' as DepartmentSyncStatus,
    syncInfo: '마지막 동기화 대기 중',
  },
  {
    departmentId: 3,
    departmentName: '인프라팀',
    rr: 'CI/CD 파이프라인, 서버 배포, 클라우드 인프라 관련 문의를 담당합니다. Kubernetes, Docker, AWS 관련 장애 및 설정 문의 티켓을 처리합니다.',
    syncStatus: 'SYNCED' as DepartmentSyncStatus,
    syncInfo: '마지막 동기화: 2026-06-17 13:20',
  },
  {
    departmentId: 4,
    departmentName: '보안팀',
    rr: '정보보안, 접근 권한, 취약점 관련 문의를 담당합니다. 계정 탈취 의심, 보안 감사, 권한 오류 관련 티켓을 처리합니다.',
    syncStatus: 'FAILED' as DepartmentSyncStatus,
    syncInfo: '마지막 동기화 실패: 2026-06-17 09:14',
  },
  {
    departmentId: 5,
    departmentName: '데이터팀',
    rr: '데이터 분석, BI 리포트, 데이터 파이프라인 관련 문의를 담당합니다. SQL 쿼리 오류, 대시보드 데이터 불일치, ETL 장애 티켓을 처리합니다.',
    syncStatus: 'SYNCED' as DepartmentSyncStatus,
    syncInfo: '마지막 동기화: 2026-06-17 11:05',
  },
  {
    departmentId: 6,
    departmentName: 'QA팀',
    rr: '',
    syncStatus: 'EMPTY' as DepartmentSyncStatus,
    syncInfo: '',
  },
])

const departmentSummary = computed(() => ({
  total: departments.value.length,
  synced: departments.value.filter((dept) => dept.syncStatus === 'SYNCED').length,
  pending: departments.value.filter((dept) => dept.syncStatus === 'PENDING').length,
  failed: departments.value.filter((dept) => dept.syncStatus === 'FAILED').length,
}))

function getDepartmentStatusLabel(status: DepartmentSyncStatus) {
  const labels: Record<DepartmentSyncStatus, string> = {
    SYNCED: '동기화 완료',
    PENDING: '동기화 대기',
    FAILED: '동기화 실패',
    EMPTY: '미설정',
  }
  return labels[status]
}

function startDepartmentEdit(dept: typeof departments.value[0]) {
  editingDepartmentId.value = dept.departmentId
  editingRr.value = dept.rr
}

function cancelDepartmentEdit() {
  editingDepartmentId.value = null
  editingRr.value = ''
}

function saveDepartmentEdit(departmentId: number) {
  const dept = departments.value.find(d => d.departmentId === departmentId)
  if (dept) {
    dept.rr = editingRr.value.trim()
    dept.syncStatus = dept.rr ? 'PENDING' : 'EMPTY'
    dept.syncInfo = dept.rr ? '동기화 대기 중' : ''
  }
  cancelDepartmentEdit()
  showSaved('R&R 프롬프트를 저장하고 동기화를 요청했습니다.')
}

function retryDepartmentSync(departmentId: number) {
  const dept = departments.value.find(d => d.departmentId === departmentId)
  if (!dept) return
  dept.syncStatus = 'PENDING'
  dept.syncInfo = '재시도 요청됨'
  showSaved(`${dept.departmentName} 동기화를 다시 요청했습니다.`)
}

function applyAiInstruction() {
  if (!aiInstruction.value.trim()) return
  aiLoading.value = true
  window.setTimeout(() => {
    departments.value[1].rr = '프론트엔드 UI/UX, 검색 화면, RAG 응답 품질과 브라우저 호환성 문제를 담당합니다. React 기반 화면 오류와 디자인 시스템 관련 티켓을 처리합니다.'
    departments.value[1].syncStatus = 'PENDING'
    departments.value[1].syncInfo = 'AI 수정 반영 후 동기화 대기 중'
    aiLoading.value = false
    aiInstruction.value = ''
    showSaved('AI가 R&R을 수정하고 동기화를 요청했습니다.')
  }, 1200)
}
const customPrompt = ref(
  '답변은 간결한 업무 문체로 작성하고, 처리 절차가 여러 단계라면 번호 목록으로 안내합니다.',
)
const selectedFileName = ref('')

const tools = ref([
  { name: 'get_employee_info', description: '사번 또는 이름으로 임직원 정보를 조회합니다.', target: 'GET https://hr.example.com/api/employees/{empNo}', type: 'HTTP API', scope: 'open' as Exclude<ToolScope, null>, active: true },
  { name: 'get_leave_balance', description: '로그인 사용자의 잔여 연차를 조회합니다.', target: 'GET https://hr.example.com/api/leave-balance/{empNo}', type: 'HTTP API', scope: 'self' as Exclude<ToolScope, null>, active: true },
  { name: 'get_user_contact', description: '사번으로 사용자의 이름과 이메일을 조회합니다.', target: 'hr_readonly_db · SELECT name, email FROM employees WHERE emp_no = :empNo', type: 'DB Query', scope: 'open' as Exclude<ToolScope, null>, active: false },
  { name: 'get_company_asset', description: '자산 번호로 지급 장비 정보를 조회합니다.', target: 'asset_readonly_db · SELECT * FROM assets WHERE asset_no = :assetNo', type: 'DB Query', scope: 'open' as Exclude<ToolScope, null>, active: true },
])

const httpFinalRequestUrl = computed(() => {
  let url = httpApiForm.value.endpointUrl
  const queryParams = new URLSearchParams()

  httpApiParams.value.forEach((param) => {
    if (!param.name.trim()) return
    const exampleValue = param.exampleValue.trim()

    if (param.location === 'PATH') {
      const value = exampleValue || `{${param.name}}`
      url = url.split(`{${param.name}}`).join(encodeURIComponent(value))
    }

    if (param.location === 'QUERY' && exampleValue) {
      queryParams.set(param.name, exampleValue)
    }
  })

  const queryString = queryParams.toString()
  if (!queryString) return url
  return `${url}${url.includes('?') ? '&' : '?'}${queryString}`
})

const manualKnowledge = ref([
  { id: 18, title: '2026년 하계 휴가 신청 안내', category: '인사', content: '휴가 시작일 3영업일 전까지 그룹웨어에서 신청합니다.', syncStatus: 'SYNCED' },
  { id: 17, title: 'VPN 인증서 갱신 절차', category: 'IT', content: '보안 포털에서 인증서를 재발급한 뒤 VPN 클라이언트를 재시작합니다.', syncStatus: 'SYNCED' },
  { id: 16, title: '신규 자산 지급 기준', category: '자산', content: '신규 입사자와 장비 교체 승인자를 대상으로 지급합니다.', syncStatus: 'PENDING' },
])

const filteredTools = computed(() => {
  if (toolFilter.value === '전체') return tools.value
  return tools.value.filter((tool) => tool.type === toolFilter.value)
})

function selectToolFilter(filter: string) {
  toolFilter.value = filter
}

function openHttpToolModal() {
  httpApiForm.value.scope = null
  httpSelfBindParamId.value = null
  toolModalOpen.value = true
}

function openDbToolModal() {
  dbToolForm.value.scope = null
  dbSelfBindParamId.value = null
  dbToolModalOpen.value = true
}

// 조회 대상을 "제한 없음"으로 바꾸면 본인 식별값 선택은 의미가 없어지므로 같이 초기화한다.
function onHttpScopeChange(scope: Exclude<ToolScope, null>) {
  httpApiForm.value.scope = scope
  if (scope !== 'self') httpSelfBindParamId.value = null
}

function onDbScopeChange(scope: Exclude<ToolScope, null>) {
  dbToolForm.value.scope = scope
  if (scope !== 'self') dbSelfBindParamId.value = null
}

function submitHttpTool() {
  if (!httpApiForm.value.scope) {
    showSaved('조회 대상을 선택하세요 (호출자 본인만 / 제한 없음).')
    return
  }
  if (httpApiForm.value.scope === 'self' && httpSelfBindParamId.value === null) {
    showSaved('본인 식별값으로 사용할 파라미터를 선택하세요.')
    return
  }
  toolModalOpen.value = false
  showSaved('HTTP API Tool을 등록했습니다.')
}

function submitDbTool() {
  if (!dbToolForm.value.scope) {
    showSaved('조회 대상을 선택하세요 (호출자 본인만 / 제한 없음).')
    return
  }
  if (dbToolForm.value.scope === 'self' && dbSelfBindParamId.value === null) {
    showSaved('본인 식별값으로 사용할 파라미터를 선택하세요.')
    return
  }
  dbToolModalOpen.value = false
  showSaved('DB Query Tool을 등록했습니다.')
}

function addDbParam() {
  dbToolParams.value.push({ id: nextDbParamId.value, name: '', dataType: 'string', required: false })
  nextDbParamId.value += 1
}

function removeDbParam(id: number) {
  dbToolParams.value = dbToolParams.value.filter((param) => param.id !== id)
  if (dbSelfBindParamId.value === id) dbSelfBindParamId.value = null
}

function addHttpParam() {
  const existingNames = new Set(httpApiParams.value.map((param) => param.name.trim()).filter(Boolean))
  let candidateName = 'param'
  let index = 1
  while (existingNames.has(candidateName)) {
    index += 1
    candidateName = `param${index}`
  }

  httpApiParams.value.push({
    id: nextHttpParamId.value,
    name: candidateName,
    location: 'QUERY',
    dataType: 'string',
    required: false,
    description: '',
    exampleValue: '',
  })
  nextHttpParamId.value += 1
}

function removeHttpParam(id: number) {
  httpApiParams.value = httpApiParams.value.filter((param) => param.id !== id)
}

function getDefaultHttpParamDescription(name: string) {
  if (name === 'serverId') return '조회할 서버 ID'
  if (name === 'employeeNo') return '조회할 사번'
  return ''
}

function getDefaultHttpParamExample(name: string) {
  if (name === 'serverId') return 'home-main'
  if (name === 'employeeNo') return 'E001'
  return ''
}

function syncPathParamsFromEndpoint() {
  const pathParamNames = Array.from(httpApiForm.value.endpointUrl.matchAll(/\{([^}/?#]+)\}/g)).map((match) => match[1])
  const existingNames = new Set(httpApiParams.value.map((param) => param.name.trim()).filter(Boolean))

  pathParamNames.forEach((name) => {
    if (existingNames.has(name)) return
    httpApiParams.value.push({
      id: nextHttpParamId.value,
      name,
      location: 'PATH',
      dataType: 'string',
      required: true,
      description: getDefaultHttpParamDescription(name),
      exampleValue: getDefaultHttpParamExample(name),
    })
    nextHttpParamId.value += 1
    existingNames.add(name)
  })
}

function updateHttpParamName(id: number, name: string) {
  const trimmedName = name.trim()
  const duplicated = trimmedName && httpApiParams.value.some((param) => param.id !== id && param.name.trim() === trimmedName)
  if (duplicated) {
    showSaved('같은 파라미터명은 중복 등록할 수 없습니다.')
    return
  }

  const param = httpApiParams.value.find((item) => item.id === id)
  if (!param) return
  param.name = name
}

function showSaved(message: string) {
  savedNotice.value = message
  window.setTimeout(() => {
    savedNotice.value = ''
  }, 1800)
}

function toggleTool(tool: { active: boolean }) {
  tool.active = !tool.active
}

function addKnowledgeRow() {
  manualKnowledge.value.push({
    id: 0,
    title: '',
    category: 'general',
    content: '',
    syncStatus: 'PENDING',
  })
}

function removeKnowledgeRow(index: number) {
  manualKnowledge.value.splice(index, 1)
}

function onManualFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  selectedFileName.value = input.files?.[0]?.name ?? ''
}
</script>

<template>
  <div class="admin-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">System Admin</p>
        <h1>AI 관리</h1>
        <p class="header-copy">AI 설정과 운영 품질을 한곳에서 관리합니다.</p>
      </div>
      <div class="header-state">
        <span class="status-dot"></span>
        A사 운영 환경 · AI 서비스 정상
      </div>
    </header>

    <div class="admin-shell">
      <aside class="section-nav" aria-label="AI 관리 메뉴">
        <template v-for="group in ['AI 설정', '운영 현황']" :key="group">
          <p class="section-group">{{ group }}</p>
          <button
            v-for="section in sections.filter((item) => item.group === group)"
            :key="section.id"
            class="section-link"
            :class="{ 'section-link--active': activeSection === section.id }"
            @click="activeSection = section.id"
          >
            {{ section.label }}
          </button>
        </template>
      </aside>

      <section class="workspace">
        <div v-if="savedNotice" class="toast">{{ savedNotice }}</div>

        <div class="requirement-notice" :class="`requirement-notice--${sectionNotices[activeSection].tone}`">
          <span class="requirement-label">{{ sectionNotices[activeSection].label }}</span>
          <div>
            <strong>{{ sectionNotices[activeSection].title }}</strong>
            <p>{{ sectionNotices[activeSection].description }}</p>
          </div>
        </div>

        <template v-if="activeSection === 'prompt'">
          <div class="workspace-title">
            <div>
              <h2>프롬프트 관리</h2>
              <p>고객사별 답변 방식과 추가 지침을 설정합니다.</p>
            </div>
            <button class="button button--primary" @click="showSaved('프롬프트를 저장했습니다.')">저장</button>
          </div>

          <div class="setting-block">
            <div class="setting-heading">
              <div>
                <h3>사용자 정의 프롬프트</h3>
                <p>기본 보안 정책 뒤에 추가되는 관리자 설정입니다.</p>
              </div>
              <label class="toggle">
                <input v-model="promptEnabled" type="checkbox" />
                <span></span>
              </label>
            </div>
            <textarea v-model="customPrompt" class="large-input" :disabled="!promptEnabled"></textarea>
            <div class="input-meta">
              <span>base_prompt는 배포 설정으로 고정됩니다.</span>
              <span>{{ customPrompt.length }} / 2,000</span>
            </div>
          </div>

          <div class="setting-block">
            <div class="setting-heading">
              <div>
                <h3>답변 미리보기</h3>
                <p>현재 프롬프트가 적용된 답변 형식을 확인합니다.</p>
              </div>
              <button class="button button--secondary" @click="showSaved('미리보기를 갱신했습니다.')">새로고침</button>
            </div>
            <div class="preview">
              <p class="preview-label">질문</p>
              <p>노트북 반납 절차를 알려주세요.</p>
              <p class="preview-label">답변</p>
              <ol>
                <li>자산관리 포털에서 반납 신청을 등록합니다.</li>
                <li>승인 후 안내된 장소로 장비를 제출합니다.</li>
              </ol>
              <span class="reference">출처: IT 자산 운영 매뉴얼 · 2026.05.18</span>
            </div>
          </div>
        </template>

        <template v-else-if="activeSection === 'department'">
          <div class="workspace-title">
            <div>
              <h2>부서 티켓 배정 관리</h2>
              <p>티켓을 담당 부서에 추천·배정할 때 사용하는 R&R 설명을 관리합니다.</p>
            </div>
          </div>

          <div class="department-ai-box">
            <div class="setting-heading">
              <div>
                <h3>AI 일괄 수정</h3>
                <p>모든 부서의 R&R을 AI가 자동으로 수정합니다. 수정 지침을 입력하세요.</p>
              </div>
            </div>
            <div class="ai-input-row">
              <input
                v-model="aiInstruction"
                class="department-ai-input"
                placeholder="예: 각 부서 프롬프트에 응답 시간 기준(24시간 이내)을 추가해줘"
                @keyup.enter="applyAiInstruction"
              />
              <button class="button button--primary" :disabled="!aiInstruction.trim() || aiLoading" @click="applyAiInstruction">
                {{ aiLoading ? '적용 중...' : 'AI 수정 적용' }}
              </button>
            </div>
          </div>

          <div class="department-section-header">
            <div>
              <h3>부서 목록</h3>
              <span>총 {{ departmentSummary.total }}개 부서 · 완료 {{ departmentSummary.synced }} · 대기 {{ departmentSummary.pending }} · 실패 {{ departmentSummary.failed }}</span>
            </div>
          </div>

          <div class="department-grid">
            <article v-for="dept in departments" :key="dept.departmentId" class="department-card">
              <div class="department-card-top">
                <strong>{{ dept.departmentName }}</strong>
                <span class="department-sync-badge" :class="`department-sync-badge--${dept.syncStatus.toLowerCase()}`">
                  {{ getDepartmentStatusLabel(dept.syncStatus) }}
                </span>
              </div>

              <template v-if="editingDepartmentId === dept.departmentId">
                <textarea
                  v-model="editingRr"
                  class="department-textarea"
                  placeholder="부서가 담당하는 역할·책임과 대표 티켓 범위를 입력하세요."
                />
                <div class="department-actions">
                  <button class="button button--secondary" @click="cancelDepartmentEdit">취소</button>
                  <button class="button button--primary" :disabled="!editingRr.trim()" @click="saveDepartmentEdit(dept.departmentId)">저장</button>
                </div>
              </template>

              <template v-else>
                <p class="department-prompt" :class="{ 'department-prompt--empty': !dept.rr }">
                  {{ dept.rr || '아직 R&R 프롬프트가 설정되지 않았습니다.' }}
                </p>
                <div class="department-actions">
                  <button v-if="dept.syncStatus === 'FAILED'" class="button button--danger-soft" @click="retryDepartmentSync(dept.departmentId)">재시도</button>
                  <button
                    class="button"
                    :class="dept.rr ? 'button--secondary' : 'button--primary'"
                    @click="startDepartmentEdit(dept)"
                  >
                    {{ dept.rr ? '편집' : '프롬프트 작성' }}
                  </button>
                </div>
                <p v-if="dept.syncInfo" class="department-sync-info">{{ dept.syncInfo }}</p>
              </template>
            </article>
          </div>

          <div class="inline-note routing-note">
            부서 자체의 생성·삭제는 조직 관리에서 수행합니다. 이 화면에서는 존재하는 부서를 선택해 AI 티켓 배정 기준만 등록합니다.
          </div>
        </template>

        <template v-else-if="activeSection === 'documents'">
          <div class="workspace-title">
            <div>
              <h2>매뉴얼 문서 관리</h2>
              <p>업로드한 사내 문서를 청킹하여 AI 검색 지식으로 반영합니다.</p>
            </div>
          </div>
          <div class="document-grid">
            <div class="setting-block">
              <h3>매뉴얼 업로드</h3>
              <div class="form-grid">
                <label class="field field--wide">문서 파일
                  <span class="file-picker">
                    <input type="file" accept=".txt,.pdf,.docx" @change="onManualFileChange" />
                    <span class="button button--secondary">파일 선택</span>
                    <span>{{ selectedFileName || '선택된 파일 없음' }}</span>
                  </span>
                </label>
                <label class="field">문서 제목<input placeholder="예: 정보보안 운영 매뉴얼" /></label>
                <label class="field">분류<input value="general" /></label>
              </div>
              <div class="inline-note">업로드 문서는 AI 서버에서 마스킹, 청킹, 임베딩 후 Vector Store에 반영됩니다.</div>
              <button class="button button--primary" :disabled="!selectedFileName" @click="showSaved('문서 적재를 요청했습니다.')">검색 지식에 적재</button>
            </div>
            <div class="document-summary">
              <div class="metric"><span>Parent 문서</span><strong>24</strong></div>
              <div class="metric"><span>총 청크</span><strong>386</strong></div>
            </div>
          </div>
          <div class="list-heading">
            <h3>적재된 문서 목록</h3>
            <input class="search-input" placeholder="문서 제목 검색" />
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Parent ID</th><th>문서 제목</th><th>분류</th><th>청크</th><th>반영 시각</th><th></th></tr></thead>
              <tbody>
                <tr><td>upload-security-policy.pdf</td><td><strong>정보보안 운영 정책</strong></td><td>보안</td><td>42</td><td>2026.06.09 13:42</td><td><button class="text-button text-button--danger">삭제</button></td></tr>
                <tr><td>upload-asset-guide.docx</td><td><strong>IT 자산 운영 매뉴얼</strong></td><td>자산</td><td>31</td><td>2026.06.08 17:20</td><td><button class="text-button text-button--danger">삭제</button></td></tr>
                <tr><td>upload-vpn-guide.pdf</td><td><strong>VPN 접속 가이드</strong></td><td>IT</td><td>18</td><td>2026.06.07 09:14</td><td><button class="text-button text-button--danger">삭제</button></td></tr>
              </tbody>
            </table>
          </div>
        </template>

        <template v-else-if="activeSection === 'tools'">
          <div class="workspace-title">
            <div>
              <h2>API Tool 관리</h2>
              <p>HTTP API와 DB Query Tool을 등록하고 활성/비활성 상태를 관리합니다.</p>
            </div>
          </div>

          <div class="toolbar">
            <div class="segmented">
              <button v-for="filter in ['전체', 'HTTP API', 'DB Query']" :key="filter" :class="{ active: toolFilter === filter }" @click="selectToolFilter(filter)">{{ filter }}</button>
            </div>
            <div class="title-actions">
              <button class="button button--secondary" @click="openDbToolModal">DB Query Tool 등록</button>
              <button class="button button--primary" @click="openHttpToolModal">HTTP API 등록</button>
            </div>
          </div>

          <div class="toolbar">
            <span class="count-label">{{ filteredTools.length }}개 Tool</span>
          </div>
          <div class="table-wrap">
            <table class="editable-table">
              <thead><tr><th>Tool 이름 / 설명</th><th>대상</th><th>유형</th><th>범위</th><th>활성</th><th>관리</th></tr></thead>
              <tbody>
                <tr v-for="tool in filteredTools" :key="tool.name">
                  <td><strong>{{ tool.name }}</strong><small>{{ tool.description }}</small></td>
                  <td><code>{{ tool.target }}</code></td>
                  <td>{{ tool.type }}</td>
                  <td>
                    <span :class="['badge', tool.scope === 'self' ? 'badge--scope-self' : 'badge--scope-open']">
                      {{ tool.scope === 'self' ? '🔒 본인전용' : '⚠️ 제한없음' }}
                    </span>
                  </td>
                  <td>
                    <label class="toggle">
                      <input :checked="tool.active" type="checkbox" @change="toggleTool(tool)" />
                      <span></span>
                    </label>
                  </td>
                  <td><button class="text-button" @click="showSaved(`${tool.name} 연결 체크에 성공했습니다.`)">연결 체크</button></td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>

        <template v-else-if="activeSection === 'knowledge'">
          <div class="workspace-title">
            <div>
              <h2>수기 지식 관리</h2>
              <p>RDB의 수기 지식을 표에서 편집하고 Vector Store와 동기화합니다.</p>
            </div>
            <div class="title-actions">
              <button class="button button--secondary" @click="addKnowledgeRow">행 추가</button>
              <button class="button button--primary" @click="showSaved('수기 지식 변경사항을 저장했습니다.')">변경사항 저장</button>
            </div>
          </div>
          <div class="table-wrap">
            <table class="editor-table">
              <thead><tr><th>ID</th><th>제목</th><th>분류</th><th>내용</th><th>동기화 상태</th><th></th></tr></thead>
              <tbody>
                <tr v-for="(item, index) in manualKnowledge" :key="`${item.id}-${index}`">
                  <td>{{ item.id || '신규' }}</td>
                  <td><input v-model="item.title" placeholder="제목 입력" /></td>
                  <td><input v-model="item.category" /></td>
                  <td><textarea v-model="item.content"></textarea></td>
                  <td><span :class="['badge', item.syncStatus === 'SYNCED' ? 'badge--green' : 'badge--amber']">{{ item.syncStatus }}</span></td>
                  <td><button class="text-button text-button--danger" @click="removeKnowledgeRow(index)">삭제</button></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="sync-action">
            <div><strong>Vector Store 전체 동기화</strong><p>저장된 수기 지식을 다시 청킹하고 검색 인덱스에 반영합니다.</p></div>
            <button class="button button--secondary" @click="showSaved(`${manualKnowledge.length}건의 전체 동기화를 요청했습니다.`)">전체 동기화</button>
          </div>
        </template>

        <template v-else-if="activeSection === 'routing'">
          <div class="workspace-title">
            <div>
              <h2>라우팅 품질</h2>
              <p>AI 추천 부서와 실제 최종 처리 부서를 비교합니다.</p>
            </div>
            <select v-model="routingFilter" class="select-input"><option>최근 7일</option><option>최근 30일</option><option>최근 90일</option></select>
          </div>
          <div class="metric-row">
            <div class="metric"><span>추천 일치율</span><strong>87.4%</strong><small>지난 기간 대비 +2.1%</small></div>
            <div class="metric"><span>공통 큐 전환율</span><strong>9.8%</strong><small>임계값 미달 42건</small></div>
            <div class="metric"><span>부서 이관율</span><strong>6.3%</strong><small>최종 처리 기준</small></div>
          </div>
          <div class="quality-grid">
            <div class="setting-block">
              <h3>부서별 추천 일치율</h3>
              <div v-for="item in [['IT지원팀', 92], ['개발1팀', 88], ['개발2팀', 84], ['자산관리팀', 76]]" :key="item[0]" class="bar-row">
                <span>{{ item[0] }}</span><div class="bar"><i :style="{ width: `${item[1]}%` }"></i></div><strong>{{ item[1] }}%</strong>
              </div>
            </div>
            <div class="setting-block">
              <h3>최근 불일치 사례</h3>
              <div class="case-list">
                <div><p>ERP 로그인 권한 오류</p><span>추천 개발1팀 → 최종 IT지원팀</span></div>
                <div><p>노트북 반납 일정 문의</p><span>추천 IT지원팀 → 최종 자산관리팀</span></div>
                <div><p>검색 결과 노출 순서 오류</p><span>추천 개발1팀 → 최종 개발2팀</span></div>
              </div>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="workspace-title">
            <div>
              <h2>지식화 현황</h2>
              <p>승인된 지식 데이터의 Vector Store 반영 상태를 확인합니다.</p>
            </div>
            <button class="button button--secondary" @click="showSaved('실패 항목 재처리를 요청했습니다.')">실패 항목 재처리</button>
          </div>
          <div class="metric-row">
            <div class="metric"><span>지식화 전환율</span><strong>31.8%</strong></div>
            <div class="metric"><span>반영 완료</span><strong>1,284</strong></div>
            <div class="metric"><span>처리 대기</span><strong>17</strong></div>
            <div class="metric metric--danger"><span>반영 실패</span><strong>4</strong></div>
          </div>
          <div class="pipeline">
            <div><span>1</span><strong>승인 완료</strong><small>RDB 저장</small></div>
            <i></i><div><span>2</span><strong>민감정보 마스킹</strong><small>원문 미보관</small></div>
            <i></i><div><span>3</span><strong>청킹·임베딩</strong><small>AI 처리</small></div>
            <i></i><div><span>4</span><strong>Vector 반영</strong><small>Qdrant</small></div>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>지식 제목</th><th>출처</th><th>승인 부서</th><th>상태</th><th>처리 시각</th><th>작업</th></tr></thead>
              <tbody>
                <tr><td><strong>노트북 반납 절차</strong></td><td>티켓 #1842</td><td>자산관리팀</td><td><span class="badge badge--green">SYNCED</span></td><td>오늘 13:42</td><td><button class="text-button">재등록</button></td></tr>
                <tr><td><strong>VPN 인증서 갱신</strong></td><td>수기 지식</td><td>IT지원팀</td><td><span class="badge badge--amber">PENDING</span></td><td>오늘 13:38</td><td>-</td></tr>
                <tr><td><strong>ERP 월마감 오류 대응</strong></td><td>티켓 #1791</td><td>개발1팀</td><td><span class="badge badge--red">FAILED</span></td><td>오늘 12:56</td><td><button class="text-button">RAG 재등록</button></td></tr>
              </tbody>
            </table>
          </div>
        </template>
      </section>
    </div>

    <div v-if="toolModalOpen" class="modal-backdrop" @click.self="toolModalOpen = false">
      <div class="modal modal--wide">
        <div class="modal-header">
          <div>
            <h2>HTTP API 등록</h2>
            <p>GET 기반 HTTP API Tool을 등록하고 연결 상태를 확인합니다.</p>
          </div>
          <button aria-label="닫기" @click="toolModalOpen = false">×</button>
        </div>
        <label>Tool 이름<input v-model="httpApiForm.name" /></label>
        <label>Description<textarea v-model="httpApiForm.description"></textarea></label>

        <div class="scope-block">
          <h3>조회 대상 *</h3>
          <div class="scope-options">
            <label class="scope-option">
              <input type="radio" name="httpScope" :checked="httpApiForm.scope === 'self'" @change="onHttpScopeChange('self')" /> 호출자 본인만
            </label>
            <label class="scope-option">
              <input type="radio" name="httpScope" :checked="httpApiForm.scope === 'open'" @change="onHttpScopeChange('open')" /> 제한 없음 (입력값에 따라 누구든 조회 가능)
            </label>
          </div>
          <div v-if="httpApiForm.scope === 'open'" class="scope-warning">
            ⚠️ 이 Tool은 입력값에 따라 누구의 정보든 조회될 수 있습니다. 연차·인사정보 등 개인정보를 반환한다면 "호출자 본인만"을 선택하세요.
          </div>
          <div v-if="httpApiForm.scope === 'self'" class="self-bind-note">
            🔒 아래 파라미터 중 하나를 "본인 식별값"으로 선택하세요. 실행 시 AI가 채운 값은 무시되고, 호출자 본인의 사번으로 강제 교체됩니다.
          </div>
        </div>

        <label>Method<input v-model="httpApiForm.method" readonly /></label>
        <label>Endpoint URL<input v-model="httpApiForm.endpointUrl" @input="syncPathParamsFromEndpoint" /></label>
        <div class="parameter-box">
          <div class="setting-heading">
            <div>
              <h3>요청 파라미터</h3>
              <p>PATH는 Endpoint URL의 중괄호 값을 치환하고, QUERY는 요청 URL 뒤에 붙습니다.</p>
            </div>
            <button class="button button--secondary" @click="addHttpParam">+ 파라미터 추가</button>
          </div>
          <div v-for="param in httpApiParams" :key="param.id" class="parameter-row" :class="{ 'parameter-row--self-bind': httpApiForm.scope === 'self' }">
            <label>파라미터 이름<input :value="param.name" placeholder="serverId" @input="updateHttpParamName(param.id, ($event.target as HTMLInputElement).value)" /></label>
            <label>위치<select v-model="param.location"><option>PATH</option><option>QUERY</option><option>HEADER</option></select></label>
            <label>타입<select v-model="param.dataType"><option>string</option><option>number</option><option>boolean</option></select></label>
            <label class="check-row">
              <input v-model="param.required" type="checkbox" />
              필수
            </label>
            <label>설명<input v-model="param.description" placeholder="조회할 서버 ID" /></label>
            <label>예시값<input v-model="param.exampleValue" placeholder="home-main" /></label>
            <label v-if="httpApiForm.scope === 'self'" class="check-row self-bind-cell">
              <input type="radio" name="httpSelfBindParam" :checked="httpSelfBindParamId === param.id" @change="httpSelfBindParamId = param.id" />
              본인 식별값
            </label>
            <button v-if="param.location !== 'PATH'" class="text-button text-button--danger" @click="removeHttpParam(param.id)">삭제</button>
          </div>
          <div class="request-preview">
            <span>예시 GET 요청 URL</span>
            <code>{{ httpFinalRequestUrl }}</code>
          </div>
        </div>
        <div class="auth-box">
          <h3>인증 설정</h3>
          <div class="modal-grid">
            <label>Auth Type<select v-model="httpApiForm.authType"><option>API_KEY</option><option>NONE</option><option>BEARER_TOKEN</option></select></label>
            <label>인증 Header 이름<input v-model="httpApiForm.authHeaderName" /></label>
            <label>인증 Key 값<input v-model="httpApiForm.authKeyValue" /></label>
          </div>
        </div>
        <div class="modal-actions">
          <button class="button button--secondary" @click="toolModalOpen = false">취소</button>
          <button class="button button--secondary" @click="showSaved('HTTP API 연결 체크에 성공했습니다.')">연결 체크</button>
          <button class="button button--primary" @click="submitHttpTool">등록</button>
        </div>
      </div>
    </div>

    <div v-if="dbToolModalOpen" class="modal-backdrop" @click.self="dbToolModalOpen = false">
      <div class="modal modal--wide">
        <div class="modal-header">
          <div>
            <h2>DB Query Tool 등록</h2>
            <p>미리 등록된 읽기 전용 DB에 SELECT 쿼리를 실행하는 Tool을 만듭니다.</p>
          </div>
          <button aria-label="닫기" @click="dbToolModalOpen = false">×</button>
        </div>

        <label>Tool 이름<input v-model="dbToolForm.name" /></label>
        <label>Description<textarea v-model="dbToolForm.description"></textarea></label>

        <div class="scope-block">
          <h3>조회 대상 *</h3>
          <div class="scope-options">
            <label class="scope-option">
              <input type="radio" name="dbScope" :checked="dbToolForm.scope === 'self'" @change="onDbScopeChange('self')" /> 호출자 본인만
            </label>
            <label class="scope-option">
              <input type="radio" name="dbScope" :checked="dbToolForm.scope === 'open'" @change="onDbScopeChange('open')" /> 제한 없음 (입력값에 따라 누구든 조회 가능)
            </label>
          </div>
          <div v-if="dbToolForm.scope === 'open'" class="scope-warning">
            ⚠️ 이 Tool은 입력값에 따라 누구의 정보든 조회될 수 있습니다. 연차·인사정보 등 개인정보를 반환한다면 "호출자 본인만"을 선택하세요.
          </div>
          <div v-if="dbToolForm.scope === 'self'" class="self-bind-note">
            🔒 아래 파라미터 중 하나를 "본인 식별값"으로 선택하세요. 실행 시 AI가 채운 값은 무시되고, 호출자 본인의 사번으로 강제 교체됩니다.
          </div>
        </div>

        <label>Datasource
          <select v-model="dbToolForm.datasourceKey">
            <option v-for="source in fixedDatasources" :key="source.key" :value="source.key">{{ source.label }}</option>
          </select>
        </label>

        <label>Query Template (SELECT 전용)
          <textarea v-model="dbToolForm.queryTemplate" class="code-input"></textarea>
        </label>
        <div class="modal-notice">
          단일 SELECT만 허용됩니다. INSERT/UPDATE/DELETE/DROP 등과 세미콜론(;), SQL 주석은 등록 시 거부됩니다. 파라미터는 :이름 형식의 named parameter만 사용하세요.
        </div>

        <div class="parameter-box">
          <div class="setting-heading">
            <div>
              <h3>쿼리 파라미터</h3>
            </div>
            <button class="button button--secondary" @click="addDbParam">+ 파라미터 추가</button>
          </div>
          <div v-for="param in dbToolParams" :key="param.id" class="parameter-row parameter-row--db" :class="{ 'parameter-row--self-bind': dbToolForm.scope === 'self' }">
            <label>파라미터 이름<input v-model="param.name" placeholder="empNo" /></label>
            <label>타입<select v-model="param.dataType"><option>string</option><option>number</option><option>boolean</option></select></label>
            <label class="check-row">
              <input v-model="param.required" type="checkbox" />
              필수
            </label>
            <label v-if="dbToolForm.scope === 'self'" class="check-row self-bind-cell">
              <input type="radio" name="dbSelfBindParam" :checked="dbSelfBindParamId === param.id" @change="dbSelfBindParamId = param.id" />
              본인 식별값
            </label>
            <button class="text-button text-button--danger" @click="removeDbParam(param.id)">삭제</button>
          </div>
        </div>

        <div class="modal-actions">
          <button class="button button--secondary" @click="dbToolModalOpen = false">취소</button>
          <button class="button button--secondary" @click="showSaved('DB 연결 및 쿼리 문법을 확인했습니다.')">연결 체크</button>
          <button class="button button--primary" @click="submitDbTool">등록</button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.admin-page { min-width: 0; min-height: 100%; background: #f4f6f8; color: #18202a; }
.page-header { min-height: 116px; padding: 24px 32px; background: #fff; border-bottom: 1px solid #e1e5e9; display: flex; align-items: center; justify-content: space-between; }
.eyebrow { margin-bottom: 4px; color: #65717e; font-size: 11px; font-weight: 700; text-transform: uppercase; }
.page-header h1 { font-size: 24px; line-height: 1.3; }
.header-copy { margin-top: 5px; color: #65717e; font-size: 13px; }
.header-state { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid #dce3df; border-radius: 6px; background: #f7faf8; color: #315c45; font-size: 12px; font-weight: 600; }
.status-dot { width: 7px; height: 7px; border-radius: 50%; background: #21a366; }
.requirement-notice { margin-bottom: 18px; padding: 14px 16px; border: 1px solid #cddceb; border-radius: 7px; background: #f4f8fc; display: flex; align-items: flex-start; gap: 12px; }
.requirement-label { flex-shrink: 0; padding: 4px 7px; border-radius: 4px; font-size: 10px; font-weight: 700; }
.requirement-notice strong { color: #2f465c; font-size: 12px; }
.requirement-notice p { margin-top: 5px; color: #667787; font-size: 11px; line-height: 1.5; }
.requirement-notice--optional .requirement-label { background: #dbeafa; color: #275f96; }
.requirement-notice--monitor { border-color: #d9dce0; background: #f7f8f9; }
.requirement-notice--monitor .requirement-label { background: #e8eaed; color: #59636d; }
.requirement-notice--required { border-color: #ead7a9; background: #fff9eb; }
.requirement-notice--required .requirement-label { background: #f6e4b7; color: #7c5812; }
.admin-shell { display: grid; grid-template-columns: 190px minmax(0, 1fr); min-height: calc(100vh - 116px); }
.section-nav { padding: 24px 14px; background: #fff; border-right: 1px solid #e1e5e9; }
.section-group { padding: 0 10px 8px; color: #8a949e; font-size: 10px; font-weight: 700; text-transform: uppercase; }
.section-group:not(:first-child) { margin-top: 24px; }
.section-link { width: 100%; min-height: 38px; padding: 8px 10px; border: 0; border-radius: 5px; background: transparent; color: #58636f; font-size: 13px; text-align: left; cursor: pointer; }
.section-link:hover { background: #f3f5f7; color: #1b2733; }
.section-link--active { background: #eaf2ff; color: #1759a8; font-weight: 700; }
.workspace { position: relative; width: 100%; max-width: 1240px; padding: 28px 32px 48px; }
.workspace-title { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-bottom: 22px; }
.workspace-title h2 { font-size: 20px; }
.workspace-title p { margin-top: 5px; color: #6d7782; font-size: 13px; }
.button { min-height: 36px; padding: 8px 14px; border: 1px solid transparent; border-radius: 5px; font-size: 13px; font-weight: 700; cursor: pointer; }
.button--primary { background: #1769c2; color: #fff; }
.button--primary:hover { background: #105daF; }
.button:disabled { background: #b9c2cb; color: #fff; cursor: not-allowed; }
.button--secondary { border-color: #cfd6dd; background: #fff; color: #33404d; }
.button--danger-soft { border-color: #f3caca; background: #fff0f0; color: #ae3838; }
.button--danger-soft:hover { background: #ffe7e7; }
.setting-block { padding: 20px; border: 1px solid #dfe4e8; border-radius: 7px; background: #fff; }
.setting-block + .setting-block { margin-top: 16px; }
.setting-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 16px; }
.setting-block h3, .setting-heading h3 { font-size: 14px; }
.setting-heading p { margin-top: 4px; color: #76818c; font-size: 12px; }
.large-input { width: 100%; min-height: 150px; padding: 13px; border: 1px solid #ccd3da; border-radius: 5px; color: #25313d; font: inherit; font-size: 13px; line-height: 1.7; resize: vertical; }
.large-input:disabled { background: #f2f4f6; color: #9ba3aa; }
.input-meta { display: flex; justify-content: space-between; margin-top: 8px; color: #89939c; font-size: 11px; }
.toggle { display: inline-flex; cursor: pointer; }
.toggle input { position: absolute; opacity: 0; }
.toggle span { position: relative; width: 34px; height: 20px; border-radius: 10px; background: #c3cad1; transition: background .15s; }
.toggle span::after { content: ''; position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform .15s; box-shadow: 0 1px 2px rgba(0,0,0,.2); }
.toggle input:checked + span { background: #1769c2; }
.toggle input:checked + span::after { transform: translateX(14px); }
.preview { padding: 16px; border-left: 3px solid #4c85c3; background: #f7f9fb; font-size: 13px; line-height: 1.7; }
.preview-label { margin-top: 10px; color: #687480; font-size: 11px; font-weight: 700; text-transform: uppercase; }
.preview-label:first-child { margin-top: 0; }
.preview ol { padding-left: 20px; }
.reference { display: block; margin-top: 10px; color: #587493; font-size: 11px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.search-input, .select-input { min-height: 36px; padding: 8px 11px; border: 1px solid #ccd3da; border-radius: 5px; background: #fff; color: #34404c; font-size: 12px; }
.search-input { width: min(360px, 100%); }
.count-label { color: #79838d; font-size: 12px; }
.table-wrap { overflow: hidden; border: 1px solid #dfe4e8; border-radius: 7px; background: #fff; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th { padding: 11px 14px; background: #f7f8fa; color: #6b7680; font-size: 11px; text-align: left; }
td { padding: 14px; border-top: 1px solid #e7eaed; color: #53606d; }
td strong { color: #26323e; }
td small { display: block; max-width: 280px; margin-top: 5px; color: #78838d; line-height: 1.45; }
code { padding: 2px 5px; border-radius: 3px; background: #f0f2f4; color: #485561; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; }
.method { color: #315f93; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; font-weight: 700; }
.text-button { padding: 4px 0; border: 0; background: transparent; color: #1769c2; font-size: 11px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.text-button--danger { color: #b34343; }
.badge { display: inline-flex; padding: 4px 7px; border-radius: 4px; font-size: 10px; font-weight: 700; }
.badge--green { background: #e8f5ee; color: #27734b; }
.badge--gray { background: #eceff2; color: #68727b; }
.badge--amber { background: #fff4d9; color: #966300; }
.badge--red { background: #ffebeb; color: #ae3838; }
.metric-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }
.metric { min-height: 98px; padding: 16px; border: 1px solid #dfe4e8; border-radius: 7px; background: #fff; display: flex; flex-direction: column; }
.metric span { color: #77828c; font-size: 11px; }
.metric strong { margin-top: 9px; font-size: 24px; }
.metric small { margin-top: auto; color: #77828c; font-size: 10px; }
.metric--danger strong { color: #b23b3b; }
.segmented { display: inline-flex; padding: 3px; border: 1px solid #d7dce1; border-radius: 6px; background: #fff; }
.segmented button { min-height: 28px; padding: 5px 11px; border: 0; border-radius: 4px; background: transparent; color: #6c7782; font-size: 11px; cursor: pointer; }
.segmented button.active { background: #eaf2ff; color: #1759a8; font-weight: 700; }
.title-actions { display: flex; gap: 8px; }
.document-grid { display: grid; grid-template-columns: minmax(0, 1fr) 190px; gap: 16px; margin-bottom: 24px; }
.document-summary { display: grid; gap: 12px; }
.document-summary .metric { min-height: 0; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 18px; }
.field { display: flex; flex-direction: column; gap: 7px; color: #5d6974; font-size: 11px; font-weight: 700; }
.field--wide { grid-column: 1 / -1; }
.field > input, .field > select, .field > textarea { min-height: 38px; padding: 9px 10px; border: 1px solid #ccd3da; border-radius: 5px; background: #fff; color: #33404c; font: inherit; font-size: 12px; }
.field > textarea { min-height: 72px; resize: vertical; line-height: 1.5; }
.field--compact { min-width: 120px; }
.file-picker { min-height: 40px; display: flex; align-items: center; gap: 10px; color: #7b858e; font-size: 11px; font-weight: 400; }
.file-picker input { display: none; }
.inline-note { margin: 14px 0; padding: 10px 12px; border-left: 3px solid #75a1cf; background: #f3f7fb; color: #687683; font-size: 11px; line-height: 1.55; }
.list-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
.list-heading h3 { font-size: 14px; }
.editable-table { min-width: 840px; }
.editor-table { min-width: 980px; }
.editor-table td { vertical-align: top; }
.editor-table input, .editor-table textarea { width: 100%; min-width: 120px; padding: 7px 8px; border: 1px solid #d3d9df; border-radius: 4px; background: #fff; color: #33404c; font: inherit; font-size: 11px; }
.editor-table textarea { min-width: 280px; min-height: 58px; resize: vertical; line-height: 1.45; }
.sync-action { margin-top: 14px; padding: 15px 16px; border: 1px solid #dfe4e8; border-radius: 7px; background: #fff; display: flex; align-items: center; justify-content: space-between; gap: 18px; }
.sync-action strong { font-size: 12px; }
.sync-action p { margin-top: 4px; color: #7b858e; font-size: 10px; }
.knowledge-list { overflow: hidden; border: 1px solid #dfe4e8; border-radius: 7px; background: #fff; }
.knowledge-item { min-height: 76px; padding: 16px; border-top: 1px solid #e7eaed; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.knowledge-item:first-child { border-top: 0; }
.knowledge-item h3 { font-size: 13px; }
.knowledge-item p { margin-top: 6px; color: #7b858f; font-size: 11px; }
.quality-grid { display: grid; grid-template-columns: 1.1fr .9fr; gap: 16px; }
.bar-row { display: grid; grid-template-columns: 76px 1fr 42px; align-items: center; gap: 10px; margin-top: 18px; font-size: 11px; }
.bar-row strong { text-align: right; }
.bar { height: 7px; overflow: hidden; border-radius: 4px; background: #e9edf0; }
.bar i { display: block; height: 100%; background: #4381bd; }
.case-list > div { padding: 13px 0; border-top: 1px solid #e8ebee; }
.case-list > div:first-child { margin-top: 8px; border-top: 0; }
.case-list p { font-size: 12px; font-weight: 700; }
.case-list span { display: block; margin-top: 5px; color: #79848e; font-size: 10px; }
.pipeline { display: grid; grid-template-columns: 1fr 24px 1fr 24px 1fr 24px 1fr; align-items: center; margin-bottom: 18px; padding: 18px; border: 1px solid #dfe4e8; border-radius: 7px; background: #fff; }
.pipeline > div { min-height: 70px; display: grid; grid-template-columns: 24px 1fr; column-gap: 8px; align-content: center; }
.pipeline > div span { grid-row: 1 / 3; width: 24px; height: 24px; border-radius: 50%; background: #e7f0fa; color: #1769c2; font-size: 11px; font-weight: 700; display: grid; place-items: center; }
.pipeline strong { font-size: 11px; }
.pipeline small { margin-top: 3px; color: #7f8992; font-size: 9px; }
.pipeline > i { height: 1px; background: #cfd6dd; }
.toast { position: fixed; z-index: 30; top: 22px; right: 24px; padding: 10px 14px; border-radius: 5px; background: #253341; color: #fff; font-size: 12px; box-shadow: 0 6px 18px rgba(0,0,0,.14); }
.modal-backdrop { position: fixed; z-index: 40; inset: 0; display: grid; place-items: center; padding: 20px; background: rgba(20,28,36,.45); overflow-y: auto; }
.modal { width: min(480px, 100%); max-height: calc(100vh - 40px); padding: 22px; border-radius: 7px; background: #fff; box-shadow: 0 16px 44px rgba(0,0,0,.22); display: flex; flex-direction: column; gap: 15px; overflow-y: auto; }
.modal-header { display: flex; align-items: center; justify-content: space-between; }
.modal-header h2 { font-size: 17px; }
.modal-header p { margin-top: 4px; color: #76818c; font-size: 11px; }
.modal-header button { width: 30px; height: 30px; border: 0; background: transparent; color: #66727d; font-size: 22px; cursor: pointer; }
.modal-notice { padding: 10px 12px; border-left: 3px solid #75a1cf; background: #f3f7fb; color: #627587; font-size: 10px; line-height: 1.5; }
.modal-notice--success { border-left-color: #21a366; background: #f1faf5; color: #2f6d4b; }
.modal label { display: flex; flex-direction: column; gap: 6px; color: #52606c; font-size: 11px; font-weight: 700; }
.modal input, .modal select, .modal textarea { width: 100%; min-height: 38px; padding: 9px 10px; border: 1px solid #ccd3da; border-radius: 5px; background: #fff; color: #26323d; font: inherit; font-size: 12px; }
.modal textarea { min-height: 86px; resize: vertical; }
.modal .code-input { min-height: 120px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.modal--wide { width: min(760px, 100%); }
.modal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.modal label small { color: #8a949d; font-size: 9px; font-weight: 400; }
.check-row { flex-direction: row !important; align-items: center; font-weight: 500 !important; }
.check-row input { width: 15px; min-height: 15px; }
.parameter-box { padding: 14px; border: 1px solid #dfe4e8; border-radius: 7px; background: #fbfcfd; }
.parameter-box .setting-heading { margin-bottom: 12px; }
.parameter-box h3 { font-size: 13px; }
.parameter-row { display: grid; grid-template-columns: 1fr .8fr .8fr .6fr 1.2fr 1fr 40px; gap: 10px; align-items: end; }
.parameter-row + .parameter-row { margin-top: 10px; }
.parameter-row--self-bind { grid-template-columns: 1fr .8fr .8fr .6fr 1.2fr 1fr .9fr 40px; }
.parameter-row--db { grid-template-columns: 1fr .8fr .6fr 40px; }
.parameter-row--db.parameter-row--self-bind { grid-template-columns: 1fr .8fr .6fr .9fr 40px; }
.self-bind-cell { color: #1769c2; font-size: 10px; }
.scope-block { padding: 14px; border: 1px solid #dfe4e8; border-radius: 7px; background: #fbfcfd; }
.scope-block h3 { margin-bottom: 10px; font-size: 13px; }
.scope-options { display: flex; gap: 18px; }
.scope-option { flex-direction: row !important; align-items: center; gap: 6px; font-weight: 500 !important; cursor: pointer; }
.scope-warning { margin-top: 12px; padding: 10px 12px; border: 1px solid #ead7a9; border-radius: 6px; background: #fff9eb; color: #7c5812; font-size: 11px; line-height: 1.55; }
.self-bind-note { margin-top: 12px; padding: 10px 12px; border: 1px solid #b9d3f0; border-radius: 6px; background: #eef5fc; color: #1759a8; font-size: 11px; line-height: 1.55; }
.badge--scope-self { background: #eaf2ff; color: #1759a8; }
.badge--scope-open { background: #fff4d9; color: #966300; }
.request-preview { margin-top: 12px; padding: 10px 12px; border-radius: 6px; background: #eef5fc; display: flex; flex-direction: column; gap: 6px; }
.request-preview span { color: #58708a; font-size: 10px; font-weight: 700; }
.request-preview code { overflow-wrap: anywhere; }
.auth-box { padding: 14px; border: 1px solid #dfe4e8; border-radius: 7px; background: #fff; }
.auth-box h3 { margin-bottom: 12px; font-size: 13px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.routing-note { margin-top: 14px; }
.department-ai-box { margin-bottom: 24px; padding: 20px 24px; border: 1px solid #bfdbfe; border-radius: 8px; background: #eff6ff; }
.department-ai-box .setting-heading { margin-bottom: 12px; }
.department-ai-box h3 { color: #1d4ed8; font-size: 14px; }
.department-ai-box p { color: #475569; font-size: 13px; }
.ai-input-row { display: flex; gap: 10px; }
.department-ai-input { flex: 1; min-width: 0; min-height: 40px; padding: 10px 14px; border: 1px solid #93c5fd; border-radius: 6px; background: #fff; color: #1f2a37; font-size: 14px; }
.department-ai-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,.12); }
.department-section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.department-section-header h3 { font-size: 15px; }
.department-section-header span { display: block; margin-top: 4px; color: #64748b; font-size: 12px; }
.department-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.department-card { min-height: 222px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; display: flex; flex-direction: column; }
.department-card:hover { border-color: #93c5fd; }
.department-card-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.department-card-top strong { color: #1f2937; font-size: 15px; }
.department-sync-badge { flex-shrink: 0; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; }
.department-sync-badge--synced { background: #dcfce7; color: #15803d; }
.department-sync-badge--pending { background: #fef9c3; color: #a16207; }
.department-sync-badge--failed { background: #fee2e2; color: #b91c1c; }
.department-sync-badge--empty { background: #f1f5f9; color: #94a3b8; }
.department-prompt { flex: 1; min-height: 88px; margin: 0 0 14px; padding: 12px; border-radius: 8px; background: #f8fafc; color: #475569; font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
.department-prompt--empty { color: #b8c3cf; font-style: italic; }
.department-textarea { flex: 1; width: 100%; min-height: 116px; margin-bottom: 14px; padding: 12px; border: 1px solid #3b82f6; border-radius: 8px; background: #f8fafc; color: #1f2937; font: inherit; font-size: 13px; line-height: 1.6; resize: vertical; }
.department-textarea:focus { outline: none; box-shadow: 0 0 0 3px rgba(59,130,246,.12); }
.department-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: auto; }
.department-sync-info { margin: 8px 0 0; color: #94a3b8; font-size: 11px; }
.rr-text { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; max-width: 340px; line-height: 1.5; color: #3d4b57; font-size: 12px; }
.keyword-text { color: #587493; font-size: 11px; }
.tool-builder { display: grid; gap: 16px; }
.builder-panel { padding: 18px; border: 1px solid #dfe4e8; border-radius: 7px; background: #fff; }
.builder-panel + .builder-panel { margin-top: 0; }
.builder-panel h3 { font-size: 14px; }
.builder-panel--preview { border-color: #cbdcf0; background: #fbfdff; }
.chip-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.chip-check { display: inline-flex; align-items: center; gap: 7px; padding: 8px 10px; border: 1px solid #d6dde4; border-radius: 999px; background: #fff; color: #45515d; font-size: 12px; cursor: pointer; }
.chip-check input { width: 14px; height: 14px; }
.lookup-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 14px; }
.query-summary { padding: 15px; border: 1px solid #d8e4f0; border-radius: 7px; background: #f7fbff; color: #354553; font-size: 13px; line-height: 1.7; }
.query-summary strong { display: block; margin-bottom: 4px; color: #1f344a; font-size: 13px; }
.query-summary p { margin-bottom: 10px; }
.sql-preview, .schema-preview { margin-top: 10px; padding: 13px; border: 1px solid #d8e0e7; border-radius: 6px; background: #17212b; color: #dce9f5; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.55; white-space: pre-wrap; }
.schema-preview { background: #f7f9fb; color: #33404c; }
.catalog-grid { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 14px; }
.catalog-tables { display: flex; flex-direction: column; gap: 8px; }
.catalog-tables button { padding: 11px 12px; border: 1px solid #d9dfe5; border-radius: 6px; background: #fff; color: #53606d; text-align: left; cursor: pointer; }
.catalog-tables button.active { border-color: #9dc1e8; background: #eaf2ff; color: #1759a8; }
.catalog-tables strong { display: block; font-size: 12px; }
.catalog-tables span { display: block; margin-top: 4px; font-size: 10px; color: #7d8790; }
.catalog-column-table { min-width: 860px; }
.catalog-column-table input[type='text'], .catalog-column-table input:not([type]) { width: 100%; min-height: 30px; padding: 6px 8px; border: 1px solid #d3d9df; border-radius: 4px; font-size: 11px; }
.catalog-column-table input[type='checkbox'] { width: 15px; height: 15px; }
.row-muted { background: #faf6f6; }
.row-muted td { color: #8a6f6f; }

@media (max-width: 1100px) {
  .workspace { padding: 24px; }
  .metric-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .quality-grid { grid-template-columns: 1fr; }
  .document-grid { grid-template-columns: 1fr; }
  .document-summary { grid-template-columns: 1fr 1fr; }
  .catalog-grid { grid-template-columns: 1fr; }
  .department-grid { grid-template-columns: 1fr; }
}

@media (max-width: 800px) {
  .page-header { min-height: 100px; padding: 18px; }
  .header-state { display: none; }
  .admin-shell { display: block; min-height: auto; }
  .section-nav { display: flex; gap: 4px; padding: 10px 14px; border-right: 0; border-bottom: 1px solid #e1e5e9; overflow-x: auto; }
  .section-group { display: none; }
  .section-link { width: auto; min-width: max-content; }
  .workspace { padding: 20px 16px 36px; }
  .workspace-title { align-items: flex-start; }
  .metric-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .table-wrap { overflow-x: auto; }
  table { min-width: 680px; }
  .pipeline { grid-template-columns: 1fr; gap: 8px; }
  .pipeline > i { width: 1px; height: 12px; margin-left: 12px; }
  .ai-input-row { flex-direction: column; }
}

@media (max-width: 520px) {
  .page-header h1 { font-size: 21px; }
  .workspace-title { flex-direction: column; gap: 12px; }
  .metric-row { grid-template-columns: 1fr; }
  .toolbar { align-items: stretch; flex-direction: column; }
  .search-input, .select-input { width: 100%; }
  .input-meta { align-items: flex-start; flex-direction: column; gap: 4px; }
  .form-grid, .modal-grid, .parameter-row { grid-template-columns: 1fr; }
  .lookup-grid { grid-template-columns: 1fr; }
  .field--wide { grid-column: auto; }
  .document-summary { grid-template-columns: 1fr; }
  .title-actions, .sync-action { align-items: stretch; flex-direction: column; }
}
</style>
