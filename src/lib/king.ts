/**
 * 시연 모드(/king · /king-board · /king-admin) 공용 타입.
 * 실제 등록·추첨·DB 와는 무관하다. 화면 세 개가 /king/sync 의 작은 상태 하나만 같이 본다.
 */
import type { Rank } from "./config";

/** 0 대기 → 1 등록됨(전광판에 뜸) → 2 추첨됨(잠깐 뜸을 들인 뒤 발표) → 3 결과 확인함 */
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
  /** 당첨자 화면에서 손님 줄을 노랗게 강조 */
  highlight: boolean;
  /** 양옆에서 터지는 꽃가루 */
  confetti: boolean;
  /** 당첨 효과음 */
  sound: boolean;
}
export const KING_FX: KingFx = { highlight: true, confetti: true, sound: true };

/** 추첨을 누른 뒤 전광판이 이름을 돌리며 뜸을 들이는 시간 */
export const KING_SUSPENSE_MS = 4000;
/** 그 뒤 당첨자 줄이 다 넘어가 멈출 때까지. 손님 줄이 마지막에 멈추고, 이때 꽃가루와 효과음이 나온다 */
export const KING_LAND_MS = 2300;
/** 손님 폰은 전광판 발표가 끝나고 이만큼 뒤에 [결과 보기]를 띄운다 */
export const KING_PHONE_LAG_MS = 700;

export interface KingState {
  /** 초기화할 때마다 바뀐다. 화면은 이 값이 바뀌면 처음으로 돌아간다 */
  epoch: number;
  step: KingStep;
  guest: KingGuest | null;
  fx: KingFx;
  /** 등록된 시각 (전광판 TIME 칸) */
  at: string | null;
  /** 추첨을 누른 시각 (서버 시계, ms). 모든 화면이 이 시각 기준으로 같은 순간에 발표한다 */
  drawAt: number | null;
  /** 각 화면이 마지막으로 상태를 물어본 시각 (직원 화면의 연결 표시용) */
  beats: { board: number | null; phone: number | null };
  now: number;
}

export const KING_EMPTY: KingState = { epoch: 0, step: 0, guest: null, fx: KING_FX, at: null, drawAt: null, beats: { board: null, phone: null }, now: 0 };
