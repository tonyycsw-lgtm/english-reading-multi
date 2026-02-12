// ============================================
// 全局命名空间 & 依赖管理
// ============================================
const UnitManager = (function() {
  let unitsIndex = [];
  let currentUnitData = null;
  let currentUnitId = '';
  const app = document.getElementById('app');

  async function init() {
    await loadUnitsIndex();
    populateUnitSelect();

    const urlUnit = getUnitFromURL();
    if (urlUnit) {
      const found = unitsIndex.find(u => u.unitId === urlUnit);
      if (found) {
        await loadAndRenderUnit(found);
        return;
      }
    }
    if (unitsIndex.length > 0) {
      await loadAndRenderUnit(unitsIndex[0]);
    }
  }

  async function loadUnitsIndex() {
    try {
      const res = await fetch('./data/units-index.json');
      if (!res.ok) throw new Error('网络错误');
      unitsIndex = await res.json();
    } catch (e) {
      console.warn('加载单元索引失败，使用内置测试数据', e);
      unitsIndex = [
        { unitId: 'unit1', unitName: 'Unit 1 – A Severe Fire in Hong Kong', dataUrl: './data/unit1.json' },
        { unitId: 'unit2', unitName: 'Unit 2 – The Rise of Blindbox', dataUrl: './data/unit2.json' }
      ];
    }
  }

  function populateUnitSelect() {
    const select = document.getElementById('unit-select');
    select.innerHTML = '';
    unitsIndex.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.unitId;
      opt.textContent = u.unitName;
      select.appendChild(opt);
    });
  }

  function getUnitFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('unit');
  }

  async function loadAndRenderUnit(unitInfo) {
    try {
      AudioController.stop();
      if (currentUnitId) {
        DragDrop.dragHistory.delete(currentUnitId);
        DragDrop.vocabDragHistory.delete(currentUnitId);
      }

      Renderer.showLoading();
      const res = await fetch(unitInfo.dataUrl);
      if (!res.ok) throw new Error('加载单元数据失败');
      const unitData = await res.json();
      currentUnitData = unitData;
      currentUnitId = unitData.unitId || unitInfo.unitId;
      app.dataset.unitId = currentUnitId;

      const select = document.getElementById('unit-select');
      select.value = currentUnitId;

      const url = new URL(window.location);
      url.searchParams.set('unit', currentUnitId);
      window.history.pushState({}, '', url);

      Renderer.renderAll(unitData, currentUnitId);
      AudioController.preloadUnitAudio(currentUnitId, unitData.audio);
    } catch (e) {
      console.error(e);
      alert('加载单元失败：' + e.message);
    }
  }

  async function handleUnitSelect(unitId) {
    const unitInfo = unitsIndex.find(u => u.unitId === unitId);
    if (unitInfo) await loadAndRenderUnit(unitInfo);
  }

  async function handleFileUpload(input) {
    const file = input.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const unitData = JSON.parse(text);
      if (!unitData.unitId || !unitData.unitName || !unitData.article) {
        throw new Error('无效的单元JSON格式');
      }
      const tempId = 'upload_' + Date.now();
      const tempEntry = {
        unitId: tempId,
        unitName: unitData.unitName,
        dataUrl: URL.createObjectURL(file)
      };
      unitsIndex.push(tempEntry);
      populateUnitSelect();
      await loadAndRenderUnit(tempEntry);
    } catch (e) {
      alert('解析JSON失败：' + e.message);
    } finally {
      input.value = '';
    }
  }

  return {
    init,
    handleUnitSelect,
    handleFileUpload,
    getCurrentUnitId: () => currentUnitId,
    getCurrentUnitData: () => currentUnitData
  };
})();

// ============================================
// 渲染器
// ============================================
const Renderer = {
  showLoading() {
    const containers = [
      'article-vocab-wrapper', 'vocab-usage-section', 'reading-section',
      'cloze-section', 'seven-five-section', 'grammar-section'
    ];
    containers.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<div class="loading-indicator"><i class="fas fa-spinner fa-spin"></i> 载入单元中...</div>';
    });
  },

  renderAll(unitData, unitId) {
    this.renderArticleVocabulary(unitData, unitId);
    this.renderVocabUsage(unitData, unitId);
    this.renderReading(unitData, unitId);
    this.renderCloze(unitData, unitId);
    this.renderSevenFive(unitData, unitId);
    this.renderGrammar(unitData, unitId);
    setTimeout(() => {
      this.attachInputListeners(unitId);
    }, 50);
  },

  renderArticleVocabulary(unitData, unitId) {
    const wrapper = document.getElementById('article-vocab-wrapper');
    const article = unitData.article;
    const vocab = unitData.vocabulary || [];
    let html = `
      <div class="article-section">
        <div class="article-header">
          <h3 class="article-title">${article.title.replace('\n', '<br>')}</h3>
          <img src="${article.illustration || './images/placeholder.png'}" alt="illustration" class="article-illustration"
               onerror="this.onerror=null; this.style.display='none'; this.nextElementSibling.style.display='flex';">
          <div class="image-fallback" style="display:none; width:100%; height:180px; align-items:center; justify-content:center; color:#64748b;">
            <i class="fas fa-image" style="font-size:48px;"></i>
            <div style="margin-left:12px;">图片加载失败</div>
          </div>
        </div>
        <div class="article-paragraph-wrapper" id="article-content-${unitId}">
    `;
    article.paragraphs.forEach((para, idx) => {
      const paraNum = idx + 1;
      html += `
        <div class="single-paragraph" id="${unitId}_para${paraNum}-text">${para.english}</div>
        <button class="btn btn-outline paragraph-audio-btn" onclick="AudioController.toggleParagraphAudio(${paraNum}, '${unitId}')" id="${unitId}_para-audio-btn-${paraNum}">
          <i class="fas fa-volume-up"></i> 朗读
        </button>
        <button class="btn btn-outline" onclick="Renderer.toggleTranslation('${unitId}_trans${paraNum}')">
          <i class="fas fa-exchange-alt"></i> 翻译
        </button>
        <button class="btn btn-outline" onclick="Renderer.toggleImplication('${unitId}_impl${paraNum}')">
          <i class="fas fa-lightbulb"></i> 解读
        </button>
        <div class="translation-content" id="${unitId}_trans${paraNum}">${para.translation}</div>
        <div class="implication-content" id="${unitId}_impl${paraNum}">
          <div class="implication-text-wrapper">
            <div class="implication-english">${para.implication.english}</div>
            <div class="implication-chinese">${para.implication.chinese}</div>
          </div>
          <div class="implication-buttons">
            <button class="implication-audio-btn" onclick="AudioController.toggleImplicationAudio(${paraNum}, '${unitId}')" id="${unitId}_impl-audio-btn-${paraNum}">
              <i class="fas fa-play"></i>
            </button>
          </div>
        </div>
      `;
    });
    html += `</div></div>`;

    html += `<div class="vocab-section"><h4 class="vocab-title"><i class="fas fa-bookmark"></i> 核心词汇</h4><div class="vocab-list" id="${unitId}_vocab-list">`;
    vocab.forEach((v, i) => {
      html += `
        <div class="vocab-item ${v.highlightClass || ''}">
          <button class="vocab-audio-btn" onclick="AudioController.playVocabularyWord(${v.id}, '${unitId}')" id="${unitId}_vocab-audio-btn-${v.id}">
            <i class="fas fa-volume-up"></i>
          </button>
          <div class="vocab-text">
            <div class="vocab-word-line">
              <span class="vocab-number">${i+1}.</span>
              <span class="vocab-word">${v.word}</span>
            </div>
            <div class="vocab-meaning">${v.meaning}</div>
          </div>
        </div>
      `;
    });
    html += `</div></div>`;
    wrapper.innerHTML = html;
  },

  renderVocabUsage(unitData, unitId) {
    const container = document.getElementById('vocab-usage-section');
    const vu = unitData.vocabUsage;
    if (!vu) { container.innerHTML = ''; return; }

    let html = `
      <div class="vocab-drag-container">
        <div style="font-weight:600; color:#4b5563; width:100%;"><i class="fas fa-hand-pointer"></i> 拖拽词汇到正确位置：</div>
        <div class="vocab-drag-source" id="${unitId}_vocab-drag-source">
    `;
    vu.options.forEach(opt => {
      html += `<div class="vocab-drag-item" draggable="true" id="${unitId}_vocab-option-${opt}">
                  <i class="fas fa-grip-vertical" style="margin-right:8px; color:#9ca3af;"></i>${opt}
                </div>`;
    });
    html += `<button class="drag-undo-btn" onclick="DragDrop.undoVocabDrag('${unitId}')"><i class="fas fa-undo"></i> 返回上一步</button></div></div>`;

    html += `<div style="font-size:12px; line-height:1.6; padding:12px; background:#fafafa; border-radius:6px;" id="${unitId}_vocab-usage-text">`;
    vu.questions.forEach((q, idx) => {
      const qWithId = q.replace(/id='vocab-drop-(\d+)'/, `id='${unitId}_vocab-drop-$1'`);
      html += `<div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                <span style="min-width:20px; font-weight:bold;">${idx+1}.</span>
                <span>${qWithId}</span>
              </div>`;
    });
    html += `</div>
      <div class="action-buttons">
        <button class="btn btn-success check-btn" onclick="ExerciseChecker.checkVocabUsage('${unitId}')"><i class="fas fa-check-circle"></i> 检查答案</button>
        <button class="btn btn-danger reset-btn" onclick="ExerciseChecker.resetVocabUsage('${unitId}')"><i class="fas fa-redo"></i> 重新开始</button>
      </div>
      <div class="result-feedback" id="${unitId}_vocab-result"></div>`;
    container.innerHTML = html;
  },

  renderReading(unitData, unitId) {
    const container = document.getElementById('reading-section');
    const rc = unitData.readingComprehension;
    if (!rc || !rc.length) { 
      container.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">暂无阅读理解题目</div>'; 
      return; 
    }
    let html = `<div style="display:flex; flex-direction:column; gap:12px;">`;
    rc.forEach((item, idx) => {
      const qNum = idx + 1;
      html += `<div><div style="font-weight:600;">${item.question}</div><div style="margin-left:20px;">`;
      item.options.forEach(opt => {
        const radioId = `${unitId}_reading-${qNum}-${opt.id}`;
        html += `<div style="display:flex; align-items:center; gap:8px;">
                    <input type="radio" name="${unitId}_reading-${qNum}" id="${radioId}" value="${opt.id}">
                    <label for="${radioId}" class="option-label">${opt.text}</label>
                  </div>`;
      });
      html += `</div></div>`;
    });
    html += `</div>
      <div class="action-buttons">
        <button class="btn btn-success check-btn" onclick="ExerciseChecker.checkReading('${unitId}')"><i class="fas fa-check-circle"></i> 检查答案</button>
        <button class="btn btn-danger reset-btn" onclick="ExerciseChecker.resetReading('${unitId}')"><i class="fas fa-redo"></i> 重新开始</button>
      </div>
      <div class="result-feedback" id="${unitId}_reading-result"></div>`;
    container.innerHTML = html;
  },

  renderCloze(unitData, unitId) {
    const container = document.getElementById('cloze-section');
    let text = unitData.clozeText || '';
    text = text.replace(/id='cloze-(\d+)'/g, `id='${unitId}_cloze-$1'`);
    container.innerHTML = `
      <div style="font-size:12px; line-height:1.6; padding:12px; border:1px solid #eee; border-radius:6px;">${text}</div>
      <div class="action-buttons">
        <button class="btn btn-success check-btn" onclick="ExerciseChecker.checkCloze('${unitId}')"><i class="fas fa-check-circle"></i> 检查答案</button>
        <button class="btn btn-danger reset-btn" onclick="ExerciseChecker.resetCloze('${unitId}')"><i class="fas fa-redo"></i> 重新开始</button>
      </div>
      <div class="result-feedback" id="${unitId}_cloze-result"></div>
    `;
  },

  renderSevenFive(unitData, unitId) {
    const container = document.getElementById('seven-five-section');
    const sf = unitData.sevenFive;
    if (!sf) { container.innerHTML = ''; return; }
    let optionsHtml = '';
    sf.options.forEach(opt => {
      optionsHtml += `<div class="drag-item" draggable="true" id="${unitId}_option-${opt.id}">
                        <i class="fas fa-grip-vertical" style="margin-right:8px;"></i>${opt.text}
                      </div>`;
    });
    let text = sf.text.replace(/id='drop-(\d+)'/g, `id='${unitId}_drop-$1'`);
    container.innerHTML = `
      <div class="drag-drop-container">
        <div style="font-weight:600; color:#4b5563; width:100%;"><i class="fas fa-hand-pointer"></i> 拖拽短语到正确位置：</div>
        <div class="drag-source" id="${unitId}_drag-source">${optionsHtml}
          <button class="drag-undo-btn" onclick="DragDrop.undoDrag('${unitId}')"><i class="fas fa-undo"></i> 返回上一步</button>
        </div>
      </div>
      <div style="font-size:12px; line-height:1.6; padding:12px; border:1px solid #eee; border-radius:6px;">${text}</div>
      <div class="action-buttons">
        <button class="btn btn-success check-btn" onclick="ExerciseChecker.checkSevenFive('${unitId}')"><i class="fas fa-check-circle"></i> 检查答案</button>
        <button class="btn btn-danger reset-btn" onclick="ExerciseChecker.resetSevenFive('${unitId}')"><i class="fas fa-redo"></i> 重新开始</button>
      </div>
      <div class="result-feedback" id="${unitId}_sevenfive-result"></div>
    `;
  },

  renderGrammar(unitData, unitId) {
    const container = document.getElementById('grammar-section');
    let text = unitData.grammarText || '';
    text = text.replace(/id='grammar-(\d+)'/g, `id='${unitId}_grammar-$1'`);
    container.innerHTML = `
      <div style="font-size:12px; line-height:1.6; padding:12px; border:1px solid #eee; border-radius:6px;">${text}</div>
      <div class="action-buttons">
        <button class="btn btn-success check-btn" onclick="ExerciseChecker.checkGrammar('${unitId}')"><i class="fas fa-check-circle"></i> 检查答案</button>
        <button class="btn btn-danger reset-btn" onclick="ExerciseChecker.resetGrammar('${unitId}')"><i class="fas fa-redo"></i> 重新开始</button>
      </div>
      <div class="result-feedback" id="${unitId}_grammar-result"></div>
    `;
  },

  toggleTranslation(id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('show');
  },
  toggleImplication(id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('show');
  },

  attachInputListeners(unitId) {
    document.querySelectorAll(`.cloze-input[id^="${unitId}_"], .grammar-input[id^="${unitId}_"]`).forEach(input => {
      input.removeEventListener('input', this.adjustWidth);
      input.addEventListener('input', this.adjustWidth);
      input.removeEventListener('focus', this.focusWidth);
      input.addEventListener('focus', this.focusWidth);
      input.removeEventListener('blur', this.blurWidth);
      input.addEventListener('blur', this.blurWidth);
    });
  },
  adjustWidth(e) {
    const el = e.target;
    let min = el.classList.contains('cloze-input') ? 1.8 : 1.5;
    const len = el.value.length;
    el.style.width = `${Math.max(min, len * 0.8 + 0.5)}em`;
  },
  focusWidth(e) {
    const el = e.target;
    const cur = parseFloat(el.style.width) || 1.8;
    el.style.width = `${cur + 0.5}em`;
  },
  blurWidth(e) {
    Renderer.adjustWidth(e);
  }
};

// ============================================
// 音频控制器（完全修复：自然结束恢复、去除图标符号）
// ============================================
const AudioController = {
  currentAudio: null,
  currentPlayingButton: null,

  // 辅助函数：根据按钮类型恢复原始外观
  resetButton(btn) {
    if (!btn) return;
    btn.classList.remove('playing', 'loading');
    if (btn.id.includes('_para-audio-btn-')) {
      btn.innerHTML = '<i class="fas fa-volume-up"></i> 朗读';
    } else if (btn.id.includes('_impl-audio-btn-')) {
      btn.innerHTML = '<i class="fas fa-play"></i>';
    } else if (btn.id.includes('_vocab-audio-btn-')) {
      btn.innerHTML = '<i class="fas fa-volume-up"></i>';
    } else {
      // 降级通用恢复
      btn.innerHTML = btn.innerHTML.includes('朗读') ? '<i class="fas fa-volume-up"></i> 朗读' : '<i class="fas fa-play"></i>';
    }
  },

  preloadUnitAudio(unitId, audioPaths = null) {
    const base = audioPaths || {};
    const paraCount = UnitManager.getCurrentUnitData()?.article?.paragraphs?.length || 6;
    for (let i = 1; i <= paraCount; i++) {
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.src = base.paragraphPattern ? base.paragraphPattern.replace('{id}', i.toString().padStart(2,'0')) : `/english-reading-multi/audio/${unitId}/paragraph_${i.toString().padStart(2,'0')}.mp3`;
      audio.load();
    }
  },

  stop() {
    if (this.currentAudio) {
      if (this.currentAudio instanceof HTMLAudioElement) {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } else {
        window.speechSynthesis.cancel();
      }
      this.currentAudio = null;
    }
    if (this.currentPlayingButton) {
      this.resetButton(this.currentPlayingButton);
      this.currentPlayingButton = null;
    }
  },

  async toggleParagraphAudio(paraNum, unitId) {
    const btn = document.getElementById(`${unitId}_para-audio-btn-${paraNum}`);
    if (!btn) return;
    if (btn.classList.contains('playing')) {
      this.stop();
      return;
    }

    btn.classList.add('loading');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 加载中...';

    try {
      const audio = new Audio();
      const unitData = UnitManager.getCurrentUnitData();
      const pattern = unitData.audio?.paragraphPattern || `/english-reading-multi/audio/${unitId}/paragraph_{id}.mp3`;
      audio.src = pattern.replace('{id}', paraNum.toString().padStart(2,'0'));
      await audio.play();

      this.stop(); // 停止当前播放
      this.currentAudio = audio;
      this.currentPlayingButton = btn;

      btn.classList.remove('loading');
      btn.classList.add('playing');
      btn.innerHTML = '<i class="fas fa-stop"></i> 停止';

      // 自然结束处理：只恢复这个按钮，不干扰全局状态
      audio.onended = () => {
        this.resetButton(btn);
        if (this.currentAudio === audio) this.currentAudio = null;
        if (this.currentPlayingButton === btn) this.currentPlayingButton = null;
      };
    } catch (e) {
      console.warn('本地音频失败，使用TTS', e);
      const paraText = document.getElementById(`${unitId}_para${paraNum}-text`)?.innerText || '';
      this.playTTS(paraText, btn, 'para');
    }
  },

  async toggleImplicationAudio(paraNum, unitId) {
    const btn = document.getElementById(`${unitId}_impl-audio-btn-${paraNum}`);
    if (!btn) return;
    if (btn.classList.contains('playing')) {
      this.stop();
      return;
    }

    btn.classList.add('loading');
    // 去除 💡 符号（仅用于音频）
    const unitData = UnitManager.getCurrentUnitData();
    const rawImpl = unitData?.article?.paragraphs[paraNum-1]?.implication?.english || '';
    const cleanImpl = rawImpl.replace(/^💡\s*/, ''); // 移除开头的💡及空白

    try {
      const audio = new Audio();
      const pattern = unitData.audio?.implicationPattern || `/english-reading-multi/audio/${unitId}/impl_{id}.mp3`;
      audio.src = pattern.replace('{id}', paraNum.toString().padStart(2,'0'));
      await audio.play();

      this.stop();
      this.currentAudio = audio;
      this.currentPlayingButton = btn;

      btn.classList.remove('loading');
      btn.classList.add('playing');
      btn.innerHTML = '<i class="fas fa-stop"></i>';

      audio.onended = () => {
        this.resetButton(btn);
        if (this.currentAudio === audio) this.currentAudio = null;
        if (this.currentPlayingButton === btn) this.currentPlayingButton = null;
      };
    } catch (e) {
      console.warn('本地音频失败，使用TTS', e);
      this.playTTS(cleanImpl, btn, 'impl');
    }
  },

  async playVocabularyWord(vocabId, unitId) {
    const btn = document.getElementById(`${unitId}_vocab-audio-btn-${vocabId}`);
    if (!btn) return;
    if (btn.classList.contains('playing')) {
      this.stop();
      return;
    }

    btn.classList.add('loading');
    const unitData = UnitManager.getCurrentUnitData();
    const word = unitData?.vocabulary?.find(v => v.id === vocabId)?.word || '';

    try {
      const audio = new Audio();
      const pattern = unitData.audio?.vocabularyPattern || `/english-reading-multi/audio/${unitId}/word_{id}.mp3`;
      audio.src = pattern.replace('{id}', vocabId.toString().padStart(2,'0'));
      await audio.play();

      this.stop();
      this.currentAudio = audio;
      this.currentPlayingButton = btn;

      btn.classList.remove('loading');
      btn.classList.add('playing');
      btn.innerHTML = '<i class="fas fa-stop"></i>';

      audio.onended = () => {
        this.resetButton(btn);
        if (this.currentAudio === audio) this.currentAudio = null;
        if (this.currentPlayingButton === btn) this.currentPlayingButton = null;
      };
    } catch (e) {
      console.warn('本地音频失败，使用TTS', e);
      this.playTTS(word, btn, 'vocab');
    }
  },

  // TTS 播放，支持按钮自然结束恢复
  playTTS(text, btn = null, type = '') {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-GB';
    utter.rate = 0.85;

    // 如果传入了按钮，设置播放状态并处理自然结束
    if (btn) {
      this.stop();
      btn.classList.remove('loading');
      btn.classList.add('playing');
      if (type === 'para') {
        btn.innerHTML = '<i class="fas fa-stop"></i> 停止(TTS)';
      } else {
        btn.innerHTML = '<i class="fas fa-stop"></i>';
      }
      this.currentPlayingButton = btn;
    }

    utter.onend = () => {
      if (btn) {
        this.resetButton(btn);
        if (this.currentPlayingButton === btn) this.currentPlayingButton = null;
      }
      this.currentAudio = null;
    };

    window.speechSynthesis.speak(utter);
    this.currentAudio = utter;
  }
};

// ============================================
// 拖拽管理器（全局统一监听）
// ============================================
const DragDrop = {
  dragHistory: new Map(),
  vocabDragHistory: new Map(),

  allowDrop(ev) { ev.preventDefault(); },

  handleDragStart(ev) {
    const el = ev.target.closest('.drag-item, .vocab-drag-item');
    if (el && el.draggable) {
      ev.dataTransfer.setData('text/plain', el.id);
    }
  },

  handleDrop(ev) {
    const vocabDropzone = ev.target.closest('.vocab-dropzone');
    if (vocabDropzone) {
      ev.preventDefault();
      const unitId = UnitManager.getCurrentUnitId();
      if (unitId) {
        this.dropVocab(ev, unitId, vocabDropzone);
      }
      return;
    }
    
    const sevenFiveDropzone = ev.target.closest('.seven-five-dropzone');
    if (sevenFiveDropzone) {
      ev.preventDefault();
      const unitId = UnitManager.getCurrentUnitId();
      if (unitId) {
        this.drop(ev, unitId, sevenFiveDropzone);
      }
    }
  },

  drop(ev, unitId, dropzone) {
    const data = ev.dataTransfer.getData('text/plain');
    const dragged = document.getElementById(data);
    if (!dragged || dragged.classList.contains('used')) return;
    if (!dropzone) return;

    if (!this.dragHistory.has(unitId)) this.dragHistory.set(unitId, []);
    this.dragHistory.get(unitId).push({
      dropzone: dropzone,
      optionId: data,
      draggedElement: dragged
    });

    dropzone.innerHTML = dragged.textContent.replace(/^.*?>\s*/, '');
    dropzone.classList.add('filled');
    dropzone.setAttribute('data-answer', data.split('-').pop());
    this.adjustDropzoneWidth(dropzone);
    dragged.classList.add('used');
    dragged.draggable = false;
  },

  undoDrag(unitId) {
    const hist = this.dragHistory.get(unitId);
    if (hist && hist.length) {
      const last = hist.pop();
      if (last.draggedElement) {
        last.draggedElement.classList.remove('used');
        last.draggedElement.draggable = true;
      }
      last.dropzone.innerHTML = '';
      last.dropzone.classList.remove('filled');
      last.dropzone.removeAttribute('data-answer');
      last.dropzone.style.minWidth = '80px';
      last.dropzone.style.width = '80px';
    }
  },

  dropVocab(ev, unitId, dropzone) {
    const data = ev.dataTransfer.getData('text/plain');
    const dragged = document.getElementById(data);
    if (!dragged || dragged.classList.contains('used')) return;
    if (!dropzone) return;

    if (!this.vocabDragHistory.has(unitId)) this.vocabDragHistory.set(unitId, []);
    this.vocabDragHistory.get(unitId).push({
      dropzone: dropzone,
      optionId: data,
      draggedElement: dragged
    });

    const word = data.replace(`${unitId}_vocab-option-`, '');
    dropzone.innerHTML = word;
    dropzone.classList.add('filled');
    dropzone.setAttribute('data-answer', word);
    dragged.classList.add('used');
    dragged.draggable = false;
  },

  undoVocabDrag(unitId) {
    const hist = this.vocabDragHistory.get(unitId);
    if (hist && hist.length) {
      const last = hist.pop();
      if (last.draggedElement) {
        last.draggedElement.classList.remove('used');
        last.draggedElement.draggable = true;
      }
      last.dropzone.innerHTML = '';
      last.dropzone.classList.remove('filled');
      last.dropzone.removeAttribute('data-answer');
      last.dropzone.style.color = '';
    }
  },

  adjustDropzoneWidth(dz) {
    const len = dz.textContent.trim().length;
    dz.style.minWidth = Math.max(80, len * 10) + 'px';
    dz.style.width = 'auto';
  }
};

// ============================================
// 习题检查器（动态长度修复）
// ============================================
const ExerciseChecker = {
  checkVocabUsage(unitId) {
    const data = UnitManager.getCurrentUnitData();
    const answers = data.answers.vocab;
    let correct = 0;
    for (let i = 1; i <= answers.length; i++) {
      const dz = document.getElementById(`${unitId}_vocab-drop-${i}`);
      if (!dz) continue;
      const user = dz.getAttribute('data-answer') || '';
      dz.classList.remove('correct','incorrect');
      dz.style.color = '';
      if (!user) {
        dz.innerHTML = answers[i-1];
        dz.style.color = '#7c3aed';
      } else if (user.trim().toLowerCase() === answers[i-1].trim().toLowerCase()) {
        dz.classList.add('correct'); correct++;
      } else {
        dz.classList.add('incorrect');
        dz.innerHTML = `${user} <span style="color:#b91c1c; font-size:10px;">(正确: ${answers[i-1]})</span>`;
      }
    }
    this.showResult(unitId, 'vocab', correct, answers.length);
  },

  resetVocabUsage(unitId) {
    const data = UnitManager.getCurrentUnitData();
    if (!data) return;
    const count = data.answers.vocab.length;
    for (let i = 1; i <= count; i++) {
      const dz = document.getElementById(`${unitId}_vocab-drop-${i}`);
      if (dz) {
        dz.innerHTML = ''; 
        dz.classList.remove('filled','correct','incorrect'); 
        dz.removeAttribute('data-answer');
        dz.style.color = '';
      }
    }
    document.querySelectorAll(`#${unitId}_vocab-drag-source .vocab-drag-item`).forEach(el => {
      el.classList.remove('used'); 
      el.draggable = true;
    });
    DragDrop.vocabDragHistory.delete(unitId);
    const result = document.getElementById(`${unitId}_vocab-result`);
    if (result) result.style.display = 'none';
  },

  checkReading(unitId) {
    const data = UnitManager.getCurrentUnitData();
    const answers = data.answers.reading;
    let correct = 0;
    for (let i = 1; i <= answers.length; i++) {
      const radios = document.getElementsByName(`${unitId}_reading-${i}`);
      let selected = null;
      radios.forEach(r => { if (r.checked) selected = r.value; });
      const correctAns = answers[i-1];
      radios.forEach(r => {
        const label = document.querySelector(`label[for="${r.id}"]`);
        if (label) {
          label.classList.remove('correct','incorrect','selected-correct','selected-incorrect');
          if (r.value === correctAns) label.classList.add('correct');
          if (r.checked) {
            if (r.value === correctAns) { label.classList.add('selected-correct'); correct++; }
            else label.classList.add('selected-incorrect');
          }
        }
      });
    }
    this.showResult(unitId, 'reading', correct, answers.length);
  },

  resetReading(unitId) {
    document.querySelectorAll(`input[type="radio"][name^="${unitId}_reading-"]`).forEach(r => {
      r.checked = false;
      const label = document.querySelector(`label[for="${r.id}"]`);
      if (label) label.classList.remove('correct','incorrect','selected-correct','selected-incorrect');
    });
    const res = document.getElementById(`${unitId}_reading-result`);
    if (res) res.style.display = 'none';
  },

  checkCloze(unitId) {
    this.genericCheckFill(unitId, 'cloze', unitData => unitData.answers.cloze);
  },

  resetCloze(unitId) {
    const data = UnitManager.getCurrentUnitData();
    if (!data) return;
    const count = data.answers.cloze.length;
    this.genericResetFill(unitId, 'cloze', count, 1.8);
  },

  checkGrammar(unitId) {
    this.genericCheckFill(unitId, 'grammar', unitData => unitData.answers.grammar);
  },

  resetGrammar(unitId) {
    const data = UnitManager.getCurrentUnitData();
    if (!data) return;
    const count = data.answers.grammar.length;
    this.genericResetFill(unitId, 'grammar', count, 1.5);
  },

  checkSevenFive(unitId) {
    const data = UnitManager.getCurrentUnitData();
    const answers = data.answers.sevenFive;
    let correct = 0;
    for (let i = 1; i <= answers.length; i++) {
      const dz = document.getElementById(`${unitId}_drop-${i}`);
      if (!dz) continue;
      const user = dz.getAttribute('data-answer');
      dz.classList.remove('correct','incorrect','empty');
      dz.style.color = '';
      if (!user) {
        dz.classList.add('empty');
        const opt = data.sevenFive.options.find(o => o.id === answers[i-1]);
        dz.innerHTML = opt ? opt.text : answers[i-1];
        dz.style.color = '#7c3aed';
        DragDrop.adjustDropzoneWidth(dz);
      } else if (user === answers[i-1]) {
        dz.classList.add('correct'); 
        dz.classList.add('filled');
        correct++;
        DragDrop.adjustDropzoneWidth(dz);
      } else {
        dz.classList.add('incorrect');
        dz.classList.add('filled');
        const userOpt = data.sevenFive.options.find(o => o.id === user);
        const corrOpt = data.sevenFive.options.find(o => o.id === answers[i-1]);
        dz.innerHTML = `${userOpt?.text || user} <br><small style="color:#b91c1c;">正确: ${corrOpt?.text || answers[i-1]}</small>`;
        DragDrop.adjustDropzoneWidth(dz);
      }
    }
    this.showResult(unitId, 'sevenfive', correct, answers.length);
  },

  resetSevenFive(unitId) {
    const data = UnitManager.getCurrentUnitData();
    if (!data) return;
    const count = data.answers.sevenFive.length;
    for (let i = 1; i <= count; i++) {
      const dz = document.getElementById(`${unitId}_drop-${i}`);
      if (dz) {
        dz.innerHTML = ''; 
        dz.classList.remove('filled','correct','incorrect','empty'); 
        dz.removeAttribute('data-answer');
        dz.style.color = '';
        dz.style.minWidth = '80px'; 
        dz.style.width = '80px';
      }
    }
    document.querySelectorAll(`#${unitId}_drag-source .drag-item`).forEach(el => {
      el.classList.remove('used'); 
      el.draggable = true;
    });
    DragDrop.dragHistory.delete(unitId);
    const res = document.getElementById(`${unitId}_sevenfive-result`);
    if (res) res.style.display = 'none';
  },

  genericCheckFill(unitId, prefix, answerGetter) {
    const data = UnitManager.getCurrentUnitData();
    const answers = answerGetter(data);
    let correct = 0;
    for (let i = 1; i <= answers.length; i++) {
      const input = document.getElementById(`${unitId}_${prefix}-${i}`);
      if (!input) continue;
      const user = input.value.trim().toLowerCase();
      const ans = answers[i-1].toLowerCase();
      input.classList.remove('correct','incorrect','missing');
      if (user === '') {
        input.classList.add('missing');
        input.value = answers[i-1];
        Renderer.adjustWidth({target: input});
      } else if (user === ans) {
        input.classList.add('correct'); correct++;
        Renderer.adjustWidth({target: input});
      } else {
        input.classList.add('incorrect');
        Renderer.adjustWidth({target: input});
      }
    }
    this.showResult(unitId, prefix, correct, answers.length);
  },

  genericResetFill(unitId, prefix, count, minWidthEm) {
    for (let i = 1; i <= count; i++) {
      const input = document.getElementById(`${unitId}_${prefix}-${i}`);
      if (input) {
        input.value = '';
        input.classList.remove('correct','incorrect','missing');
        input.style.width = `${minWidthEm}em`;
      }
    }
    const res = document.getElementById(`${unitId}_${prefix}-result`);
    if (res) res.style.display = 'none';
  },

  showResult(unitId, section, correct, total) {
    const resId = `${unitId}_${section}-result`;
    const res = document.getElementById(resId);
    if (!res) return;
    const percent = Math.round((correct/total)*100);
    if (correct === total) {
      res.innerHTML = `<strong><i class="fas fa-trophy"></i> 全部正确！ (${correct}/${total})</strong>`;
      res.className = 'result-feedback result-correct';
    } else {
      res.innerHTML = `<strong><i class="fas fa-chart-line"></i> 答对 ${correct}/${total} (${percent}%)</strong>`;
      res.className = 'result-feedback result-incorrect';
    }
    res.style.display = 'block';
  }
};

// ============================================
// 全局拖拽监听器
// ============================================
document.addEventListener('dragstart', (e) => {
  DragDrop.handleDragStart(e);
});

document.addEventListener('dragover', (e) => {
  e.preventDefault();
});

document.addEventListener('drop', (e) => {
  DragDrop.handleDrop(e);
});

// ============================================
// 页面启动
// ============================================
window.onload = () => {
  UnitManager.init();
};