const $ = (selector) => document.querySelector(selector);
const API_BASE = 'https://family-trip-notebook-2026.wholekiwi16.chatgpt.site';
const initialLink = new URLSearchParams(location.hash.slice(1));
const accessKey = initialLink.get('key') || localStorage.getItem('family-trip-access-key') || '';
if (accessKey) localStorage.setItem('family-trip-access-key', accessKey);
const state = { trip: null, items: [], viewer: '', selectedDay: '2026-11-23', tab: 'overview' };
const categories = { 숙소: '⌂', 식사: '♨', 관광: '✳', 이동: '↗', 방문: '◎', 기타: '✎' };
const statusNames = { planned: '계획', done: '완료', candidate: '후보', booked: '예약·확정', skip: '제외' };
const statusChoices = {
  plan: [['planned', '계획'], ['done', '완료']],
  research: [['candidate', '후보'], ['booked', '예약·확정'], ['skip', '제외']],
  log: [['done', '기록 완료']],
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function safeUrl(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; }
  catch { return ''; }
}
function won(value) { return `${Number(value || 0).toLocaleString('ko-KR')}원`; }
function shortDate(value) {
  if (!value) return '날짜 미정';
  const [y, m, d] = value.split('-').map(Number);
  return `${m}월 ${d}일`;
}
function fullDate(value) {
  if (!value) return '날짜 미정';
  const date = new Date(`${value}T12:00:00`);
  return `${shortDate(value)} (${['일', '월', '화', '수', '목', '금', '토'][date.getDay()]})`;
}
function dates(start, end) {
  const result = [];
  const date = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  while (date <= last && result.length < 31) {
    result.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`);
    date.setDate(date.getDate() + 1);
  }
  return result;
}
async function request(path, options = {}) {
  if (!accessKey) throw new Error('가족 공유 링크로 접속해주세요.');
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers: { 'content-type': 'application/json', authorization: `Bearer ${accessKey}`, ...options.headers } });
  let data;
  try { data = await response.json(); } catch { throw new Error('서버 응답을 읽지 못했습니다.'); }
  if (!response.ok) throw new Error(data.error || '저장하지 못했습니다. 다시 시도해주세요.');
  return data;
}
async function refresh({ quiet = false } = {}) {
  try {
    const data = await request('/api/state');
    state.trip = data.trip;
    state.items = data.items || [];
    state.viewer = data.viewer || '';
    if (!dates(data.trip.start_date, data.trip.end_date).includes(state.selectedDay)) state.selectedDay = data.trip.start_date;
    $('#syncStatus').textContent = '● 함께 편집 중';
    $('#syncStatus').title = `로그인: ${state.viewer}`;
    render();
  } catch (error) {
    $('#syncStatus').textContent = '● 연결 확인 필요';
    $('#syncStatus').title = error.message;
    if (!quiet) {
      $('#stats').innerHTML = `<div class="empty-state">${esc(error.message)}<br>페이지를 새로고침해 다시 시도해주세요.</div>`;
    }
  }
}
function switchTab(name) {
  state.tab = name;
  document.querySelectorAll('[data-tab]').forEach((button) => button.classList.toggle('active', button.dataset.tab === name));
  document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === name));
  location.hash = `key=${encodeURIComponent(accessKey)}&tab=${name}`;
}
function render() {
  const trip = state.trip;
  if (!trip) return;
  $('#heroTitle').textContent = trip.title;
  $('#heroSubtitle').textContent = trip.note || '빈칸부터 함께 채우는 가족 여행';
  $('#heroDates').textContent = `${shortDate(trip.start_date)} — ${shortDate(trip.end_date)}`;
  $('#heroDestination').textContent = trip.destination || '여행지 미정';
  const plans = state.items.filter((item) => item.kind === 'plan');
  const logs = state.items.filter((item) => item.kind === 'log');
  const research = state.items.filter((item) => item.kind === 'research');
  const estimated = plans.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const actual = logs.reduce((sum, item) => sum + Number(item.price || 0), 0);
  $('#stats').innerHTML = [
    ['계획한 일정', `${plans.length}개`, '날짜별 일정'],
    ['모아둔 자료', `${research.length}개`, '후보와 예약 정보'],
    ['현장 기록', `${logs.length}개`, '여행 중 직접 남긴 이야기'],
    ['비용', `${won(estimated)} / ${won(actual)}`, '예상 / 실제'],
  ].map(([label, value, hint]) => `<article class="stat"><span>${label}</span><strong>${value}</strong><small>${hint}</small></article>`).join('');

  $('#dayTabs').innerHTML = dates(trip.start_date, trip.end_date).map((day, index) =>
    `<button type="button" class="day-tab ${day === state.selectedDay ? 'active' : ''}" data-day="${day}"><small>DAY ${index + 1}</small><strong>${fullDate(day)}</strong><span>${plans.filter((item) => item.date === day).length}개 일정</span></button>`).join('');
  const dailyPlans = plans.filter((item) => item.date === state.selectedDay).sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
  $('#planList').innerHTML = dailyPlans.length ? dailyPlans.map(card).join('') : empty('이날 일정은 아직 비어 있어요.', '자료함에서 후보를 모으거나 첫 일정을 추가해보세요.', 'plan');
  $('#logList').innerHTML = logs.length ? [...logs].sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)).map(card).join('') : empty('아직 현장 기록이 없어요.', '여행 중 실제로 먹고 본 것을 가족과 함께 남겨보세요.', 'log');
  const filter = $('#researchFilter').value;
  const filtered = research.filter((item) => filter === 'all' || item.category === filter);
  $('#researchList').innerHTML = filtered.length ? [...filtered].sort((a, b) => b.created_at.localeCompare(a.created_at)).map(card).join('') : empty('아직 모아둔 자료가 없어요.', '숙소·식당·가볼 곳을 조사할 때마다 여기에 저장하세요.', 'research');
}
function empty(title, subtitle, kind) {
  return `<div class="empty-state"><span>✳</span><strong>${title}</strong><p>${subtitle}</p><button type="button" class="button button-light" data-add="${kind}">＋ 추가하기</button></div>`;
}
function card(item) {
  const link = safeUrl(item.url);
  const label = item.category || '기타';
  const badge = item.kind !== 'log' ? `<span class="status status-${esc(item.status)}">${esc(statusNames[item.status] || item.status)}</span>` : '';
  const meta = [item.kind !== 'research' ? fullDate(item.date) : '', item.time, item.place, Number(item.price) > 0 ? won(item.price) : ''].filter(Boolean).map(esc).join(' · ');
  const source = item.kind === 'log' && item.source_id ? ' · 일정에서 기록' : '';
  const actions = item.kind === 'research' ? `<button type="button" data-action="to-plan" data-id="${esc(item.id)}">일정에 담기 ↗</button>`
    : item.kind === 'plan' ? `<button type="button" data-action="to-log" data-id="${esc(item.id)}">다녀온 기록 남기기 ↗</button>` : '';
  return `<article class="item-card"><div class="item-icon">${categories[label] || '✎'}</div><div class="item-body"><div class="item-title-line"><h3>${esc(item.title)}</h3>${badge}</div><p class="item-meta">${esc(label)}${meta ? ` · ${meta}` : ''}</p>${item.note ? `<p class="item-note">${esc(item.note).replace(/\n/g, '<br>')}</p>` : ''}${link ? `<a class="item-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer">참고 링크 ↗</a>` : ''}<div class="item-bottom"><small>${esc(item.author || '가족')}${source}</small><div class="item-actions">${actions}<button type="button" data-action="edit" data-id="${esc(item.id)}">수정</button><button type="button" data-action="delete" data-id="${esc(item.id)}">삭제</button></div></div></div></article>`;
}
function openItem(kind, item = null, prefill = {}) {
  const form = $('#itemForm');
  form.reset();
  const fields = form.elements;
  fields.id.value = item?.id || '';
  fields.kind.value = kind;
  fields.source_id.value = item?.source_id || prefill.source_id || '';
  fields.title.value = item?.title || prefill.title || '';
  fields.category.value = item?.category || prefill.category || (kind === 'log' ? '식사' : '숙소');
  fields.date.value = item?.date || prefill.date || (kind === 'research' ? '' : state.selectedDay);
  fields.time.value = item?.time || prefill.time || '';
  fields.place.value = item?.place || prefill.place || '';
  fields.price.value = item?.price || prefill.price || '';
  fields.url.value = item?.url || prefill.url || '';
  fields.note.value = item?.note || prefill.note || '';
  fields.status.innerHTML = statusChoices[kind].map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  fields.status.value = item?.status || (kind === 'research' ? 'candidate' : kind === 'plan' ? 'planned' : 'done');
  fields.date.required = kind !== 'research';
  $('#dateField').hidden = kind === 'research';
  $('#timeField').hidden = kind === 'research';
  $('#statusField').hidden = kind === 'log';
  $('#dialogKicker').textContent = kind === 'plan' ? 'ITINERARY' : kind === 'log' ? 'TRAVEL JOURNAL' : 'IDEA LIBRARY';
  $('#dialogTitle').textContent = `${item ? '수정' : '추가'} · ${{ plan: '여행 일정', log: '현장 기록', research: '자료' }[kind]}`;
  $('#formError').textContent = '';
  $('#itemDialog').showModal();
}
function openTrip() {
  const fields = $('#tripForm').elements;
  for (const name of ['title', 'destination', 'start_date', 'end_date', 'note']) fields[name].value = state.trip[name] || '';
  $('#tripFormError').textContent = '';
  $('#tripDialog').showModal();
}

document.addEventListener('click', async (event) => {
  const tab = event.target.closest('[data-tab], [data-go]');
  if (tab) return switchTab(tab.dataset.tab || tab.dataset.go);
  const day = event.target.closest('[data-day]');
  if (day) { state.selectedDay = day.dataset.day; render(); return; }
  const add = event.target.closest('[data-add]');
  if (add) return openItem(add.dataset.add);
  const action = event.target.closest('[data-action]');
  if (!action) return;
  const item = state.items.find((entry) => entry.id === action.dataset.id);
  if (!item) return;
  if (action.dataset.action === 'edit') return openItem(item.kind, item);
  if (action.dataset.action === 'to-plan') { switchTab('plan'); return openItem('plan', null, { ...item, date: state.selectedDay, source_id: item.id }); }
  if (action.dataset.action === 'to-log') { switchTab('log'); return openItem('log', null, { ...item, source_id: item.id, note: '' }); }
  if (action.dataset.action === 'delete' && confirm(`“${item.title}” 항목을 삭제할까요?`)) {
    try { await request(`/api/items/${encodeURIComponent(item.id)}`, { method: 'DELETE' }); await refresh(); }
    catch (error) { alert(error.message); }
  }
});

$('#itemForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const input = Object.fromEntries(new FormData(form));
  const id = input.id;
  delete input.id;
  $('#saveItemButton').disabled = true;
  $('#formError').textContent = '';
  try {
    await request(id ? `/api/items/${encodeURIComponent(id)}` : '/api/items', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(input) });
    $('#itemDialog').close();
    await refresh();
  } catch (error) { $('#formError').textContent = error.message; }
  finally { $('#saveItemButton').disabled = false; }
});
$('#tripForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = Object.fromEntries(new FormData(event.currentTarget));
  $('#tripFormError').textContent = '';
  try {
    await request('/api/trip', { method: 'PATCH', body: JSON.stringify(input) });
    $('#tripDialog').close();
    await refresh();
  } catch (error) { $('#tripFormError').textContent = error.message; }
});
$('#researchFilter').addEventListener('change', render);
$('#editTripButton').addEventListener('click', openTrip);
$('#closeDialog').addEventListener('click', () => $('#itemDialog').close());
$('#cancelDialog').addEventListener('click', () => $('#itemDialog').close());
$('#closeTripDialog').addEventListener('click', () => $('#tripDialog').close());
$('#cancelTripDialog').addEventListener('click', () => $('#tripDialog').close());
$('#shareButton').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}#key=${encodeURIComponent(accessKey)}`); $('#shareButton').textContent = '✓ 링크 복사됨'; }
  catch { $('#shareButton').textContent = '주소창 링크를 복사해주세요'; }
  setTimeout(() => { $('#shareButton').textContent = '↗ 링크 복사'; }, 2500);
});

switchTab(['overview', 'plan', 'log', 'research'].includes(initialLink.get('tab')) ? initialLink.get('tab') : 'overview');
refresh();
setInterval(() => { if (!$('#itemDialog').open && !$('#tripDialog').open) refresh({ quiet: true }); }, 20000);
