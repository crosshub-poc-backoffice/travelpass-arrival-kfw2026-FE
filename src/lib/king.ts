/**
 * 시연 모드(/king · /king-board · /king-admin) 공용 타입.
 * 실제 등록·추첨·DB 와는 무관하다. 화면 세 개가 /king/sync 의 작은 상태 하나만 같이 본다.
 */
import type { Rank } from "./config";

/** 0 대기 → 1 등록됨(전광판에 뜸) → 2 추첨됨(결과 나옴) → 3 결과 확인함 */
export type KingStep = 0 | 1 | 2 | 3;

export interface KingGuest {
  /** 전광판에 뜨는 이름 (영문·숫자, 실제 등록과 같은 규칙) */
  name: string;
  origin: string;
  rank: Rank;
  /** 편명·추첨번호. 등록되는 순간 실제 마지막 번호의 다음 번호로 정해진다 (그 전에는 의미 없는 값) */
  seq: number;
}

/** 당첨 발표 순간 전광판 연출. 직원 화면에서 켜고 끈다 */
export interface KingFx {
  /** 발표할 때 손님 줄만 남기고 나머지 줄은 비운다 */
  solo: boolean;
  /** 양옆에서 터지는 꽃가루 */
  confetti: boolean;
  /** 당첨 효과음 */
  sound: boolean;
}
export const KING_FX: KingFx = { solo: true, confetti: true, sound: true };

export interface KingState {
  /** 초기화할 때마다 바뀐다. 화면은 이 값이 바뀌면 처음으로 돌아간다 */
  epoch: number;
  step: KingStep;
  guest: KingGuest | null;
  fx: KingFx;
  /** 등록된 시각 (전광판 TIME 칸) */
  at: string | null;
  /** 각 화면이 마지막으로 상태를 물어본 시각 (직원 화면의 연결 표시용) */
  beats: { board: number | null; phone: number | null };
  now: number;
}

export const KING_EMPTY: KingState = { epoch: 0, step: 0, guest: null, fx: KING_FX, at: null, beats: { board: null, phone: null }, now: 0 };
