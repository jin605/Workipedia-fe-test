<script setup lang="ts">
import { computed, ref } from 'vue'

type Section = 'prompt' | 'department' | 'documents' | 'tools' | 'knowledge' | 'routing' | 'sync'

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
const departmentModalOpen = ref(false)
const toolFilter = ref('전체')
const routingFilter = ref('전체')
const promptEnabled = ref(true)
const customPrompt = ref(
  '답변은 간결한 업무 문체로 작성하고, 처리 절차가 여러 단계라면 번호 목록으로 안내합니다.',
)
const selectedFileName = ref('')

const tools = ref([
  { name: 'get_employee_info', description: '사번 또는 이름으로 임직원 정보를 조회합니다.', endpoint: '/api/hr/employees', method: 'GET', type: 'HTTP API', status: '정상', active: true, calls: '1,248' },
  { name: 'get_leave_balance', description: '로그인 사용자의 잔여 연차를 조회합니다.', endpoint: '/api/hr/leave-balance', method: 'GET', type: 'HTTP API', status: '정상', active: true, calls: '864' },
  { name: 'get_company_asset', description: '자산 번호로 지급 장비 정보를 조회합니다.', endpoint: 'asset_readonly', method: 'SELECT', type: 'DB Query', status: '승인됨', active: false, calls: '327' },
])

const manualKnowledge = ref([
  { id: 18, title: '2026년 하계 휴가 신청 안내', category: '인사', content: '휴가 시작일 3영업일 전까지 그룹웨어에서 신청합니다.', chromaId: 'manual-18' },
  { id: 17, title: 'VPN 인증서 갱신 절차', category: 'IT', content: '보안 포털에서 인증서를 재발급한 뒤 VPN 클라이언트를 재시작합니다.', chromaId: 'manual-17' },
  { id: 16, title: '신규 자산 지급 기준', category: '자산', content: '신규 입사자와 장비 교체 승인자를 대상으로 지급합니다.', chromaId: '' },
])

const filteredTools = computed(() => {
  if (toolFilter.value === '전체') return tools.value
  return tools.value.filter((tool) => tool.type === toolFilter.value)
})

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
    chromaId: '',
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
              <p>티켓을 담당 부서에 추천·배정할 때 사용하는 업무 범위와 시스템 정보를 관리합니다.</p>
            </div>
            <div class="title-actions">
              <button class="button button--secondary" @click="showSaved('배정 정보를 ChromaDB에 동기화했습니다.')">전체 동기화</button>
              <button class="button button--primary" @click="departmentModalOpen = true">배정 기준 추가</button>
            </div>
          </div>
          <div class="metric-row">
            <div class="metric"><span>배정 기준 등록 부서</span><strong>4</strong></div>
            <div class="metric"><span>승인 라우팅 사례</span><strong>557</strong></div>
            <div class="metric"><span>동기화 대기</span><strong>1</strong></div>
            <div class="metric"><span>최근 추천 일치율</span><strong>87.4%</strong></div>
          </div>
          <div class="toolbar">
            <input class="search-input" placeholder="부서명 또는 담당 시스템 검색" />
            <span class="count-label">전체 4개 부서</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>부서</th><th>담당 시스템</th><th>업무 키워드</th><th>승인 사례</th><th>동기화</th><th>상태</th><th></th></tr></thead>
              <tbody>
                <tr><td><strong>개발1팀</strong><small>ERP 및 사내 계정 서비스 운영</small></td><td>ERP, 계정 시스템</td><td>권한, 로그인, 배치 오류</td><td>142건</td><td><span class="badge badge--green">SYNCED</span></td><td><span class="badge badge--green">활성</span></td><td><button class="text-button">수정</button></td></tr>
                <tr><td><strong>개발2팀</strong><small>검색 및 AI 서비스 운영</small></td><td>검색, RAG</td><td>검색 품질, 챗봇 응답</td><td>96건</td><td><span class="badge badge--green">SYNCED</span></td><td><span class="badge badge--green">활성</span></td><td><button class="text-button">수정</button></td></tr>
                <tr><td><strong>IT지원팀</strong><small>임직원 IT 환경 지원</small></td><td>VPN, 사내 장비</td><td>접속, 노트북, 네트워크</td><td>238건</td><td><span class="badge badge--green">SYNCED</span></td><td><span class="badge badge--green">활성</span></td><td><button class="text-button">수정</button></td></tr>
                <tr><td><strong>자산관리팀</strong><small>IT 자산 지급 및 회수</small></td><td>자산 포털</td><td>지급, 반납, 재고</td><td>81건</td><td><span class="badge badge--amber">PENDING</span></td><td><span class="badge badge--gray">검토 필요</span></td><td><button class="text-button">수정</button></td></tr>
              </tbody>
            </table>
          </div>
          <div class="inline-note routing-note">
            부서 자체의 생성·삭제는 조직 관리에서 수행합니다. 이 화면에서는 존재하는 부서를 선택해 AI 티켓 배정 기준만 등록합니다.
          </div>
        </template>

        <template v-else-if="activeSection === 'documents'">
          <div class="workspace-title">
            <div>
              <h2>매뉴얼 문서 관리</h2>
              <p>업로드한 사내 문서를 청킹하여 ChromaDB 지식으로 반영합니다.</p>
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
              <div class="inline-note">업로드 문서는 AI 서버에서 마스킹, 청킹, 임베딩 후 ChromaDB에 반영됩니다.</div>
              <button class="button button--primary" :disabled="!selectedFileName" @click="showSaved('문서 적재를 요청했습니다.')">ChromaDB에 적재</button>
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
              <p>등록된 API 명세를 런타임 Tool로 바인딩합니다. DB Query는 승인된 항목만 활성화할 수 있습니다.</p>
            </div>
            <button class="button button--primary" @click="toolModalOpen = true">Tool 등록</button>
          </div>
          <div class="toolbar">
            <div class="segmented">
              <button v-for="filter in ['전체', 'HTTP API', 'DB Query']" :key="filter" :class="{ active: toolFilter === filter }" @click="toolFilter = filter">{{ filter }}</button>
            </div>
            <button class="button button--secondary" @click="showSaved('Tool 변경사항을 저장했습니다.')">변경사항 저장</button>
          </div>
          <div class="table-wrap">
            <table class="editable-table">
              <thead><tr><th>Tool 이름 / 설명</th><th>Endpoint</th><th>Method</th><th>유형</th><th>상태</th><th>활성</th></tr></thead>
              <tbody>
                <tr v-for="tool in filteredTools" :key="tool.name">
                  <td><strong>{{ tool.name }}</strong><small>{{ tool.description }}</small></td>
                  <td><code>{{ tool.endpoint }}</code></td>
                  <td><span class="method">{{ tool.method }}</span></td>
                  <td>{{ tool.type }}</td>
                  <td><span class="badge badge--green">{{ tool.status }}</span></td>
                  <td>
                    <label class="toggle">
                      <input :checked="tool.active" type="checkbox" @change="toggleTool(tool)" />
                      <span></span>
                    </label>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>

        <template v-else-if="activeSection === 'knowledge'">
          <div class="workspace-title">
            <div>
              <h2>수기 지식 관리</h2>
              <p>RDB의 수기 지식을 표에서 편집하고 ChromaDB와 동기화합니다.</p>
            </div>
            <div class="title-actions">
              <button class="button button--secondary" @click="addKnowledgeRow">행 추가</button>
              <button class="button button--primary" @click="showSaved('수기 지식 변경사항을 저장했습니다.')">변경사항 저장</button>
            </div>
          </div>
          <div class="table-wrap">
            <table class="editor-table">
              <thead><tr><th>ID</th><th>제목</th><th>분류</th><th>내용</th><th>Chroma Doc ID</th><th></th></tr></thead>
              <tbody>
                <tr v-for="(item, index) in manualKnowledge" :key="`${item.id}-${index}`">
                  <td>{{ item.id || '신규' }}</td>
                  <td><input v-model="item.title" placeholder="제목 입력" /></td>
                  <td><input v-model="item.category" /></td>
                  <td><textarea v-model="item.content"></textarea></td>
                  <td><code>{{ item.chromaId || '동기화 전' }}</code></td>
                  <td><button class="text-button text-button--danger" @click="removeKnowledgeRow(index)">삭제</button></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="sync-action">
            <div><strong>ChromaDB 전체 동기화</strong><p>저장된 수기 지식을 다시 청킹하고 Vector Store에 반영합니다.</p></div>
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
              <p>승인된 지식 데이터의 ChromaDB 반영 상태를 확인합니다.</p>
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
            <i></i><div><span>4</span><strong>Vector 반영</strong><small>ChromaDB</small></div>
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
      <div class="modal">
        <div class="modal-header"><h2>API Tool 등록</h2><button aria-label="닫기" @click="toolModalOpen = false">×</button></div>
        <label>Tool 이름<input placeholder="예: get_travel_expense" /></label>
        <label>설명<textarea placeholder="LLM이 이 Tool을 선택해야 하는 조건을 입력하세요."></textarea></label>
        <div class="modal-grid">
          <label>유형<select><option>HTTP API</option><option>DB Query</option></select></label>
          <label>HTTP Method<select><option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option></select></label>
        </div>
        <label>Endpoint URL<input placeholder="https://internal-api.example.com/v1/..." /></label>
        <label>Parameters JSON Schema<textarea class="code-input" placeholder='{"type":"object","properties":{}}'></textarea></label>
        <div class="modal-actions"><button class="button button--secondary" @click="toolModalOpen = false">취소</button><button class="button button--primary" @click="toolModalOpen = false; showSaved('Tool 초안을 등록했습니다.')">등록</button></div>
      </div>
    </div>

    <div v-if="departmentModalOpen" class="modal-backdrop" @click.self="departmentModalOpen = false">
      <div class="modal modal--wide">
        <div class="modal-header">
          <div>
            <h2>부서 배정 기준 추가</h2>
            <p>티켓 라우팅에 사용할 부서의 업무 범위를 등록합니다.</p>
          </div>
          <button aria-label="닫기" @click="departmentModalOpen = false">×</button>
        </div>
        <div class="modal-notice">선택 설정입니다. 미등록 부서와 신뢰도 기준을 통과하지 못한 티켓은 공통 접수 큐로 이동합니다.</div>
        <label>대상 부서
          <select>
            <option>부서를 선택하세요</option>
            <option>정보보안팀</option>
            <option>인사팀</option>
            <option>법무팀</option>
            <option>경영지원팀</option>
          </select>
        </label>
        <label>R&R 설명
          <textarea placeholder="예: 정보보안팀은 보안 정책, 계정 침해, 악성코드 및 개인정보 유출 사고를 담당합니다."></textarea>
        </label>
        <div class="modal-grid">
          <label>담당 시스템
            <input placeholder="보안 포털, DLP, 백신" />
            <small>쉼표로 구분해 입력합니다.</small>
          </label>
          <label>업무 키워드
            <input placeholder="침해사고, 악성코드, 개인정보" />
            <small>구체적인 업무 용어를 입력합니다.</small>
          </label>
        </div>
        <label class="check-row">
          <input type="checkbox" checked />
          등록 후 티켓 라우팅에 즉시 사용
        </label>
        <div class="modal-actions">
          <button class="button button--secondary" @click="departmentModalOpen = false">취소</button>
          <button class="button button--primary" @click="departmentModalOpen = false; showSaved('부서 배정 기준을 등록하고 동기화를 요청했습니다.')">등록 및 동기화</button>
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
.field > input { min-height: 38px; padding: 9px 10px; border: 1px solid #ccd3da; border-radius: 5px; font: inherit; font-size: 12px; }
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
.modal-backdrop { position: fixed; z-index: 40; inset: 0; display: grid; place-items: center; padding: 20px; background: rgba(20,28,36,.45); }
.modal { width: min(480px, 100%); padding: 22px; border-radius: 7px; background: #fff; box-shadow: 0 16px 44px rgba(0,0,0,.22); display: flex; flex-direction: column; gap: 15px; }
.modal-header { display: flex; align-items: center; justify-content: space-between; }
.modal-header h2 { font-size: 17px; }
.modal-header p { margin-top: 4px; color: #76818c; font-size: 11px; }
.modal-header button { width: 30px; height: 30px; border: 0; background: transparent; color: #66727d; font-size: 22px; cursor: pointer; }
.modal-notice { padding: 10px 12px; border-left: 3px solid #75a1cf; background: #f3f7fb; color: #627587; font-size: 10px; line-height: 1.5; }
.modal label { display: flex; flex-direction: column; gap: 6px; color: #52606c; font-size: 11px; font-weight: 700; }
.modal input, .modal select, .modal textarea { width: 100%; min-height: 38px; padding: 9px 10px; border: 1px solid #ccd3da; border-radius: 5px; background: #fff; color: #26323d; font: inherit; font-size: 12px; }
.modal textarea { min-height: 86px; resize: vertical; }
.modal .code-input { min-height: 120px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.modal--wide { width: min(620px, 100%); }
.modal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.modal label small { color: #8a949d; font-size: 9px; font-weight: 400; }
.check-row { flex-direction: row !important; align-items: center; font-weight: 500 !important; }
.check-row input { width: 15px; min-height: 15px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.routing-note { margin-top: 14px; }

@media (max-width: 1100px) {
  .workspace { padding: 24px; }
  .metric-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .quality-grid { grid-template-columns: 1fr; }
  .document-grid { grid-template-columns: 1fr; }
  .document-summary { grid-template-columns: 1fr 1fr; }
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
}

@media (max-width: 520px) {
  .page-header h1 { font-size: 21px; }
  .workspace-title { flex-direction: column; gap: 12px; }
  .metric-row { grid-template-columns: 1fr; }
  .toolbar { align-items: stretch; flex-direction: column; }
  .search-input, .select-input { width: 100%; }
  .input-meta { align-items: flex-start; flex-direction: column; gap: 4px; }
  .form-grid, .modal-grid { grid-template-columns: 1fr; }
  .field--wide { grid-column: auto; }
  .document-summary { grid-template-columns: 1fr; }
  .title-actions, .sync-action { align-items: stretch; flex-direction: column; }
}
</style>
