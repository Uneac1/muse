import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { oauthApi } from './api';
import { applyOpenAiOAuthResult, buildOpenAiPopupFeatures, type TokenAccountForm } from './tokenAccountDialogModel';
import type { OpenAIOAuthResult, TokenAccountView } from '../types';

interface OpenAiOAuthFlowOptions {
  open: boolean;
  account: TokenAccountView | null;
  form: TokenAccountForm;
  setForm: (updater: (current: TokenAccountForm) => TokenAccountForm) => void;
  onClose: () => void;
  onSave: (payload: Partial<TokenAccountView>) => Promise<void>;
}

export function useOpenAiOAuthFlow({
  open,
  account,
  form,
  setForm,
  onClose,
  onSave,
}: OpenAiOAuthFlowOptions) {
  const [oauthPending, setOauthPending] = useState(false);
  const [oauthState, setOauthState] = useState('');
  const [oauthSaving, setOauthSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setOauthPending(false);
      setOauthState('');
      setOauthSaving(false);
    }
  }, [open]);

  const saveOAuthResult = async (payload: Partial<OpenAIOAuthResult>) => {
    const next = applyOpenAiOAuthResult(form, payload);
    setForm(() => next);
    try {
      setOauthSaving(true);
      await onSave(next);
      toast.success(account ? 'OpenAI OAuth 账号已更新' : 'OpenAI OAuth 账号已添加');
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'OpenAI OAuth 账号保存失败');
    } finally {
      setOauthSaving(false);
    }
  };

  useEffect(() => {
    if (!open) return;

    const handleMessage = async (event: MessageEvent) => {
      const payload = event.data;
      if (!payload || typeof payload !== 'object') return;

      if (payload.type === 'openai-oauth-error') {
        setOauthPending(false);
        toast.error(payload.error || 'OpenAI OAuth 失败');
        return;
      }

      if (payload.type !== 'openai-oauth-success') return;
      setOauthPending(false);
      setOauthState('');
      await saveOAuthResult(payload);
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [form, onClose, onSave, open]);

  useEffect(() => {
    if (!open || !oauthPending || !oauthState) return;

    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const result = await oauthApi.openaiResult(oauthState);
        if (cancelled || result.status === 'pending') return;

        setOauthPending(false);
        setOauthState('');

        if (result.status === 'expired') {
          toast.error('OpenAI 授权状态已过期，请重新发起授权');
          return;
        }

        if (result.type === 'openai-oauth-error') {
          toast.error(result.error || 'OpenAI OAuth 失败');
          return;
        }

        if (result.type !== 'openai-oauth-success') {
          toast.error('OpenAI OAuth 返回了未知状态');
          return;
        }

        await saveOAuthResult(result);
      } catch (error: any) {
        if (!cancelled) {
          setOauthPending(false);
          setOauthState('');
          toast.error(error.message || '轮询 OpenAI 授权结果失败');
        }
      }
    }, 1800);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [form, oauthPending, oauthState, onClose, onSave, open]);

  const startOAuth = async () => {
    try {
      setOauthPending(true);
      const result = await oauthApi.openaiAuthorize();
      setOauthState(result.state);
      const popupFeatures = buildOpenAiPopupFeatures(window.screenX, window.outerWidth, window.screenY, window.outerHeight);
      const popup = window.open(result.url, 'muse-openai-oauth', popupFeatures);
      if (!popup) {
        setOauthPending(false);
        setOauthState('');
        toast.error('浏览器拦截了授权弹窗，请允许弹窗后重试');
        return;
      }
      toast.success('已在当前浏览器打开 OpenAI 授权页，请完成登录');
    } catch (error: any) {
      setOauthPending(false);
      setOauthState('');
      toast.error(error.message || '无法启动 OpenAI OAuth');
    }
  };

  const resetOAuthSession = async () => {
    try {
      setOauthPending(false);
      setOauthState('');
      await oauthApi.openaiResetSession();
      toast.success('Muse OpenAI 授权登录态已重置。下次授权会重新打开一个干净但可持续复用的 Muse 专用窗口。');
    } catch (error: any) {
      toast.error(error.message || '重置 Muse OpenAI 登录态失败');
    }
  };

  return {
    oauthPending,
    oauthState,
    oauthSaving,
    startOAuth,
    resetOAuthSession,
  };
}
