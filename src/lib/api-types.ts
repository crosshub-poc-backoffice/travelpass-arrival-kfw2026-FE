/**
 * 백엔드 응답 모양 (docs/openapi.yaml 과 같아야 한다).
 * 화면은 백엔드 코드를 가져다 쓰지 않고 이 타입만 본다.
 */
import type { PrizeType, Rank } from "./config";

/** 전광판 모드: 추첨 직후엔 당첨자 화면, 그 밖엔 다음 추첨 안내 */
export type BoardPin =
  | {
      kind: "winners"; round: string; drawn_at: string;
      /** 당첨자를 보여 주는 방식. 백엔드는 보내지 않고, 전광판이 추첨 연출 설정(lib/show)을 보고 채운다. 없거나 pages = 9명씩 페이지 넘김 */
      view?: "pages" | "summary";
      /** 모아보기 1등 자리 아래 문구 (1등이 없을 때 이유 등). 이것도 전광판이 추첨 연출 설정에서 채운다 */
      firstNote?: string;
      winners: { rank: Rank; seq: number; display_name: string; origin_code: string }[];
    }
  | { kind: "next"; at: string | null };

/** 경품 하나의 수량 내역. 나감 + 당첨 대기 + 예약 + 여유 = 총 */
export interface InventoryItem {
  prize_type: PrizeType;
  stock: number | null;
  claimed: number;
  waiting: number;
  reserved: number;
  free: number | null;
  /** 부스에 남은 실물 = 총 − 나감 */
  remaining: number | null;
}
