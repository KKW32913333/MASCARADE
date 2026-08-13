'use strict';
/* =========================================================================
 * MASQUE ROYALE ― 仮面領の一夜
 * データ駆動設計のカードゲーム本体。
 * カード1枚 = CARD_DEFS の1プロパティ。効果は effect 種別で分岐して処理する。
 * ========================================================================= */

/* ---------------------------------------------------------------------
 * 1. カードデータ定義
 * ------------------------------------------------------------------- */
const CARD_DEFS = {
  attendant:    { id:'attendant',    name:'給仕',         yomi:'きゅうじ',       number:1,  count:2, effect:'guessRank',
    desc:'相手の手札の数字を1つ宣言する。的中すれば相手は即座に脱落する（「1」は宣言できない）。', image:'cards/card-attendant.png' },
  musician:     { id:'musician',     name:'楽団員',       yomi:'がくだんいん',   number:2,  count:2, effect:'mutualReveal',
    desc:'対象と自分、お互いの手札を見せ合う。', image:'cards/card-musician.png' },
  fortune:      { id:'fortune',      name:'占い師',       yomi:'うらないし',     number:3,  count:2, effect:'peekHand',
    desc:'対象の手札をこっそり覗き見る（自分の手札は見せない）。', image:'cards/card-fortune.png' },
  noble_lady:   { id:'noble_lady',   name:'貴婦人',       yomi:'きふじん',       number:4,  count:2, effect:'protectSelf',
    desc:'次の自分の番が来るまで、他人の効果を受けない。', image:'cards/card-noble_lady.png' },
  spy:          { id:'spy',          name:'密偵',         yomi:'みってい',       number:5,  count:2, effect:'peekDeckTop',
    desc:'山札の一番上をこっそり確認し、そのまま戻すか山札の底へ送るか選べる。', image:'cards/card-spy.png' },
  jester:       { id:'jester',       name:'道化師',       yomi:'どうけし',       number:6,  count:2, effect:'swapHand',
    desc:'対象と自分の手札を強制的に交換する。', image:'cards/card-jester.png' },
  taster:       { id:'taster',       name:'毒見役',       yomi:'どくみやく',     number:7,  count:2, effect:'forceRedraw',
    desc:'対象に手札を公開で捨てさせ、山札から新しい1枚を引かせる。', image:'cards/card-taster.png' },
  black_knight: { id:'black_knight', name:'黒騎士',       yomi:'くろきし',       number:8,  count:2, effect:'compareHand',
    desc:'対象と手札の数字をこっそり比べ合い、低い方が脱落する（同数なら何も起きない）。', image:'cards/card-black_knight.png' },
  grand_duke:   { id:'grand_duke',   name:'大公',         yomi:'たいこう',       number:9,  count:1, effect:'none',
    desc:'特別な効果は持たない、静かなる仮面。数字の大きさだけを頼りに、最後まで大事に持ち続けるか、思い切って手放すかが問われる。',
    image:'cards/card-grand_duke.png' },
  masked_host:  { id:'masked_host',  name:'仮面の主催者', yomi:'かめんのしゅさいしゃ', number:10, count:1, effect:'none',
    desc:'自分の番にこの仮面を自ら場に出すと、その場で正体が露見し即座に脱落する。ただし他者の効果で捨てさせられた場合や、勝敗を決める最後の公開時にはこの効果は発動しない（LARVAの黄金律）。最強にして最も脆い切り札。',
    exposeEliminates:true, image:'cards/card-masked_host.png' },
};
const CARD_ORDER = ['attendant','musician','fortune','noble_lady','spy','jester','taster','black_knight','grand_duke','masked_host'];

function rankClass(number){
  if(number>=9) return 'rank-royal';
  if(number>=7) return 'rank-gold';
  if(number>=4) return 'rank-silver';
  return 'rank-bronze';
}

/* ---------------------------------------------------------------------
 * 2. ユーティリティ
 * ------------------------------------------------------------------- */
function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}
function buildFreshDeck(){
  const deck = [];
  CARD_ORDER.forEach(id=>{
    const def = CARD_DEFS[id];
    for(let i=0;i<def.count;i++) deck.push(id);
  });
  return shuffle(deck);
}
function cardDef(id){ return CARD_DEFS[id]; }
function uniq(){ return Math.random().toString(36).slice(2,9); }
// 演出用のCPU「間」。ヘッドレステスト（__TEST_FORCE_CPU）実行時のみ短縮する。
function pace(ms){ return (typeof window!=='undefined' && window.__TEST_FORCE_CPU) ? Math.min(10, ms) : ms; }

/* ---------------------------------------------------------------------
 * 3. ゲーム状態 & コアロジック
 * ------------------------------------------------------------------- */
const Game = {
  state: null,

  newGame(){
    const deck = buildFreshDeck();
    const removedCard = deck.pop(); // 転生札（誰にも見えない1枚、裏向きで除外）
    const forceCPU = (typeof window!=='undefined' && window.__TEST_FORCE_CPU); // ヘッドレステスト専用フック
    const players = [
      { id:0, name:'あなた', isCPU: !!forceCPU, hand:[deck.pop()], alive:true, protectedFlag:false, discard:[] },
      { id:1, name:'仮面卿', isCPU:true,  hand:[deck.pop()], alive:true, protectedFlag:false, discard:[] },
    ];
    this.state = {
      deck, removedCard,
      players,
      turnIndex: Math.random()<0.5 ? 0 : 1,
      turnCount: 0,
      log: [],
      phase: 'idle',       // idle | choose | resolve | over
      pendingCard: null,   // 選択済みだが未解決のカードID（対象/数字待ち）
      gameOver: false,
      winner: null,
      endReason: null,
    };
    UI.showTable();
    this.addLog(`舞踏会の幕が上がる。1枚の仮面が「転生札」として裏向きに除外された。最初の番は「${players[this.state.turnIndex].name}」。`, true);
    UI.render();
    this.startTurn();
  },

  addLog(text, isTurnHeader){
    this.state.log.push({ text, header: !!isTurnHeader });
  },

  me(){ return this.state.players[0]; },
  opp(){ return this.state.players[1]; },
  other(idx){ return idx===0?1:0; },
  playerAt(idx){ return this.state.players[idx]; },

  startTurn(){
    const s = this.state;
    if(s.gameOver) return;
    s.turnCount++;
    const p = s.players[s.turnIndex];

    // 山札が尽きた場合はここでゲーム終了（比べ合い）
    if(s.deck.length===0){
      this.endGameByShowdown();
      return;
    }

    p.protectedFlag = false; // 加護は自分の番が来た時点で解除
    const drawn = s.deck.pop();
    p.hand.push(drawn);
    this.addLog(`── ${p.name} の番（${s.turnCount}巡）──`, true);
    this.addLog(`${p.name} は山札から仮面を1枚引いた。`);

    s.phase = 'choose';
    UI.render();

    if(p.isCPU){
      setTimeout(()=>CPU.takeTurn(), pace(850));
    }
  },

  /* 手札からカードを1枚選んで場に出す（プレイする） */
  discardCard(playerIdx, cardId, opts){
    opts = opts || {};
    const s = this.state;
    const p = s.players[playerIdx];
    const idx = p.hand.indexOf(cardId);
    if(idx===-1){ console.error('hand mismatch', playerIdx, cardId, p.hand); return; }
    p.hand.splice(idx,1);
    p.discard.push(cardId);
    const def = cardDef(cardId);

    if(!opts.forced){
      this.addLog(`${p.name} は「${def.name}（${def.number}）」の仮面を外し、場に出した。`);
    } else {
      this.addLog(`${p.name} は掟に従い「${def.name}（${def.number}）」を場に出した。`);
    }

    // 仮面の主催者は捨てられた瞬間に脱落
    if(def.exposeEliminates){
      this.eliminate(playerIdx, `「${def.name}」を自ら場に出してしまい、正体が露見した`);
      UI.render();
      if(this.checkGameEnd()) return;
      this.advanceTurn();
      return;
    }

    if(opts.forced || def.effect==='none'){
      // 効果を持たないカード（大公など）。このカードを出したことが今回の番の行動そのものであり、
      // これでターンは終了する（もう1枚は次の自分の番まで手札に残る）。
      UI.render();
      if(this.checkGameEnd()) return;
      this.advanceTurn();
      return;
    }

    // 効果解決フェーズへ
    s.phase = 'resolve';
    s.pendingCard = cardId;
    UI.render();
  },

  /* 有効な対象（生存していて、加護されていない相手）を1体返す（2人対戦なので常に相手固定） */
  validOpponentIdx(actorIdx){
    const t = this.other(actorIdx);
    const tp = this.playerAt(t);
    if(!tp.alive) return null;
    if(tp.protectedFlag) return null;
    return t;
  },

  /* ---------------- 各効果の解決 ---------------- */

  effGuessRank(actorIdx, guessNumber){
    const s = this.state;
    const actor = this.playerAt(actorIdx);
    const t = this.other(actorIdx);
    const target = this.playerAt(t);
    if(!target.alive || target.protectedFlag){
      this.addLog(`${actor.name} は「給仕」を使ったが、${target.protectedFlag?'貴婦人の加護で無効化された':'対象は既に退場していた'}。`);
      this.finishResolve();
      return;
    }
    const targetCard = target.hand[0];
    const hit = cardDef(targetCard).number === guessNumber;
    this.addLog(`${actor.name}は「${target.name}の手札は${guessNumber}」と宣言した…${hit?'的中！':'外れ。'}`);
    if(hit){
      this.eliminate(t, `${actor.name}の宣言が的中し、正体が見破られた`);
    }
    this.finishResolve();
  },

  effMutualReveal(actorIdx){
    const s = this.state;
    const actor = this.playerAt(actorIdx);
    const t = this.other(actorIdx);
    const target = this.playerAt(t);
    if(!target.alive || target.protectedFlag){
      this.addLog(`${actor.name} は「楽団員」を使ったが、${target.protectedFlag?'貴婦人の加護で無効化された':'対象は既に退場していた'}。`);
      this.finishResolve();
      return;
    }
    const aCard = actor.hand[0], tCard = target.hand[0];
    this.addLog(`${actor.name}と${target.name}は互いに仮面を外し、正体を見せ合った。（${actor.name}:${cardDef(aCard).name} / ${target.name}:${cardDef(tCard).name}）`);
    UI.showInfoModal('お互いの正体', `${actor.name}: ${UI.cardInline(aCard)}<br><br>${target.name}: ${UI.cardInline(tCard)}`, ()=>{
      // LARVAの黄金律：他者の効果で公開されただけでは脱落しない（自分の番に自ら捨てた時のみ発動）
      this.finishResolve();
    }, true);
  },

  effPeekHand(actorIdx){
    const s = this.state;
    const actor = this.playerAt(actorIdx);
    const t = this.other(actorIdx);
    const target = this.playerAt(t);
    if(!target.alive || target.protectedFlag){
      this.addLog(`${actor.name} は「占い師」を使ったが、${target.protectedFlag?'貴婦人の加護で無効化された':'対象は既に退場していた'}。`);
      this.finishResolve();
      return;
    }
    const tCard = target.hand[0];
    this.addLog(`${actor.name}は${target.name}の手札をこっそり覗き見た。`);
    if(!actor.isCPU){
      UI.showInfoModal('占いの結果', `${target.name}の手札は…<br><br>${UI.cardInline(tCard)}`, ()=>{
        this.finishResolve();
      }, true);
    } else {
      CPU.memory[t] = tCard; // CPUは記憶する
      this.finishResolve();
    }
  },

  effProtectSelf(actorIdx){
    const actor = this.playerAt(actorIdx);
    actor.protectedFlag = true;
    this.addLog(`${actor.name}は「貴婦人」の加護を得た。次の自分の番までは狙われない。`);
    this.finishResolve();
  },

  effPeekDeckTop(actorIdx){
    const s = this.state;
    const actor = this.playerAt(actorIdx);
    if(s.deck.length===0){
      this.addLog(`${actor.name}は「密偵」を使ったが、山札は残っていなかった。`);
      this.finishResolve();
      return;
    }
    const top = s.deck[s.deck.length-1];
    this.addLog(`${actor.name}は山札の一番上をこっそり確認した。`);
    if(!actor.isCPU){
      UI.showInfoModal('密偵の報告', `山札の一番上は…<br><br>${UI.cardInline(top)}<br><br>このまま戻すか、山札の底へ送るか選んでください。`,
        null, true, [
          {label:'そのまま戻す', action:()=>{ this.addLog(`${actor.name}は山札をそのままにした。`); this.finishResolve(); }},
          {label:'底へ送る', action:()=>{ s.deck.pop(); s.deck.unshift(top); this.addLog(`${actor.name}は見た仮面を山札の底へ送った。`); this.finishResolve(); }},
        ]);
    } else {
      // CPUはランダム（記憶しない簡易AI）
      if(Math.random()<0.5){ s.deck.pop(); s.deck.unshift(top); this.addLog(`${actor.name}は見た仮面を山札の底へ送ったようだ。`); }
      else { this.addLog(`${actor.name}は山札をそのままにしたようだ。`); }
      this.finishResolve();
    }
  },

  effSwapHand(actorIdx){
    const s = this.state;
    const actor = this.playerAt(actorIdx);
    const t = this.other(actorIdx);
    const target = this.playerAt(t);
    if(!target.alive || target.protectedFlag){
      this.addLog(`${actor.name} は「道化師」を使ったが、${target.protectedFlag?'貴婦人の加護で無効化された':'対象は既に退場していた'}。`);
      this.finishResolve();
      return;
    }
    const aCard = actor.hand[0];
    const tCard = target.hand[0];
    actor.hand[0] = tCard;
    target.hand[0] = aCard;
    this.addLog(`${actor.name}は${target.name}と強制的に仮面を交換させた。`);
    this.finishResolve();
  },

  effForceRedraw(actorIdx){
    const s = this.state;
    const actor = this.playerAt(actorIdx);
    const t = this.other(actorIdx);
    const target = this.playerAt(t);
    if(!target.alive || target.protectedFlag){
      this.addLog(`${actor.name} は「毒見役」を使ったが、${target.protectedFlag?'貴婦人の加護で無効化された':'対象は既に退場していた'}。`);
      this.finishResolve();
      return;
    }
    const oldCard = target.hand.pop();
    target.discard.push(oldCard);
    this.addLog(`${actor.name}は${target.name}に仮面を公開で捨てさせた。（${cardDef(oldCard).name}）`);
    // LARVAの黄金律：他者の効果で捨てさせられた場合、そのカードの効果（仮面の主催者の脱落含む）は発動しない
    let newCard = null;
    if(s.deck.length>0){ newCard = s.deck.pop(); }
    else if(s.removedCard){ newCard = s.removedCard; s.removedCard = null; this.addLog('山札が尽きていたため、転生札が使われた。'); }
    if(newCard){
      target.hand.push(newCard);
      this.addLog(`${target.name}は山札から新しい仮面を引いた。`);
    } else {
      this.addLog(`${target.name}に配る仮面が残っていなかった。`);
    }
    this.finishResolve();
  },

  effCompareHand(actorIdx){
    const s = this.state;
    const actor = this.playerAt(actorIdx);
    const t = this.other(actorIdx);
    const target = this.playerAt(t);
    if(!target.alive || target.protectedFlag){
      this.addLog(`${actor.name} は「黒騎士」を使ったが、${target.protectedFlag?'貴婦人の加護で無効化された':'対象は既に退場していた'}。`);
      this.finishResolve();
      return;
    }
    const aCard = actor.hand[0], tCard = target.hand[0];
    const reveal = () => {
      const aDef = cardDef(aCard), tDef = cardDef(tCard);
      this.addLog(`${actor.name}と${target.name}は仮面の数字を見せ合った。（${actor.name}:${aDef.name} / ${target.name}:${tDef.name}）`);
      // LARVAの黄金律：比べ合いによる公開だけでは脱落しない。数字の大小のみで決着する
      if(aDef.number < tDef.number){ this.eliminate(actorIdx, `${target.name}との対決に敗れた`); }
      else if(tDef.number < aDef.number){ this.eliminate(t, `${actor.name}との対決に敗れた`); }
      else { this.addLog('数字は同じだった。両者、決着つかず。'); }
      this.finishResolve();
    };
    if(!actor.isCPU){
      UI.showInfoModal('黒騎士の対決', `${actor.name}: ${UI.cardInline(aCard)}<br><br>${target.name}: ${UI.cardInline(tCard)}`, reveal, true);
    } else {
      reveal();
    }
  },

  finishResolve(){
    const s = this.state;
    s.pendingCard = null;
    s.phase = 'idle';
    UI.render();
    if(this.checkGameEnd()) return;
    this.advanceTurn();
  },

  eliminate(playerIdx, reason){
    const s = this.state;
    const p = s.players[playerIdx];
    if(!p.alive) return;
    p.alive = false;
    // 残った手札は公開して捨て札へ
    while(p.hand.length){
      const c = p.hand.pop();
      p.discard.push(c);
    }
    this.addLog(`💀 ${p.name} は退場した。（${reason}）`);
  },

  checkGameEnd(){
    const s = this.state;
    const alive = s.players.filter(p=>p.alive);
    if(alive.length<=1){
      s.gameOver = true;
      s.winner = alive[0] || null;
      s.endReason = 'elimination';
      s.phase = 'over';
      UI.render();
      UI.showGameOver();
      return true;
    }
    return false;
  },

  endGameByShowdown(){
    const s = this.state;
    const alive = s.players.filter(p=>p.alive);
    let winner = null;
    if(alive.length===1){ winner = alive[0]; }
    else if(alive.length>1){
      let best = -1;
      alive.forEach(p=>{
        const n = cardDef(p.hand[0]).number;
        if(n>best){ best=n; winner=p; }
        else if(n===best){ winner=null; } // 同数タイは引き分け扱い
      });
    }
    s.gameOver = true;
    s.winner = winner;
    s.endReason = 'showdown';
    s.phase = 'over';
    this.addLog('山札が尽きた。仮面を開き、最後の見比べが行われる。');
    UI.render();
    UI.showGameOver();
  },

  advanceTurn(){
    const s = this.state;
    if(s.gameOver) return;
    s.turnIndex = this.other(s.turnIndex);
    s.phase = 'idle';
    setTimeout(()=>this.startTurn(), pace(s.players[s.turnIndex].isCPU ? 550 : 300));
  },
};

/* ---------------------------------------------------------------------
 * 4. 簡易CPU AI
 * ------------------------------------------------------------------- */
const CPU = {
  memory: {}, // { playerIdx: cardId } 占い師などで知った情報

  takeTurn(){
    const s = Game.state;
    const idx = s.turnIndex;
    const p = s.players[idx];
    if(!p.isCPU || s.phase!=='choose') return;

    const hand = p.hand.slice();
    let chosen;
    // 「仮面の主催者」は絶対に自分からは出さない（もう1枚がある限り）
    if(hand.includes('masked_host') && hand.length===2){
      chosen = hand.find(c=>c!=='masked_host');
    } else {
      // 単純なスコアリング：数字が低いほど積極的に切る／高いほど温存しがち、加えて少し乱数
      const scored = hand.map(c=>{
        const n = cardDef(c).number;
        return { c, score: (10-n) + Math.random()*4 };
      });
      scored.sort((a,b)=>b.score-a.score);
      chosen = scored[0].c;
    }

    Game.discardCard(idx, chosen);

    // discardCard は効果を持たないカード（大公など）や「仮面の主催者」露見の場合、
    // 自分でターンを終わらせる。ここでは効果解決待ち(resolveフェーズ)の場合のみ担当する。
    setTimeout(()=>{
      if(Game.state.gameOver) return;
      if(Game.state.pendingCard === chosen && Game.state.phase==='resolve'){
        this.resolvePending(idx, chosen);
      }
    }, pace(650));
  },

  guessWeightedNumber(actorIdx){
    const s = Game.state;
    const remaining = {}; // number -> 残数
    CARD_ORDER.forEach(id=>{
      const d = cardDef(id);
      if(d.number===1) return; // 1は宣言不可
      remaining[d.number] = d.count;
    });
    // 見えている札（捨て札全部、自分の手札）を減算
    const seen = [];
    s.players.forEach(pl=>seen.push(...pl.discard));
    seen.push(...s.players[actorIdx].hand);
    seen.forEach(cid=>{
      const n = cardDef(cid).number;
      if(remaining[n]!==undefined) remaining[n] = Math.max(0, remaining[n]-1);
    });
    // 記憶（占い師で見た情報）があればそれを優先
    const t = Game.other(actorIdx);
    if(CPU.memory[t]){
      const n = cardDef(CPU.memory[t]).number;
      if(n!==1) return n;
    }
    const pool = [];
    Object.keys(remaining).forEach(n=>{
      for(let i=0;i<remaining[n];i++) pool.push(Number(n));
    });
    if(pool.length===0) return 2 + Math.floor(Math.random()*9);
    return pool[Math.floor(Math.random()*pool.length)];
  },

  resolvePending(actorIdx, cardId){
    const def = cardDef(cardId);
    switch(def.effect){
      case 'guessRank': Game.effGuessRank(actorIdx, this.guessWeightedNumber(actorIdx)); break;
      case 'mutualReveal': Game.effMutualReveal(actorIdx); break;
      case 'peekHand': Game.effPeekHand(actorIdx); break;
      case 'protectSelf': Game.effProtectSelf(actorIdx); break;
      case 'peekDeckTop': Game.effPeekDeckTop(actorIdx); break;
      case 'swapHand': Game.effSwapHand(actorIdx); break;
      case 'forceRedraw': Game.effForceRedraw(actorIdx); break;
      case 'compareHand': Game.effCompareHand(actorIdx); break;
      default: Game.finishResolve();
    }
  },
};

/* ---------------------------------------------------------------------
 * 5. UI 描画
 * ------------------------------------------------------------------- */
const UI = {
  init(){
    this.buildRulesPanel();
    this.buildSparkles();
  },

  buildSparkles(){
    const layer = document.getElementById('sparkle-layer');
    if(!layer) return;
    let html='';
    for(let i=0;i<26;i++){
      const top = Math.random()*100, left = Math.random()*100, delay = Math.random()*5;
      html += `<div class="sparkle" style="top:${top}%; left:${left}%; animation-delay:${delay}s;"></div>`;
    }
    layer.innerHTML = html;
  },

  buildRulesPanel(){
    const panel = document.getElementById('rules-panel');
    if(!panel) return;
    let rows = '';
    CARD_ORDER.forEach(id=>{
      const d = cardDef(id);
      rows += `<div class="rule-card-row">
        <div class="rule-thumb"><img src="${d.image}" alt="${d.name}" loading="lazy"></div>
        <div class="rule-text">
          <span class="rn">${d.number}. ${d.name}</span><span class="ry">（${d.yomi}）</span>
          <div class="rd">${d.desc}</div>
        </div>
        <div class="rule-count">×${d.count}</div>
      </div>`;
    });
    panel.innerHTML = `<h3>仮面一覧（全18枚）</h3>${rows}
      <div class="rd" style="margin:14px 0 6px; opacity:.85;">
        数字が小さいほど「攻めの読み合い」向き。数字が大きいほど希少で、抱え続ける価値と危険の両方を持つ切り札です。
      </div>
      <div class="rd" style="margin:10px 0 6px; opacity:.85;">
        <b style="color:var(--gold-light);">LARVAの黄金律</b>：カードの効果が発動するのは、自分の番に自分でその仮面を場に出した時のみ。他人の効果で捨てさせられた場合や、山札切れによる最後の公開では、効果は発動しません。
      </div>
      <div class="rd" style="margin:10px 0 6px; opacity:.85;">
        カードの情報を探るため、対戦相手への簡単な質問も自由です。より高度な心理戦をお楽しみください。
      </div>`;
  },

  toggleRules(){
    const panel = document.getElementById('rules-panel');
    const btn = document.getElementById('rules-toggle-btn');
    const open = panel.classList.toggle('open');
    btn.textContent = (open?'▴':'▾') + ' 仮面の一覧とルールを見る';
  },

  toggleLog(){
    const panel = document.getElementById('log-panel');
    const btn = document.getElementById('log-toggle');
    const open = panel.classList.toggle('open');
    btn.textContent = (open?'▴':'▾') + ' 舞踏会の記録（ログ）';
    if(open) this.renderLog();
  },

  showTable(){
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('table').classList.add('open');
  },

  cardInline(cid){
    const d = cardDef(cid);
    return `<span style="display:inline-flex;align-items:center;gap:8px;vertical-align:middle;">
      <img src="${d.image}" alt="${d.name}" style="width:34px;aspect-ratio:300/505;object-fit:cover;border-radius:5px;box-shadow:0 2px 6px rgba(0,0,0,0.5);">
      <b>${d.name}（${d.number}）</b>
    </span>`;
  },

  render(){
    if(!Game.state) return;
    const s = Game.state;
    const me = Game.me(), opp = Game.opp();

    document.getElementById('turn-badge').textContent =
      s.gameOver ? '舞踏会、終幕' : (s.players[s.turnIndex].isCPU ? '仮面卿の番' : 'あなたの番');
    document.getElementById('deck-count-text').textContent = `山札 ${s.deck.length}枚`;

    // 相手
    document.getElementById('opp-protect').classList.toggle('show', opp.protectedFlag);
    document.getElementById('opp-eliminated').classList.toggle('show', !opp.alive);
    document.getElementById('opp-hand').innerHTML = opp.hand.map(()=>
      `<div class="card-back"><span class="mask-icon">🎭</span></div>`).join('');
    document.getElementById('opp-discard').innerHTML = this.renderDiscardChips(opp.discard);

    // 自分
    document.getElementById('me-protect').classList.toggle('show', me.protectedFlag);
    document.getElementById('me-eliminated').classList.toggle('show', !me.alive);
    document.getElementById('me-hand').innerHTML = me.hand.map((cid,i)=>this.renderCard(cid,{
      selectable: !s.gameOver && s.phase==='choose' && s.turnIndex===0,
      onclick: `UI.onMeChooseCard('${cid}')`,
    })).join('');
    document.getElementById('me-discard').innerHTML = this.renderDiscardChips(me.discard);

    this.renderActionPanel();
    if(document.getElementById('log-panel').classList.contains('open')) this.renderLog();
  },

  renderCard(cid, opts){
    opts = opts || {};
    const d = cardDef(cid);
    const cls = ['card', rankClass(d.number)];
    if(opts.selectable) cls.push('selectable');
    return `<div class="${cls.join(' ')}" ${opts.selectable?`onclick="${opts.onclick}"`:''} title="${d.name}（${d.number}）">
      <img src="${d.image}" alt="${d.name}（${d.number}）">
    </div>`;
  },

  renderDiscardChips(discardArr){
    if(!discardArr.length) return `<span class="chip" style="opacity:.5;">まだ何も出ていない</span>`;
    return discardArr.map(cid=>{
      const d = cardDef(cid);
      return `<span class="chip ${d.exposeEliminates?'host':''}"><b>${d.number}</b> ${d.name}</span>`;
    }).join('');
  },

  renderLog(){
    const panel = document.getElementById('log-panel');
    const s = Game.state;
    panel.innerHTML = s.log.map(l=> l.header ? `<div class="lg-turn">${l.text}</div>` : `<div>${l.text}</div>`).join('');
    panel.scrollTop = panel.scrollHeight;
  },

  renderActionPanel(){
    const s = Game.state;
    const box = document.getElementById('ap-prompt');
    const panel = document.getElementById('action-panel');

    if(s.gameOver){
      box.innerHTML = '結果は下の画面をご覧ください。';
      panel.querySelectorAll('.choice-row, .num-pad, .sub').forEach(n=>n.remove());
      return;
    }

    // 既存の動的要素を除去してから作り直す
    panel.querySelectorAll('.choice-row, .num-pad, .sub, .card').forEach(n=>n.remove());

    if(s.phase==='resolve' && s.pendingCard){
      const cid = s.pendingCard;
      const d = cardDef(cid);
      const actorIsMe = s.turnIndex===0;
      if(!actorIsMe){
        box.innerHTML = `仮面卿が「${d.name}」の力を発動している…`;
        return;
      }
      if(d.effect==='guessRank'){
        box.innerHTML = `「${d.name}」発動：仮面卿の手札の数字を宣言してください（1は宣言できません）`;
        const pad = document.createElement('div');
        pad.className = 'num-pad';
        for(let n=2;n<=10;n++){
          const b = document.createElement('button');
          b.className='btn'; b.textContent=n;
          b.onclick = ()=>Game.effGuessRank(0, n);
          pad.appendChild(b);
        }
        panel.appendChild(pad);
        return;
      }
      if(['mutualReveal','peekHand','protectSelf','swapHand','forceRedraw','compareHand'].includes(d.effect)){
        box.innerHTML = `「${d.name}」の力を仮面卿に対して発動します。`;
        const row = document.createElement('div');
        row.className='choice-row';
        const b = document.createElement('button');
        b.className='btn primary'; b.textContent='発動する';
        b.onclick = ()=>{
          if(d.effect==='mutualReveal') Game.effMutualReveal(0);
          else if(d.effect==='peekHand') Game.effPeekHand(0);
          else if(d.effect==='protectSelf') Game.effProtectSelf(0);
          else if(d.effect==='swapHand') Game.effSwapHand(0);
          else if(d.effect==='forceRedraw') Game.effForceRedraw(0);
          else if(d.effect==='compareHand') Game.effCompareHand(0);
        };
        row.appendChild(b);
        panel.appendChild(row);
        return;
      }
      if(d.effect==='peekDeckTop'){
        box.innerHTML = `「${d.name}」発動中…`;
        Game.effPeekDeckTop(0);
        return;
      }
    }

    if(s.phase==='choose'){
      if(s.turnIndex===0){
        box.innerHTML = 'どちらの仮面を場に出しますか？（手札から1枚を選択）';
      } else {
        box.innerHTML = '仮面卿が思案している…';
      }
      return;
    }

    box.innerHTML = '―';
  },

  onMeChooseCard(cid){
    const s = Game.state;
    if(s.phase!=='choose' || s.turnIndex!==0) return;
    Game.discardCard(0, cid);
  },

  showInfoModal(title, html, onClose, showCloseBtn, customButtons){
    const overlay = document.getElementById('info-overlay');
    const box = document.getElementById('info-box');
    let btnHtml = '';
    if(customButtons){
      btnHtml = `<div class="choice-row">${customButtons.map((b,i)=>`<button class="btn ${i===0?'primary':''}" data-cb="${i}">${b.label}</button>`).join('')}</div>`;
    } else if(showCloseBtn){
      btnHtml = `<div class="choice-row"><button class="btn primary" id="info-ok-btn">わかった</button></div>`;
    }
    box.innerHTML = `<h4>${title}</h4><p>${html}</p>${btnHtml}`;
    overlay.classList.add('open');
    if(customButtons){
      customButtons.forEach((b,i)=>{
        box.querySelector(`[data-cb="${i}"]`).onclick = ()=>{
          overlay.classList.remove('open');
          b.action();
        };
      });
    } else {
      const okBtn = document.getElementById('info-ok-btn');
      if(okBtn){
        okBtn.onclick = ()=>{ overlay.classList.remove('open'); if(onClose) onClose(); };
      } else if(onClose){
        // ボタンが無い呼び出しのフォールバック：オーバーレイを確実に閉じてから続行する
        overlay.classList.remove('open');
        onClose();
      }
    }
  },

  showGameOver(){
    const s = Game.state;
    const overlay = document.getElementById('gameover-overlay');
    const box = document.getElementById('gameover-box');
    let title, sub;
    if(s.winner && s.winner.id===0){ title='あなたの勝利'; sub='正体を隠し通し、王位を継承した。'; }
    else if(s.winner && s.winner.id===1){ title='仮面卿の勝利'; sub='あなたの正体は見破られてしまった。'; }
    else { title='引き分け'; sub='舞踏会は決着つかず幕を閉じた。'; }

    const revealRow = s.players.map(p=>{
      const cid = p.hand[0];
      return `<div style="display:flex;justify-content:space-between;align-items:center;font-size:12.5px;padding:6px 0;border-top:1px dashed rgba(255,255,255,0.1);">
        <span>${p.name}</span><span>${cid ? UI.cardInline(cid) : (p.alive?'—':'退場')}</span>
      </div>`;
    }).join('');

    box.innerHTML = `
      <div class="result-title">${title}</div>
      <div class="result-sub">${sub}</div>
      ${revealRow}
      <div class="start-actions" style="margin-top:18px;">
        <button class="btn-grand" onclick="UI.restart()">もう一度舞踏会へ</button>
      </div>
    `;
    overlay.classList.add('open');
  },

  restart(){
    document.getElementById('gameover-overlay').classList.remove('open');
    Game.newGame();
  },
};

document.addEventListener('DOMContentLoaded', ()=>UI.init());

/* テスト用フック（jsdomヘッドレステストから利用。通常のプレイには使用しない） */
if(typeof window!=='undefined'){
  window.__masqueTestHooks = { Game, CPU, UI, CARD_DEFS };
}
