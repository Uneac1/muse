import type { AiChatResult } from '../types';

export function getChatToolExecutions(result?: AiChatResult | null) {
  return result?.toolExecutions ?? result?.museToolExecutions ?? 0;
}

export function getChatToolDetails(result?: AiChatResult | null) {
  return result?.toolDetails ?? result?.museToolDetails ?? [];
}

export function getChatUiActions(result?: AiChatResult | null) {
  return result?.uiActions ?? result?.museActions ?? [];
}
