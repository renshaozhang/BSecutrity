// B证项目负责人题库 - 做题应用逻辑
(function () {
    'use strict';

    var QUESTIONS = window.QUESTIONS || [];
    var STORAGE_KEY = 'b-cert-quiz-progress-v1';

    // ---- State ----
    var state = {
        order: [],          // array of question indices (supports shuffle)
        pos: 0,             // current position in `order`
        answers: {},        // { qid: selectedLetter }
        filter: 'all',      // current toolbar filter (visual only; doesn't change order)
        jumpFilter: 'all',  // filter inside the jump modal grid
        shuffled: false,
    };

    // ---- Persistence ----
    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                answers: state.answers,
                shuffled: state.shuffled,
                pos: state.pos,
            }));
        } catch (e) { /* ignore quota errors */ }
    }
    function load() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            var data = JSON.parse(raw);
            if (data.answers) state.answers = data.answers;
            if (typeof data.shuffled === 'boolean') state.shuffled = data.shuffled;
            if (typeof data.pos === 'number') state.pos = data.pos;
        } catch (e) { /* ignore */ }
    }

    // ---- Helpers ----
    function $(id) { return document.getElementById(id); }
    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function blankOut(text) {
        // Highlight blank markers like (  ) or (    ) or () used as answer placeholder
        return text.replace(/(\(\s*\))/g, '<span class="blank">(    )</span>');
    }
    function toast(msg) {
        var t = $('toast');
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(toast._t);
        toast._t = setTimeout(function () { t.classList.remove('show'); }, 1800);
    }

    // ---- Order / navigation ----
    function buildOrder() {
        var arr = [];
        for (var i = 0; i < QUESTIONS.length; i++) arr.push(i);
        if (state.shuffled) {
            // Fisher-Yates with a simple PRNG-free shuffle
            for (var i = arr.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
            }
        }
        state.order = arr;
    }

    function currentQIndex() {
        if (state.pos < 0 || state.pos >= state.order.length) return -1;
        return state.order[state.pos];
    }
    function currentQuestion() {
        var idx = currentQIndex();
        return idx >= 0 ? QUESTIONS[idx] : null;
    }

    function goTo(pos) {
        pos = Math.max(0, Math.min(state.order.length - 1, pos));
        state.pos = pos;
        save();
        render();
        // scroll to top of question
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function nextUnanswered() {
        for (var i = 0; i < state.order.length; i++) {
            var p = (state.pos + 1 + i) % state.order.length;
            var qi = state.order[p];
            if (!state.answers[QUESTIONS[qi].id]) {
                goTo(p);
                return true;
            }
        }
        return false;
    }
    function nextWrong() {
        for (var i = 0; i < state.order.length; i++) {
            var p = (state.pos + 1 + i) % state.order.length;
            var qi = state.order[p];
            var q = QUESTIONS[qi];
            var a = state.answers[q.id];
            if (a && a !== q.answer) { goTo(p); return true; }
        }
        return false;
    }

    // ---- Stats ----
    function computeStats() {
        var total = QUESTIONS.length;
        var answered = 0, correct = 0, wrong = 0;
        for (var i = 0; i < QUESTIONS.length; i++) {
            var q = QUESTIONS[i];
            var a = state.answers[q.id];
            if (a) {
                answered++;
                if (a === q.answer) correct++;
                else wrong++;
            }
        }
        return {
            total: total,
            answered: answered,
            correct: correct,
            wrong: wrong,
            unanswered: total - answered,
            accuracy: answered ? Math.round(correct / answered * 100) : 0,
        };
    }

    // ---- Render ----
    function render() {
        var q = currentQuestion();
        if (!q) {
            $('qCard').innerHTML = '<div class="empty">没有题目</div>';
            return;
        }

        // Badge & type
        $('qBadge').textContent = '第 ' + q.id + ' 题';
        var hasC = q.options.C && q.options.C.length > 0;
        var hasD = q.options.D && q.options.D.length > 0;
        var typeTag = (!hasC && !hasD) ? '判断题' : '单选题';
        $('qTypeTag').textContent = typeTag;

        // Question text
        $('qText').innerHTML = blankOut(escapeHtml(q.question));

        // Options
        var optContainer = $('options');
        optContainer.innerHTML = '';
        var userAnswer = state.answers[q.id];
        var answered = !!userAnswer;
        var letters = ['A', 'B', 'C', 'D'];
        for (var li = 0; li < letters.length; li++) {
            var L = letters[li];
            var text = q.options[L];
            if (!text || !text.length) continue;
            var btn = document.createElement('button');
            btn.className = 'option';
            btn.setAttribute('data-letter', L);
            btn.innerHTML = '<span class="letter">' + L + '</span><span class="opt-text">' + escapeHtml(text) + '</span>';

            if (answered) {
                btn.classList.add('disabled');
                var isCorrect = (L === q.answer);
                var isUserPick = (L === userAnswer);
                if (isCorrect) btn.classList.add('correct');
                else if (isUserPick) btn.classList.add('wrong');
                if (isUserPick) btn.classList.add('selected');
            } else {
                (function (letter) {
                    btn.addEventListener('click', function () { onSelect(letter); });
                })(L);
            }
            optContainer.appendChild(btn);
        }

        // Feedback panel
        var fb = $('feedback');
        if (answered) {
            var isRight = (userAnswer === q.answer);
            fb.className = 'feedback show ' + (isRight ? 'correct' : 'wrong');
            var correctText = q.options[q.answer] || '';
            var userText = q.options[userAnswer] || '';
            var head = isRight ? '\u2713 回答正确' : '\u2717 回答错误';
            var body = '';
            if (!isRight) {
                body += '<div class="row"><span class="label">你的答案：</span><span class="ans-wrong">' +
                        userAnswer + '. ' + escapeHtml(userText) + '</span></div>';
            }
            body += '<div class="row"><span class="label">正确答案：</span><span class="ans-correct">' +
                    q.answer + '. ' + escapeHtml(correctText) + '</span></div>';
            body += '<div class="row" style="margin-top:6px; color:var(--muted); font-size:13px;">' +
                    '解析：本题考查相关知识点，正确选项为 ' + q.answer + '。</div>';
            fb.innerHTML = '<div class="feedback-head">' + head + '</div><div class="feedback-body">' + body + '</div>';
        } else {
            fb.className = 'feedback';
            fb.innerHTML = '';
        }

        // Top stats
        var stats = computeStats();
        $('quickStats').innerHTML = '<b>' + stats.answered + '</b>/' + stats.total;
        var pct = Math.round(state.pos / state.order.length * 100);
        $('progressFill').style.width = pct + '%';
        $('progressLabel').textContent = '进度 ' + (state.pos + 1) + '/' + state.order.length + ' · ' + pct + '%';
        $('accuracyLabel').textContent = '正确率 ' + (stats.answered ? stats.accuracy + '%' : '—');

        // Nav buttons
        $('prevBtn').disabled = (state.pos <= 0);
        $('nextBtn').disabled = (state.pos >= state.order.length - 1);

        // Active filter buttons
        var filters = ['filterAll', 'filterUnanswered', 'filterWrong'];
        for (var f = 0; f < filters.length; f++) {
            var el = $(filters[f]);
            var isActive = (f === 0 && state.filter === 'all') ||
                          (f === 1 && state.filter === 'unanswered') ||
                          (f === 2 && state.filter === 'wrong');
            el.classList.toggle('active', isActive);
        }
        $('shuffleBtn').classList.toggle('active', state.shuffled);
    }

    // ---- Selection ----
    function onSelect(letter) {
        var q = currentQuestion();
        if (!q) return;
        if (state.answers[q.id]) return; // already answered
        state.answers[q.id] = letter;
        save();
        render();
    }

    // ---- Jump grid ----
    function renderJumpGrid() {
        var grid = $('qGrid');
        grid.innerHTML = '';
        var filter = state.jumpFilter;
        for (var i = 0; i < QUESTIONS.length; i++) {
            var q = QUESTIONS[i];
            var a = state.answers[q.id];
            var show = true;
            if (filter === 'unanswered') show = !a;
            else if (filter === 'wrong') show = (a && a !== q.answer);
            else if (filter === 'correct') show = (a && a === q.answer);
            if (!show) continue;

            var cell = document.createElement('div');
            cell.className = 'q-cell';
            cell.textContent = q.id;
            if (i === currentQIndex()) cell.classList.add('current');
            if (a && a === q.answer) cell.classList.add('answered-correct');
            else if (a) cell.classList.add('answered-wrong');
            else if (a) cell.classList.add('answered');
            (function (qi) {
                cell.addEventListener('click', function () {
                    // find position of qi in state.order
                    var p = state.order.indexOf(qi);
                    if (p >= 0) {
                        closeModal();
                        goTo(p);
                    }
                });
            })(i);
            grid.appendChild(cell);
        }
        if (!grid.children.length) {
            grid.innerHTML = '<div class="empty" style="grid-column:1/-1;">该筛选下没有题目</div>';
        }
    }

    function openModal() {
        var stats = computeStats();
        $('statTotal').textContent = stats.total;
        $('statCorrect').textContent = stats.correct;
        $('statWrong').textContent = stats.wrong;
        $('statUnanswered').textContent = stats.unanswered;
        $('statAcc').textContent = stats.answered ? stats.accuracy + '%' : '—';
        renderJumpGrid();
        $('modal').classList.add('show');
    }
    function closeModal() {
        $('modal').classList.remove('show');
    }

    // ---- Init ----
    function init() {
        load();
        buildOrder();
        // Restore pos within bounds
        if (state.pos >= state.order.length) state.pos = 0;

        // Event bindings
        $('prevBtn').addEventListener('click', function () { goTo(state.pos - 1); });
        $('nextBtn').addEventListener('click', function () { goTo(state.pos + 1); });

        $('statsBtn').addEventListener('click', openModal);
        $('modalClose').addEventListener('click', closeModal);
        $('modal').addEventListener('click', function (e) {
            if (e.target === $('modal')) closeModal();
        });

        $('filterAll').addEventListener('click', function () {
            state.filter = 'all'; render();
        });
        $('filterUnanswered').addEventListener('click', function () {
            state.filter = 'unanswered';
            if (!nextUnanswered()) { state.filter = 'all'; toast('没有未答题目'); }
            render();
        });
        $('filterWrong').addEventListener('click', function () {
            state.filter = 'wrong';
            if (!nextWrong()) { state.filter = 'all'; toast('没有错题'); }
            render();
        });
        $('shuffleBtn').addEventListener('click', function () {
            state.shuffled = !state.shuffled;
            // preserve current question
            var curQi = currentQIndex();
            buildOrder();
            if (curQi >= 0) {
                var newP = state.order.indexOf(curQi);
                if (newP >= 0) state.pos = newP;
            }
            save();
            render();
            toast(state.shuffled ? '已开启乱序' : '已恢复顺序');
        });

        // Modal filters
        var tabs = document.querySelectorAll('#jumpFilter .filter-tab');
        for (var t = 0; t < tabs.length; t++) {
            tabs[t].addEventListener('click', function (e) {
                for (var j = 0; j < tabs.length; j++) tabs[j].classList.remove('active');
                e.target.classList.add('active');
                state.jumpFilter = e.target.getAttribute('data-filter');
                renderJumpGrid();
            });
        }
        $('jumpUnanswered').addEventListener('click', function () {
            closeModal();
            state.filter = 'unanswered';
            if (!nextUnanswered()) { state.filter = 'all'; toast('没有未答题目'); }
            render();
        });
        $('jumpWrong').addEventListener('click', function () {
            closeModal();
            state.filter = 'wrong';
            if (!nextWrong()) { state.filter = 'all'; toast('没有错题'); }
            render();
        });
        $('resetBtn').addEventListener('click', function () {
            if (!confirm('确定要重置所有答题进度吗？此操作不可恢复。')) return;
            state.answers = {};
            save();
            closeModal();
            goTo(0);
            toast('进度已重置');
        });

        // Keyboard navigation
        document.addEventListener('keydown', function (e) {
            if ($('modal').classList.contains('show')) {
                if (e.key === 'Escape') closeModal();
                return;
            }
            // Options: A/B/C/D
            if (/^[a-dA-D]$/.test(e.key) && !state.answers[currentQuestion().id]) {
                var letter = e.key.toUpperCase();
                onSelect(letter);
                e.preventDefault();
                return;
            }
            if (e.key === 'ArrowRight' || e.key === 'Enter') { goTo(state.pos + 1); e.preventDefault(); }
            else if (e.key === 'ArrowLeft') { goTo(state.pos - 1); e.preventDefault(); }
        });

        render();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
