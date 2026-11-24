/**
 * 스플릿 플랩 엔진. React 리렌더 없이 DOM 을 직접 돌린다.
 * 셀 구조 (FlipBoard.tsx 에서 렌더):
 *   .cell > .st (정적 위: 다음 글자) / .sb (정적 아래: 현재 글자)
 *          .ft (회전 위판: 현재 글자) / .fb (회전 아래판: 다음 글자)
 */
import { cells as splitCells, emojiSrc, preloadEmoji } from "@/lib/glyphs";

export const CHARSET = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:.-/";
export const STEP_MS = 80;
const MAX_STEPS = 9;

interface Cell {
  st: HTMLElement;
  sb: HTMLElement;
  ft: HTMLElement;
  fb: HTMLElement;
  cur: string;
  path: string[];
  timer: number | null;
  anims: Animation[];
}

function idx(ch: string) {
  const i = CHARSET.indexOf(ch);
  return i < 0 ? 0 : i;
}

/**
 * 문자셋 밖(이모지·국기)은 판에 순서가 없으니, 영문 몇 장을 넘기다 마지막 장에 그림이 걸리게 한다.
 * 장 수를 글자처럼 들쭉날쭉하게 해서 그림 칸만 먼저 멈추거나 한꺼번에 뜨지 않게.
 */
const WILD_MIN = 4;
const WILD_MAX = 9;
const LETTERS = CHARSET.slice(1);

function isGlyph(ch: string) {
  return CHARSET.includes(ch) || /\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]/u.test(ch);
}

function wildPath(to: string): string[] {
  const n = WILD_MIN + Math.floor(Math.random() * (WILD_MAX - WILD_MIN + 1));
  const out = Array.from({ length: n - 1 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]);
  out.push(to);
  return out;
}

/** 국기 칸에 들어가는 그림: 국기(지역 표시 문자 두 개)와 직접 입력 출발지용 🌐 */
function isFlag(ch: string) {
  return ch === "\u{1F310}" || /^[\u{1F1E6}-\u{1F1FF}]{2}$/u.test(ch);
}

/** 그대로 둘 칸: 같은 글자, 같은 국기. 이모지만 같아도 주변 글자와 같이 넘어간다 */
function stays(from: string, to: string) {
  return from === to && (CHARSET.includes(to) || isFlag(to));
}

function buildPath(from: string, to: string): string[] {
  if (stays(from, to)) return [];
  // 그림 글자로 들어가거나 나올 때
  if (!CHARSET.includes(to) || !CHARSET.includes(from)) return wildPath(to);
  const L = CHARSET.length;
  const i = idx(from);
  const j = idx(to);
  const dist = (j - i + L) % L;
  if (dist === 0) return [];
  if (dist <= MAX_STEPS) return Array.from({ length: dist }, (_, k) => CHARSET[(i + k + 1) % L]);
  const out: string[] = [];
  for (let k = 1; k < MAX_STEPS; k++) out.push(CHARSET[(i + Math.round((k * dist) / MAX_STEPS)) % L]);
  out.push(CHARSET[j]);
  return out;
}

/** 칸 반쪽에 글자를 넣는다. 팔레트 이모지·국기는 그림(.emo 로 크기 줄임) */
function put(el: HTMLElement, ch: string) {
  const src = emojiSrc(ch);
  if (src) {
    // 그림 이모지: 글자와 같은 줄 상자 가운데에 놓여서 위/아래 반쪽이 글자처럼 잘려 보인다
    // 반쪽(높이 50%) 안에서 칸 전체 높이 상자를 위/아래로 붙여, 그림 가운데가 반쪽 경계에 오게 한다
    const box = document.createElement("span");
    box.className = "emoji-cell";
    const img = document.createElement("span");
    img.className = "emoji-img";
    img.style.backgroundImage = `url("${src}")`;
    box.appendChild(img);
    el.replaceChildren(box);
  } else {
    el.textContent = ch;
  }
  el.classList.toggle("emo", !CHARSET.includes(ch));
}

export class FlipEngine {
  private rows: Cell[][] = [];
  private onTick: () => void;

  constructor(root: HTMLElement, onTick: () => void) {
    this.onTick = onTick;
    preloadEmoji();
    root.querySelectorAll<HTMLElement>(".row").forEach((rowEl) => {
      const cells: Cell[] = [];
      rowEl.querySelectorAll<HTMLElement>(".cell").forEach((el) => {
        cells.push({
          st: el.querySelector(".st")!,
          sb: el.querySelector(".sb")!,
          ft: el.querySelector(".ft")!,
          fb: el.querySelector(".fb")!,
          cur: " ",
          path: [],
          timer: null,
          anims: [],
        });
      });
      this.rows.push(cells);
    });
  }

  /** 행 전체를 목표 문자열(또는 칸 배열)로. 칸은 그래핌 단위라 이모지·국기도 한 칸. instant 면 애니메이션 없이. */
  setRow(rowIndex: number, text: string | string[], opts: { instant?: boolean; baseDelay?: number } = {}) {
    const cells = this.rows[rowIndex];
    if (!cells) return;
    const glyphs = Array.isArray(text) ? text : splitCells(text.toUpperCase());
    cells.forEach((cell, col) => {
      const g = glyphs[col] ?? " ";
      const target = isGlyph(g) ? g : " ";
      if (opts.instant) { this.settle(cell, target); return; }
      this.animate(cell, target, (opts.baseDelay ?? 0) + col * 14 + Math.random() * 20);
    });
  }

  private settle(cell: Cell, ch: string) {
    this.cancel(cell);
    cell.cur = ch;
    put(cell.st, ch);
    put(cell.sb, ch);
    put(cell.ft, ch);
    put(cell.fb, ch);
  }

  private cancel(cell: Cell) {
    if (cell.timer) { clearTimeout(cell.timer); cell.timer = null; }
    cell.anims.forEach((a) => a.cancel());
    cell.anims = [];
    cell.path = [];
  }

  private animate(cell: Cell, target: string, delay: number) {
    this.cancel(cell);
    if (stays(cell.cur, target)) { this.settle(cell, target); return; }
    cell.path = buildPath(cell.cur, target);
    cell.timer = window.setTimeout(() => this.step(cell), delay);
  }

  private step(cell: Cell) {
    const next = cell.path.shift();
    if (next === undefined) { cell.timer = null; return; }
    const cur = cell.cur;
    put(cell.st, next);
    put(cell.sb, cur);
    put(cell.ft, cur);
    put(cell.fb, next);
    const half = STEP_MS / 2;
    const a1 = cell.ft.animate(
      [{ transform: "rotateX(0deg)", opacity: 1 }, { transform: "rotateX(-90deg)", opacity: 1 }],
      { duration: half, easing: "ease-in", fill: "forwards" },
    );
    const a2 = cell.fb.animate(
      [{ transform: "rotateX(90deg)", opacity: 1 }, { transform: "rotateX(0deg)", opacity: 1 }],
      { duration: half, delay: half, easing: "ease-out", fill: "both" },
    );
    cell.anims = [a1, a2];
    this.onTick();
    cell.timer = window.setTimeout(() => {
      cell.cur = next;
      put(cell.sb, next);
      cell.anims.forEach((a) => a.cancel());
      cell.anims = [];
      this.step(cell);
    }, STEP_MS);
  }

  destroy() {
    this.rows.forEach((cells) => cells.forEach((c) => this.cancel(c)));
  }
}
