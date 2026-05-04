import type { AiChatResult, AiProvider } from '../types';

type ToolDetail = NonNullable<AiChatResult['toolDetails']>[number];
type UiAction = NonNullable<AiChatResult['uiActions']>[number];

type RuntimeAnswer = {
  content: string;
  actions: UiAction[];
  toolExecutions: number;
  toolDetails: ToolDetail[];
  responseMeta: {
    provider: AiProvider;
    protocol: 'gemini' | 'anthropic' | 'responses' | 'openai';
    model: string;
    accountId: number;
    accountName: string;
  };
  degradedReason?: string;
  runtimeEventRefs?: string[];
};

export function buildAiChatResult(input: {
  thread: AiChatResult['thread'];
  userMessage: AiChatResult['userMessage'];
  assistantMessage: AiChatResult['assistantMessage'];
  answer: RuntimeAnswer;
  runtimeView: {
    mode: string;
    observationLoop: string;
    currentFocusPath: string | null;
  };
  fallbackAccount?: AiChatResult['fallbackAccount'];
  degradedReason?: string;
}): AiChatResult {
  const toolDetails = input.answer.toolDetails || [];
  const degradedReason = input.degradedReason
    || input.answer.degradedReason
    || (toolDetails.length > 0 && toolDetails.every((item) => !item.ok)
      ? '共享运行时工具本轮全部失败，当前回复未依赖成功工具结果。'
      : undefined);
  const runtimeEventRefs = input.answer.runtimeEventRefs || [];

  return {
    thread: input.thread,
    userMessage: input.userMessage,
    assistantMessage: input.assistantMessage,
    chatSession: {
      threadId: input.thread.id,
      accountId: input.answer.responseMeta.accountId,
      accountName: input.answer.responseMeta.accountName,
      provider: input.answer.responseMeta.provider,
      model: input.answer.responseMeta.model,
    },
    agentRuntime: {
      mode: input.runtimeView.mode,
      observationLoop: input.runtimeView.observationLoop,
      currentFocusPath: input.runtimeView.currentFocusPath,
      runtimeEventRefs,
    },
    uiActions: input.answer.actions,
    toolExecutions: input.answer.toolExecutions,
    toolDetails,
    degradedReason,
    runtimeEventRefs,
    responseMeta: input.answer.responseMeta,
    ...(input.fallbackAccount ? { fallbackAccount: input.fallbackAccount } : {}),

    // Legacy aliases kept for compatibility while the UI finishes migrating.
    museActions: input.answer.actions,
    museToolExecutions: input.answer.toolExecutions,
    museToolDetails: toolDetails,
  };
}
